import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../client";
import { takeBootPrefetch } from "../bootPrefetch.js";
import { fetchSalonConfigRow } from "../queries/bootQueries.js";
import { dbConfigToApp, appConfigToDb } from "../transforms";
import type { DbConfigRow } from "../transforms";
import { createDefaultSalonConfig } from "../../constants/salonSettings";
import { logger } from "../../lib/logger";
import { useBookingPolicyRuntime } from "./useBookingPolicyRuntime";
import type { Database, Json } from "../database.types";
import type { SalonConfig } from "../../types/index";

type SalonConfigRow = Database["public"]["Tables"]["salon_config"]["Row"];
type SalonConfigInsert = Database["public"]["Tables"]["salon_config"]["Insert"];
type SalonConfigUpdate = Database["public"]["Tables"]["salon_config"]["Update"];

/** The (id, updated_at) pair a guarded save must match to be accepted. */
interface AuthoritativeRowRef {
  id: string;
  updatedAt: string | null;
}

export type UpdateConfigResult = { ok: true } | { ok: false; error: string };

/** Either a full replacement config or a functional update from the last accepted one. */
export type ConfigUpdater = SalonConfig | ((previous: SalonConfig) => SalonConfig);

/**
 * A row carrying enough identity to act as the save authority. Both the boot
 * prefetch and the JS query helpers hand back untyped data, so the guard
 * takes `unknown` and only promises the two columns it actually inspects.
 */
type IdentifiedRow = Pick<SalonConfigRow, "id" | "updated_at">;

function isValidAuthoritativeRow(row: unknown, expectedId?: string): row is IdentifiedRow {
  if (typeof row !== "object" || row === null) return false;
  const candidate = row as Partial<IdentifiedRow>;
  return (
    typeof candidate.id === "string" &&
    candidate.id.length > 0 &&
    (expectedId === undefined || candidate.id === expectedId) &&
    (typeof candidate.updated_at === "string" || candidate.updated_at === null)
  );
}

/**
 * The generated row types the jsonb columns as Json; narrow them once for the
 * transform. Optional columns stay optional so a partial row (offline seeds,
 * test fixtures) still folds onto the defaults inside dbConfigToApp.
 */
function toConfigRow(row: Partial<SalonConfigRow>): DbConfigRow {
  return {
    default_pickup_offset: row.default_pickup_offset ?? null,
    pricing: (row.pricing as DbConfigRow["pricing"]) ?? null,
    enforce_capacity: row.enforce_capacity ?? null,
    daily_dog_cap: row.daily_dog_cap ?? null,
    large_dog_slots: (row.large_dog_slots as DbConfigRow["large_dog_slots"]) ?? null,
    settings: (row.settings as DbConfigRow["settings"]) ?? null,
  };
}

/** Reverse direction: the app shape is plain data, so it serialises to jsonb as-is. */
function toDbPayload(config: SalonConfig): SalonConfigInsert & SalonConfigUpdate {
  const out = appConfigToDb(config);
  return {
    default_pickup_offset: out.default_pickup_offset,
    pricing: out.pricing as Json,
    enforce_capacity: out.enforce_capacity,
    daily_dog_cap: out.daily_dog_cap,
    large_dog_slots: out.large_dog_slots as Json,
    settings: out.settings as unknown as Json,
  };
}

export interface UseSalonConfigOptions {
  /** True for owners — only they pass the owner_insert_salon_config RLS check, so only they seed. */
  canSeed?: boolean;
}

// `canSeed` is true when the caller is an owner — only owners pass the
// owner_insert_salon_config RLS check, so we only attempt the seed in that case.
export function useSalonConfig({ canSeed = false }: UseSalonConfigOptions = {}) {
  const bookingPolicy = useBookingPolicyRuntime();
  const [config, setConfig] = useState<SalonConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const configRef = useRef<SalonConfig | null>(null);
  const rowRef = useRef<AuthoritativeRowRef | null>(null);
  const saveQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  const externalAuthorityGenerationRef = useRef(0);

  const installConfig = useCallback((nextConfig: SalonConfig | null) => {
    configRef.current = nextConfig;
    setConfig(nextConfig);
  }, []);

  const installAuthoritativeRow = useCallback((row: Partial<SalonConfigRow>): boolean => {
    const nextConfig = dbConfigToApp(toConfigRow(row));
    const hasIdentityAndVersion = isValidAuthoritativeRow(row);

    rowRef.current = hasIdentityAndVersion
      ? { id: row.id, updatedAt: row.updated_at }
      : null;
    installConfig(nextConfig);
    return hasIdentityAndVersion;
  }, [installConfig]);

  const recoverAuthoritativeConfig = useCallback(async (previousConfig: SalonConfig): Promise<boolean> => {
    let latest: unknown;
    let reloadError: unknown;
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
    // Narrowed once here; the nested async function below would otherwise
    // lose the null check.
    const client = supabase;
    const controller = new AbortController();

    async function fetch() {
      try {
        // Consume the boot prefetch when one is in flight (primed by
        // useAuth alongside the staff-profile fetch); otherwise run the
        // same SELECT ourselves, as before. The owner-seed branch below
        // is untouched either way.
        const { data, error: err } = await (takeBootPrefetch("salonConfig") ??
          fetchSalonConfigRow(client, controller.signal));

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
          const { data: inserted, error: insErr } = await client
            .from("salon_config")
            .insert(toDbPayload(defaultConfig))
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
    (updaterOrValue: ConfigUpdater): Promise<UpdateConfigResult> => {
      const isUpdater = typeof updaterOrValue === "function";
      const enqueuedAuthorityGeneration = externalAuthorityGenerationRef.current;
      const turn = saveQueueRef.current.then(async (): Promise<UpdateConfigResult> => {
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

        const nextConfig = typeof updaterOrValue === "function"
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
            .update(toDbPayload(nextConfig))
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
            error: (err instanceof Error && err.message) || "Couldn't save settings.",
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
