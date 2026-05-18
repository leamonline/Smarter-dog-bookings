import { useState, useEffect, useCallback } from "react";
import { supabase } from "../client.js";
import { dbConfigToApp, appConfigToDb } from "../transforms.js";
import { PRICING, LARGE_DOG_SLOTS } from "../../constants/salon.ts";

// Defaults used when there's no salon_config row yet (first-time deploys).
// Mirrors what the constants file already exports — keeps DB and client in sync.
const DEFAULT_CONFIG = {
  defaultPickupOffset: 120,
  pricing: PRICING,
  enforceCapacity: true,
  largeDogSlots: LARGE_DOG_SLOTS,
};

// `canSeed` is true when the caller is an owner — only owners pass the
// owner_insert_salon_config RLS check, so we only attempt the seed in that case.
export function useSalonConfig({ canSeed = false } = {}) {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    const controller = new AbortController();

    async function fetch() {
      try {
        const { data, error: err } = await supabase
          .from("salon_config")
          .select("*")
          .limit(1)
          .abortSignal(controller.signal)
          .maybeSingle();

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
          const { data: inserted, error: insErr } = await supabase
            .from("salon_config")
            .insert(appConfigToDb(DEFAULT_CONFIG))
            .select()
            .abortSignal(controller.signal)
            .single();
          if (controller.signal.aborted) return;
          if (insErr) {
            setError(insErr.message);
            setConfig(DEFAULT_CONFIG);
          } else {
            setConfig(dbConfigToApp(inserted));
          }
        } else {
          setConfig(DEFAULT_CONFIG);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    fetch();
    return () => { controller.abort(); };
  }, [canSeed]);

  const updateConfig = useCallback(
    async (updaterOrValue) => {
      const safeConfig = config || DEFAULT_CONFIG;
      const newConfig =
        typeof updaterOrValue === "function"
          ? updaterOrValue(safeConfig)
          : updaterOrValue;
      const prev = config;
      setConfig(newConfig);

      if (!supabase) return;
      const { error: err } = await supabase
        .from("salon_config")
        .update(appConfigToDb(newConfig))
        .not("id", "is", null); // update the single row
      if (err) {
        console.error("Failed to update config:", err);
        setConfig(prev);
      }
    },
    [config]
  );

  return { config, loading, error, updateConfig };
}
