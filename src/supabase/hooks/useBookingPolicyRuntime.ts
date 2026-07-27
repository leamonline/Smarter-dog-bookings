import { useCallback, useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { BookingPolicyRules, BookingPolicyRuntimeStatus } from "../../types";
import { createDefaultBookingRules } from "../../constants/salonSettings";
import { logger } from "../../lib/logger";
import { bookingPolicyClient } from "../client.js";
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
// hook calls. Production receives the full Supabase client.
const policyClient = bookingPolicyClient as SupabaseClient | null;

export type BookingRulesPatch = Partial<
  Omit<BookingPolicyRules, "customerPortal" | "depositBank">
> & {
  customerPortal?: Partial<BookingPolicyRules["customerPortal"]>;
  depositBank?: BookingPolicyRules["depositBank"];
};

const INACTIVE_RUNTIME: BookingPolicyRuntimeStatus = {
  state: "inactive",
  scheduledEffectiveAt: null,
};

const NON_ACTIVE_POLL_MS = 60_000;
const BOUNDARY_POLL_MS = 5_000;
const BOUNDARY_WINDOW_MS = 60_000;

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
  const inFlightRef = useRef<ReturnType<typeof reloadRequest> | null>(null);

  async function reloadRequest() {
    if (!policyClient) {
      setLoading(false);
      setConfirmed(true);
      confirmedRef.current = true;
      return { ok: true as const, runtime: INACTIVE_RUNTIME };
    }

    if (!confirmedRef.current) setLoading(true);
    setError(null);
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
      setRuntime(nextRuntime);
      setRules(dbBookingRulesToApp(rulesResult.data));
      confirmedRef.current = true;
      setConfirmed(true);
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
  }

  const reload = useCallback(async () => {
    if (inFlightRef.current) return inFlightRef.current;
    const request = reloadRequest();
    inFlightRef.current = request;
    try {
      return await request;
    } finally {
      if (inFlightRef.current === request) inFlightRef.current = null;
    }
  }, []);

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
    async (patch: BookingRulesPatch) => {
      const previous = rules;
      setError(null);

      if (!policyClient) {
        setRules(applyPatch(previous, patch));
        return { ok: true as const };
      }

      const { data, error: rpcError } = await updateBookingRules(
        policyClient,
        { rules: patch },
      );
      if (rpcError) {
        const message = rpcError.message || "Couldn't save booking rules.";
        logger.error("Failed to update booking rules", rpcError, {
          tags: { hook: "useBookingPolicyRuntime", op: "updateRules" },
        });
        setError(message);
        return { ok: false as const, error: message };
      }

      try {
        setRules(dbBookingRulesToApp(data));
        return { ok: true as const };
      } catch (caught) {
        const message =
          caught instanceof Error
            ? caught.message
            : "Couldn't reload booking rules.";
        setRules(previous);
        setError(message);
        return { ok: false as const, error: message };
      }
    },
    [rules],
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
