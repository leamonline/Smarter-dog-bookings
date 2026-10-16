-- WhatsApp opt-out belongs to the number (migration 20261014120000).
--
-- A STOP from a number with no customer record is stored on its conversation;
-- the database carries it to every customer record that has, or later gets,
-- that number, however the number is typed; no ordinary edit undoes it, a
-- number change included; only the audited staff re-enable, confirming every
-- record on the number, switches it back on; and at most one STOP
-- acknowledgement can be pending per conversation. The triggers under test stay ON for every write below.
-- Synthetic fixtures, rolled back.

begin;
create extension if not exists pgtap with schema extensions;
select plan(62);

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

-- A repeat STOP keeps the first time.
update public.whatsapp_conversations
   set whatsapp_opted_out_at = '2026-10-14 10:30:00+00'
 where id = '24400000-0000-4000-8000-000000000001';
select is(
  (select whatsapp_opted_out_at from public.whatsapp_conversations where id = '24400000-0000-4000-8000-000000000001'),
  '2026-10-14 09:00:00+00'::timestamptz, 'a repeat STOP keeps the number''s first time'
);

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

-- A stale link: a customer whose number is now different (staff changed it)
-- is still linked to the stopped number's conversation.
update public.whatsapp_conversations
   set human_id = '24400000-0000-4000-8000-000000000014'
 where id = '24400000-0000-4000-8000-000000000002';
select is(
  (select whatsapp_opted_out from public.humans where id = '24400000-0000-4000-8000-000000000014'),
  false, 'a linked customer on a DIFFERENT number is not opted out by the link'
);
-- An opt-out staff set for another reason, on a number that never said STOP,
-- is still refused an ordinary untick while the record is linked to a
-- stopped conversation (20261016120000, G2: refusal only, never a flag).
-- Staff re-enable that conversation's number instead.
update public.humans set whatsapp_opted_out = true where id = '24400000-0000-4000-8000-000000000014';
select throws_ok(
  $$update public.humans set whatsapp_opted_out = false where id = '24400000-0000-4000-8000-000000000014'$$,
  'P0001', null, 'an untick of a record linked to a stopped conversation is refused, even on another number'
);
select isnt(
  (select whatsapp_opted_out_at from public.whatsapp_conversations where id = '24400000-0000-4000-8000-000000000002'),
  null, 'and the STOP stays on the number that customer was linked to'
);

-- ── A customer changes their number to one that said STOP ──────────
insert into public.humans (id, name, surname, phone)
values ('24400000-0000-4000-8000-000000000015', 'Synthetic', 'Mover', '07700 900 450');
update public.humans set phone = '+44 7700 900441' where id = '24400000-0000-4000-8000-000000000015';
select is(
  (select whatsapp_opted_out from public.humans where id = '24400000-0000-4000-8000-000000000015'),
  true, 'changing a record''s number to a stopped one opts it out'
);

-- ── A customer who said STOP changes their number AWAY ──────────────
update public.humans set phone = '07700 900 470' where id = '24400000-0000-4000-8000-000000000013';
select is(
  (select whatsapp_opted_out from public.humans where id = '24400000-0000-4000-8000-000000000013'),
  true, 'a new number does not restore permission: the STOP stays on the customer'
);
select is(
  (select whatsapp_opted_out_reason from public.humans where id = '24400000-0000-4000-8000-000000000013'),
  'asked_on_whatsapp', 'with its reason'
);
select isnt(
  (select whatsapp_opted_out_at from public.whatsapp_conversations where id = '24400000-0000-4000-8000-000000000002'),
  null, 'and the old number stays suppressed'
);

-- ── No ordinary edit undoes a STOP ──────────────────────────────────
select throws_ok(
  $$update public.humans set whatsapp_opted_out = false where id = '24400000-0000-4000-8000-000000000013'$$,
  'P0001', null, 'unticking a customer who said STOP is refused, even after their number changed'
);
select throws_ok(
  $$update public.humans set whatsapp_opted_out = false, phone = '07700 900 471' where id = '24400000-0000-4000-8000-000000000013'$$,
  'P0001', null, 'and so is an untick hidden in a save that also changes the number'
);
select throws_ok(
  $$update public.humans set whatsapp_opted_out_reason = 'staff' where id = '24400000-0000-4000-8000-000000000015'$$,
  'P0001', null, 'relabelling a STOP''s reason is refused, so it cannot open the way for an untick'
);
select throws_ok(
  $$update public.whatsapp_conversations set whatsapp_opted_out_at = null where id = '24400000-0000-4000-8000-000000000001'$$,
  'P0001', null, 'clearing the number''s own STOP directly is refused'
);
select throws_ok(
  $$update public.whatsapp_conversations set phone_e164 = '+447700900499' where id = '24400000-0000-4000-8000-000000000001'$$,
  'P0001', null, 'and so is moving the stopped conversation to another number'
);
-- The same refusals for a real staff session, through RLS. Cached plans are
-- discarded first: a plan made above, as postgres, may have inlined
-- whatsapp_phone_key and would skip the permission check a fresh staff
-- connection meets.
discard plans;
set local role authenticated;
select throws_ok(
  $$update public.whatsapp_conversations set phone_e164 = '+447700900499' where id = '24400000-0000-4000-8000-000000000001'$$,
  'P0001', null, 'a staff session moving the stopped conversation gets the refusal, not a permission error'
);
select throws_ok(
  $$update public.whatsapp_conversations set whatsapp_last_stop_at = null where id = '24400000-0000-4000-8000-000000000001'$$,
  'P0001', null, 'and cannot edit when the number last said STOP'
);
reset role;

-- ── Already opted out for another reason, then the number says STOP ─
insert into public.humans (id, name, surname, phone, whatsapp_opted_out, whatsapp_opted_out_at, whatsapp_opted_out_reason)
values ('24400000-0000-4000-8000-000000000018', 'Synthetic', 'Earlier', '07700 900 480', true, '2026-10-01 08:00:00+00', 'told staff by phone');
insert into public.whatsapp_conversations (id, phone_e164)
values ('24400000-0000-4000-8000-000000000004', '+447700900480');
update public.whatsapp_conversations
   set whatsapp_opted_out_at = '2026-10-14 11:00:00+00'
 where id = '24400000-0000-4000-8000-000000000004';
select is(
  (select whatsapp_opted_out_reason || ' @ ' || whatsapp_opted_out_at::text from public.humans where id = '24400000-0000-4000-8000-000000000018'),
  'asked_on_whatsapp @ 2026-10-01 08:00:00+00', 'a record already opted out is marked as a STOP, keeping its own time'
);
update public.humans set phone = '07700 900 481' where id = '24400000-0000-4000-8000-000000000018';
select throws_ok(
  $$update public.humans set whatsapp_opted_out = false where id = '24400000-0000-4000-8000-000000000018'$$,
  'P0001', null, 'so after a number change its STOP still cannot be unticked'
);

-- ── The STOP label never sits on a record that is not opted out ──────
insert into public.humans (id, name, surname, phone, whatsapp_opted_out, whatsapp_opted_out_reason)
values ('24400000-0000-4000-8000-000000000019', 'Synthetic', 'Labelled', '07700 900480', false, 'asked_on_whatsapp');
select is(
  (select whatsapp_opted_out from public.humans where id = '24400000-0000-4000-8000-000000000019'),
  true, 'a record written with the label on a stopped number is still opted out'
);
select throws_ok(
  $$insert into public.humans (id, name, surname, phone, whatsapp_opted_out, whatsapp_opted_out_reason)
    values ('24400000-0000-4000-8000-000000000020', 'Synthetic', 'Unstopped', '07700 900 497', false, 'asked_on_whatsapp')$$,
  '23514', null, 'and the label without an opt-out is refused elsewhere'
);
insert into public.humans (id, name, surname, phone)
values ('24400000-0000-4000-8000-000000000021', 'Synthetic', 'Mover2', '07700 900 498');
select throws_ok(
  $$update public.humans set phone = '07700 900 496', whatsapp_opted_out_reason = 'asked_on_whatsapp' where id = '24400000-0000-4000-8000-000000000021'$$,
  '23514', null, 'labelling a record while moving it to an unstopped number is refused too'
);
update public.humans set phone = '+44 7700 900480', whatsapp_opted_out_reason = 'asked_on_whatsapp' where id = '24400000-0000-4000-8000-000000000021';
select is(
  (select whatsapp_opted_out from public.humans where id = '24400000-0000-4000-8000-000000000021'),
  true, 'and labelling it while moving it to a stopped number opts it out'
);
select is(
  (select count(*)::int from public.humans
    where id in ('24400000-0000-4000-8000-000000000011', '24400000-0000-4000-8000-000000000013', '24400000-0000-4000-8000-000000000015')
      and whatsapp_opted_out is true),
  3, 'every refused untick left its record opted out'
);

-- ── The scope staff confirm before re-enabling ──────────────────────
select is(
  (select jsonb_path_query_array(public.staff_whatsapp_number_opt_out_scope('07700900441'), '$.records[*].id')),
  '["24400000-0000-4000-8000-000000000011", "24400000-0000-4000-8000-000000000015"]'::jsonb,
  'the scope lists every opted-out record on the number'
);
select is(
  array[(public.staff_whatsapp_number_opt_out_scope('+447700900441') ->> 'number_stopped_at')::timestamptz,
        (public.staff_whatsapp_number_opt_out_scope('+447700900441') ->> 'last_stop_at')::timestamptz],
  array['2026-10-14 09:00:00+00'::timestamptz, '2026-10-14 10:30:00+00'::timestamptz],
  'and when the number first and last said STOP'
);

-- ── Re-enabling: renewed permission, the whole scope, audited ───────
select throws_ok(
  $$select public.staff_reenable_whatsapp_number('07700900441', array['24400000-0000-4000-8000-000000000011']::uuid[], '2026-10-14 10:30:00+00'::timestamptz, 'Customer phoned to ask for reminders again')$$,
  'P0001', null, 're-enabling only part of the number is refused'
);
select throws_ok(
  $$select public.staff_reenable_whatsapp_number('07700900441',
      array['24400000-0000-4000-8000-000000000011', '24400000-0000-4000-8000-000000000015']::uuid[], '2026-10-14 10:30:00+00'::timestamptz, 'ok')$$,
  'P0001', null, 'and so is a re-enable without the customer''s renewed permission recorded'
);
select throws_ok(
  $$select public.staff_reenable_whatsapp_number('07700900441',
      array['24400000-0000-4000-8000-000000000011', '24400000-0000-4000-8000-000000000015']::uuid[],
      '2026-10-14 09:00:00+00'::timestamptz, 'Customer phoned to ask for reminders again')$$,
  'P0001', null, 'and so is one confirming a STOP older than the latest: the number said STOP again since'
);
select is(
  (select whatsapp_opted_out_at from public.whatsapp_conversations where id = '24400000-0000-4000-8000-000000000001'),
  '2026-10-14 09:00:00+00'::timestamptz, 'a refused re-enable changes nothing'
);

-- A customer, not staff, cannot call it.
select set_config('request.jwt.claims', '{"sub":"24400000-0000-4000-8000-000000000099","role":"authenticated"}', true);
select throws_ok(
  $$select public.staff_reenable_whatsapp_number('07700900441',
      array['24400000-0000-4000-8000-000000000011', '24400000-0000-4000-8000-000000000015']::uuid[], '2026-10-14 10:30:00+00'::timestamptz, 'Customer phoned to ask for reminders again')$$,
  '42501', null, 'only staff can re-enable'
);
select throws_ok(
  $$select public.staff_whatsapp_number_opt_out_scope('07700900441')$$,
  '42501', null, 'or read the scope'
);
select set_config('request.jwt.claims', '{"sub":"24400000-0000-4000-8000-000000000041","role":"authenticated"}', true);

select lives_ok(
  $$select public.staff_reenable_whatsapp_number('+44 7700 900441',
      array['24400000-0000-4000-8000-000000000015', '24400000-0000-4000-8000-000000000011']::uuid[], '2026-10-14 10:30:00+00'::timestamptz, 'Customer phoned to ask for reminders again')$$,
  'confirming every record on the number with the renewed permission re-enables it'
);
select is(
  (select whatsapp_opted_out_at from public.whatsapp_conversations where id = '24400000-0000-4000-8000-000000000001'),
  null, 'the number''s STOP is cleared'
);
select is(
  (select count(*)::int from public.humans
    where id in ('24400000-0000-4000-8000-000000000011', '24400000-0000-4000-8000-000000000015')
      and whatsapp_opted_out is false and whatsapp_opted_out_reason is null),
  2, 'and both confirmed records are back on'
);
select is(
  (select array[phone_key, permission_note, reenabled_by::text, cardinality(human_ids)::text, cardinality(conversation_ids)::text]
     from public.whatsapp_opt_out_reenables where phone_key = '7700900441'),
  array['7700900441', 'Customer phoned to ask for reminders again', '24400000-0000-4000-8000-000000000041', '2', '1'],
  'the re-enable is audited: number, who, the permission, and its scope'
);
select is(
  (select whatsapp_opted_out from public.humans where id = '24400000-0000-4000-8000-000000000013'),
  true, 'a customer who moved off that number keeps their own STOP'
);
update public.humans set phone = '07700 900 441' where id = '24400000-0000-4000-8000-000000000011';
select is(
  (select whatsapp_opted_out from public.humans where id = '24400000-0000-4000-8000-000000000011'),
  false, 'a later save of the same number does not undo the re-enable'
);
insert into public.humans (id, name, surname, phone)
values ('24400000-0000-4000-8000-000000000017', 'Synthetic', 'After', '07700900441');
select is(
  (select whatsapp_opted_out from public.humans where id = '24400000-0000-4000-8000-000000000017'),
  false, 'and a record created on the number afterwards is not opted out'
);
select throws_ok(
  $$select public.staff_reenable_whatsapp_number('07700900441', '{}'::uuid[], null, 'Customer phoned to ask for reminders again')$$,
  'P0001', null, 'a number that is not switched off has nothing to re-enable'
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

-- ── Nothing internal is callable from the API ───────────────────────
select is(
  (select count(*)::int
     from unnest(array['anon', 'authenticated']) as r(role)
     cross join unnest(array[
       'public.whatsapp_phone_key(text)',
       'public.whatsapp_conversation_apply_opt_out()',
       'public.humans_apply_number_opt_out()',
       'public.humans_guard_whatsapp_reenable()',
       'public.whatsapp_conversation_guard_stop()'
     ]) as f(sig)
    where has_function_privilege(r.role, f.sig, 'execute')),
  0, 'no trigger function or helper is executable by anon or authenticated'
);
select is(
  (select count(*)::int
     from unnest(array[
       'public.staff_whatsapp_number_opt_out_scope(text)',
       'public.staff_reenable_whatsapp_number(text, uuid[], timestamptz, text)'
     ]) as f(sig)
    where has_function_privilege('anon', f.sig, 'execute')),
  0, 'anon cannot reach the staff re-enable functions'
);
select is(
  (select count(*)::int from pg_catalog.pg_proc p
     join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('whatsapp_conversation_apply_opt_out', 'humans_apply_number_opt_out', 'humans_guard_whatsapp_reenable',
                        'whatsapp_conversation_guard_stop', 'staff_whatsapp_number_opt_out_scope', 'staff_reenable_whatsapp_number')
      and p.prosecdef
      and p.proconfig @> array['search_path=public, pg_temp']),
  6, 'the definer functions are SECURITY DEFINER with a pinned search_path'
);
select ok(
  not has_table_privilege('authenticated', 'public.whatsapp_opt_out_reenables', 'insert')
  and not has_table_privilege('authenticated', 'public.whatsapp_opt_out_reenables', 'update')
  and not has_table_privilege('authenticated', 'public.whatsapp_opt_out_reenables', 'delete')
  and not has_table_privilege('anon', 'public.whatsapp_opt_out_reenables', 'select'),
  'the audit is written only through the re-enable'
);
select is(
  (select count(*)::int from pg_catalog.pg_proc where proname = 'humans_clear_number_opt_out'),
  0, 'the cascading re-enable trigger is gone'
);

select * from finish();
rollback;
