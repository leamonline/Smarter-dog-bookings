-- Exercise compare-and-write on two real backends and inspect the winner's row.
begin;
create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;
select plan(6);

create temp table revision_dblink as
select format('hostaddr=%L port=%L dbname=%L user=%L password=postgres',
  host(inet_server_addr())::text, current_setting('port'), current_database(), session_user) as conn;
select extensions.dblink_connect('revision_one', conn) from revision_dblink;
select extensions.dblink_connect('revision_two', conn) from revision_dblink;

select extensions.dblink_exec('revision_one', $fixture$
  begin;
  set local session_replication_role = replica;
  delete from public.bookings where id = '26900000-0000-4000-8000-000000000101';
  delete from public.dogs where id = '26900000-0000-4000-8000-000000000011';
  delete from public.humans where id = '26900000-0000-4000-8000-000000000001';
  insert into public.humans (id, name, surname) values
    ('26900000-0000-4000-8000-000000000001', 'Revision', 'Fixture');
  insert into public.dogs (id, name, breed, human_id, size) values
    ('26900000-0000-4000-8000-000000000011', 'Synthetic dog', 'Poodle', '26900000-0000-4000-8000-000000000001', 'small');
  insert into public.bookings (id, dog_id, booking_date, slot, service, size, status) values
    ('26900000-0000-4000-8000-000000000101', '26900000-0000-4000-8000-000000000011',
      '2099-11-28', '09:00', 'full-groom', 'small', 'Ready for collection');
  commit;
  begin;
$fixture$);

select is((select staff_revision from public.bookings where id = '26900000-0000-4000-8000-000000000101'),
  0, 'existing row begins at revision zero');
select is((select revision from extensions.dblink('revision_one', $winner$
  update public.bookings
    set payment = 'Paid in Full', payment_method = 'card', paid_amount = 42, staff_revision = 987
    where id = '26900000-0000-4000-8000-000000000101' and staff_revision = 0
    returning staff_revision
$winner$) as saved(revision integer)), 1, 'the database advances the winner regardless of supplied revision');
create temp table revision_loser as
select pid from extensions.dblink('revision_two', 'select pg_backend_pid()') as backend(pid integer);
select extensions.dblink_send_query('revision_two', $loser$
  with changed as (
    update public.bookings
      set payment = 'Paid in Full', payment_method = 'cash', paid_amount = 7
      where id = '26900000-0000-4000-8000-000000000101' and staff_revision = 0
      returning id
  )
  select count(*)::integer from changed
$loser$);
do $wait$
declare
  deadline timestamptz := clock_timestamp() + interval '5 seconds';
begin
  while cardinality(pg_blocking_pids((select pid from revision_loser))) = 0
        and clock_timestamp() < deadline loop
    perform pg_sleep(0.02);
  end loop;
end;
$wait$;
select ok(cardinality(pg_blocking_pids((select pid from revision_loser))) > 0, 'the competing update waits for the row');
select extensions.dblink_exec('revision_one', 'commit');
select is((select affected from extensions.dblink_get_result('revision_two') as result(affected integer)),
  0, 'the competing update matches no row after the first write commits');
select results_eq(
  $$select payment, payment_method, paid_amount, status from public.bookings
    where id = '26900000-0000-4000-8000-000000000101'$$,
  $$values ('Paid in Full'::text, 'card'::text, 42::numeric, 'Ready for collection'::text)$$,
  'the stored payment and unaffected status belong to the first device'
);
update public.bookings set notes = 'first note' where id = '26900000-0000-4000-8000-000000000101';
update public.bookings set notes = 'second note' where id = '26900000-0000-4000-8000-000000000101';
select is((select staff_revision from public.bookings where id = '26900000-0000-4000-8000-000000000101'),
  3, 'two updates in one transaction each advance the revision');
select extensions.dblink_disconnect('revision_one');
select extensions.dblink_disconnect('revision_two');
select * from finish();
rollback;

begin;
set local session_replication_role = replica;
delete from public.bookings where id = '26900000-0000-4000-8000-000000000101';
delete from public.dogs where id = '26900000-0000-4000-8000-000000000011';
delete from public.humans where id = '26900000-0000-4000-8000-000000000001';
commit;
