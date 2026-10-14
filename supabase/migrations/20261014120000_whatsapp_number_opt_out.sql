-- WhatsApp opt-out belongs to the NUMBER, not only to a customer record (#990, #1016).
--
-- Until now a STOP was stored only as humans.whatsapp_opted_out. A number with
-- no customer record had nowhere to keep it: the agent could only switch off
-- auto-send, which staff also toggle for unrelated reasons, so a later staff
-- reply or template to that number went out after an explicit STOP. This
-- migration gives the number its own suppression and keeps every customer
-- record that carries the number, now or later, in step with it.
--
--  1. whatsapp_conversations.whatsapp_opted_out_at: the agent sets it on STOP
--     (keeping the first time on a repeat). whatsapp-send refuses a number
--     whose conversation carries it, whether or not any customer record exists.
--  2. public.whatsapp_phone_key(text): the digits that identify a number
--     however it was typed. SQL mirror of phoneMatchKey in
--     supabase/functions/_shared/optOut.ts; supabase/tests/244 pins the same
--     cases as optOut.test.ts.
--  3. A suppressed conversation flags every customer record on the same
--     number. The notify-* functions that send WhatsApp through Twilio check
--     only humans.whatsapp_opted_out, so the flag has to reach them. It
--     follows the NUMBER, never the conversation's human_id link: a customer
--     whose number staff have since changed keeps a stale link, and the old
--     number's STOP must not opt their new number out. Whatever the link, the
--     stopped number stays refused through its conversation (whatsapp-send).
--  4. A customer record created with, or changed to, a suppressed number is
--     flagged as it is written.
--  5. A STOP is never undone by an ordinary edit. Refused: unticking
--     humans.whatsapp_opted_out on a record whose opt-out came from a STOP
--     (or whose old or new number is still suppressed), relabelling a STOP's
--     reason, and clearing the number's own suppression. A record already
--     opted out for another reason is marked as a STOP when its number says
--     STOP, so a later number change cannot hide it. Changing a customer's
--     number never clears their opt-out either. The one way back is
--     public.staff_reenable_whatsapp_number: staff name the number, confirm
--     EVERY record on it that is opted out (whatever the reason, so the scope
--     is explicit and the send paths cannot disagree about the number) and
--     the latest STOP they saw, and record the customer's renewed permission. Each re-enable is audited in
--     whatsapp_opt_out_reenables. public.staff_whatsapp_number_opt_out_scope
--     shows staff that scope first.
--
--  3, 4 and the re-enable take a transaction-scoped advisory lock on the
--  number before they read the other table. A STOP and a customer write, or a
--  STOP and a re-enable, on the same number in flight together are therefore
--  serialised: whichever comes second waits, then sees the first one's
--  committed row (supabase/tests/246).
--  6. At most one pending STOP acknowledgement draft per conversation, as a
--     unique index, so two STOP events processed at once cannot both leave
--     one for staff to send.
--
-- Additive and idempotent: if not exists, create or replace, drop/create
-- trigger and policy by name. Nothing is backfilled: no conversation is
-- suppressed yet, and the acknowledgement marker is new with this change, so
-- no existing row can violate the index.
--
-- humans and whatsapp_conversations are written by every booking and inbound
-- message; give up after five seconds rather than queue those writes behind a
-- long transaction. The apply then fails cleanly and can be run again.
set local lock_timeout = '5s';

-- ── 1. Number-level suppression ─────────────────────────────
alter table public.whatsapp_conversations
  add column if not exists whatsapp_opted_out_at timestamptz;

alter table public.whatsapp_conversations
  add column if not exists whatsapp_last_stop_at timestamptz;

comment on column public.whatsapp_conversations.whatsapp_last_stop_at is
  'When this number last said STOP, repeats included (whatsapp_opted_out_at keeps the first). A re-enable must name it, so a STOP sent after staff reviewed the number is never cleared unseen.';

comment on column public.whatsapp_conversations.whatsapp_opted_out_at is
  'When this number asked us to stop WhatsApp messages (a STOP to the agent). whatsapp-send refuses the number while set; cleared only by public.staff_reenable_whatsapp_number, which records the renewed permission.';

-- ── 2. Phone key ────────────────────────────────────────────
-- UK numbers: the national significant number ("7700900123") from +44, 44,
-- 0044, 0 and "+44 (0)" forms. Anything else: the digits without a "00"
-- prefix, if there are at least seven. Null when it cannot be a number.
create or replace function public.whatsapp_phone_key(p_phone text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  with d as (
    -- [^0-9], not \D: \D keeps non-ASCII digits, which phoneMatchKey drops.
    select pg_catalog.regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g') as digits
  ),
  uk as (
    select digits,
           case
             when digits like '0044%' then pg_catalog.substr(digits, 5)
             when digits like '44%' then pg_catalog.substr(digits, 3)
             when digits like '0%' then pg_catalog.substr(digits, 2)
           end as national
    from d
  ),
  uk_trunk as (
    select digits,
           case when national like '0%' then pg_catalog.substr(national, 2) else national end as national
    from uk
  ),
  intl as (
    select national,
           case when digits like '00%' then pg_catalog.substr(digits, 3) else digits end as international
    from uk_trunk
  )
  select case
           when national ~ '^[0-9]{9,10}$' then national
           when international ~ '^[0-9]{7,}$' then international
         end
  from intl
$$;

comment on function public.whatsapp_phone_key(text) is
  'Digits identifying a phone number however it was typed; SQL mirror of phoneMatchKey in supabase/functions/_shared/optOut.ts.';

revoke all on function public.whatsapp_phone_key(text) from public;
revoke all on function public.whatsapp_phone_key(text) from anon;
revoke all on function public.whatsapp_phone_key(text) from authenticated;

-- The number's STOP is guarded where it is stored:
--  - a repeat STOP keeps the first time, and records itself as the latest.
--    Done here, not by the agent filtering its write on "not yet stopped":
--    that filter is checked against the last committed row, so a STOP landing
--    while staff re-enable the number would match nothing and be lost.
--    Unfiltered, it waits for the re-enable and stops the number again
--    (supabase/tests/246);
--  - clearing it is refused outside staff_reenable_whatsapp_number. Staff can
--    update conversations directly (staff_update_whatsapp_conversations), and
--    for a number with no customer record this column is the whole STOP;
--  - so is moving a stopped conversation to another number or channel, which
--    would carry the STOP away from the number that sent it, and editing the
--    latest-STOP time directly.
-- SECURITY DEFINER so a staff session (which cannot execute
-- whatsapp_phone_key) gets these refusals rather than a permission error.
create or replace function public.whatsapp_conversation_guard_stop()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE' and old.whatsapp_opted_out_at is not null then
    if new.whatsapp_opted_out_at is null then
      if coalesce(current_setting('smarter_dog.whatsapp_reenable', true), '') <> 'on' then
        raise exception 'This number asked on WhatsApp for messages to stop. Switch WhatsApp back on with the customer''s renewed permission instead.'
          using errcode = 'P0001', detail = 'whatsapp_reenable_needs_permission';
      end if;
      new.whatsapp_last_stop_at := null;
      return new;
    end if;
    if new.channel is distinct from old.channel
       or public.whatsapp_phone_key(new.phone_e164) is distinct from public.whatsapp_phone_key(old.phone_e164) then
      raise exception 'This number asked on WhatsApp for messages to stop; its conversation cannot be moved to another number.'
        using errcode = 'P0001', detail = 'whatsapp_stopped_number_fixed';
    end if;
    if new.whatsapp_opted_out_at is distinct from old.whatsapp_opted_out_at then
      -- A repeat STOP: keep the first time, record the latest.
      new.whatsapp_last_stop_at := new.whatsapp_opted_out_at;
      new.whatsapp_opted_out_at := old.whatsapp_opted_out_at;
    elsif new.whatsapp_last_stop_at is distinct from old.whatsapp_last_stop_at then
      -- Only a STOP moves it: a re-enable must name the real latest one.
      raise exception 'The time this number last said STOP is recorded, not edited.'
        using errcode = 'P0001', detail = 'whatsapp_stop_record_fixed';
    end if;
    return new;
  end if;
  if new.whatsapp_opted_out_at is null then
    new.whatsapp_last_stop_at := null;
  elsif tg_op = 'INSERT' or old.whatsapp_opted_out_at is null then
    new.whatsapp_last_stop_at := new.whatsapp_opted_out_at;
  end if;
  return new;
end;
$$;

revoke all on function public.whatsapp_conversation_guard_stop() from public;
revoke all on function public.whatsapp_conversation_guard_stop() from anon;
revoke all on function public.whatsapp_conversation_guard_stop() from authenticated;

drop trigger if exists trg_whatsapp_conversation_guard_stop on public.whatsapp_conversations;
create trigger trg_whatsapp_conversation_guard_stop
  before insert or update of whatsapp_opted_out_at, whatsapp_last_stop_at, phone_e164, channel
  on public.whatsapp_conversations
  for each row
  execute function public.whatsapp_conversation_guard_stop();

-- ── 3. Suppressed number → the customer records carrying it ──
create or replace function public.whatsapp_conversation_apply_opt_out()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_key text := public.whatsapp_phone_key(new.phone_e164);
begin
  if v_key is null then
    return null;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('whatsapp_number_opt_out:' || v_key, 0));
  -- A record already opted out for another reason is marked as a STOP too,
  -- keeping its own time: without that, a later number change would leave
  -- nothing to show the STOP, and an ordinary untick would pass.
  update public.humans h
     set whatsapp_opted_out = true,
         whatsapp_opted_out_at = case when h.whatsapp_opted_out is true
                                      then coalesce(h.whatsapp_opted_out_at, new.whatsapp_opted_out_at)
                                      else new.whatsapp_opted_out_at end,
         whatsapp_opted_out_reason = 'asked_on_whatsapp'
   where (h.whatsapp_opted_out is not true
          or h.whatsapp_opted_out_reason is distinct from 'asked_on_whatsapp')
     and public.whatsapp_phone_key(h.phone) = v_key;
  return null;
end;
$$;

revoke all on function public.whatsapp_conversation_apply_opt_out() from public;
revoke all on function public.whatsapp_conversation_apply_opt_out() from anon;
revoke all on function public.whatsapp_conversation_apply_opt_out() from authenticated;

drop trigger if exists trg_whatsapp_conversation_apply_opt_out on public.whatsapp_conversations;
create trigger trg_whatsapp_conversation_apply_opt_out
  after insert or update of whatsapp_opted_out_at on public.whatsapp_conversations
  for each row
  when (new.whatsapp_opted_out_at is not null and new.channel = 'whatsapp')
  execute function public.whatsapp_conversation_apply_opt_out();

-- ── 4. Customer record given a suppressed number ────────────
create or replace function public.humans_apply_number_opt_out()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_at timestamptz;
  v_key text;
begin
  -- Already a STOP: nothing to add. (The label alone is not enough: a record
  -- labelled but not opted out must still be checked, #1016 final review.)
  if new.whatsapp_opted_out is true
     and new.whatsapp_opted_out_reason is not distinct from 'asked_on_whatsapp' then
    return new;
  end if;
  -- Only a new record or a changed number: a save that leaves the phone as it
  -- was has nothing new to check.
  if tg_op = 'UPDATE' and new.phone is not distinct from old.phone then
    return new;
  end if;
  v_key := public.whatsapp_phone_key(new.phone);
  if v_key is null then
    return new;
  end if;
  -- Wait for a STOP on this number that is still in flight, then read it.
  perform pg_advisory_xact_lock(hashtextextended('whatsapp_number_opt_out:' || v_key, 0));
  select c.whatsapp_opted_out_at into v_at
    from public.whatsapp_conversations c
   where c.channel = 'whatsapp'
     and c.whatsapp_opted_out_at is not null
     and public.whatsapp_phone_key(c.phone_e164) = v_key
   order by c.whatsapp_opted_out_at
   limit 1;
  if v_at is not null then
    -- Already opted out for another reason: keep its time, mark the STOP.
    new.whatsapp_opted_out_at := case when new.whatsapp_opted_out is true
                                      then coalesce(new.whatsapp_opted_out_at, v_at)
                                      else v_at end;
    new.whatsapp_opted_out := true;
    new.whatsapp_opted_out_reason := 'asked_on_whatsapp';
  end if;
  return new;
end;
$$;

revoke all on function public.humans_apply_number_opt_out() from public;
revoke all on function public.humans_apply_number_opt_out() from anon;
revoke all on function public.humans_apply_number_opt_out() from authenticated;

drop trigger if exists trg_humans_apply_number_opt_out on public.humans;
create trigger trg_humans_apply_number_opt_out
  before insert or update of phone on public.humans
  for each row
  execute function public.humans_apply_number_opt_out();

-- The STOP label only ever sits on an opted-out record. The label is new
-- with this migration, so no existing row can violate it.
do $stop_label$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
     where conname = 'humans_stop_label_means_opted_out'
       and conrelid = 'public.humans'::regclass
  ) then
    alter table public.humans
      add constraint humans_stop_label_means_opted_out
      check (whatsapp_opted_out_reason is distinct from 'asked_on_whatsapp' or whatsapp_opted_out is true);
  end if;
end;
$stop_label$;

-- ── 5. Re-enabling needs renewed permission, scoped and audited ─
-- An earlier, never-applied draft of this migration re-enabled every record
-- on the number when one was unticked (#1016 final review). Drop it from any
-- disposable database that ran that draft.
drop trigger if exists trg_humans_clear_number_opt_out on public.humans;
drop function if exists public.humans_clear_number_opt_out();

create table if not exists public.whatsapp_opt_out_reenables (
  id uuid primary key default gen_random_uuid(),
  phone_key text not null,
  human_ids uuid[] not null,
  conversation_ids uuid[] not null,
  permission_note text not null,
  reenabled_by uuid not null,
  reenabled_at timestamptz not null default now()
);

comment on table public.whatsapp_opt_out_reenables is
  'One row per WhatsApp re-enable: the number, every record and conversation it switched back on, who did it and the customer''s renewed permission as staff recorded it. Written only by staff_reenable_whatsapp_number.';

alter table public.whatsapp_opt_out_reenables enable row level security;
revoke all on table public.whatsapp_opt_out_reenables from public;
revoke all on table public.whatsapp_opt_out_reenables from anon;
revoke all on table public.whatsapp_opt_out_reenables from authenticated;
grant select on table public.whatsapp_opt_out_reenables to authenticated;
drop policy if exists staff_read_whatsapp_opt_out_reenables on public.whatsapp_opt_out_reenables;
create policy staff_read_whatsapp_opt_out_reenables
  on public.whatsapp_opt_out_reenables
  for select to authenticated
  using (public.is_staff());

-- An untick that would quietly undo a STOP is refused, and so is relabelling
-- a STOP's reason (which would let a later untick through). Opt-outs staff
-- set for other reasons, on a number that never said STOP, are untouched.
create or replace function public.humans_guard_whatsapp_reenable()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_key text;
begin
  if coalesce(current_setting('smarter_dog.whatsapp_reenable', true), '') = 'on' then
    return new;
  end if;
  if old.whatsapp_opted_out_reason is not distinct from 'asked_on_whatsapp' then
    raise exception 'This customer asked on WhatsApp for messages to stop. Switch WhatsApp back on with their renewed permission instead.'
      using errcode = 'P0001', detail = 'whatsapp_reenable_needs_permission';
  end if;
  -- From here on it is an untick of an opt-out with another reason.
  -- Both numbers: the one the record had, and the one it is saved with.
  foreach v_key in array array[public.whatsapp_phone_key(old.phone), public.whatsapp_phone_key(new.phone)] loop
    continue when v_key is null;
    if exists (
      select 1 from public.whatsapp_conversations c
       where c.channel = 'whatsapp'
         and c.whatsapp_opted_out_at is not null
         and public.whatsapp_phone_key(c.phone_e164) = v_key
    ) then
      raise exception 'This number asked on WhatsApp for messages to stop. Switch WhatsApp back on with the customer''s renewed permission instead.'
        using errcode = 'P0001', detail = 'whatsapp_reenable_needs_permission';
    end if;
  end loop;
  return new;
end;
$$;

revoke all on function public.humans_guard_whatsapp_reenable() from public;
revoke all on function public.humans_guard_whatsapp_reenable() from anon;
revoke all on function public.humans_guard_whatsapp_reenable() from authenticated;

drop trigger if exists trg_humans_guard_whatsapp_reenable on public.humans;
create trigger trg_humans_guard_whatsapp_reenable
  before update of whatsapp_opted_out, whatsapp_opted_out_reason on public.humans
  for each row
  when ((old.whatsapp_opted_out is true and new.whatsapp_opted_out is not true)
        or (old.whatsapp_opted_out_reason is not distinct from 'asked_on_whatsapp'
            and new.whatsapp_opted_out_reason is distinct from 'asked_on_whatsapp'))
  execute function public.humans_guard_whatsapp_reenable();

-- What a re-enable of this number would switch back on, for staff to see
-- and confirm first: the number's STOP, if any (first and latest), and every
-- opted-out record on the number with its reason.
create or replace function public.staff_whatsapp_number_opt_out_scope(p_phone text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_key text := public.whatsapp_phone_key(p_phone);
begin
  if not public.is_staff() then
    raise exception 'staff only' using errcode = '42501';
  end if;
  if v_key is null then
    raise exception 'Not a phone number' using errcode = 'P0001', detail = 'invalid_phone';
  end if;
  return jsonb_build_object(
    'phone_key', v_key,
    'number_stopped_at', (
      select min(c.whatsapp_opted_out_at) from public.whatsapp_conversations c
       where c.channel = 'whatsapp'
         and c.whatsapp_opted_out_at is not null
         and public.whatsapp_phone_key(c.phone_e164) = v_key),
    'last_stop_at', (
      select max(c.whatsapp_last_stop_at) from public.whatsapp_conversations c
       where c.channel = 'whatsapp'
         and c.whatsapp_opted_out_at is not null
         and public.whatsapp_phone_key(c.phone_e164) = v_key),
    'records', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', h.id,
               'name', concat_ws(' ', h.name, h.surname),
               'phone', h.phone,
               'reason', h.whatsapp_opted_out_reason,
               'opted_out_at', h.whatsapp_opted_out_at) order by h.id)
        from public.humans h
       where h.whatsapp_opted_out is true
         and public.whatsapp_phone_key(h.phone) = v_key), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.staff_whatsapp_number_opt_out_scope(text) from public;
revoke all on function public.staff_whatsapp_number_opt_out_scope(text) from anon;
grant execute on function public.staff_whatsapp_number_opt_out_scope(text) to authenticated;

-- Switch WhatsApp back on for a number. p_human_ids and p_last_stop_at must
-- be exactly the opted-out records and the latest STOP as staff saw them in
-- the scope: if anyone else has been flagged, or the number has said STOP
-- again, since, or the list is incomplete, nothing changes.
create or replace function public.staff_reenable_whatsapp_number(
  p_phone text,
  p_human_ids uuid[],
  p_last_stop_at timestamptz,
  p_permission_note text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_key text := public.whatsapp_phone_key(p_phone);
  v_note text := btrim(coalesce(p_permission_note, ''));
  v_confirmed uuid[];
  v_humans uuid[];
  v_conversations uuid[];
  v_audit uuid;
begin
  if not public.is_staff() then
    raise exception 'staff only' using errcode = '42501';
  end if;
  if v_key is null then
    raise exception 'Not a phone number' using errcode = 'P0001', detail = 'invalid_phone';
  end if;
  if length(v_note) < 10 then
    raise exception 'Record how the customer gave permission again'
      using errcode = 'P0001', detail = 'permission_note_required';
  end if;
  -- Lock the whole scope before reading it: the number's conversations, then
  -- EVERY customer record on the number (opted out or not, so none can be
  -- opted out underneath this), then the number. Conversations first is the
  -- order a STOP takes (its row, then the lock in its trigger), and customer
  -- rows before the number is the order a phone change takes, so each waits
  -- for the other instead of deadlocking. A write already in flight is
  -- waited for and then seen below (supabase/tests/246).
  perform 1 from public.whatsapp_conversations c
   where c.channel = 'whatsapp'
     and public.whatsapp_phone_key(c.phone_e164) = v_key
   order by c.id
     for update;
  perform 1 from public.humans h
   where public.whatsapp_phone_key(h.phone) = v_key
   order by h.id
     for update;
  perform pg_advisory_xact_lock(hashtextextended('whatsapp_number_opt_out:' || v_key, 0));

  select coalesce(array_agg(distinct x order by x), '{}') into v_confirmed
    from unnest(coalesce(p_human_ids, '{}')) as x;
  select coalesce(array_agg(h.id order by h.id), '{}') into v_humans
    from public.humans h
   where h.whatsapp_opted_out is true
     and public.whatsapp_phone_key(h.phone) = v_key;
  if v_confirmed is distinct from v_humans
     or p_last_stop_at is distinct from (
       select max(c.whatsapp_last_stop_at) from public.whatsapp_conversations c
        where c.channel = 'whatsapp'
          and c.whatsapp_opted_out_at is not null
          and public.whatsapp_phone_key(c.phone_e164) = v_key) then
    raise exception 'This number''s opt-outs have changed. Review them again before switching WhatsApp back on.'
      using errcode = 'P0001', detail = 'reenable_scope_changed';
  end if;
  select coalesce(array_agg(c.id order by c.id), '{}') into v_conversations
    from public.whatsapp_conversations c
   where c.channel = 'whatsapp'
     and c.whatsapp_opted_out_at is not null
     and public.whatsapp_phone_key(c.phone_e164) = v_key;
  if cardinality(v_humans) = 0 and cardinality(v_conversations) = 0 then
    raise exception 'WhatsApp is not switched off for this number'
      using errcode = 'P0001', detail = 'nothing_to_reenable';
  end if;

  perform set_config('smarter_dog.whatsapp_reenable', 'on', true);
  update public.humans
     set whatsapp_opted_out = false,
         whatsapp_opted_out_at = null,
         whatsapp_opted_out_reason = null
   where id = any(v_humans);
  update public.whatsapp_conversations
     set whatsapp_opted_out_at = null
   where id = any(v_conversations);
  perform set_config('smarter_dog.whatsapp_reenable', 'off', true);

  insert into public.whatsapp_opt_out_reenables
    (phone_key, human_ids, conversation_ids, permission_note, reenabled_by)
  values (v_key, v_humans, v_conversations, v_note, auth.uid())
  returning id into v_audit;

  return jsonb_build_object(
    'phone_key', v_key,
    'human_ids', to_jsonb(v_humans),
    'conversation_ids', to_jsonb(v_conversations),
    'audit_id', v_audit
  );
end;
$$;

revoke all on function public.staff_reenable_whatsapp_number(text, uuid[], timestamptz, text) from public;
revoke all on function public.staff_reenable_whatsapp_number(text, uuid[], timestamptz, text) from anon;
grant execute on function public.staff_reenable_whatsapp_number(text, uuid[], timestamptz, text) to authenticated;

-- ── 6. One pending STOP acknowledgement per conversation ────
create unique index if not exists whatsapp_drafts_one_pending_opt_out_ack
  on public.whatsapp_drafts (conversation_id)
  where state = 'pending' and (tool_calls ->> 'opt_out_acknowledgement') = 'true';
