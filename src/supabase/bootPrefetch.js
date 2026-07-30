// bootPrefetch — fires the tier-1 staff-dashboard reads (bookings week,
// salon_config, day_settings week) concurrently with the staff-profile
// fetch, instead of after it. useAuth primes this from the same
// setTimeout(0) task that starts the profile fetch; the owning hooks then
// consume the in-flight promises when they mount (or fall back to fetching
// themselves if nothing was primed — tests and the sign-in flow take that
// path).
//
// The auth gate itself is untouched: nothing renders earlier, the responses
// just arrive sooner. NO caching layer — each primed promise is handed out
// at most once, only for matching params, and only within a short TTL.
import { supabase } from "./client";
import { toDateStr } from "./transforms";
import {
  fetchBookingsWeek,
  fetchSalonConfigRow,
  fetchDaySettingsWeek,
} from "./queries/bootQueries.js";

// A primed promise older than this is stale (the user has almost certainly
// navigated weeks or the app failed mid-boot) — consumers refetch instead.
const TTL_MS = 30_000;

let primed = false;
const store = new Map(); // name → { params, promise, primedAt }

// Compute the boot week EXACTLY like useWeekNav does on mount: honour a
// ?date=YYYY-MM-DD query param when present and valid, else today; then
// derive that week's Monday (dow === 0 ? -6 : 1 - dow — Sunday belongs to
// the week that STARTED six days earlier). Exported for the logic tests.
export function computeBootWeekRange() {
  let base = new Date();
  const search =
    typeof window !== "undefined" ? window.location?.search || "" : "";
  const dateParam = new URLSearchParams(search).get("date");
  if (dateParam) {
    const parsed = new Date(dateParam + "T00:00:00");
    if (!isNaN(parsed.getTime())) base = parsed;
  }
  const dow = base.getDay();
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(base);
  monday.setDate(base.getDate() + mondayOffset);
  monday.setHours(0, 0, 0, 0);
  const weekEnd = new Date(monday);
  weekEnd.setDate(monday.getDate() + 6);
  return { startStr: toDateStr(monday), endStr: toDateStr(weekEnd) };
}

// Fire the three tier-1 queries. No-op when the supabase client is null
// (offline harness) or when already primed (module flag — useAuth's
// initial-load gate is belt and braces on top of this).
export function primeBootPrefetch() {
  if (!supabase || primed) return;
  primed = true;

  const { startStr, endStr } = computeBootWeekRange();
  const primedAt = Date.now();

  // Promise.resolve() subscribes to the lazy PostgREST builder, which is
  // what actually issues the request. Builders resolve with { data, error }
  // (they don't reject on network failure), matching what the hooks expect.
  store.set("bookingsWeek", {
    params: { startStr },
    promise: Promise.resolve(fetchBookingsWeek(supabase, startStr, endStr)),
    primedAt,
  });
  store.set("salonConfig", {
    params: {},
    promise: Promise.resolve(fetchSalonConfigRow(supabase)),
    primedAt,
  });
  store.set("daySettingsWeek", {
    params: { startStr },
    promise: Promise.resolve(fetchDaySettingsWeek(supabase, startStr, endStr)),
    primedAt,
  });
}

// Hand a primed promise to its owning hook, at most once. Returns null —
// and the hook falls back to its own fetch — when nothing was primed, the
// params don't match what was primed (e.g. a ?date= week change raced the
// boot), or the entry is older than the TTL.
export function takeBootPrefetch(name, params = {}) {
  const entry = store.get(name);
  if (!entry) return null;
  if (Date.now() - entry.primedAt >= TTL_MS) return null;
  if (entry.params.startStr !== params.startStr) return null;
  store.delete(name);
  return entry.promise;
}

export function _resetBootPrefetchForTests() {
  primed = false;
  store.clear();
}
