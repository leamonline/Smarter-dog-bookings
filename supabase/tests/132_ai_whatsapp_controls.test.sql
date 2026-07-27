-- Global and per-customer AI WhatsApp controls are durable and staff-only.
-- Manual sends are tested at the Edge Function decision boundary.

begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

insert into auth.users (id) values
  ('13200000-0000-4000-8000-000000000001'),
  ('13200000-0000-4000-8000-000000000002');

insert into public.staff_profiles (user_id, role, display_name) values
  ('13200000-0000-4000-8000-000000000001', 'staff', 'AI control staff');

insert into public.humans (id, name, surname, customer_user_id) values
  ('13200000-0000-4000-8000-000000000010', 'AIControl', 'Customer',
   '13200000-0000-4000-8000-000000000002');

select is(
  (select enabled from public.ai_whatsapp_settings where singleton),
  true,
  'the global switch preserves current behaviour by default'
);

select is(
  (select ai_whatsapp_allowed from public.humans
   where id = '13200000-0000-4000-8000-000000000010'),
  true,
  'existing and new customers default to allowing AI-initiated messages'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'public.ai_whatsapp_settings',
    'SELECT'
  ),
  'authenticated callers cannot read the settings table directly'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"13200000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
set local role authenticated;

select throws_ok(
  $$ select * from public.get_ai_whatsapp_settings() $$,
  '42501',
  null,
  'customers cannot read the staff setting'
);

select throws_ok(
  $$ select * from public.set_ai_whatsapp_enabled(false) $$,
  '42501',
  null,
  'customers cannot change the global setting'
);

select lives_ok(
  $$ update public.humans
     set ai_whatsapp_allowed = false
     where id = '13200000-0000-4000-8000-000000000010' $$,
  'a customer direct update is safely filtered by RLS'
);

reset role;

select is(
  (select ai_whatsapp_allowed from public.humans
   where id = '13200000-0000-4000-8000-000000000010'),
  true,
  'the customer could not alter their AI messaging preference'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"13200000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;

select lives_ok(
  $$ select * from public.set_ai_whatsapp_enabled(false) $$,
  'staff can turn the global switch off'
);

select is(
  (select enabled from public.get_ai_whatsapp_settings()),
  false,
  'staff read back the durable disabled state'
);

select lives_ok(
  $$ update public.humans
     set ai_whatsapp_allowed = false
     where id = '13200000-0000-4000-8000-000000000010' $$,
  'staff can block AI messages for one customer'
);

reset role;

select is(
  (select ai_whatsapp_allowed from public.humans
   where id = '13200000-0000-4000-8000-000000000010'),
  false,
  'the customer-level block persists'
);

select * from finish();
rollback;
