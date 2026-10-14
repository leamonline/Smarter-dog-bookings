-- WhatsApp opt-out belongs to the number (migration 20261014120000).
--
-- A STOP from a number with no customer record is stored on its conversation;
-- the database carries it to every customer record that has, or later gets,
-- that number, however the number is typed; switching WhatsApp back on for a
-- customer clears it; and at most one STOP acknowledgement can be pending per
-- conversation. The triggers under test stay ON for every write below.
-- Synthetic fixtures, rolled back.

begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

-- Act as a member of staff: only staff may change a customer's phone
-- (prevent_customer_critical_column_update). The staff fixture alone is
-- written with triggers off; everything under test keeps them on.
set local session_replication_role = replica;
insert into auth.users (id) values ('24400000-0000-4000-8000-000000000041');
insert into public.staff_profiles (id, user_id, role, display_name)
values ('24400000-0000-4000-8000-000000000040', '24400000-0000-4000-8000-000000000041', 'staff', 'Opt-out Test Staff');
set local session_replication_role = default;
select set_config('request.jwt.claims', '{"sub":"24400000-0000-4000-8000-000000000041","role":"authenticated"}', true);

-- ── Phone key: the same cases as supabase/functions/_shared/optOut.test.ts ──
select is(public.whatsapp_phone_key('+447700900123'), '7700900123', 'E.164 UK number');
select is(public.whatsapp_phone_key('07700 900123'), '7700900123', 'national format with a space');
select is(public.whatsapp_phone_key('+44 (0)7700 900123'), '7700900123', '"+44 (0)" form');
select is(public.whatsapp_phone_key('0044 7700-900123'), '7700900123', '0044 prefix with a dash');
select is(public.whatsapp_phone_key('07700900124'), '7700900124', 'a neighbouring number keeps its own key');
select is(public.whatsapp_phone_key('+33 6 12 34 56 78'), '33612345678', 'formatted international number');
select is(public.whatsapp_phone_key('0033612345678'), '33612345678', '00-prefixed international number');
select is(public.whatsapp_phone_key('12345'), null, 'too short to be a number');
select is(public.whatsapp_phone_key(''), null, 'empty');

-- ── A number with no customer record says STOP ──────────────────────
insert into public.whatsapp_conversations (id, phone_e164)
values ('24400000-0000-4000-8000-000000000001', '+447700900441');
update public.whatsapp_conversations
   set whatsapp_opted_out_at = '2026-10-14 09:00:00+00'
 where id = '24400000-0000-4000-8000-000000000001';

-- … and later becomes a customer, typed differently
insert into public.humans (id, name, surname, phone)
values ('24400000-0000-4000-8000-000000000011', 'Synthetic', 'Later', '07700 900 441');
select is(
  (select whatsapp_opted_out from public.humans where id = '24400000-0000-4000-8000-000000000011'),
  true, 'a customer created later with the number is opted out as it is written'
);
select is(
  (select whatsapp_opted_out_reason || ' @ ' || whatsapp_opted_out_at::text from public.humans where id = '24400000-0000-4000-8000-000000000011'),
  'asked_on_whatsapp @ 2026-10-14 09:00:00+00', 'with the reason and the time the number said STOP'
);

insert into public.humans (id, name, surname, phone)
values ('24400000-0000-4000-8000-000000000012', 'Synthetic', 'Neighbour', '07700 900 442');
select is(
  (select whatsapp_opted_out from public.humans where id = '24400000-0000-4000-8000-000000000012'),
  false, 'a different number is untouched'
);

-- ── STOP on a number shared by records, then linked to another ──────
insert into public.humans (id, name, surname, phone)
values ('24400000-0000-4000-8000-000000000013', 'Synthetic', 'Shared', '+44 7700 900443'),
       ('24400000-0000-4000-8000-000000000014', 'Synthetic', 'Landline', '01632 960443');
insert into public.whatsapp_conversations (id, phone_e164)
values ('24400000-0000-4000-8000-000000000002', '+447700900443');
update public.whatsapp_conversations
   set whatsapp_opted_out_at = now()
 where id = '24400000-0000-4000-8000-000000000002';
select is(
  (select whatsapp_opted_out from public.humans where id = '24400000-0000-4000-8000-000000000013'),
  true, 'the STOP flags an unlinked record already on the number'
);

update public.whatsapp_conversations
   set human_id = '24400000-0000-4000-8000-000000000014'
 where id = '24400000-0000-4000-8000-000000000002';
select is(
  (select whatsapp_opted_out from public.humans where id = '24400000-0000-4000-8000-000000000014'),
  true, 'linking the conversation to a customer later carries the STOP to them'
);

-- ── A customer changes their number to one that said STOP ──────────
insert into public.humans (id, name, surname, phone)
values ('24400000-0000-4000-8000-000000000015', 'Synthetic', 'Mover', '07700 900 450');
update public.humans set phone = '+44 7700 900441' where id = '24400000-0000-4000-8000-000000000015';
select is(
  (select whatsapp_opted_out from public.humans where id = '24400000-0000-4000-8000-000000000015'),
  true, 'changing a record''s number to a stopped one opts it out'
);

-- ── Staff switch WhatsApp back on ───────────────────────────────────
update public.humans set whatsapp_opted_out = false where id = '24400000-0000-4000-8000-000000000011';
select is(
  (select whatsapp_opted_out_at from public.whatsapp_conversations where id = '24400000-0000-4000-8000-000000000001'),
  null, 're-enabling a customer clears the number''s STOP'
);
update public.humans set phone = '07700 900 441' where id = '24400000-0000-4000-8000-000000000011';
select is(
  (select whatsapp_opted_out from public.humans where id = '24400000-0000-4000-8000-000000000011'),
  false, 'a later save that keeps the same number does not undo the re-opt-in'
);
select is(
  (select whatsapp_opted_out from public.humans where id = '24400000-0000-4000-8000-000000000015'),
  true, 'another record on the number stays opted out until staff switch it back on too'
);

-- ── An SMS conversation is not a WhatsApp STOP ──────────────────────
insert into public.whatsapp_conversations (id, phone_e164, channel, whatsapp_opted_out_at)
values ('24400000-0000-4000-8000-000000000003', '+447700900460', 'sms', now());
insert into public.humans (id, name, surname, phone)
values ('24400000-0000-4000-8000-000000000016', 'Synthetic', 'Texter', '07700 900 460');
select is(
  (select whatsapp_opted_out from public.humans where id = '24400000-0000-4000-8000-000000000016'),
  false, 'a timestamp on an SMS conversation does not opt anyone out of WhatsApp'
);

-- ── One pending STOP acknowledgement per conversation ───────────────
select lives_ok(
  $$insert into public.whatsapp_drafts (conversation_id, proposed_text, intent, confidence, state, tool_calls)
    values ('24400000-0000-4000-8000-000000000001', 'ack', 'escalate', 1, 'pending', '{"opt_out_acknowledgement": true}')$$,
  'the first pending acknowledgement is accepted'
);
select throws_ok(
  $$insert into public.whatsapp_drafts (conversation_id, proposed_text, intent, confidence, state, tool_calls)
    values ('24400000-0000-4000-8000-000000000001', 'ack again', 'escalate', 1, 'pending', '{"opt_out_acknowledgement": true}')$$,
  '23505', null, 'a second pending acknowledgement for the conversation is refused'
);
select lives_ok(
  $$insert into public.whatsapp_drafts (conversation_id, proposed_text, intent, confidence, state, tool_calls)
    values ('24400000-0000-4000-8000-000000000002', 'ack', 'escalate', 1, 'pending', '{"opt_out_acknowledgement": true}')$$,
  'another conversation has its own'
);
select lives_ok(
  $$insert into public.whatsapp_drafts (conversation_id, proposed_text, intent, confidence, state, tool_calls)
    values ('24400000-0000-4000-8000-000000000001', 'reply one', 'escalate', 1, 'pending', '{"reason": "x"}'),
           ('24400000-0000-4000-8000-000000000001', 'reply two', 'escalate', 1, 'pending', null)$$,
  'ordinary pending drafts are not limited'
);
update public.whatsapp_drafts set state = 'rejected'
 where conversation_id = '24400000-0000-4000-8000-000000000001' and tool_calls ->> 'opt_out_acknowledgement' = 'true';
select lives_ok(
  $$insert into public.whatsapp_drafts (conversation_id, proposed_text, intent, confidence, state, tool_calls)
    values ('24400000-0000-4000-8000-000000000001', 'ack after rejection', 'escalate', 1, 'pending', '{"opt_out_acknowledgement": true}')$$,
  'once staff decide the pending one, a later STOP may leave a new one'
);

-- ── Nothing here is callable from the API ───────────────────────────
select is(
  (select count(*)::int
     from unnest(array['anon', 'authenticated']) as r(role)
     cross join unnest(array[
       'public.whatsapp_phone_key(text)',
       'public.whatsapp_conversation_apply_opt_out()',
       'public.humans_apply_number_opt_out()',
       'public.humans_clear_number_opt_out()'
     ]) as f(sig)
    where has_function_privilege(r.role, f.sig, 'execute')),
  0, 'no new function is executable by anon or authenticated'
);
select is(
  (select count(*)::int from pg_catalog.pg_proc p
     join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('whatsapp_conversation_apply_opt_out', 'humans_apply_number_opt_out', 'humans_clear_number_opt_out')
      and p.prosecdef
      and p.proconfig @> array['search_path=public, pg_temp']),
  3, 'the trigger functions are SECURITY DEFINER with a pinned search_path'
);

select * from finish();
rollback;
