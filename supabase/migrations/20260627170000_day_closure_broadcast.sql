-- ============================================================
-- Day-closure broadcast: notification_log trigger_type + template seed
--
-- Feature 2 lets staff message every Booked customer for a chosen day (e.g. a
-- closure reason) as separate 1:1 templated WhatsApp/SMS sends. Each send is
-- logged with a new trigger_type so the existing idempotency index
-- (booking_id, trigger_type, human_id) WHERE status IN ('pending','sent')
-- de-dupes re-fires.
--
-- The broadcast-message edge function gates sending on (a) a kill-switch env
-- var and (b) this template being status='approved'. We seed it as 'pending';
-- it must be submitted to Meta and approved before anything sends.
-- ============================================================

-- Extend the trigger_type CHECK to add 'day_closure'. Drop by definition match
-- (name-drift-safe) and recreate with EVERY existing live value preserved plus
-- the new one — dropping any value would silently break that notification path.
do $$
declare r record;
begin
  for r in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    where t.relname = 'notification_log'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%trigger_type%'
  loop
    execute format('alter table public.notification_log drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.notification_log
  add constraint notification_log_trigger_type_check
  check (trigger_type in (
    'confirmed', 'reminder', 'cancelled', 'waitlist_joined', 'ready', 'welcome',
    'reminder_sms_fallback', 'confirmed_sms_fallback',
    'staff_message', 'staff_new_booking', 'staff_cancellation', 'staff_reschedule',
    'staff_new_client', 'staff_waitlist',
    'day_closure'
  ));

-- Seed the day-closure template as 'pending'. UTILITY category (appointment-
-- related → avoids marketing-opt-out rules and the 24h window). Two body vars:
-- {{1}} = customer first name, {{2}} = the staff-typed reason. Submit this to
-- Meta; on approval, set status='approved' (or let the sync do it) and the
-- broadcast function will start sending once the kill-switch is on. Idempotent.
insert into public.whatsapp_templates (name, language, category, status, components, version)
values (
  'day_closure_v1',
  'en_GB',
  'UTILITY',
  'pending',
  '[{"type":"BODY","text":"Hi {{1}}, a quick update about your Smarter Dog grooming appointment: {{2}}. Please reply here if you need anything."}]'::jsonb,
  1
)
on conflict (name, language, version) do nothing;
