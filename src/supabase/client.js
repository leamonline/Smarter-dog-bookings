import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn(
    "Supabase credentials not found. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env.local. VITE_SUPABASE_ANON_KEY is still supported as a fallback. Running in offline mode."
  );
}

// Use a simple in-memory lock instead of navigator.locks, which causes
// deadlocks when multiple Supabase hooks mount simultaneously.
const navigatorLockFallback = async (name, _opts, fn) => {
  // Serialise callers with a promise queue per lock name.
  navigatorLockFallback._q = navigatorLockFallback._q || {};
  const prev = navigatorLockFallback._q[name] || Promise.resolve();
  const next = prev.catch(() => {}).then(() => fn());
  navigatorLockFallback._q[name] = next;
  return next;
};

export const supabase =
  supabaseUrl && supabaseKey
    ? createClient(supabaseUrl, supabaseKey, {
        auth: {
          lock: navigatorLockFallback,
        },
      })
    : null;
