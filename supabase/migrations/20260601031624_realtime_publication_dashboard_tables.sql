-- ============================================================
-- Realtime publication — remaining dashboard tables
--
-- Adds the three dashboard tables whose client subscriptions were
-- silently dead because the table was never in the supabase_realtime
-- publication. Their postgres_changes handlers existed but never
-- received events, so these panels only updated on a manual refetch:
--
--   - waitlist_entries → useWaitlist / useWaitlistUpcoming
--   - notification_log → useTomorrowReminders (live reminder ticks)
--   - booking_events   → useBookingEvents (recent activity feed)
--
-- bookings, day_settings, dogs, humans, salon_todos and the whatsapp_*
-- tables were already published (the first four were enabled via the
-- Supabase dashboard rather than a migration, which is why earlier
-- migrations never reference them).
--
-- RLS still applies to realtime delivery: all three tables already have
-- authenticated/staff SELECT policies, so staff clients receive events
-- and customers don't.
--
-- Idempotent by design: guards on pg_publication_tables before adding,
-- so this is safe to re-run and safe over an environment where a subset
-- has already been added by hand.
-- ============================================================

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'waitlist_entries',
    'notification_log',
    'booking_events'
  ]
  loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = tbl
    ) then
      execute format(
        'alter publication supabase_realtime add table public.%I',
        tbl
      );
    end if;
  end loop;
end
$$;
