-- ============================================================
-- 027_whatsapp_agent_trigger.sql
-- Wire whatsapp_events → whatsapp-agent Edge Function via pg_net.
--
-- What this migration does:
--   1. Adds increment_conversation_unread(uuid) RPC.
--      The agent's upsert path uses this to bump unread_count
--      without a read-modify-write race.
--   2. Creates a trigger function that POSTs the new event_id to
--      the whatsapp-agent function. Only fires when:
--        - signature_valid = true
--        - processing_status = 'pending'
--      Other rows (invalid signatures, already-processed rows)
--      are left alone.
--   3. Creates an AFTER INSERT trigger on whatsapp_events.
--
-- Why async via pg_net and not a blocking call:
--   The webhook function has to return 200 to Meta within ~200ms
--   or Meta retries. Calling Claude takes 1–5 seconds. So the
--   webhook just writes the row and returns; this trigger kicks
--   off the agent work in the background.
--
-- Configuration (run ONCE after applying this migration, as owner):
--   alter database postgres set app.agent_url =
--     'https://nlzhllhkigmsvrzduefz.supabase.co/functions/v1/whatsapp-agent';
--   alter database postgres set app.agent_secret = '<AGENT_CALLBACK_SECRET>';
--   select pg_reload_conf();
--
--   The same AGENT_CALLBACK_SECRET value must also be set in
--   Supabase → Edge Functions → Secrets so the agent can match.
--
-- Dependencies:
--   - 026_whatsapp_schema.sql (whatsapp_events, whatsapp_conversations)
--   - pg_net extension (already enabled at version 0.20.0)
-- ============================================================

-- ============================================================
-- 1. increment_conversation_unread
--    Called by the agent function to bump unread_count atomically.
--    SECURITY DEFINER because the service role is fine but this keeps
--    the lock in one place if we ever widen who can call it.
-- ============================================================
create or replace function increment_conversation_unread(conversation_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update whatsapp_conversations
     set unread_count = unread_count + 1
   where id = conversation_id;
$$;

comment on function increment_conversation_unread(uuid) is
  'Atomically bumps whatsapp_conversations.unread_count. Called by whatsapp-agent after inserting an inbound message.';

-- Only the service role should call this (agent function).
revoke execute on function increment_conversation_unread(uuid) from public;
grant execute on function increment_conversation_unread(uuid) to service_role;

-- ============================================================
-- 2. Trigger function — POST the event_id to whatsapp-agent
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
  -- Read config. `true` as the second arg means "return null if unset"
  -- rather than raising. We log and skip in that case so a misconfig
  -- doesn't break the webhook insert path itself.
  v_agent_url := current_setting('app.agent_url', true);
  v_secret    := current_setting('app.agent_secret', true);

  if v_agent_url is null or v_secret is null then
    raise warning 'fire_whatsapp_agent: app.agent_url or app.agent_secret not set — skipping';
    return new;
  end if;

  -- Fire and forget. pg_net queues the request; it will NOT block
  -- the transaction. Failures surface in net._http_response for
  -- later debugging, not as errors here.
  select into v_req_id
    net.http_post(
      url     := v_agent_url,
      headers := jsonb_build_object(
        'content-type',    'application/json',
        'x-agent-secret',  v_secret
      ),
      body    := jsonb_build_object('event_id', new.id)
    );

  return new;
end;
$$;

comment on function fire_whatsapp_agent() is
  'AFTER INSERT trigger on whatsapp_events. POSTs event_id to the whatsapp-agent Edge Function via pg_net. Skips silently if app.agent_url/app.agent_secret are not configured.';

-- ============================================================
-- 3. The trigger itself
--    Only fires on rows worth processing. We do the filter in the
--    WHEN clause so the trigger function isn't even entered for
--    invalid-signature or non-pending rows.
-- ============================================================
drop trigger if exists whatsapp_events_fire_agent on whatsapp_events;

create trigger whatsapp_events_fire_agent
  after insert on whatsapp_events
  for each row
  when (new.signature_valid = true and new.processing_status = 'pending')
  execute function fire_whatsapp_agent();

-- ============================================================
-- 4. Debug helper view (optional but useful)
--    Pairs up each event with the most recent pg_net response, so
--    you can see at a glance whether the trigger fired and what
--    the agent returned.
-- ============================================================
create or replace view whatsapp_agent_trigger_log as
select
  e.id                as event_id,
  e.received_at,
  e.processing_status,
  e.error_message     as agent_error,
  r.id                as http_request_id,
  r.status_code       as agent_http_status,
  r.content::text     as agent_response,
  r.created           as http_request_at
from whatsapp_events e
left join lateral (
  select *
    from net._http_response
   where created >= e.received_at - interval '1 minute'
   order by created desc
   limit 1
) r on true
order by e.received_at desc;

comment on view whatsapp_agent_trigger_log is
  'Debug view pairing whatsapp_events rows with their most recent pg_net http response. Use to check whether the trigger fired and what the agent replied.';

-- RLS: staff can select the view. It inherits from whatsapp_events RLS
-- for the event columns and from net._http_response (service-role-only)
-- for the http columns — staff will see the event half even if the
-- http columns come back null in their queries. That's fine.
grant select on whatsapp_agent_trigger_log to authenticated;

-- ============================================================
-- Done. Next step after applying:
--   1. alter database postgres set app.agent_url = '...';
--   2. alter database postgres set app.agent_secret = '...';
--   3. select pg_reload_conf();
--   4. deploy whatsapp-agent with ANTHROPIC_API_KEY and
--      AGENT_CALLBACK_SECRET secrets set in Supabase.
--
-- Rollback:
--   drop trigger whatsapp_events_fire_agent on whatsapp_events;
--   drop function fire_whatsapp_agent();
--   drop function increment_conversation_unread(uuid);
--   drop view whatsapp_agent_trigger_log;
-- ============================================================
