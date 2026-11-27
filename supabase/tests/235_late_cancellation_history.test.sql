-- Full-schema tests: all assertions exercise the actual committed rows and role gates.
--
-- CHANGE (20261124200000, ADR 015): a cancellation before the appointment day
-- no longer records a notice-window strike, whatever the notice. The
-- fixture's appointments are tomorrow, inside the 48-hour notice window, so
-- every cancellation here is plain Cancelled with no new history row. Same-day
-- cancellations, which are now no-shows, are covered by 267. The legacy
-- history stays readable, waivable and transferable on merge; those checks
-- use rows written the way the old trigger wrote them.
begin;
create extension if not exists pgtap with schema extensions;
select plan(21);
\ir fixtures/ensure_local_vault_secrets.psql
\ir fixtures/late_cancellation_cases.psql
select lives_ok($$select * from public.cancel_customer_booking('93000000-0000-4000-8000-000000000010','Customer cannot attend')$$,'late customer cancellation succeeds');
select is((select count(*)::integer from public.bookings where group_id='93000000-0000-4000-8000-000000000020' and status='Cancelled'),2,'whole multi-dog appointment is cancelled, not a no-show, the day before');
select is((select count(*)::integer from smarter_dog_private.late_cancellation_history where human_id='93000000-0000-4000-8000-000000000002'),0,'a cancellation inside the notice window no longer records a strike');
select lives_ok($$select * from public.cancel_customer_booking('93000000-0000-4000-8000-000000000010','Customer cannot attend')$$,'duplicate request replays receipt');
select is((select count(*)::integer from smarter_dog_private.late_cancellation_history where human_id='93000000-0000-4000-8000-000000000002'),0,'replay adds nothing');
select throws_ok($$select * from smarter_dog_private.cancel_booking_impl('93000000-0000-4000-8000-000000000012','Reschedule request',true)$$,'SDC02','cancellation_deadline_passed','internal reschedule path retains deadline');
select throws_ok($$select public.staff_customer_cancellation_history('93000000-0000-4000-8000-000000000002')$$,'42501','staff_only','customer cannot read staff incidents');
select * from public.cancel_customer_booking('93000000-0000-4000-8000-000000000012','Customer cannot attend');
select * from public.cancel_customer_booking('93000000-0000-4000-8000-000000000013','Customer cannot attend');
select set_config('request.jwt.claim.sub','93000000-0000-4000-8000-000000000005',true);
select set_config('request.jwt.claims','{"sub":"93000000-0000-4000-8000-000000000005","role":"authenticated"}',true);
select is((public.staff_customer_cancellation_history('93000000-0000-4000-8000-000000000002')->>'count')::integer,0,'three day-before cancellations add nothing to the legacy count');
select is((public.staff_customer_no_show_history('93000000-0000-4000-8000-000000000002')->>'count')::integer,0,'day-before cancellations are not no-shows');
select is((select deposit_required from humans where id='93000000-0000-4000-8000-000000000002'),false,'day-before cancellations never require a deposit');
-- Legacy history, written the way the retired trigger wrote it.
insert into smarter_dog_private.late_cancellation_history
  (human_id,appointment_key,booking_date,booking_ids,appointment_start,notice_deadline,requested_at,reason,actor_id,actor_scope) values
  ('93000000-0000-4000-8000-000000000002','93000000-0000-4000-8000-000000000012',(now() at time zone 'Europe/London')::date+1,
   array['93000000-0000-4000-8000-000000000012']::uuid[],now()+interval '1 day',now()-interval '1 day',now()-interval '1 hour','Legacy one',null,'customer'),
  ('93000000-0000-4000-8000-000000000002','93000000-0000-4000-8000-000000000013',(now() at time zone 'Europe/London')::date+1,
   array['93000000-0000-4000-8000-000000000013']::uuid[],now()+interval '1 day',now()-interval '1 day',now()-interval '1 hour','Legacy two',null,'customer');
select is((public.staff_customer_cancellation_history('93000000-0000-4000-8000-000000000002')->>'count')::integer,2,'legacy history stays readable');
select public.waive_late_cancellation((select id from smarter_dog_private.late_cancellation_history where appointment_key='93000000-0000-4000-8000-000000000012'),'Exceptional circumstances');
select is((public.staff_customer_cancellation_history('93000000-0000-4000-8000-000000000002')->>'count')::integer,1,'reasoned waiver still removes a legacy incident from its count');
select ok(not has_function_privilege('authenticated','public.cancel_whatsapp_booking_by_id_for_reschedule(uuid,uuid,text)','execute'),'browser cannot invoke WhatsApp reschedule cancellation');
select ok(has_function_privilege('service_role','public.cancel_whatsapp_booking_by_id_for_reschedule(uuid,uuid,text)','execute'),'service role can invoke explicit WhatsApp reschedule path');
select throws_ok($$select public.waive_late_cancellation((select id from smarter_dog_private.late_cancellation_history limit 1),' ')$$,'22023','waiver_reason_required','waiver requires an audit reason');
-- A separate active source tests rescheduling without bypassing the group's
-- existing revival guard.
set local session_replication_role=replica;
insert into public.bookings(id,dog_id,booking_date,slot,status,service,size) values
 ('93000000-0000-4000-8000-000000000015','93000000-0000-4000-8000-000000000003',(now() at time zone 'Europe/London')::date+1,'13:00','Booked','full-groom','small');
set local session_replication_role=origin;
select * from public.cancel_whatsapp_booking_by_id_for_reschedule('93000000-0000-4000-8000-000000000015','93000000-0000-4000-8000-000000000002','Move appointment');
select ok((select bool_and(cancellation_cause='reschedule' and status='Cancelled') from bookings where id='93000000-0000-4000-8000-000000000015'),'WhatsApp reschedule writes explicit provenance and stays a cancellation');
select * from public.cancel_whatsapp_booking_by_id('93000000-0000-4000-8000-000000000014','93000000-0000-4000-8000-000000000002','Customer cannot attend');
select is((select status from bookings where id='93000000-0000-4000-8000-000000000014'),'Cancelled','a WhatsApp cancellation the day before is a plain cancellation');
select is((select count(*)::integer from smarter_dog_private.late_cancellation_history where human_id='93000000-0000-4000-8000-000000000002'),2,'WhatsApp cancellations add no new history');
set local session_replication_role=replica;
insert into public.humans(id,name,surname) values('93000000-0000-4000-8000-000000000006','Merge','Fixture');
set local session_replication_role=origin;
update smarter_dog_private.late_cancellation_history set human_id='93000000-0000-4000-8000-000000000006' where human_id='93000000-0000-4000-8000-000000000002';
select lives_ok($$select public.merge_humans('93000000-0000-4000-8000-000000000002','93000000-0000-4000-8000-000000000006')$$,'guarded merge transfers history transactionally');
select is((select count(*)::integer from smarter_dog_private.late_cancellation_history where human_id='93000000-0000-4000-8000-000000000002'),2,'all history remains on the surviving customer file');
select ok(exists(select 1 from smarter_dog_private.late_cancellation_history_audit where before_state->>'human_id'='93000000-0000-4000-8000-000000000006' and after_state->>'human_id'='93000000-0000-4000-8000-000000000002'),'history ownership transfer is audited');
select * from finish();
rollback;
