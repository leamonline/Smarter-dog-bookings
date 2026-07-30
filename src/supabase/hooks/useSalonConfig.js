import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../client";
import { takeBootPrefetch } from "../bootPrefetch.js";
import { fetchSalonConfigRow } from "../queries/bootQueries.js";
import { dbConfigToApp, appConfigToDb } from "../transforms";
import { createDefaultSalonConfig } from "../../constants/salonSettings";
import { logger } from "../../lib/logger";
import { useBookingPolicyRuntime } from "./useBookingPolicyRuntime";

function isValidAuthoritativeRow(row, expectedId) {
  return (
    typeof row?.id === "string" &&
    row.id.length > 0 &&
    (expectedId === undefined || row.id === expectedId) &&
    (typeof row.updated_at === "string" || row.updated_at === null)
  );
}

// `canSeed` is true when the caller is an owner — only owners pass the
// owner_insert_salon_config RLS check, so we only attempt the seed in that case.
export function useSalonConfig({ canSeed = false } = {}) {
  const bookingPolicy = useBookingPolicyRuntime();
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const configRef = useRef(null);
  const rowRef = useRef(null);
  const saveQueueRef = useRef(Promise.resolve());
  const externalAuthorityGenerationRef = useRef(0);

  const installConfig = useCallback((nextConfig) => {
    configRef.current = nextConfig;
    setConfig(nextConfig);
  }, []);

  const installAuthoritativeRow = useCallback((row) => {
    const nextConfig = dbConfigToApp(row);
    const hasIdentityAndVersion = isValidAuthoritativeRow(row);

    rowRef.current = hasIdentityAndVersion
      ? { id: row.id, updatedAt: row.updated_at }
      : null;
    installConfig(nextConfig);
    return hasIdentityAndVersion;
  }, [installConfig]);

  const recoverAuthoritativeConfig = useCallback(async (previousConfig) => {
    let latest;
    let reloadError;
    try {
      ({ data: latest, error: reloadError } = await fetchSalonConfigRow(supabase));
    } catch (err) {
      reloadError = err;
    }

    if (reloadError || !isValidAuthoritativeRow(latest)) {
      rowRef.current = null;
      installConfig(previousConfig);
      if (reloadError) {
        logger.error("Failed to reload config after an unverifiable write", reloadError, {
          tags: { hook: "useSalonConfig", op: "updateConfig" },
        });
      }
      return false;
    }

    installAuthoritativeRow(latest);
    externalAuthorityGenerationRef.current += 1;
    return true;
  }, [installAuthoritativeRow, installConfig]);

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
          installAuthoritativeRow(data);
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
            installConfig(defaultConfig);
          } else {
            installAuthoritativeRow(inserted);
          }
        } else {
          installConfig(createDefaultSalonConfig());
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    fetch();
    return () => { controller.abort(); };
  }, [canSeed, installAuthoritativeRow, installConfig]);

  // Returns { ok: true } on success, or { ok: false, error } on failure.
  // Turns are serialised so functional updates always start from the last
  // accepted config, rather than from a possibly stale render snapshot.
  const updateConfig = useCallback(
    (updaterOrValue) => {
      const isUpdater = typeof updaterOrValue === "function";
      const enqueuedAuthorityGeneration = externalAuthorityGenerationRef.current;
      const turn = saveQueueRef.current.then(async () => {
        const previousConfig = configRef.current || createDefaultSalonConfig();
        if (
          !isUpdater &&
          enqueuedAuthorityGeneration !== externalAuthorityGenerationRef.current
        ) {
          return {
            ok: false,
            error: "Settings changed while this save was queued. Please review the latest settings and try your change again.",
          };
        }

        const nextConfig = isUpdater
          ? updaterOrValue(previousConfig)
          : updaterOrValue;
        installConfig(nextConfig);

        if (!supabase) return { ok: true };

        const authoritativeRow = rowRef.current;
        if (!authoritativeRow) {
          installConfig(previousConfig);
          return {
            ok: false,
            error: "Couldn't save settings because the latest settings could not be verified. Please reload and try again.",
          };
        }

        try {
          let query = supabase
            .from("salon_config")
            .update(appConfigToDb(nextConfig))
            .eq("id", authoritativeRow.id);
          query = authoritativeRow.updatedAt === null
            ? query.is("updated_at", null)
            : query.eq("updated_at", authoritativeRow.updatedAt);

          const { data: updated, error: err } = await query.select().maybeSingle();
          if (err) {
            logger.error("Failed to update config", err, {
              tags: { hook: "useSalonConfig", op: "updateConfig" },
            });
            installConfig(previousConfig);
            return { ok: false, error: err.message || "Couldn't save settings." };
          }

          if (!updated) {
            if (!await recoverAuthoritativeConfig(previousConfig)) {
              return {
                ok: false,
                error: "Couldn't reload the latest settings. Please reload before trying your change again.",
              };
            }

            return {
              ok: false,
              error: "Settings changed elsewhere. The latest settings have been reloaded; please try your change again.",
            };
          }

          if (!isValidAuthoritativeRow(updated, authoritativeRow.id)) {
            if (await recoverAuthoritativeConfig(previousConfig)) {
              return {
                ok: false,
                error: "Couldn't verify the saved settings. The latest settings have been reloaded; please review them before trying again.",
              };
            }
            return {
              ok: false,
              error: "Couldn't verify the saved settings. Please reload before trying another change.",
            };
          }

          installAuthoritativeRow(updated);
          return { ok: true };
        } catch (err) {
          logger.error("Failed to update config", err, {
            tags: { hook: "useSalonConfig", op: "updateConfig" },
          });
          installConfig(previousConfig);
          return {
            ok: false,
            error: err?.message || "Couldn't save settings.",
          };
        }
      });

      // A failed turn is returned to its caller, but must not block later
      // settings changes queued from the same hook instance.
      saveQueueRef.current = turn.catch(() => undefined);
      return turn;
    },
    [installAuthoritativeRow, installConfig, recoverAuthoritativeConfig]
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
