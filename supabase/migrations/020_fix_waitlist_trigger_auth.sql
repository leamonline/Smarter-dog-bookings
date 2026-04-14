-- 020_fix_waitlist_trigger_auth.sql
-- ⚠ WARNING: This migration contains a hardcoded Supabase project URL
-- (nlzhllhkigmsvrzduefz.supabase.co). If the project ref changes, update
-- the pg_net URL in the trigger function below.
-- HIGH-2: The waitlist trigger fires a webhook WITHOUT an Authorization header,
-- completely bypassing the WEBHOOK_SECRET check in the edge function.

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
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || coalesce(current_setting('app.webhook_secret', true), '')
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
