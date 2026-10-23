-- A booking confirmation marks its WhatsApp conversation complete
-- (whatsapp-send template mode, booking_confirmed_v1). There is no migration:
-- this pins the database behaviour the Edge Function's update relies on.
--
-- 1. The row whatsapp-send writes (closed_at, closed_by empty, closure_reason
--    'booking_confirmed_quiet', suggestions cleared) passes the closure_reason
--    CHECK (20260520200000) as the service role. 'booking_confirmed' would not,
--    which is why the existing booking reason is reused.
-- 2. Closing supersedes the conversation's pending drafts as
--    conversation_closed (20260520240000), which is why a pending handoff keeps
--    the thread open instead.
-- 3. The customer's next message reopens it exactly as after a manual close
--    (reopen_on_new_inbound, 20260614120000).

begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

insert into public.whatsapp_conversations
  (id, phone_e164, channel, state, last_inbound_at, closure_suggested_at, closure_suggested_reason)
values
  ('25700000-0000-4000-8000-000000000001', '+447700900257', 'whatsapp', 'ai_handling',
   now() - interval '1 hour', now() - interval '1 day', 'stale_30d');

insert into public.whatsapp_drafts (id, conversation_id, proposed_text, intent, confidence, state)
values
  ('25700000-0000-4000-8000-000000000011', '25700000-0000-4000-8000-000000000001',
   'Fixture draft', 'booking_query', 0.9, 'pending');

-- ── 1-2: the update whatsapp-send makes ─────────────────────────────
set local role service_role;
select lives_ok(
  $$update public.whatsapp_conversations
       set closed_at = now(),
           closed_by = null,
           closure_reason = 'booking_confirmed_quiet',
           closure_suggested_at = null,
           closure_suggested_reason = null
     where id = '25700000-0000-4000-8000-000000000001'
       and closed_at is null$$,
  'the service role can mark a conversation complete after a booking confirmation');
reset role;

select ok(
  exists (select 1 from public.whatsapp_conversations
           where id = '25700000-0000-4000-8000-000000000001'
             and closed_at is not null
             and closed_by is null
             and closure_reason = 'booking_confirmed_quiet'
             and closure_suggested_at is null
             and closure_suggested_reason is null),
  'the conversation is closed with the booking reason, no person, and no stale suggestion');

-- ── 3: closing supersedes pending drafts ────────────────────────────
select is(
  (select state || '/' || rejected_reason from public.whatsapp_drafts
    where id = '25700000-0000-4000-8000-000000000011'),
  'superseded/conversation_closed',
  'a pending draft is superseded as conversation_closed, as with Mark complete');

-- ── 4-5: the next customer message reopens it ───────────────────────
update public.whatsapp_conversations
   set last_inbound_at = now()
 where id = '25700000-0000-4000-8000-000000000001';

select ok(
  exists (select 1 from public.whatsapp_conversations
           where id = '25700000-0000-4000-8000-000000000001'
             and closed_at is null
             and closure_reason is null
             and closed_by is null),
  'a new customer message reopens the conversation');

select is(
  (select state from public.whatsapp_conversations
    where id = '25700000-0000-4000-8000-000000000001'),
  'ai_handling',
  'reopening leaves the handling mode as it was');

-- ── 6: why the reason is reused ─────────────────────────────────────
select throws_ok(
  $$update public.whatsapp_conversations
       set closed_at = now(), closure_reason = 'booking_confirmed'
     where id = '25700000-0000-4000-8000-000000000001'$$,
  '23514',
  null,
  'closure_reason has no plain booking_confirmed value without a migration');

select * from finish();
rollback;
