-- ============================================================
-- BACKFILL — already applied on prod, was missing from source control.
--
-- Surfaced by the reverse-drift reconciliation on 2026-06-15: prod's
-- supabase_migrations.schema_migrations has version 20260531200942
-- (raise_pg_net_timeout_in_fire_whatsapp_agent) with no matching local file,
-- so a rebuild from supabase/migrations/ would have recreated
-- fire_whatsapp_agent WITHOUT the 15s pg_net timeout (reverting to the
-- pg_net default). SQL below is copied verbatim from prod's recorded
-- statements so source now matches the live definition. CREATE OR REPLACE
-- is idempotent; this file is NOT meant to be re-applied (it already is).
-- ============================================================

CREATE OR REPLACE FUNCTION public.fire_whatsapp_agent()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_agent_url text;
  v_secret    text;
  v_req_id    bigint;
begin
  select value into v_agent_url from app_settings where key = 'agent_url';
  select value into v_secret    from app_settings where key = 'agent_secret';

  if v_agent_url is null or v_secret is null then
    raise warning 'fire_whatsapp_agent: agent_url or agent_secret missing in app_settings — skipping';
    return new;
  end if;

  select into v_req_id
    net.http_post(
      url     := v_agent_url,
      headers := jsonb_build_object(
        'content-type',   'application/json',
        'x-agent-secret', v_secret
      ),
      body    := jsonb_build_object('event_id', new.id),
      timeout_milliseconds := 15000
    );

  return new;
end;
$function$;
