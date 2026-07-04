-- paid_at / payment_method / paid_amount stamping
-- (trg_set_booking_paid_at, migration 20260704130000).
--
-- The trigger must fire, so triggers stay LIVE for the payment UPDATEs; the
-- fixture booking is inserted with triggers disabled so the insert skips the
-- gates/notify. Vault secrets are provisioned in case a payment UPDATE reaches
-- a notify path. One txn, rolled back.

begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

select vault.create_secret('http://localhost:54321', 'supabase_url');
select vault.create_secret('pgtap-test-secret', 'webhook_secret');

set local session_replication_role = replica;
insert into public.humans (id, name)
  values ('aaaaaaaa-0000-4000-8000-00000000008a', 'pgTAP Pay Owner');
insert into public.dogs (id, name, human_id, is_pregnant)
  values ('bbbbbbbb-0000-4000-8000-00000000008b', 'PayPup',
          'aaaaaaaa-0000-4000-8000-00000000008a', false);
insert into public.bookings (id, booking_date, slot, dog_id, size, service, status, payment)
  values ('cccccccc-0000-4000-8000-00000000008c',
          (date_trunc('week', current_date) + interval '7 days')::date,
          '09:00', 'bbbbbbbb-0000-4000-8000-00000000008b', 'small', 'full-groom',
          'Booked', 'Due at Pick-up');
set local session_replication_role = default;

-- Mark paid in full with a method + amount.
update public.bookings
  set payment = 'Paid in Full', payment_method = 'card', paid_amount = 42
  where id = 'cccccccc-0000-4000-8000-00000000008c';

select is(
  (select paid_at is not null from public.bookings where id = 'cccccccc-0000-4000-8000-00000000008c'),
  true, 'marking Paid in Full stamps paid_at'
);
select is(
  (select payment_method = 'card' and paid_amount = 42 from public.bookings
   where id = 'cccccccc-0000-4000-8000-00000000008c'),
  true, 'the recorded method + amount persist alongside paid_at'
);

-- Move back off Paid in Full — everything clears.
update public.bookings set payment = 'Due at Pick-up'
  where id = 'cccccccc-0000-4000-8000-00000000008c';

select is(
  (select paid_at is null from public.bookings where id = 'cccccccc-0000-4000-8000-00000000008c'),
  true, 'moving off Paid in Full clears paid_at'
);
select is(
  (select payment_method is null and paid_amount is null from public.bookings
   where id = 'cccccccc-0000-4000-8000-00000000008c'),
  true, 'moving off Paid in Full clears the method + amount'
);

select * from finish();
rollback;
