-- Fix security review findings from 2026-05-06:
-- - remove public SECURITY DEFINER demo RPCs
-- - remove public WhatsApp debug view
-- - make briefings service-only
-- - restore booking status notification wiring
-- - normalize bookings.status to the canonical lifecycle

-- 1. Remove production demo RPCs.
DROP FUNCTION IF EXISTS public.demo_add_dog(text, text, text, uuid);
DROP FUNCTION IF EXISTS public.get_demo_customer(uuid);
DROP FUNCTION IF EXISTS public.get_demo_customers();

-- 2. Remove public WhatsApp debug view.
DROP VIEW IF EXISTS public.whatsapp_agent_trigger_log;

-- 3. Lock briefings down to service role only.
-- Guarded for clean-rebuild safety: `briefings` was created out-of-band on prod
-- (its create migration was never committed to this repo) and is dropped later
-- in 20260608010000_drop_briefings_table.sql. On a from-scratch apply
-- (`supabase db reset` / the db-tests CI) the table is absent, so this block
-- would fail with 42P01 — skip it when the table doesn't exist. No-op on prod,
-- where the table existed when this migration first ran.
do $$
begin
  if to_regclass('public.briefings') is not null then
    execute 'revoke all privileges on table public.briefings from public, anon, authenticated';
    execute 'revoke all privileges on sequence public.briefings_id_seq from public, anon, authenticated';
    execute 'drop policy if exists "Allow service role full access" on public.briefings';
    execute 'drop policy if exists "service_role_full_access_briefings" on public.briefings';
    execute 'create policy "service_role_full_access_briefings" on public.briefings as permissive for all to service_role using (true) with check (true)';
    execute 'grant all privileges on table public.briefings to service_role';
    execute 'grant usage, select, update on sequence public.briefings_id_seq to service_role';
  end if;
end;
$$;

-- 4. Normalize booking statuses and constrain future writes.
UPDATE public.bookings
SET status = 'Booked'
WHERE status IS NULL
   OR status IN ('Not Arrived', 'No-show');

ALTER TABLE public.bookings
  ALTER COLUMN status SET DEFAULT 'Booked';

ALTER TABLE public.bookings
  ALTER COLUMN status SET NOT NULL;

ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_status_check;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_status_check
  CHECK (status IN ('Booked', 'Checked in', 'Ready for pick-up', 'Cancelled'))
  NOT VALID;

ALTER TABLE public.bookings
  VALIDATE CONSTRAINT bookings_status_check;

-- 5. Preserve existing notification log types and add ready.
ALTER TABLE public.notification_log
  DROP CONSTRAINT IF EXISTS notification_log_trigger_type_check;

ALTER TABLE public.notification_log
  ADD CONSTRAINT notification_log_trigger_type_check
  CHECK (trigger_type IN ('confirmed', 'reminder', 'cancelled', 'waitlist_joined', 'ready'))
  NOT VALID;

ALTER TABLE public.notification_log
  VALIDATE CONSTRAINT notification_log_trigger_type_check;

-- 6. Restore missing status-update notifications.
-- The insert trigger already exists as trg_notify_booking_insert and points
-- at public.notify_on_booking_insert(), which was rewritten in
-- 20260505210120_webhook_secret_via_vault.sql to use get_webhook_secret().
-- Keep it, but recreate it only if a drifted database is missing it.
DROP TRIGGER IF EXISTS notify_booking_confirmed_trigger ON public.bookings;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = 'public.bookings'::regclass
      AND tgname = 'trg_notify_booking_insert'
      AND NOT tgisinternal
  ) THEN
    EXECUTE 'CREATE TRIGGER trg_notify_booking_insert AFTER INSERT ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.notify_on_booking_insert()';
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_booking_delete ON public.bookings;
DROP FUNCTION IF EXISTS public.notify_on_booking_delete();

DROP TRIGGER IF EXISTS notify_booking_cancelled_trigger ON public.bookings;
CREATE TRIGGER notify_booking_cancelled_trigger
  AFTER UPDATE ON public.bookings
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'Cancelled')
  EXECUTE FUNCTION public.notify_on_booking_cancelled();

DROP TRIGGER IF EXISTS notify_booking_ready_trigger ON public.bookings;
CREATE TRIGGER notify_booking_ready_trigger
  AFTER UPDATE ON public.bookings
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'Ready for pick-up')
  EXECUTE FUNCTION public.notify_on_booking_ready();
