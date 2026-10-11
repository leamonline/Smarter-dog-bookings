-- 20261004120000_reconcile_humans_with_prod: a database rebuilt from committed
-- history must carry the humans shape production has had since spring 2026,
-- minus the two unused columns 20261005190000_drop_unused_humans_columns
-- removes again.
begin;
select plan(9);

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

-- 20261005190000_drop_unused_humans_columns: the two columns the May 2026
-- phone-lookup RPC left behind are gone, and so is the index on the generated one.
select hasnt_column('public', 'humans', 'customer_notes', 'customer_notes was dropped');
select hasnt_column('public', 'humans', 'phone_normalised', 'phone_normalised was dropped');
select hasnt_index('public', 'humans', 'humans_phone_normalised_idx', 'the partial index on phone_normalised went with the column');
select has_index('public', 'humans', 'humans_phone_unique', 'the partial unique index on phone is kept');

select throws_ok(
  $$insert into public.humans (name, surname, phone) values ('Shape', 'Twin', '+447700900237')$$,
  '23505',
  null,
  'a second human with the same phone is refused, as on prod');

select * from finish();
rollback;
