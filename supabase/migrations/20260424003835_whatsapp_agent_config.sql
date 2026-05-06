-- ============================================================
-- 028_whatsapp_agent_config.sql
-- Replace GUC-based config with a private settings table.
--
-- Why this migration exists:
--   027 tried to read app.agent_url / app.agent_secret via
--   current_setting(). That works on a real Postgres superuser,
--   but Supabase's `postgres` role is NOT a superuser — it gets
--   "permission denied to set parameter" on ALTER DATABASE SET.
--
--   So instead we keep the same contract (trigger fires and posts
--   to the agent URL with x-agent-secret header) but source the
--   values from a locked-down table. Values are INSERTed at
--   runtime, never committed to git.
--
-- Security model:
--   - RLS on with no policies → API-level access is blocked for
--     authenticated/anon/public.
--   - SECURITY DEFINER functions bypass RLS, so the trigger can
--     still read it.
--   - Only service_role has direct grants, as a belt-and-braces
--     second layer in case RLS is ever toggled off accidentally.
-- ============================================================

create table if not exists app_settings (
  key         text primary key,
  value       text not null,
  updated_at  timestamptz not null default now()
);

comment on table app_settings is
  'Runtime config for internal functions (e.g. pg_net trigger targets). Never expose via API.';

alter table app_settings enable row level security;
-- Deliberately no policies — RLS blocks everything through PostgREST.

revoke all on app_settings from public;
revoke all on app_settings from anon;
revoke all on app_settings from authenticated;
grant  all on app_settings to service_role;

-- ============================================================
-- Replace fire_whatsapp_agent() to read from app_settings.
-- Same behaviour (fire and forget via pg_net), same skip-silently
-- fallback if config is missing.
-- ============================================================
create or replace function fire_whatsapp_agent()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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
      body    := jsonb_build_object('event_id', new.id)
    );

  return new;
end;
$$;

comment on function fire_whatsapp_agent() is
  'AFTER INSERT trigger on whatsapp_events. Reads agent_url + agent_secret from app_settings and POSTs event_id to the whatsapp-agent Edge Function via pg_net. Skips silently if config missing.';

-- ============================================================
-- Next step (run via a one-off SQL, not a migration — so the
-- secret value never lands in git):
--
--   insert into app_settings (key, value) values
--     ('agent_url',    'https://<project>.supabase.co/functions/v1/whatsapp-agent'),
--     ('agent_secret', '<AGENT_CALLBACK_SECRET>')
--   on conflict (key) do update set value = excluded.value,
--                                   updated_at = now();
-- ============================================================
