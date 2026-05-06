-- 014_waitlist_pg_net_trigger.sql
-- ⚠ WARNING: This migration contains a hardcoded Supabase project URL
-- (nlzhllhkigmsvrzduefz.supabase.co). If the project ref changes, update
-- the pg_net URL in the trigger function below.
-- Postgres trigger: fire notify-waitlist-joined edge function on waitlist INSERT

CREATE OR REPLACE FUNCTION notify_waitlist_joined_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM net.http_post(
    url     := 'https://nlzhllhkigmsvrzduefz.supabase.co/functions/v1/notify-waitlist-joined',
    headers := jsonb_build_object(
      'Content-Type', 'application/json'
    ),
    body    := jsonb_build_object(
      'type',   'INSERT',
      'table',  'waitlist_entries',
      'record', row_to_json(NEW)
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_waitlist_insert ON waitlist_entries;

CREATE TRIGGER on_waitlist_insert
  AFTER INSERT ON waitlist_entries
  FOR EACH ROW
  EXECUTE FUNCTION notify_waitlist_joined_trigger();
