import { useState, useEffect, useCallback } from "react";
import { supabase } from "../client.js";
import { takeBootPrefetch } from "../bootPrefetch.js";
import { fetchSalonConfigRow } from "../queries/bootQueries.js";
import { dbConfigToApp, appConfigToDb } from "../transforms";
import { createDefaultSalonConfig } from "../../constants/salonSettings";
import { logger } from "../../lib/logger";
import { useBookingPolicyRuntime } from "./useBookingPolicyRuntime";

// `canSeed` is true when the caller is an owner — only owners pass the
// owner_insert_salon_config RLS check, so we only attempt the seed in that case.
export function useSalonConfig({ canSeed = false } = {}) {
  const bookingPolicy = useBookingPolicyRuntime();
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    const controller = new AbortController();

    async function fetch() {
      try {
        // Consume the boot prefetch when one is in flight (primed by
        // useAuth alongside the staff-profile fetch); otherwise run the
        // same SELECT ourselves, as before. The owner-seed branch below
        // is untouched either way.
        const { data, error: err } = await (takeBootPrefetch("salonConfig") ??
          fetchSalonConfigRow(supabase, controller.signal));

        if (controller.signal.aborted) return;
        if (err) {
          setError(err.message);
          return;
        }

        if (data) {
          setConfig(dbConfigToApp(data));
          return;
        }

        // No row yet. If the caller is an owner, seed one. Otherwise just
        // expose the in-memory defaults so the UI keeps working — the next
        // owner sign-in will create the row.
        if (canSeed) {
          const defaultConfig = createDefaultSalonConfig();
          const { data: inserted, error: insErr } = await supabase
            .from("salon_config")
            .insert(appConfigToDb(defaultConfig))
            .select()
            .abortSignal(controller.signal)
            .single();
          if (controller.signal.aborted) return;
          if (insErr) {
            setError(insErr.message);
            setConfig(defaultConfig);
          } else {
            setConfig(dbConfigToApp(inserted));
          }
        } else {
          setConfig(createDefaultSalonConfig());
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    fetch();
    return () => { controller.abort(); };
  }, [canSeed]);

  // Returns { ok: true } on success, or { ok: false, error } on failure.
  // Optimistically updates local state, then rolls back on supabase error
  // so the caller can surface a toast without the UI lying about the
  // committed value.
  const updateConfig = useCallback(
    async (updaterOrValue) => {
      const safeConfig = config || createDefaultSalonConfig();
      const newConfig =
        typeof updaterOrValue === "function"
          ? updaterOrValue(safeConfig)
          : updaterOrValue;
      const prev = config;
      setConfig(newConfig);

      if (!supabase) return { ok: true };
      const { error: err } = await supabase
        .from("salon_config")
        .update(appConfigToDb(newConfig))
        .not("id", "is", null); // update the single row
      if (err) {
        logger.error("Failed to update config", err, {
          tags: { hook: "useSalonConfig", op: "updateConfig" },
        });
        setConfig(prev);
        return { ok: false, error: err.message || "Couldn't save settings." };
      }
      return { ok: true };
    },
    [config]
  );

  return {
    config,
    loading,
    error,
    updateConfig,
    bookingRules: bookingPolicy.rules,
    bookingPolicyRuntime: bookingPolicy.runtime,
    bookingRulesLoading: bookingPolicy.loading,
    bookingRulesConfirmed: bookingPolicy.confirmed,
    bookingRulesError: bookingPolicy.error,
    updateBookingRules: bookingPolicy.updateRules,
    reloadBookingPolicy: bookingPolicy.reload,
  };
}
