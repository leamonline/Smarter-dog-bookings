-- 20261004120000_reconcile_humans_with_prod: a database rebuilt from committed
-- history must carry the humans shape production has had since spring 2026.
begin;
select plan(12);

select col_is_null('public', 'humans', 'surname', 'surname is nullable, as on prod');
select is(
  (select count(*)::int from pg_constraint where conrelid = 'public.humans'::regclass and contype = 'u'),
  0,
  'no unique constraint remains on humans (prod dropped unique(name, surname))');
select lives_ok(
  $$insert into public.humans (name, surname, phone) values ('Shape', null, '+447700900237')$$,
  'a human can be stored with no surname');
select lives_ok(
  $$insert into public.humans (name, surname) values ('Shape', null), ('Shape', null)$$,
  'two humans may share a name with no surname');

select has_column('public', 'humans', 'customer_notes', 'customer_notes exists');
select col_not_null('public', 'humans', 'customer_notes', 'customer_notes is NOT NULL');
select is(
  (select column_default from information_schema.columns
    where table_schema = 'public' and table_name = 'humans' and column_name = 'customer_notes'),
  '''''::text',
  'customer_notes defaults to the empty string');
select is(
  (select customer_notes from public.humans where phone = '+447700900237'),
  '',
  'a new human has empty customer_notes');

select is(
  (select is_generated from information_schema.columns
    where table_schema = 'public' and table_name = 'humans' and column_name = 'phone_normalised'),
  'ALWAYS',
  'phone_normalised is a generated column');
select is(
  (select phone_normalised from public.humans where phone = '+447700900237'),
  '07700900237',
  'phone_normalised folds +44 to the 0-national form');
select has_index('public', 'humans', 'humans_phone_normalised_idx', 'partial index on phone_normalised exists');

select throws_ok(
  $$insert into public.humans (name, surname, phone) values ('Shape', 'Twin', '+447700900237')$$,
  '23505',
  null,
  'a second human with the same phone is refused, as on prod');

select * from finish();
rollback;
