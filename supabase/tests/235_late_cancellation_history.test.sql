-- Full-schema tests: all assertions exercise the actual committed rows and role gates.
begin;
create extension if not exists pgtap with schema extensions;
select plan(23);
\ir fixtures/ensure_local_vault_secrets.psql
\ir fixtures/late_cancellation_cases.psql
select lives_ok($$select * from public.cancel_customer_booking('93000000-0000-4000-8000-000000000010','Customer cannot attend')$$,'late customer cancellation succeeds');
select is((select count(*)::integer from public.bookings where group_id='93000000-0000-4000-8000-000000000020' and status='Cancelled'),2,'whole multi-dog appointment is cancelled');
select is((select count(*)::integer from smarter_dog_private.late_cancellation_history where human_id='93000000-0000-4000-8000-000000000002'),1,'one incident for two dogs');
select is((select cardinality(booking_ids) from smarter_dog_private.late_cancellation_history where human_id='93000000-0000-4000-8000-000000000002'),2,'history records both affected rows');
select lives_ok($$select * from public.cancel_customer_booking('93000000-0000-4000-8000-000000000010','Customer cannot attend')$$,'duplicate request replays receipt');
select is((select count(*)::integer from smarter_dog_private.late_cancellation_history where human_id='93000000-0000-4000-8000-000000000002'),1,'replay does not add strike');
select throws_ok($$select * from smarter_dog_private.cancel_booking_impl('93000000-0000-4000-8000-000000000012','Reschedule request',true)$$,'SDC02','cancellation_deadline_passed','internal reschedule path retains deadline');
select throws_ok($$select public.staff_customer_cancellation_history('93000000-0000-4000-8000-000000000002')$$,'42501','staff_only','customer cannot read staff incidents');
select * from public.cancel_customer_booking('93000000-0000-4000-8000-000000000012','Customer cannot attend');
select * from public.cancel_customer_booking('93000000-0000-4000-8000-000000000013','Customer cannot attend');
select set_config('request.jwt.claim.sub','93000000-0000-4000-8000-000000000005',true);
select set_config('request.jwt.claims','{"sub":"93000000-0000-4000-8000-000000000005","role":"authenticated"}',true);
select is((public.staff_customer_cancellation_history('93000000-0000-4000-8000-000000000002')->>'count')::integer,3,'third cancellation recorded on customer projection');
select ok((public.staff_customer_cancellation_history('93000000-0000-4000-8000-000000000002')->>'reviewRequired')::boolean,'third cancellation flags staff review');
select is((select deposit_required from humans where id='93000000-0000-4000-8000-000000000002'),false,'deposit flag remains staff controlled');
select public.waive_late_cancellation((select id from smarter_dog_private.late_cancellation_history where appointment_key='93000000-0000-4000-8000-000000000012'),'Exceptional circumstances');
select is((public.staff_customer_cancellation_history('93000000-0000-4000-8000-000000000002')->>'count')::integer,2,'reasoned waiver removes incident from threshold');
select ok(not has_function_privilege('authenticated','public.cancel_whatsapp_booking_by_id_for_reschedule(uuid,uuid,text)','execute'),'browser cannot invoke WhatsApp reschedule cancellation');
select ok(has_function_privilege('service_role','public.cancel_whatsapp_booking_by_id_for_reschedule(uuid,uuid,text)','execute'),'service role can invoke explicit WhatsApp reschedule path');
select throws_ok($$select public.waive_late_cancellation((select id from smarter_dog_private.late_cancellation_history limit 1),' ')$$,'22023','waiver_reason_required','waiver requires an audit reason');
-- A separate active source tests rescheduling without bypassing the group's
-- existing revival guard. Staff can waive a mistaken grouped incident explicitly.
set local session_replication_role=replica;
insert into public.bookings(id,dog_id,booking_date,slot,status,service,size) values
 ('93000000-0000-4000-8000-000000000015','93000000-0000-4000-8000-000000000003',(now() at time zone 'Europe/London')::date+1,'13:00','Booked','full-groom','small');
set local session_replication_role=origin;
select * from public.cancel_whatsapp_booking_by_id_for_reschedule('93000000-0000-4000-8000-000000000015','93000000-0000-4000-8000-000000000002','Move appointment');
select is((select count(*)::integer from smarter_dog_private.late_cancellation_history where human_id='93000000-0000-4000-8000-000000000002'),3,'WhatsApp reschedule adds no incident');
select ok((select bool_and(cancellation_cause='reschedule') from bookings where id='93000000-0000-4000-8000-000000000015'),'WhatsApp reschedule writes explicit provenance');
select * from public.cancel_whatsapp_booking_by_id('93000000-0000-4000-8000-000000000014','93000000-0000-4000-8000-000000000002','Customer cannot attend');
select is((select count(*)::integer from smarter_dog_private.late_cancellation_history where human_id='93000000-0000-4000-8000-000000000002'),4,'WhatsApp customer cancellation adds incident');
update smarter_dog_private.late_cancellation_history set requested_at=now()-interval '13 months',notice_deadline=now()-interval '14 months' where appointment_key='93000000-0000-4000-8000-000000000013';
select is((public.staff_customer_cancellation_history('93000000-0000-4000-8000-000000000002')->>'count')::integer,2,'older than 12 months and waived incidents excluded from count');
select is(jsonb_array_length(public.staff_customer_cancellation_history('93000000-0000-4000-8000-000000000002')->'items'),4,'older incidents remain visible in history');
set local session_replication_role=replica;
insert into public.humans(id,name,surname) values('93000000-0000-4000-8000-000000000006','Merge','Fixture');
set local session_replication_role=origin;
update smarter_dog_private.late_cancellation_history set human_id='93000000-0000-4000-8000-000000000006' where human_id='93000000-0000-4000-8000-000000000002';
select lives_ok($$select public.merge_humans('93000000-0000-4000-8000-000000000002','93000000-0000-4000-8000-000000000006')$$,'guarded merge transfers history transactionally');
select is((select count(*)::integer from smarter_dog_private.late_cancellation_history where human_id='93000000-0000-4000-8000-000000000002'),4,'all history remains on the surviving customer file');
select ok(exists(select 1 from smarter_dog_private.late_cancellation_history_audit where before_state->>'human_id'='93000000-0000-4000-8000-000000000006' and after_state->>'human_id'='93000000-0000-4000-8000-000000000002'),'history ownership transfer is audited');
select * from finish();
rollback;
