-- Apply before dependent Edge deployment; no hosted application authorised by this file.
begin;
alter table public.whatsapp_conversations add column agent_state_rev bigint not null default 0
  check (agent_state_rev between 0 and 9007199254740991);
create function public.bump_whatsapp_agent_state_revision() returns trigger
language plpgsql set search_path = pg_catalog, public as $$
begin
  if new.agent_state is distinct from old.agent_state then
    new.agent_state_rev := old.agent_state_rev + 1;
  else
    new.agent_state_rev := old.agent_state_rev;
  end if;
  return new;
end;
$$;
revoke all on function public.bump_whatsapp_agent_state_revision() from public, anon, authenticated;
create trigger whatsapp_agent_state_revision before update on public.whatsapp_conversations
for each row execute function public.bump_whatsapp_agent_state_revision();
create function public.compare_and_set_whatsapp_agent_state(p_conversation_id uuid, p_expected_revision bigint, p_state jsonb)
returns table(saved boolean, agent_state jsonb, agent_state_rev bigint)
language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if p_expected_revision is null or p_expected_revision < 0 or p_state is null or jsonb_typeof(p_state) <> 'object' then
    raise exception 'invalid_agent_state_update' using errcode = '22023';
  end if;
  return query update public.whatsapp_conversations c set agent_state = p_state
    where c.id = p_conversation_id and c.agent_state_rev = p_expected_revision
    returning true, c.agent_state, c.agent_state_rev;
  if found then return; end if;
  return query select false, c.agent_state, c.agent_state_rev from public.whatsapp_conversations c where c.id = p_conversation_id;
end;
$$;
revoke all on function public.compare_and_set_whatsapp_agent_state(uuid,bigint,jsonb) from public, anon, authenticated;
grant execute on function public.compare_and_set_whatsapp_agent_state(uuid,bigint,jsonb) to service_role;
comment on column public.whatsapp_conversations.agent_state_rev is 'Server-owned memory revision; every changed agent_state write increments it, including legacy writers.';
commit;
