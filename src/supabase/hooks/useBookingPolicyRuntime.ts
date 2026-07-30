import { useCallback, useEffect, useRef, useState } from "react";
import type { BookingPolicyRules, BookingPolicyRuntimeStatus } from "../../types";
import { createDefaultBookingRules } from "../../constants/salonSettings";
import { logger } from "../../lib/logger";
import { bookingPolicyClient } from "../client";
import {
  getBookingPolicyRuntimeStatus,
  getBookingRules,
  updateBookingRules,
} from "../rpc";
import {
  dbBookingPolicyRuntimeToApp,
  dbBookingRulesToApp,
} from "../transforms";
import { registerResume } from "../refreshOnResume.js";

// The Playwright transport deliberately implements only the RPC surface this
// hook calls. Production receives a structurally compatible typed client.
const policyClient = bookingPolicyClient;

export type BookingRulesPatch = Partial<
  Omit<BookingPolicyRules, "customerPortal" | "depositBank">
> & {
  customerPortal?: Partial<BookingPolicyRules["customerPortal"]>;
  depositBank?: BookingPolicyRules["depositBank"];
};

type ReloadResult =
  | { ok: true; runtime: BookingPolicyRuntimeStatus }
  | { ok: false; error: string };

const INACTIVE_RUNTIME: BookingPolicyRuntimeStatus = {
  state: "inactive",
  scheduledEffectiveAt: null,
};

const NON_ACTIVE_POLL_MS = 60_000;
const BOUNDARY_POLL_MS = 5_000;
const BOUNDARY_WINDOW_MS = 60_000;

export const BOOKING_POLICY_INVALIDATED_EVENT =
  "smarterdog:booking-policy-invalidated";

function applyPatch(
  current: BookingPolicyRules,
  patch: BookingRulesPatch,
): BookingPolicyRules {
  return {
    ...current,
    ...patch,
    depositBank: patch.depositBank
      ? { ...patch.depositBank }
      : current.depositBank,
    customerPortal: patch.customerPortal
      ? { ...current.customerPortal, ...patch.customerPortal }
      : current.customerPortal,
  };
}

function sameBank(
  left: BookingPolicyRules["depositBank"],
  right: BookingPolicyRules["depositBank"],
) {
  return (
    left.accountName === right.accountName &&
    left.sortCode === right.sortCode &&
    left.accountNumber === right.accountNumber
  );
}

function preserveNestedIdentity(
  current: BookingPolicyRules,
  next: BookingPolicyRules,
) {
  const samePortal =
    current.customerPortal.allowCancellations ===
      next.customerPortal.allowCancellations &&
    current.customerPortal.allowRescheduling ===
      next.customerPortal.allowRescheduling &&
    current.customerPortal.allowRepeatBooking ===
      next.customerPortal.allowRepeatBooking &&
    current.customerPortal.showHistory === next.customerPortal.showHistory;
  return {
    ...next,
    depositBank: sameBank(current.depositBank, next.depositBank)
      ? current.depositBank
      : next.depositBank,
    customerPortal: samePortal
      ? current.customerPortal
      : next.customerPortal,
  };
}

export function useBookingPolicyRuntime() {
  const [rules, setRules] = useState<BookingPolicyRules>(
    createDefaultBookingRules,
  );
  const [runtime, setRuntime] =
    useState<BookingPolicyRuntimeStatus>(INACTIVE_RUNTIME);
  const [loading, setLoading] = useState(Boolean(policyClient));
  const [confirmed, setConfirmed] = useState(!policyClient);
  const [error, setError] = useState<string | null>(null);
  const confirmedRef = useRef(!policyClient);
  const rulesRef = useRef(rules);
  const runtimeRef = useRef(runtime);
  const lastConfirmedRuntimeStateRef = useRef<
    BookingPolicyRuntimeStatus["state"] | null
  >(null);
  const mutationQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  const mutationPendingRef = useRef(0);
  const mutationEpochRef = useRef(0);
  const inFlightRef = useRef<Promise<ReloadResult> | null>(null);

  const commitRules = useCallback((next: BookingPolicyRules) => {
    setRules((current) => {
      const committed = preserveNestedIdentity(current, next);
      rulesRef.current = committed;
      return committed;
    });
  }, []);

  const reloadRequest = useCallback(async (): Promise<ReloadResult> => {
    if (!policyClient) {
      setLoading(false);
      setConfirmed(true);
      confirmedRef.current = true;
      return { ok: true as const, runtime: INACTIVE_RUNTIME };
    }

    if (!confirmedRef.current) setLoading(true);
    setError(null);
    const mutationEpochAtStart = mutationEpochRef.current;
    try {
      const [runtimeResult, rulesResult] = await Promise.all([
        getBookingPolicyRuntimeStatus(policyClient),
        getBookingRules(policyClient),
      ]);
      const rpcError = runtimeResult.error || rulesResult.error;
      if (rpcError) {
        const message = rpcError.message || "Couldn't load booking rules.";
        setError(message);
        return { ok: false as const, error: message };
      }
      const nextRuntime = dbBookingPolicyRuntimeToApp(runtimeResult.data);
      const nextRules = dbBookingRulesToApp(rulesResult.data);
      if (mutationEpochAtStart !== mutationEpochRef.current) {
        return { ok: true as const, runtime: runtimeRef.current };
      }
      const previousRuntimeState = lastConfirmedRuntimeStateRef.current;
      runtimeRef.current = nextRuntime;
      lastConfirmedRuntimeStateRef.current = nextRuntime.state;
      setRuntime(nextRuntime);
      commitRules(nextRules);
      confirmedRef.current = true;
      setConfirmed(true);
      if (
        previousRuntimeState !== null &&
        previousRuntimeState !== "active" &&
        nextRuntime.state === "active"
      ) {
        window.dispatchEvent(new Event(BOOKING_POLICY_INVALIDATED_EVENT));
      }
      return { ok: true as const, runtime: nextRuntime };
    } catch (caught) {
      const message =
        caught instanceof Error
          ? caught.message
          : "Couldn't load booking rules.";
      setError(message);
      return { ok: false as const, error: message };
    } finally {
      setLoading(false);
    }
  }, [commitRules]);

  const reload = useCallback(async () => {
    if (mutationPendingRef.current > 0) {
      return { ok: true as const, runtime: runtimeRef.current };
    }
    if (inFlightRef.current) return inFlightRef.current;
    const request = reloadRequest();
    inFlightRef.current = request;
    try {
      return await request;
    } finally {
      if (inFlightRef.current === request) inFlightRef.current = null;
    }
  }, [reloadRequest]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    const refresh = () => {
      void reload();
    };
    const unregisterResume = registerResume(refresh);
    window.addEventListener("focus", refresh);
    return () => {
      unregisterResume();
      window.removeEventListener("focus", refresh);
    };
  }, [reload]);

  useEffect(() => {
    if (!policyClient || runtime.state === "active") return undefined;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const nextDelay = () => {
      if (runtime.state !== "scheduled" || !runtime.scheduledEffectiveAt) {
        return NON_ACTIVE_POLL_MS;
      }
      const untilBoundary =
        Date.parse(runtime.scheduledEffectiveAt) - Date.now();
      if (untilBoundary > BOUNDARY_WINDOW_MS) {
        return Math.min(
          NON_ACTIVE_POLL_MS,
          untilBoundary - BOUNDARY_WINDOW_MS,
        );
      }
      if (untilBoundary > 0) {
        return Math.min(BOUNDARY_POLL_MS, untilBoundary);
      }
      return BOUNDARY_POLL_MS;
    };

    const schedule = () => {
      timer = setTimeout(async () => {
        const result = await reload();
        if (
          !cancelled &&
          (result?.ok === false || result?.runtime?.state !== "active")
        ) {
          schedule();
        }
      }, nextDelay());
    };

    schedule();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [reload, runtime.scheduledEffectiveAt, runtime.state]);

  const updateRules = useCallback(
    (patch: BookingRulesPatch) => {
      mutationPendingRef.current += 1;
      mutationEpochRef.current += 1;

      const execute = async () => {
        const previous = rulesRef.current;
        try {
          setError(null);

          if (!policyClient) {
            commitRules(applyPatch(previous, patch));
            return { ok: true as const };
          }

          const { data, error: rpcError } = await updateBookingRules(
            policyClient,
            { rules: patch },
          );
          if (rpcError) {
            const message =
              rpcError.message || "Couldn't save booking rules.";
            logger.error("Failed to update booking rules", rpcError, {
              tags: { hook: "useBookingPolicyRuntime", op: "updateRules" },
            });
            setError(message);
            return { ok: false as const, error: message };
          }

          commitRules(dbBookingRulesToApp(data));
          return { ok: true as const };
        } catch (caught) {
          const message =
            caught instanceof Error
              ? caught.message
              : "Couldn't save booking rules.";
          setError(message);
          return { ok: false as const, error: message };
        } finally {
          mutationPendingRef.current -= 1;
        }
      };

      const request = mutationQueueRef.current.then(execute, execute);
      mutationQueueRef.current = request.then(
        () => undefined,
        () => undefined,
      );
      return request;
    },
    [commitRules],
  );

  return {
    rules,
    runtime,
    loading,
    confirmed,
    error,
    updateRules,
    reload,
  };
}
