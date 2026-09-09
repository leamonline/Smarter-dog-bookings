-- ============================================================
-- Measurement telemetry retention: 90 days (#612)
--
-- WHY
-- booking_funnel_events (portal wizard step telemetry) and booking_denials
-- (best-effort denied-demand log) have accrued since July 2026 with no expiry.
-- The measurement catalogue requires a named owner and an explicit retention
-- period before analytical storage keeps customer-activity rows. The owner
-- (@leamonline) set that period at 90 days on 9 September 2026.
--
-- WHAT
-- A daily cron deletes rows in both tables whose created_at is older than
-- 90 days. The longest reporting window the Reports view offers is 90 days
-- and measurementWindow(90) starts at UTC midnight 89 days back, so no row a
-- report can still read is ever removed. Aggregates shown in reports are
-- computed on demand and are not stored, so nothing else changes.
--
-- Additive + idempotent (create or replace, unschedule-then-schedule).
-- Nothing here touches the booking write path or the two logging RPCs.
-- ============================================================

create or replace function public.prune_measurement_telemetry()
returns table (funnel_events_deleted integer, denials_deleted integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cutoff timestamptz := now() - interval '90 days';
  v_funnel integer;
  v_denials integer;
begin
  with gone as (
    delete from public.booking_funnel_events e
    where e.created_at < v_cutoff
    returning e.id
  )
  select count(*) into v_funnel from gone;

  with gone as (
    delete from public.booking_denials d
    where d.created_at < v_cutoff
    returning d.id
  )
  select count(*) into v_denials from gone;

  return query select v_funnel, v_denials;
end;
$$;

comment on function public.prune_measurement_telemetry() is
  'Daily cleanup (#612 retention decision, 9 September 2026). Deletes booking_funnel_events and booking_denials rows older than 90 days and returns the two counts. SECURITY DEFINER; cron-only.';

revoke execute on function public.prune_measurement_telemetry() from public, anon, authenticated;
grant execute on function public.prune_measurement_telemetry() to service_role;

comment on table public.booking_funnel_events is
  'Best-effort per-step telemetry for the customer booking wizard (improvement #4). One session_id per wizard run; the wizard logs each step it reaches via log_funnel_event() fire-and-forget. Staff-read-only; drives the booking-funnel drop-off report. Retention: rows older than 90 days are deleted daily by prune_measurement_telemetry() (owner @leamonline, decided 9 September 2026).';

comment on table public.booking_denials is
  'Best-effort log of booking demand the salon could not accept (capacity, calendar, cutoff, pregnancy, etc.). Written fire-and-forget by log_booking_denial() from the portal wizard + WhatsApp Flow endpoint; a write failure must never block a booking. Staff-read-only. Feeds the capacity-prevented-demand report (accrues from deploy). Retention: rows older than 90 days are deleted daily by prune_measurement_telemetry() (owner @leamonline, decided 9 September 2026).';

-- Daily at 03:25 UTC, after prune_abandoned_signups_daily (03:15) so the
-- overnight jobs stay serial. unschedule first keeps this re-runnable.
do $$
begin
  perform cron.unschedule('prune_measurement_telemetry_daily');
exception when others then
  null;
end$$;

select cron.schedule(
  'prune_measurement_telemetry_daily',
  '25 3 * * *',
  $cron$ select public.prune_measurement_telemetry(); $cron$
);
