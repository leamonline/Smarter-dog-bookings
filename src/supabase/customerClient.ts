import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY;

// In-memory lock (same as staff client) to prevent
// navigator.locks deadlocks.
type LockQueue = Record<string, Promise<unknown>>;

interface NavigatorLockFallback {
  <Result>(
    name: string,
    _opts: number,
    fn: () => Promise<Result>,
  ): Promise<Result>;
  _q?: LockQueue;
}

const navigatorLockFallback: NavigatorLockFallback = async <Result>(
  name: string,
  _opts: number,
  fn: () => Promise<Result>,
) => {
  navigatorLockFallback._q ??= {};
  const prev = navigatorLockFallback._q[name] || Promise.resolve();
  const next = prev.catch(() => {}).then(() => fn());
  navigatorLockFallback._q[name] = next;
  return next;
};

// Separate client with its own storage key so
// customer and staff sessions don't interfere.
export const customerSupabase =
  supabaseUrl && supabaseKey
    ? createClient<Database>(supabaseUrl, supabaseKey, {
        auth: {
          lock: navigatorLockFallback,
          storageKey: "sb-customer-auth-token",
        },
      })
    : null;
