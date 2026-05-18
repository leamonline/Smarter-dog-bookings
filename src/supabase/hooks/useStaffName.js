import { useEffect, useRef, useState } from "react";
import { supabase } from "../client.js";

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
const cache = new Map(); // user_id -> displayName | null (null means "fetched, not found")
const pending = new Map(); // user_id -> Promise<displayName | null>

async function fetchOne(userId) {
  if (!supabase || !userId) return null;
  if (pending.has(userId)) return pending.get(userId);

  const p = (async () => {
    const { data, error } = await supabase
      .from("staff_profiles")
      .select("display_name")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) {
      console.warn("useStaffName: failed to fetch staff_profile", userId, error);
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

export function useStaffName(userId) {
  const [name, setName] = useState(() => (userId ? cache.get(userId) ?? null : null));
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
      setName(cache.get(userId));
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
