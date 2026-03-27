import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// In-memory lock (same as staff client) to prevent
// navigator.locks deadlocks.
const navigatorLockFallback = async (name, _opts, fn) => {
  navigatorLockFallback._q = navigatorLockFallback._q || {};
  const prev = navigatorLockFallback._q[name] || Promise.resolve();
  const next = prev.catch(() => {}).then(() => fn());
  navigatorLockFallback._q[name] = next;
  return next;
};

// Separate client with its own storage key so
// customer and staff sessions don't interfere.
export const customerSupabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          lock: navigatorLockFallback,
          storageKey: "sb-customer-auth-token",
        },
      })
    : null;
