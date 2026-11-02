-- Messenger joins the inbox without relaxing WhatsApp, SMS or email identity.
-- phone_e164 stays required on those channels. Messenger is unique on
-- page id + PSID, stores no phone, and cannot turn auto-send on.

begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

select throws_ok(
  $$ insert into public.whatsapp_conversations (channel, phone_e164)
     values ('whatsapp', null) $$,
  '23514', null,
  'a WhatsApp conversation still needs a phone'
);

select lives_ok(
  $$ insert into public.whatsapp_conversations (channel, phone_e164)
     values ('whatsapp', '+447700900260') $$,
  'a WhatsApp conversation with a phone still inserts'
);

select throws_ok(
  $$ insert into public.whatsapp_conversations (channel, phone_e164)
     values ('whatsapp', '+447700900260') $$,
  '23505', null,
  'the (phone, channel) unique index is unchanged'
);

select lives_ok(
  $$ insert into public.whatsapp_conversations (
       channel, phone_e164, messenger_page_id, messenger_psid, auto_send_enabled, state
     ) values (
       'messenger', null, 'page-260', 'psid-260', true, 'ai_handling'
     ) $$,
  'a Messenger conversation does not need a phone'
);

select results_eq(
  $$ select (phone_e164 is null), auto_send_enabled, autonomous_booking_enabled, state::text
       from public.whatsapp_conversations
      where messenger_psid = 'psid-260' $$,
  $$ select true, false, false, 'human_takeover'::text $$,
  'Messenger stays manual: no phone, no auto-send, human takeover'
);

select throws_ok(
  $$ insert into public.whatsapp_conversations (
       channel, phone_e164, messenger_page_id, messenger_psid
     ) values ('messenger', null, 'page-260', 'psid-260') $$,
  '23505', null,
  'the same Page and PSID cannot open a second thread'
);

select throws_ok(
  $$ insert into public.whatsapp_conversations (
       channel, phone_e164, messenger_page_id, messenger_psid
     ) values ('messenger', '+447700900260', 'page-260', 'psid-261') $$,
  '23514', null,
  'a Messenger row cannot also carry a phone'
);

select * from finish();
rollback;
