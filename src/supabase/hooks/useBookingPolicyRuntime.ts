import { useCallback, useEffect, useState } from "react";
import type { BookingPolicyRules, BookingPolicyRuntimeStatus } from "../../types";
import { createDefaultBookingRules } from "../../constants/salonSettings";
import { logger } from "../../lib/logger";
import { supabase } from "../client.js";
import {
  getBookingPolicyRuntimeStatus,
  getBookingRules,
  updateBookingRules,
} from "../rpc";
import {
  dbBookingPolicyRuntimeToApp,
  dbBookingRulesToApp,
} from "../transforms";

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
  const [loading, setLoading] = useState(Boolean(supabase));
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!supabase) {
      setLoading(false);
      return { ok: true as const };
    }

    setLoading(true);
    setError(null);
    try {
      const [runtimeResult, rulesResult] = await Promise.all([
        getBookingPolicyRuntimeStatus(supabase),
        getBookingRules(supabase),
      ]);
      const rpcError = runtimeResult.error || rulesResult.error;
      if (rpcError) {
        const message = rpcError.message || "Couldn't load booking rules.";
        setError(message);
        return { ok: false as const, error: message };
      }
      setRuntime(dbBookingPolicyRuntimeToApp(runtimeResult.data));
      setRules(dbBookingRulesToApp(rulesResult.data));
      return { ok: true as const };
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
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const updateRules = useCallback(
    async (patch: BookingRulesPatch) => {
      const previous = rules;
      setError(null);

      if (!supabase) {
        setRules(applyPatch(previous, patch));
        return { ok: true as const };
      }

      const { data, error: rpcError } = await updateBookingRules(supabase, {
        rules: patch,
      });
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
    error,
    updateRules,
    reload,
  };
}
