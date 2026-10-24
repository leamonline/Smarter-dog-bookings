-- #1000: current settings writes and the website RPC survive the column drop.
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

select hasnt_column('public', 'salon_config', 'large_dog_slots',
  'retired large-dog settings column is absent');

-- The suite uses a disposable database; every fixture is rolled back.
delete from public.salon_config;
select lives_ok($$insert into public.salon_config (id, settings)
  values ('aaaaaaaa-0000-4000-8000-000000000258',
          '{"businessName":"Column retirement test"}'::jsonb)$$,
  'current seed shape inserts without the retired column');
select lives_ok($$update public.salon_config
  set settings = '{"businessName":"Updated test salon"}'::jsonb
  where id = 'aaaaaaaa-0000-4000-8000-000000000258'$$,
  'current settings shape updates without the retired column');

set local role anon;
select is((select business_name from public.get_public_salon_facts()),
  'Updated test salon', 'website RPC still reads the saved public setting as anon');
reset role;

select lives_ok('alter table public.salon_config drop column if exists large_dog_slots',
  'column drop is safe to repeat');
select * from finish();
rollback;
