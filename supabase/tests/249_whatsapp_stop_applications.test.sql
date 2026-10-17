-- A STOP is applied once per Meta message, and a re-enable supersedes the
-- leftover acknowledgement (migration 20261016120000, G3 and G4).
--
-- If the agent applied a STOP but failed to store the inbound message, a
-- replay of the event used to apply the same STOP again, undoing a re-enable
-- staff had made since. apply_whatsapp_stop records the Meta id in the same
-- transaction as the stamp and never applies it twice. Synthetic fixtures,
-- rolled back.

begin;
create extension if not exists pgtap with schema extensions;
select plan(28);

set local session_replication_role = replica;
insert into auth.users (id) values ('24900000-0000-4000-8000-000000000041');
insert into public.staff_profiles (id, user_id, role, display_name)
values ('24900000-0000-4000-8000-000000000040', '24900000-0000-4000-8000-000000000041', 'staff', 'Stop Apply Test Staff');
set local session_replication_role = default;

insert into public.whatsapp_conversations (id, phone_e164, auto_send_enabled) values
  ('24900000-0000-4000-8000-000000000001', '+447700900901', true),
  ('24900000-0000-4000-8000-000000000002', '+447700900902', true),
  ('24900000-0000-4000-8000-000000000003', '+447700900903', true);
insert into public.humans (id, name, surname, phone)
values ('24900000-0000-4000-8000-000000000011', 'Synthetic', 'Stopper', '07700 900 901');

create temp table _r (k text primary key, v jsonb);
grant all on _r to service_role;

-- 1. The first STOP for a Meta message applies.
set local role service_role;
insert into _r values ('x1', public.apply_whatsapp_stop('24900000-0000-4000-8000-000000000001', 'wamid.X'));
reset role;
select is((select v ->> 'applied' from _r where k = 'x1'), 'true', 'the first STOP for a message applies');
select isnt(
  (select whatsapp_opted_out_at from public.whatsapp_conversations where id = '24900000-0000-4000-8000-000000000001'),
  null, 'it stamps the number'
);
select is(
  (select auto_send_enabled from public.whatsapp_conversations where id = '24900000-0000-4000-8000-000000000001'),
  false, 'and switches auto-send off'
);
select is(
  (select count(*)::int from public.whatsapp_stop_applications where meta_message_id = 'wamid.X'),
  1, 'and records the message once'
);
select is(
  (select whatsapp_opted_out from public.humans where id = '24900000-0000-4000-8000-000000000011'),
  true, 'the number''s customer is flagged in the same transaction'
);

-- 2. Re-enabled by staff, then the same message is replayed.
select set_config('request.jwt.claims', '{"sub":"24900000-0000-4000-8000-000000000041","role":"authenticated"}', true);
select lives_ok(
  $$select public.staff_reenable_whatsapp_number('07700900901', array['24900000-0000-4000-8000-000000000011']::uuid[],
      (select whatsapp_last_stop_at from public.whatsapp_conversations where id = '24900000-0000-4000-8000-000000000001'),
      'Customer phoned to ask for reminders again')$$,
  'staff re-enable the number'
);
set local role service_role;
insert into _r values ('x2', public.apply_whatsapp_stop('24900000-0000-4000-8000-000000000001', 'wamid.X'));
reset role;
select is((select v ->> 'applied' from _r where k = 'x2'), 'false', 'a replayed STOP is not applied again');
select is((select v ->> 'reason' from _r where k = 'x2'), 'already_applied', 'and says why');
select is(
  (select array[whatsapp_opted_out_at::text, whatsapp_last_stop_at::text]
     from public.whatsapp_conversations where id = '24900000-0000-4000-8000-000000000001'),
  array[null, null]::text[], 'the number stays re-enabled, its latest STOP unchanged'
);
select is(
  (select whatsapp_opted_out from public.humans where id = '24900000-0000-4000-8000-000000000011'),
  false, 'and so does its customer'
);

-- 3. A new STOP message stops it again.
set local role service_role;
insert into _r values ('y', public.apply_whatsapp_stop('24900000-0000-4000-8000-000000000001', 'wamid.Y'));
reset role;
select is((select v ->> 'applied' from _r where k = 'y'), 'true', 'a new STOP message applies');
select isnt(
  (select whatsapp_opted_out_at from public.whatsapp_conversations where id = '24900000-0000-4000-8000-000000000001'),
  null, 'and stops the number again'
);
select is(
  (select whatsapp_opted_out from public.humans where id = '24900000-0000-4000-8000-000000000011'),
  true, 'and its customer'
);

-- 4. No Meta id, or a blank one: applies every time, records nothing.
set local role service_role;
insert into _r values ('n1', public.apply_whatsapp_stop('24900000-0000-4000-8000-000000000002', null));
insert into _r values ('n2', public.apply_whatsapp_stop('24900000-0000-4000-8000-000000000002', null));
insert into _r values ('b1', public.apply_whatsapp_stop('24900000-0000-4000-8000-000000000002', '  '));
insert into _r values ('b2', public.apply_whatsapp_stop('24900000-0000-4000-8000-000000000002', '  '));
reset role;
select is(
  (select array_agg(v ->> 'applied' order by k) from _r where k in ('n1', 'n2', 'b1', 'b2')),
  array['true', 'true', 'true', 'true'], 'a STOP without a usable Meta id applies on every call'
);
select is(
  (select count(*)::int from public.whatsapp_stop_applications where conversation_id = '24900000-0000-4000-8000-000000000002'),
  0, 'and writes no marker'
);

-- 5. An unknown conversation is refused and leaves no marker.
set local role service_role;
select throws_ok(
  $$select public.apply_whatsapp_stop('24900000-0000-4000-8000-0000000000ff', 'wamid.Z')$$,
  'P0001', null, 'an unknown conversation is refused'
);
reset role;
select is(
  (select count(*)::int from public.whatsapp_stop_applications where meta_message_id = 'wamid.Z'),
  0, 'and no marker remains'
);

-- 6. Privileges.
select ok(
  not has_function_privilege('anon', 'public.apply_whatsapp_stop(uuid,text)', 'execute')
  and not has_function_privilege('authenticated', 'public.apply_whatsapp_stop(uuid,text)', 'execute'),
  'the API roles cannot apply a STOP'
);
select ok(has_function_privilege('service_role', 'public.apply_whatsapp_stop(uuid,text)', 'execute'), 'the agent (service_role) can');
select ok(
  not has_table_privilege('anon', 'public.whatsapp_stop_applications', 'select')
  and not has_table_privilege('authenticated', 'public.whatsapp_stop_applications', 'select'),
  'the API roles cannot read the markers'
);
select ok(
  not has_function_privilege('anon', 'public.whatsapp_conversation_supersede_stop_acks()', 'execute')
  and not has_function_privilege('authenticated', 'public.whatsapp_conversation_supersede_stop_acks()', 'execute'),
  'nor execute the supersede trigger function'
);
select is(
  (select count(*)::int from pg_catalog.pg_proc p
     join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('apply_whatsapp_stop', 'whatsapp_conversation_supersede_stop_acks')
      and p.prosecdef and p.proconfig @> array['search_path=public, pg_temp']),
  2, 'both new functions are SECURITY DEFINER with a pinned search_path'
);

-- 7. A re-enable supersedes the pending acknowledgement, and only that.
update public.whatsapp_conversations set whatsapp_opted_out_at = now() where id = '24900000-0000-4000-8000-000000000003';
insert into public.whatsapp_drafts (id, conversation_id, proposed_text, intent, confidence, state, tool_calls) values
  ('24900000-0000-4000-8000-000000000021', '24900000-0000-4000-8000-000000000003', 'ack', 'escalate', 1, 'pending', '{"opt_out_acknowledgement": true}'),
  ('24900000-0000-4000-8000-000000000022', '24900000-0000-4000-8000-000000000003', 'reply', 'escalate', 1, 'pending', '{"reason": "x"}'),
  ('24900000-0000-4000-8000-000000000023', '24900000-0000-4000-8000-000000000003', 'old ack', 'escalate', 1, 'approved', '{"opt_out_acknowledgement": true}');
insert into _r values ('re', public.staff_reenable_whatsapp_number('07700900903', '{}'::uuid[],
  (select whatsapp_last_stop_at from public.whatsapp_conversations where id = '24900000-0000-4000-8000-000000000003'),
  'Customer phoned to ask for reminders again'));
select is(
  (select array_agg(state order by id) from public.whatsapp_drafts where conversation_id = '24900000-0000-4000-8000-000000000003'),
  array['superseded', 'pending', 'approved'], 'only the pending acknowledgement is superseded'
);
select is(
  (select rejected_reason from public.whatsapp_drafts where id = '24900000-0000-4000-8000-000000000021'),
  'whatsapp_reenabled', 'the superseded acknowledgement says why, like the other supersede paths'
);
select is(
  (select array_agg(key order by key) from _r, jsonb_object_keys(v) as key where k = 're'),
  array['audit_id', 'conversation_ids', 'human_ids', 'phone_key'], 'the re-enable returns what it returned before'
);
select is(
  (select v -> 'conversation_ids' from _r where k = 're'),
  '["24900000-0000-4000-8000-000000000003"]'::jsonb, 'naming the re-enabled conversation'
);
set local role service_role;
insert into _r values ('w', public.apply_whatsapp_stop('24900000-0000-4000-8000-000000000003', 'wamid.W'));
reset role;
select is((select v ->> 'applied' from _r where k = 'w'), 'true', 'a fresh STOP afterwards applies');
select lives_ok(
  $$insert into public.whatsapp_drafts (conversation_id, proposed_text, intent, confidence, state, tool_calls)
    values ('24900000-0000-4000-8000-000000000003', 'new ack', 'escalate', 1, 'pending', '{"opt_out_acknowledgement": true}')$$,
  'and can queue a new pending acknowledgement'
);

select * from finish();
rollback;
