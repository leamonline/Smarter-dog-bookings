-- ============================================================
-- Customer reminder confirmation advances Booked -> Reconfirmed
--
-- Connects the existing confirmation event to the lifecycle status added in
-- 20260919090000. NOTHING about the reminder flow itself changes: no new
-- message is sent, no template changes, the 36-hour eligibility window and the
-- staff-overwrite rule are untouched, and the 'reconfirmed' booking_event still
-- fires off reminder_confirmed_at exactly as before (so no new notification is
-- emitted by this change).
--
-- The status advance is deliberately far narrower than the stamping it rides
-- on. Four guards, each closing a scenario found by tracing the callers:
--
-- 1. ONLY Booked -> Reconfirmed.
--    The RPC is human-scoped, not booking-scoped: one "Yes" stamps every
--    eligible booking for that customer, and its status filter admits Arrived
--    and Ready for collection. In production today, 6 bookings at
--    Ready-for-collection and 1 mid-visit already carry a customer
--    confirmation — customers really do tap Confirm after dropping the dog
--    off. Advancing those would drag a dog that is standing in the salon
--    BACKWARDS to Reconfirmed, and because Reconfirmed ranks below Arrived the
--    lifecycle trigger would then clear checked_in_at and destroy the arrival
--    history. A booking that has moved on is stamped, as it is today, and its
--    status is left alone.
--
-- 2. ONLY a booking dated today or later.
--    Reminders go out 0-8 days ahead (421 sent; none has ever been sent after
--    the appointment date), but "0 days ahead" plus a 36-hour reply window
--    means a reply can arrive roughly a day AFTER the visit. A booking left on
--    Booked because the paperwork was never closed would otherwise be
--    reconfirmed retrospectively, for an appointment that has already happened.
--
-- 3. No-show excluded alongside Cancelled.
--    The filter still read NOT IN ('Cancelled','Completed'), which was correct
--    when a no-show WAS a Cancelled row. Since the split it silently admitted
--    no-shows. This restores the pre-split behaviour rather than changing it.
--
-- 4. A reschedule clears the status too (see reset_reminder_on_reschedule
--    below), so a moved booking cannot keep a Reconfirmed status for a date
--    nobody confirmed.
--
-- Idempotent: create or replace only.
-- ============================================================

begin;

create or replace function public.mark_reminder_confirmed(p_human_id uuid)
returns setof uuid
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  return query
  update bookings b
     set reminder_confirmed_at = now(),
         reminder_confirmed_source = 'customer',
         -- Guards 1 and 2. Every other status is stamped but not advanced,
         -- which is exactly what happens today.
         status = case
           when b.status = 'Booked'
            and b.booking_date >= (now() at time zone 'Europe/London')::date
           then 'Reconfirmed'
           else b.status
         end
    from dogs d
   where b.dog_id = d.id
     and d.human_id = p_human_id
     and (b.reminder_confirmed_at is null
          or b.reminder_confirmed_source = 'staff')
     -- Guard 3.
     and b.status not in ('Cancelled', 'Completed', 'No-show')
     and exists (
       select 1
         from notification_log n
        where n.booking_id    = b.id
          and n.trigger_type  = 'reminder'
          and n.channel       = 'whatsapp'
          and n.status        = 'sent'
          and n.sent_at       >= now() - interval '36 hours'
     )
  returning b.id;
end;
$$;

comment on function public.mark_reminder_confirmed(uuid) is
  'Stamps a customer reminder confirmation for every eligible booking of one customer, and advances Booked -> Reconfirmed for those dated today or later. Never advances a booking that has already arrived: that would rank it below Arrived and clear checked_in_at. Sends nothing.';

-- Grants restated: REPLACE preserves them, but a bare re-apply must not depend
-- on that, and Supabase auto-grants EXECUTE on public functions to anon. This
-- RPC is called by the service-role edge function only.
revoke all on function public.mark_reminder_confirmed(uuid) from public;
revoke all on function public.mark_reminder_confirmed(uuid) from anon;
revoke all on function public.mark_reminder_confirmed(uuid) from authenticated;

-- ── Guard 4: a reschedule un-reconfirms the booking ──────────────────
-- The confirmation was for the old date, and this trigger already clears both
-- halves of the pair and deletes the reminder log rows so a fresh reminder must
-- go out. Without the status reset, a moved booking would keep a Reconfirmed
-- status that no longer has a confirmation behind it — the screen would claim
-- the customer confirmed a date they were never asked about.
create or replace function public.reset_reminder_on_reschedule()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if new.booking_date is distinct from old.booking_date then
    -- Free the idempotency index so the next cron/manual send fires afresh,
    -- and drop any stale failure for the old date at the same time.
    delete from public.notification_log
     where booking_id = old.id
       and trigger_type in ('reminder', 'reminder_sms_fallback');

    -- The confirmation was for the old date - clear both halves so the
    -- booking isn't shown as confirmed for a date nobody confirmed.
    new.reminder_confirmed_at := null;
    new.reminder_confirmed_source := null;

    -- ...and the status that confirmation produced. Only Reconfirmed is
    -- reverted: a dog that has arrived has arrived, whatever date the booking
    -- was moved to, and a terminal status is not ours to reopen.
    if new.status = 'Reconfirmed' then
      new.status := 'Booked';
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.reset_reminder_on_reschedule() from public, anon, authenticated;

commit;
