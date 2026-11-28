-- Local-only two-session claim and recovery test. Application triggers are
-- disabled for committed fixture seeding, and no provider is called.
begin;
create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;
select plan(20);

create temp table collection_dblink as
select format('hostaddr=%L port=%L dbname=%L user=%L password=postgres',
  host(inet_server_addr())::text, current_setting('port'), current_database(), session_user) as conn;
select extensions.dblink_connect('collection_one', conn) from collection_dblink;
select extensions.dblink_connect('collection_two', conn) from collection_dblink;

select extensions.dblink_exec('collection_one', $fixture$
  begin;
  set local session_replication_role = replica;
  delete from public.staff_collection_notice_claims where owner_id = '26800000-0000-4000-8000-000000000001';
  delete from public.bookings where id in ('26800000-0000-4000-8000-000000000101', '26800000-0000-4000-8000-000000000102');
  delete from public.dogs where id in ('26800000-0000-4000-8000-000000000011', '26800000-0000-4000-8000-000000000012');
  delete from public.humans where id in ('26800000-0000-4000-8000-000000000001', '26800000-0000-4000-8000-000000000002');
  insert into public.humans (id, name, surname, phone) values
    ('26800000-0000-4000-8000-000000000001', 'Synthetic', 'Owner', '07700900321'),
    ('26800000-0000-4000-8000-000000000002', 'Synthetic', 'Unrelated contact', '07700900322');
  insert into public.dogs (id, name, breed, human_id, size) values
    ('26800000-0000-4000-8000-000000000011', 'First dog', 'Poodle', '26800000-0000-4000-8000-000000000001', 'small'),
    ('26800000-0000-4000-8000-000000000012', 'Second dog', 'Poodle', '26800000-0000-4000-8000-000000000001', 'small');
  insert into public.bookings (id, dog_id, booking_date, slot, service, size, status) values
    ('26800000-0000-4000-8000-000000000101', '26800000-0000-4000-8000-000000000011', '2099-11-28', '09:00', 'full-groom', 'small', 'Ready for collection'),
    ('26800000-0000-4000-8000-000000000102', '26800000-0000-4000-8000-000000000012', '2099-11-28', '09:30', 'full-groom', 'small', 'Arrived');
  commit;
$fixture$);

select ok(not has_function_privilege('authenticated', 'public.claim_staff_collection_notice(uuid,uuid,text,text)', 'execute'), 'clients cannot grant claims');
select ok(not has_function_privilege('authenticated', 'public.reconcile_staff_collection_notice(uuid,text,text,text)', 'execute'), 'clients cannot release ambiguous attempts');
select ok(not has_table_privilege('anon', 'public.staff_collection_notice_claims', 'select'), 'anonymous callers cannot read claims');

select is(public.claim_staff_collection_notice('26800000-0000-4000-8000-000000000101',
  '26800000-0000-4000-8000-000000000001', '+447700900321', 'whatsapp')->>'state', 'ineligible',
  'an arrived sibling holds the collection notice');
select is(public.claim_staff_collection_notice('26800000-0000-4000-8000-000000000101',
  '26800000-0000-4000-8000-000000000002', '+447700900322', 'whatsapp')->>'state', 'ineligible',
  'an unrelated recipient cannot be selected');
select is(public.claim_staff_collection_notice('26800000-0000-4000-8000-000000000101',
  '26800000-0000-4000-8000-000000000001', '+447700900322', 'whatsapp')->>'state', 'ineligible',
  'a current contact cannot send to a different number');

select extensions.dblink_exec('collection_one', $ready$
  begin;
  set local session_replication_role = replica;
  update public.bookings set status = 'Ready for collection' where id = '26800000-0000-4000-8000-000000000102';
  commit;
  begin;
$ready$);
create temp table collection_winner as
select result from extensions.dblink('collection_one', $first$
  select public.claim_staff_collection_notice('26800000-0000-4000-8000-000000000101',
    '26800000-0000-4000-8000-000000000001', '+447700900321', 'whatsapp')
$first$) as reply(result jsonb);
select is((select result->>'state' from collection_winner), 'claimed', 'the first device claims the notice');
create temp table collection_loser as
select pid from extensions.dblink('collection_two', 'select pg_backend_pid()') as backend(pid integer);
select extensions.dblink_send_query('collection_two', $second$
  select public.claim_staff_collection_notice('26800000-0000-4000-8000-000000000102',
    '26800000-0000-4000-8000-000000000001', '+447700900321', 'sms')
$second$);
do $wait$
declare
  deadline timestamptz := clock_timestamp() + interval '5 seconds';
begin
  while cardinality(pg_blocking_pids((select pid from collection_loser))) = 0
        and clock_timestamp() < deadline loop
    perform pg_sleep(0.02);
  end loop;
end;
$wait$;
select ok(cardinality(pg_blocking_pids((select pid from collection_loser))) > 0,
  'the second backend waits on the first uncommitted claim');
select extensions.dblink_exec('collection_one', 'commit');
select is((select result->>'state' from extensions.dblink_get_result('collection_two') as reply(result jsonb)),
  'pending', 'a different device, sibling and channel share the pending claim');
select is((select count(*)::integer from public.staff_collection_notice_claims
  where owner_id = '26800000-0000-4000-8000-000000000001'), 1, 'exactly one durable row exists');

select ok(public.settle_staff_collection_notice((select (result->>'attempt_id')::uuid from collection_winner),
  'unknown', null, false), 'recording an uncertain result succeeds');
select is(public.claim_staff_collection_notice('26800000-0000-4000-8000-000000000102',
  '26800000-0000-4000-8000-000000000001', '+447700900321', 'sms')->>'state', 'unknown',
  'recovery and channel switches never reclaim unknown outcomes');
select ok(not public.reconcile_staff_collection_notice((select (result->>'attempt_id')::uuid from collection_winner),
  'not_sent', null, ''), 'empty reconciliation evidence cannot release a claim');
select ok(public.reconcile_staff_collection_notice((select (result->>'attempt_id')::uuid from collection_winner),
  'accepted', 'synthetic-receipt-268', 'test-provider-reconciliation'), 'evidence can settle an ambiguous attempt');
select is(public.claim_staff_collection_notice('26800000-0000-4000-8000-000000000102',
  '26800000-0000-4000-8000-000000000001', '+447700900321', 'sms'),
  '{"state":"accepted","recorded":false}'::jsonb, 'a committed acceptance replays even without an Inbox entry');
select is((select provider_id from public.staff_collection_notice_claims
  where owner_id = '26800000-0000-4000-8000-000000000001'), 'synthetic-receipt-268',
  'the provider evidence is persisted on the original row');

set local session_replication_role = replica;
insert into public.human_trusted_contacts (human_id, trusted_id)
values ('26800000-0000-4000-8000-000000000001', '26800000-0000-4000-8000-000000000002');
set local session_replication_role = origin;
create temp table collection_first_trusted as
select (public.claim_staff_collection_notice('26800000-0000-4000-8000-000000000101',
  '26800000-0000-4000-8000-000000000002', '+447700900322', 'sms')->>'attempt_id')::uuid as attempt;
select ok((select attempt is not null from collection_first_trusted), 'a linked trusted contact has a separate claim');
select ok(public.settle_staff_collection_notice((select attempt from collection_first_trusted), 'not_sent', null, false),
  'a definite refusal is durably retryable');
select is(public.claim_staff_collection_notice('26800000-0000-4000-8000-000000000102',
  '26800000-0000-4000-8000-000000000002', '+447700900322', 'whatsapp')->>'state', 'claimed',
  'a definite refusal allows a later explicit attempt');
select ok(not public.settle_staff_collection_notice((select attempt from collection_first_trusted), 'accepted', 'stale', false),
  'a stale attempt cannot settle the replacement claim');

select extensions.dblink_disconnect('collection_one');
select extensions.dblink_disconnect('collection_two');
select * from finish();
rollback;

-- Clean up committed synthetic fixtures outside the rollback above.
begin;
set local session_replication_role = replica;
delete from public.staff_collection_notice_claims where owner_id = '26800000-0000-4000-8000-000000000001';
delete from public.bookings where id in ('26800000-0000-4000-8000-000000000101', '26800000-0000-4000-8000-000000000102');
delete from public.dogs where id in ('26800000-0000-4000-8000-000000000011', '26800000-0000-4000-8000-000000000012');
delete from public.humans where id in ('26800000-0000-4000-8000-000000000001', '26800000-0000-4000-8000-000000000002');
commit;
