// bootQueries — the three tier-1 initial reads the staff dashboard needs to
// paint the week view, extracted so the boot prefetch (src/supabase/
// bootPrefetch.js) and the owning hooks fire the SAME query bodies and can't
// drift. Each function returns the raw supabase result promise/thenable —
// callers destructure { data, error } exactly as before.
//
// `signal` is optional: the hooks pass their AbortController signal (their
// historical behaviour, byte-for-byte); the prefetch path has no controller
// because it fires before any component mounts.

// The exact initial week select from useBookings (src/supabase/hooks/
// useBookings.js).
export function fetchBookingsWeek(client, startStr, endStr, signal) {
  const query = client
    .from("bookings")
    .select("*, notification_log(trigger_type, status, sent_at, channel)")
    .gte("booking_date", startStr)
    .lte("booking_date", endStr)
    .order("booking_date")
    .order("slot");
  return signal ? query.abortSignal(signal) : query;
}

// The salon_config SELECT (maybeSingle) from useSalonConfig (src/supabase/
// hooks/useSalonConfig.ts). SELECT only — the owner-seed branch stays in the
// hook.
export function fetchSalonConfigRow(client, signal) {
  const query = client.from("salon_config").select("*").limit(1);
  return (signal ? query.abortSignal(signal) : query).maybeSingle();
}

// The day_settings week select from useDaySettings (src/supabase/hooks/
// useDaySettings.js).
export function fetchDaySettingsWeek(client, startStr, endStr, signal) {
  const query = client
    .from("day_settings")
    .select("*")
    .gte("setting_date", startStr)
    .lte("setting_date", endStr);
  return signal ? query.abortSignal(signal) : query;
}
