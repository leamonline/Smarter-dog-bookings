import { useEffect, useRef, useState } from "react";
import { supabase } from "../client";
import { logger } from "../../lib/logger";

/**
 * useStaffName — resolves a `staff_profiles.user_id` to a display name.
 *
 * Used for surfacing audit metadata (e.g. "Overridden by Alex on …")
 * on booking cards and detail modals without joining every booking
 * fetch against staff_profiles.
 *
 * Cache is module-scoped so multiple consumers share lookups; the
 * map only grows. Salons typically have 1-3 staff so this stays tiny.
 *
 * Returns `{ name, loading }`:
 *   - `name` is the resolved display_name, or null while loading or
 *     if the user_id doesn't exist in staff_profiles.
 *   - `loading` is true on the first render after a uuid is supplied,
 *     until the fetch settles.
 */
export interface UseStaffNameResult {
  name: string | null;
  loading: boolean;
}

// user_id -> displayName | null (null means "fetched, not found")
const cache = new Map<string, string | null>();
// user_id -> in-flight lookup
const pending = new Map<string, Promise<string | null>>();

async function fetchOne(userId: string | null | undefined): Promise<string | null> {
  if (!supabase || !userId) return null;
  const inFlight = pending.get(userId);
  if (inFlight) return inFlight;
  const client = supabase;

  const p = (async (): Promise<string | null> => {
    const { data, error } = await client
      .from("staff_profiles")
      .select("display_name")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) {
      logger.warn("useStaffName: failed to fetch staff_profile", {
        tags: { hook: "useStaffName", op: "fetch" },
        extra: { userId, message: error?.message },
      });
      return null;
    }
    return data?.display_name || null;
  })();

  pending.set(userId, p);
  const name = await p;
  cache.set(userId, name);
  pending.delete(userId);
  return name;
}

export function useStaffName(userId: string | null | undefined): UseStaffNameResult {
  const [name, setName] = useState<string | null>(() => (userId ? cache.get(userId) ?? null : null));
  const [loading, setLoading] = useState(() => Boolean(userId && !cache.has(userId)));
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!userId) {
      setName(null);
      setLoading(false);
      return;
    }
    if (cache.has(userId)) {
      setName(cache.get(userId) ?? null);
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchOne(userId).then((resolved) => {
      if (!mountedRef.current) return;
      setName(resolved);
      setLoading(false);
    });
  }, [userId]);

  return { name, loading };
}
