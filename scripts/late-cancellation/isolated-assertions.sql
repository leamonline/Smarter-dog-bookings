begin;
\ir ../../supabase/tests/fixtures/late_cancellation_cases.psql
select * from public.cancel_customer_booking('93000000-0000-4000-8000-000000000010','Customer cannot attend');
do $$begin
 if (select count(*) from public.bookings where group_id='93000000-0000-4000-8000-000000000020' and status='Cancelled')<>2 then raise exception 'whole appointment not cancelled'; end if;
 if (select count(*) from smarter_dog_private.late_cancellation_history)<>1 then raise exception 'multi-dog overcount'; end if;
 if (select cardinality(booking_ids) from smarter_dog_private.late_cancellation_history)<>2 then raise exception 'missing affected dog rows'; end if;
end$$;
select * from public.cancel_customer_booking('93000000-0000-4000-8000-000000000010','Customer cannot attend');
do $$begin
 if (select count(*) from smarter_dog_private.late_cancellation_history)<>1 then raise exception 'retry overcount'; end if;
 begin
   perform * from smarter_dog_private.cancel_booking_impl('93000000-0000-4000-8000-000000000012','Reschedule request',true);
   raise exception 'late reschedule accepted';
 exception when sqlstate 'SDC02' then null; end;
 if (select status from bookings where id='93000000-0000-4000-8000-000000000012')<>'Booked' then raise exception 'failed move changed booking'; end if;
 begin
   perform public.staff_customer_cancellation_history('93000000-0000-4000-8000-000000000002');
   raise exception 'customer read staff history';
 exception when insufficient_privilege then null; end;
end$$;
select * from public.cancel_customer_booking('93000000-0000-4000-8000-000000000012','Customer cannot attend');
select * from public.cancel_customer_booking('93000000-0000-4000-8000-000000000013','Customer cannot attend');
select set_config('request.jwt.claim.sub','93000000-0000-4000-8000-000000000005',true);
select set_config('request.jwt.claims','{"sub":"93000000-0000-4000-8000-000000000005","role":"authenticated"}',true);
do $$declare p jsonb; begin
 p:=public.staff_customer_cancellation_history('93000000-0000-4000-8000-000000000002');
 if (p->>'count')::integer<>3 or (p->>'reviewRequired')::boolean is not true then raise exception 'third-strike review missing'; end if;
 if (select deposit_required from public.humans where id='93000000-0000-4000-8000-000000000002') then raise exception 'deposit automatically enabled'; end if;
 perform public.waive_late_cancellation((select id from smarter_dog_private.late_cancellation_history where appointment_key='93000000-0000-4000-8000-000000000012'),'Accepted exceptional circumstances');
 p:=public.staff_customer_cancellation_history('93000000-0000-4000-8000-000000000002');
 if (p->>'count')::integer<>2 or (p->>'reviewRequired')::boolean then raise exception 'waiver did not remove threshold'; end if;
 if not exists(select 1 from smarter_dog_private.late_cancellation_history_audit where action='corrected') then raise exception 'missing correction audit'; end if;
end$$;
update public.bookings set status='Cancelled',cancellation_cause='salon',cancel_reason='Salon closure' where id='93000000-0000-4000-8000-000000000014';
do $$begin if (select count(*) from smarter_dog_private.late_cancellation_history)<>3 then raise exception 'salon cancellation became strike'; end if; end$$;
update public.bookings set status='Booked' where id='93000000-0000-4000-8000-000000000010';
do $$begin if (select waived_at from smarter_dog_private.late_cancellation_history where appointment_key='93000000-0000-4000-8000-000000000020') is not null then raise exception 'partial undo removed strike'; end if; end$$;
update public.bookings set status='Booked' where id='93000000-0000-4000-8000-000000000011';
do $$begin if (select waived_at from smarter_dog_private.late_cancellation_history where appointment_key='93000000-0000-4000-8000-000000000020') is null then raise exception 'full undo left strike'; end if; end$$;
-- Explicit WhatsApp reschedule provenance must not create an incident.
select * from public.cancel_whatsapp_booking_by_id_for_reschedule('93000000-0000-4000-8000-000000000010','93000000-0000-4000-8000-000000000002','Move appointment');
do $$begin
 if (select count(*) from smarter_dog_private.late_cancellation_history)<>3 then raise exception 'WhatsApp reschedule became strike'; end if;
 if exists(select 1 from bookings where group_id='93000000-0000-4000-8000-000000000020' and cancellation_cause is distinct from 'reschedule') then raise exception 'missing reschedule attribution'; end if;
end$$;
update bookings set status='Booked' where id='93000000-0000-4000-8000-000000000014';
select * from public.cancel_whatsapp_booking_by_id('93000000-0000-4000-8000-000000000014','93000000-0000-4000-8000-000000000002','Customer cancelled in WhatsApp');
do $$begin if (select count(*) from smarter_dog_private.late_cancellation_history)<>4 then raise exception 'WhatsApp cancellation missing'; end if; end$$;
-- Recurring dates remain separate, and group-only ambiguity must not cancel either date.
set local session_replication_role=replica;
insert into bookings(id,dog_id,group_id,booking_date,slot,status) values
 ('93000000-0000-4000-8000-000000000015','93000000-0000-4000-8000-000000000003','93000000-0000-4000-8000-000000000020',(now() at time zone 'Europe/London')::date+2,'08:30','Booked'),
 ('93000000-0000-4000-8000-000000000016','93000000-0000-4000-8000-000000000003','93000000-0000-4000-8000-000000000020',(now() at time zone 'Europe/London')::date+3,'08:30','Booked'),
 ('93000000-0000-4000-8000-000000000017','93000000-0000-4000-8000-000000000003',null,(now() at time zone 'Europe/London')::date,'00:00','Booked');
set local session_replication_role=origin;
select set_config('request.jwt.claim.sub','93000000-0000-4000-8000-000000000001',true);
do $$begin
 begin
   perform * from public.cancel_whatsapp_booking_group('93000000-0000-4000-8000-000000000020','93000000-0000-4000-8000-000000000002','Cannot attend');
   raise exception 'ambiguous recurring group accepted';
 exception when invalid_parameter_value then null; end;
 if (select count(*) from bookings where id in ('93000000-0000-4000-8000-000000000015','93000000-0000-4000-8000-000000000016') and status='Booked')<>2 then raise exception 'ambiguous request wrote rows'; end if;
 begin
   perform * from public.cancel_customer_booking('93000000-0000-4000-8000-000000000017','Cannot attend');
   raise exception 'started appointment cancellation accepted';
 exception when sqlstate 'SDC03' then null; end;
 begin
   update bookings set status='Cancelled',cancellation_cause='customer',cancel_reason='Cannot attend' where id='93000000-0000-4000-8000-000000000017';
   raise exception 'direct cancellation bypassed start guard';
 exception when sqlstate 'SDC03' then null; end;
 if (select status from bookings where id='93000000-0000-4000-8000-000000000017')<>'Booked' then raise exception 'started refusal changed row'; end if;
end$$;
select * from public.cancel_whatsapp_booking_by_id('93000000-0000-4000-8000-000000000015','93000000-0000-4000-8000-000000000002','Cannot attend');
do $$begin if (select status from bookings where id='93000000-0000-4000-8000-000000000016')<>'Booked' then raise exception 'other recurring date cancelled'; end if; end$$;
select * from public.cancel_customer_booking('93000000-0000-4000-8000-000000000016','Cannot attend');
do $$begin if exists(select 1 from smarter_dog_private.late_cancellation_history where '93000000-0000-4000-8000-000000000016'=any(booking_ids)) then raise exception 'on-time cancellation became late'; end if; end$$;
rollback;
