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
--  3. A suppressed conversation flags its linked customer and every customer
--     record on the same number, when it is suppressed and whenever it is
--     later linked. The notify-* functions that send WhatsApp through Twilio
--     check only humans.whatsapp_opted_out, so the flag has to reach them.
--  4. A customer record created with, or changed to, a suppressed number is
--     flagged as it is written.
--  5. Switching WhatsApp back on for a customer (whatsapp_opted_out true ->
--     false, by staff or by the customer) clears the number's suppression,
--     so that one control stays the way to undo a STOP.
--  6. At most one pending STOP acknowledgement draft per conversation, as a
--     unique index, so two STOP events processed at once cannot both leave
--     one for staff to send.
--
-- Additive and idempotent: if not exists, create or replace, drop/create
-- trigger by name. Nothing is backfilled: no conversation is suppressed yet,
-- and the acknowledgement marker is new with this change, so no existing row
-- can violate the index.
--
-- humans and whatsapp_conversations are written by every booking and inbound
-- message; give up after five seconds rather than queue those writes behind a
-- long transaction. The apply then fails cleanly and can be run again.
set local lock_timeout = '5s';

-- ── 1. Number-level suppression ─────────────────────────────
alter table public.whatsapp_conversations
  add column if not exists whatsapp_opted_out_at timestamptz;

comment on column public.whatsapp_conversations.whatsapp_opted_out_at is
  'When this number asked us to stop WhatsApp messages (a STOP to the agent). whatsapp-send refuses the number while set; cleared when staff switch WhatsApp back on for a customer on the number.';

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
    select pg_catalog.regexp_replace(coalesce(p_phone, ''), '\D', '', 'g') as digits
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

-- ── 3. Suppressed conversation → its customer records ───────
create or replace function public.whatsapp_conversation_apply_opt_out()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.humans h
     set whatsapp_opted_out = true,
         whatsapp_opted_out_at = new.whatsapp_opted_out_at,
         whatsapp_opted_out_reason = 'asked_on_whatsapp'
   where h.whatsapp_opted_out is not true
     and (
       h.id = new.human_id
       or public.whatsapp_phone_key(h.phone) = public.whatsapp_phone_key(new.phone_e164)
     );
  return null;
end;
$$;

revoke all on function public.whatsapp_conversation_apply_opt_out() from public;
revoke all on function public.whatsapp_conversation_apply_opt_out() from anon;
revoke all on function public.whatsapp_conversation_apply_opt_out() from authenticated;

drop trigger if exists trg_whatsapp_conversation_apply_opt_out on public.whatsapp_conversations;
create trigger trg_whatsapp_conversation_apply_opt_out
  after insert or update of human_id, whatsapp_opted_out_at on public.whatsapp_conversations
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
begin
  if new.whatsapp_opted_out is true then
    return new;
  end if;
  -- Only a new record or a changed number: a staff re-opt-in that leaves the
  -- phone as it was must not be undone here.
  if tg_op = 'UPDATE' and new.phone is not distinct from old.phone then
    return new;
  end if;
  select c.whatsapp_opted_out_at into v_at
    from public.whatsapp_conversations c
   where c.channel = 'whatsapp'
     and c.whatsapp_opted_out_at is not null
     and public.whatsapp_phone_key(c.phone_e164) = public.whatsapp_phone_key(new.phone)
   order by c.whatsapp_opted_out_at
   limit 1;
  if v_at is not null then
    new.whatsapp_opted_out := true;
    new.whatsapp_opted_out_at := v_at;
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

-- ── 5. WhatsApp switched back on → clear the number's suppression ─
create or replace function public.humans_clear_number_opt_out()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.whatsapp_conversations c
     set whatsapp_opted_out_at = null
   where c.channel = 'whatsapp'
     and c.whatsapp_opted_out_at is not null
     and (
       c.human_id = new.id
       or public.whatsapp_phone_key(c.phone_e164) = public.whatsapp_phone_key(new.phone)
     );
  return null;
end;
$$;

revoke all on function public.humans_clear_number_opt_out() from public;
revoke all on function public.humans_clear_number_opt_out() from anon;
revoke all on function public.humans_clear_number_opt_out() from authenticated;

drop trigger if exists trg_humans_clear_number_opt_out on public.humans;
create trigger trg_humans_clear_number_opt_out
  after update of whatsapp_opted_out on public.humans
  for each row
  when (old.whatsapp_opted_out is true and new.whatsapp_opted_out is not true)
  execute function public.humans_clear_number_opt_out();

-- ── 6. One pending STOP acknowledgement per conversation ────
create unique index if not exists whatsapp_drafts_one_pending_opt_out_ack
  on public.whatsapp_drafts (conversation_id)
  where state = 'pending' and (tool_calls ->> 'opt_out_acknowledgement') = 'true';
