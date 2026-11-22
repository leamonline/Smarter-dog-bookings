-- In-app messages beside WhatsApp (20261122170000).
--
-- A customer reads and writes only their own conversation. Staff read all.
-- Direct writes are refused. The unified inbox merges an app thread with
-- that customer's WhatsApp/SMS threads and leaves a number with no customer
-- as its own WhatsApp row. App sends do not insert WhatsApp messages.
-- One transaction, rolled back. Fixtures use Ofcom drama numbers.

begin;
create extension if not exists pgtap with schema extensions;
select plan(50);

set local session_replication_role = replica;

insert into auth.users (id) values
  ('26600000-0000-4000-8000-0000000000a1'),
  ('26600000-0000-4000-8000-0000000000b1'),
  ('26600000-0000-4000-8000-0000000000c1'),
  ('26600000-0000-4000-8000-0000000000d1'),
  ('26600000-0000-4000-8000-0000000000e1');

insert into public.staff_profiles (id, user_id, role, display_name) values
  ('26600000-0000-4000-8000-0000000000c0', '26600000-0000-4000-8000-0000000000c1', 'staff', 'App Inbox Staff');

insert into public.humans (id, name, surname, phone, customer_user_id) values
  ('26600000-0000-4000-8000-0000000000a0', 'App', 'Alice', '+447700900501', '26600000-0000-4000-8000-0000000000a1'),
  ('26600000-0000-4000-8000-0000000000b0', 'App', 'Bob', '+447700900502', '26600000-0000-4000-8000-0000000000b1'),
  ('26600000-0000-4000-8000-0000000000d0', 'App', 'Dora', '+447700900504', '26600000-0000-4000-8000-0000000000d1'),
  ('26600000-0000-4000-8000-0000000000e0', 'App', 'Erin', '+447700900505', null),
  ('26600000-0000-4000-8000-0000000000f0', 'App', 'Fran', '+447700900506', null);

-- e1 is an auth user with no human, for the unlinked-account refusal.

insert into public.whatsapp_conversations (
  id, phone_e164, channel, human_id, last_message_at, last_message_text, last_message_direction, unread_count
) values
  ('26600000-0000-4000-8000-000000000a11', '+447700900501', 'whatsapp',
   '26600000-0000-4000-8000-0000000000a0', now() - interval '2 hours', '266-fixture-wa-alice', 'inbound', 1),
  ('26600000-0000-4000-8000-000000000e11', '+447700900505', 'whatsapp',
   '26600000-0000-4000-8000-0000000000e0', now() - interval '3 hours', '266-fixture-wa-erin', 'inbound', 0),
  ('26600000-0000-4000-8000-000000000f11', '+447700900506', 'whatsapp',
   '26600000-0000-4000-8000-0000000000f0', now() - interval '5 hours', '266-fixture-wa-fran', 'inbound', 0),
  ('26600000-0000-4000-8000-000000000f12', '+447700900506', 'sms',
   '26600000-0000-4000-8000-0000000000f0', now() - interval '4 hours', '266-fixture-sms-fran', 'inbound', 2),
  ('26600000-0000-4000-8000-000000000b11', '+447700900599', 'whatsapp',
   null, now() - interval '1 hour', '266-fixture-wa-unlinked', 'inbound', 4);

insert into public.whatsapp_messages (id, conversation_id, direction, role, content, channel, sent_at) values
  ('26600000-0000-4000-8000-000000000a21', '26600000-0000-4000-8000-000000000a11', 'inbound', 'user',
   '266-fixture-wa-alice', 'whatsapp', now() - interval '2 hours'),
  ('26600000-0000-4000-8000-000000000e21', '26600000-0000-4000-8000-000000000e11', 'inbound', 'user',
   '266-fixture-wa-erin', 'whatsapp', now() - interval '3 hours'),
  ('26600000-0000-4000-8000-000000000f21', '26600000-0000-4000-8000-000000000f11', 'inbound', 'user',
   '266-fixture-wa-fran', 'whatsapp', now() - interval '5 hours'),
  ('26600000-0000-4000-8000-000000000f22', '26600000-0000-4000-8000-000000000f12', 'inbound', 'user',
   '266-fixture-sms-fran', 'sms', now() - interval '4 hours'),
  ('26600000-0000-4000-8000-000000000b21', '26600000-0000-4000-8000-000000000b11', 'inbound', 'user',
   '266-fixture-wa-unlinked', 'whatsapp', now() - interval '1 hour');

set local session_replication_role = default;

create temporary table wa_before on commit drop as
  select count(*)::int as n from public.whatsapp_messages;

select ok(
  (select c.relrowsecurity from pg_class c where c.oid = 'public.app_conversations'::regclass),
  'RLS is on for app conversations'
);
select ok(
  (select c.relrowsecurity from pg_class c where c.oid = 'public.app_messages'::regclass),
  'RLS is on for app messages'
);
select ok(
  has_table_privilege('authenticated', 'public.app_messages', 'SELECT')
  and not has_table_privilege('authenticated', 'public.app_messages', 'INSERT')
  and not has_table_privilege('authenticated', 'public.app_messages', 'UPDATE'),
  'signed-in users may read app messages and may not write them directly'
);
select ok(
  not has_table_privilege('anon', 'public.app_messages', 'SELECT'),
  'anon may not read app messages'
);
select ok(
  has_function_privilege('authenticated', 'public.send_app_message(text, uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.send_app_message(text, uuid)', 'EXECUTE'),
  'only a signed-in user may call send_app_message'
);
select ok(
  exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'app_messages'
  )
  and exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'app_conversations'
  ),
  'both app tables are on the realtime publication'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"26600000-0000-4000-8000-0000000000a1","role":"authenticated"}',
  true
);
set local role authenticated;

select lives_ok(
  $$select * from public.send_app_message('Hello from the app', '26600000-0000-4000-8000-0000000000b0')$$,
  'a customer can send, and a human id they pass is not who the row is filed under'
);

reset role;

select is(
  (select sender from public.app_messages where body = 'Hello from the app'),
  'customer'::text,
  'the stored message sender is the customer'
);
select ok(
  (select staff_user_id is null from public.app_messages where body = 'Hello from the app'),
  'a customer message has no staff sender'
);
select is(
  (select c.human_id from public.app_messages m
    join public.app_conversations c on c.id = m.conversation_id
    where m.body = 'Hello from the app'),
  '26600000-0000-4000-8000-0000000000a0'::uuid,
  'the written conversation belongs to the customer who sent it, not the id they passed'
);
select is(
  (select staff_unread_count from public.app_conversations
    where human_id = '26600000-0000-4000-8000-0000000000a0'),
  1,
  'a customer message is unread for staff'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"26600000-0000-4000-8000-0000000000a1","role":"authenticated"}',
  true
);
set local role authenticated;

select is(
  (select count(*)::int from public.app_conversations),
  1,
  'the customer sees their own conversation'
);
select is(
  (select count(*)::int from public.app_messages),
  1,
  'the customer sees their own message'
);

select throws_ok(
  $$insert into public.app_messages (conversation_id, sender, body)
    values ('26600000-0000-4000-8000-0000000000a0', 'customer', 'raw')$$,
  '42501',
  null,
  'a customer cannot insert a message directly'
);
select throws_ok(
  $$update public.app_messages set body = 'changed'$$,
  '42501',
  null,
  'a customer cannot edit a message directly'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"26600000-0000-4000-8000-0000000000b1","role":"authenticated"}',
  true
);

select is(
  (select count(*)::int from public.app_messages where body = 'Hello from the app'),
  0,
  'another customer cannot read the message'
);
select is(
  (select count(*)::int from public.app_conversations),
  0,
  'another customer cannot see the conversation'
);

select lives_ok(
  $$select * from public.send_app_message('Hello from Bob', '26600000-0000-4000-8000-0000000000a0')$$,
  'the other customer sends on their own thread'
);

reset role;

select is(
  (select c.human_id from public.app_messages m
    join public.app_conversations c on c.id = m.conversation_id
    where m.body = 'Hello from Bob'),
  '26600000-0000-4000-8000-0000000000b0'::uuid,
  'Bob''s message is stored on Bob''s conversation'
);
select is(
  (select count(*)::int from public.app_messages m
    join public.app_conversations c on c.id = m.conversation_id
    where c.human_id = '26600000-0000-4000-8000-0000000000a0'),
  1,
  'passing Alice''s id did not add a message to Alice'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"26600000-0000-4000-8000-0000000000c1","role":"authenticated"}',
  true
);
set local role authenticated;

select is(
  (select count(*)::int from public.app_conversations
    where human_id in (
      '26600000-0000-4000-8000-0000000000a0',
      '26600000-0000-4000-8000-0000000000b0'
    )),
  2,
  'staff see both customers'' conversations'
);

select lives_ok(
  $$select * from public.send_app_message('See you Wednesday', '26600000-0000-4000-8000-0000000000a0')$$,
  'staff can reply in the app'
);

reset role;

select is(
  (select sender from public.app_messages where body = 'See you Wednesday'),
  'staff'::text,
  'the stored reply sender is staff'
);
select is(
  (select staff_user_id from public.app_messages where body = 'See you Wednesday'),
  '26600000-0000-4000-8000-0000000000c1'::uuid,
  'the stored reply records which staff member sent it'
);
select is(
  (select customer_unread_count from public.app_conversations
    where human_id = '26600000-0000-4000-8000-0000000000a0'),
  1,
  'a staff reply is unread for the customer'
);
select is(
  (select count(*)::int from public.whatsapp_messages),
  (select n from wa_before),
  'an app send does not write a WhatsApp message'
);

create temporary table alice_app on commit drop as
  select id from public.app_conversations
  where human_id = '26600000-0000-4000-8000-0000000000a0';
grant select on alice_app to authenticated;

select set_config(
  'request.jwt.claims',
  '{"role":"authenticated"}',
  true
);
set local role authenticated;

select throws_ok(
  $$select * from public.send_app_message('Hi', null)$$,
  '28000',
  'not_authenticated',
  'a session with no user is refused'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"26600000-0000-4000-8000-0000000000c1","role":"authenticated"}',
  true
);

select throws_ok(
  $$select * from public.send_app_message('   ', '26600000-0000-4000-8000-0000000000a0')$$,
  '22023',
  'empty_message',
  'a blank message is refused'
);
select throws_ok(
  $$select * from public.send_app_message(repeat('a', 2001), '26600000-0000-4000-8000-0000000000a0')$$,
  '22023',
  'message_too_long',
  'a message over 2000 characters is refused'
);
select throws_ok(
  $$select * from public.send_app_message('Hi', null)$$,
  '22023',
  'human_required',
  'staff must say which customer they are writing to'
);
select throws_ok(
  $$select * from public.send_app_message('Hi', '26600000-0000-4000-8000-000000000099')$$,
  '42704',
  'human_not_found',
  'staff cannot message a customer who does not exist'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"26600000-0000-4000-8000-0000000000e1","role":"authenticated"}',
  true
);

select throws_ok(
  $$select * from public.send_app_message('Hi', null)$$,
  '28000',
  'no_linked_human',
  'an account with no customer record cannot send'
);

reset role;
update public.humans
set archived_at = now()
where id = '26600000-0000-4000-8000-0000000000b0';

select set_config(
  'request.jwt.claims',
  '{"sub":"26600000-0000-4000-8000-0000000000b1","role":"authenticated"}',
  true
);
set local role authenticated;

select throws_ok(
  $$select * from public.send_app_message('Still here', null)$$,
  '22023',
  'account_archived',
  'an archived customer cannot send'
);

-- Staff mark Alice's customer message read, then Alice marks the staff reply.
select set_config(
  'request.jwt.claims',
  '{"sub":"26600000-0000-4000-8000-0000000000c1","role":"authenticated"}',
  true
);

select is(
  (select out_unread_count from public.mark_app_messages_read((select id from alice_app))),
  0,
  'staff marking the thread read clears the staff unread count'
);

reset role;

select ok(
  (select staff_read_at is not null from public.app_messages where body = 'Hello from the app'),
  'the customer message is marked read by staff'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"26600000-0000-4000-8000-0000000000b1","role":"authenticated"}',
  true
);
set local role authenticated;

select throws_ok(
  format(
    $$select * from public.mark_app_messages_read(%L)$$,
    (select id from alice_app)
  ),
  '42704',
  'not_found',
  'another customer cannot mark Alice''s thread read'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"26600000-0000-4000-8000-0000000000a1","role":"authenticated"}',
  true
);

select is(
  (select out_unread_count from public.mark_app_messages_read((select id from alice_app))),
  0,
  'the customer marking the thread read clears their unread count'
);

reset role;

select ok(
  (select customer_read_at is not null from public.app_messages where body = 'See you Wednesday'),
  'the staff reply is marked read by the customer'
);
select is(
  (select staff_unread_count from public.app_conversations
    where human_id = '26600000-0000-4000-8000-0000000000a0'),
  0,
  'the customer mark does not reopen the staff unread count'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"26600000-0000-4000-8000-0000000000d1","role":"authenticated"}',
  true
);
set local role authenticated;

select lives_ok(
  $$select * from public.send_app_message('Hello from Dora', null)$$,
  'a customer with no WhatsApp thread can still message in the app'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"26600000-0000-4000-8000-0000000000a1","role":"authenticated"}',
  true
);

select throws_ok(
  $$select * from public.list_staff_unified_inbox()$$,
  '42501',
  'not_staff',
  'a customer cannot open the unified staff inbox'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"26600000-0000-4000-8000-0000000000c1","role":"authenticated"}',
  true
);

select is(
  (select last_channel from public.list_staff_unified_inbox()
    where human_id = '26600000-0000-4000-8000-0000000000a0'),
  'app'::text,
  'the newer app message is the channel marker on a customer who also has WhatsApp'
);
select is(
  (select channels from public.list_staff_unified_inbox()
    where human_id = '26600000-0000-4000-8000-0000000000a0'),
  array['whatsapp', 'app']::text[],
  'Alice''s row lists WhatsApp and the app'
);
select is(
  (select count(*)::int from public.list_staff_unified_inbox()
    where human_id = '26600000-0000-4000-8000-0000000000f0'),
  1,
  'WhatsApp and SMS for one customer are one inbox row'
);
select is(
  (select channels from public.list_staff_unified_inbox()
    where human_id = '26600000-0000-4000-8000-0000000000f0'),
  array['whatsapp', 'sms']::text[],
  'Fran''s row lists WhatsApp and SMS and not the app'
);
select ok(
  (select app_conversation_id is null from public.list_staff_unified_inbox()
    where human_id = '26600000-0000-4000-8000-0000000000e0'),
  'a WhatsApp-only customer has no app conversation'
);
select is(
  (select channels from public.list_staff_unified_inbox()
    where human_id = '26600000-0000-4000-8000-0000000000d0'),
  array['app']::text[],
  'a customer who only uses the app is an app row'
);
select ok(
  (select human_id is null and channels = array['whatsapp']::text[]
    from public.list_staff_unified_inbox()
    where whatsapp_conversation_id = '26600000-0000-4000-8000-000000000b11'),
  'a number with no customer record stays a WhatsApp thread of its own'
);
select is(
  (select string_agg(channel, ',' order by sent_at, id)
    from public.list_staff_unified_thread('26600000-0000-4000-8000-0000000000a0', null)),
  'whatsapp,app,app',
  'Alice''s thread is the WhatsApp message, then her app message, then the staff app reply'
);
select is(
  (select string_agg(channel, ',' order by sent_at, id)
    from public.list_staff_unified_thread(null, '26600000-0000-4000-8000-000000000b11')),
  'whatsapp',
  'the unlinked number''s thread is only its WhatsApp message'
);

reset role;
select * from finish();
rollback;
