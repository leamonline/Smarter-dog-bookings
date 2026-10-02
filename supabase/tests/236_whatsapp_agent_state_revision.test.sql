begin;
select plan(9);
insert into public.whatsapp_conversations(id,phone_e164,agent_state)
values ('93600000-0000-4000-8000-000000000001','+447700900936','{"preferredTime":"09:00"}');
select is((select agent_state_rev from public.whatsapp_conversations where id='93600000-0000-4000-8000-000000000001'),0::bigint,'initial revision');
select ok((select saved from public.compare_and_set_whatsapp_agent_state('93600000-0000-4000-8000-000000000001',0,'{"preferredTime":"10:00"}')),'first expected revision succeeds');
select is((select agent_state_rev from public.whatsapp_conversations where id='93600000-0000-4000-8000-000000000001'),1::bigint,'state write advances revision');
select ok(not (select saved from public.compare_and_set_whatsapp_agent_state('93600000-0000-4000-8000-000000000001',0,'{"preferredTime":"11:00"}')),'stale snapshot refused');
select is((select agent_state->>'preferredTime' from public.whatsapp_conversations where id='93600000-0000-4000-8000-000000000001'),'10:00','stale attempt did not overwrite');
update public.whatsapp_conversations set agent_state='{"preferredTime":"12:00"}',agent_state_rev=0 where id='93600000-0000-4000-8000-000000000001';
select is((select agent_state_rev from public.whatsapp_conversations where id='93600000-0000-4000-8000-000000000001'),2::bigint,'legacy writer advances server-owned revision');
select ok(not has_function_privilege('authenticated','public.compare_and_set_whatsapp_agent_state(uuid,bigint,jsonb)','execute'),'browser cannot write through service CAS');
select ok(has_function_privilege('service_role','public.compare_and_set_whatsapp_agent_state(uuid,bigint,jsonb)','execute'),'service role can use CAS');
select throws_ok($$select * from public.compare_and_set_whatsapp_agent_state('93600000-0000-4000-8000-000000000001',2,'[]')$$,'22023','invalid_agent_state_update','non-object rejected');
select * from finish();
rollback;
