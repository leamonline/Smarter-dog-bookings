-- ============================================================
-- 20261104100000_sms_permission_confirmations.sql
--
-- A proper, audited way for staff to confirm that a customer is happy to be
-- texted after they replied STOP on WhatsApp.
--
-- WHY. The messaging policy (docs/messaging-policy.md) pauses automatic texts
-- to a customer with `whatsapp_opted_out`, because an opt-out belongs to the
-- number and we cannot know they only meant WhatsApp. The pause lifts when staff
-- have clarified, and `humans.preferred_channel = 'sms'` is the proof of that.
-- Until now nothing in the app could set it: it was a database edit, with no
-- record of who decided or why.
--
-- WHAT THIS ADDS.
--   1. public.sms_permission_confirmations   the audit trail: who, when, why.
--   2. public.staff_confirm_sms_permission   the ONLY way to set
--      public.staff_withdraw_sms_permission  preferred_channel = 'sms' for a
--                                            customer whose WhatsApp is stopped,
--                                            and the way to take it back.
--   3. A guard trigger so that proof cannot be forged by an ordinary update
--      (a staff edit, the customer portal, an import), and so that a NEW STOP
--      clears an earlier confirmation instead of silently inheriting it.
--
-- DESIGN NOTES.
--   - Mirrors staff_reenable_whatsapp_number (20261014120000): staff-only
--     SECURITY DEFINER RPC, a note of at least 10 characters, a transaction-
--     local setting that lets the guard permit exactly that write, the actor
--     recorded as auth.uid(), and an audit table written only by the function.
--   - Per customer record, not per number: confirming one record does not
--     confirm another on the same number. That is the conservative failure mode
--     (a record stays paused until someone has asked about it too).
--   - It never touches whatsapp_opted_out: WhatsApp stays stopped. SMS permission
--     and WhatsApp permission are separate decisions.
--   - sms_opted_out always wins: a customer who opted out of SMS cannot be
--     confirmed here (they asked us to stop texting; that needs its own decision).
--   - Nothing here backfills or edits existing rows. The guard fires only on
--     writes to preferred_channel / whatsapp_opted_out.
--
-- ROLLOUT. Apply this to production BEFORE merging the frontend that calls it
-- (docs/migrations.md). It is additive and idempotent. Nothing reads the new
-- objects until that frontend deploys, so applying it first changes no behaviour
-- except that the guard now protects preferred_channel.
--
-- ROLLBACK (forward-fix; the database cannot be rolled back):
--   drop trigger if exists zz_humans_sms_confirmation_guard on public.humans;  -- (a rollback, not part of this migration)
--   drop function if exists public.humans_guard_sms_confirmation();
--   drop function if exists public.staff_confirm_sms_permission(uuid, text);
--   drop function if exists public.staff_withdraw_sms_permission(uuid, text);
--   -- keep the table: it is the audit record.
-- ============================================================

-- ── 1. The audit trail ──────────────────────────────────────
create table if not exists public.sms_permission_confirmations (
  id uuid primary key default gen_random_uuid(),
  human_id uuid not null references public.humans(id) on delete cascade,
  action text not null check (action in ('confirmed', 'withdrawn', 'superseded_by_stop')),
  reason text not null,
  confirmed_by uuid,
  confirmed_by_name text,
  created_at timestamptz not null default now(),
  previous_preferred_channel text,
  whatsapp_opted_out_at timestamptz,
  -- A person's decision always names the person and says why. Only the system's
  -- own "a new STOP cleared this" row has no actor.
  constraint sms_permission_confirmations_actor_check check (
    action = 'superseded_by_stop' or (confirmed_by is not null and length(btrim(reason)) >= 10)
  )
);

comment on table public.sms_permission_confirmations is
  'One row per decision about texting a customer after a WhatsApp STOP: staff confirming SMS is fine, staff withdrawing that, or a new STOP clearing an earlier confirmation. Who (auth.uid() and the name at the time), when, why. Written only by staff_confirm_sms_permission, staff_withdraw_sms_permission and humans_guard_sms_confirmation (20261104100000).';

create index if not exists sms_permission_confirmations_human_idx
  on public.sms_permission_confirmations (human_id, created_at desc);

alter table public.sms_permission_confirmations enable row level security;
revoke all on table public.sms_permission_confirmations from public;
revoke all on table public.sms_permission_confirmations from anon;
revoke all on table public.sms_permission_confirmations from authenticated;
grant select on table public.sms_permission_confirmations to authenticated;
-- Created once by name (no drop-and-create: the Supabase MCP tool used for the
-- staging apply cannot take a drop statement).
do $sms_confirmation_policy$
begin
  if not exists (
    select 1 from pg_catalog.pg_policies
     where schemaname = 'public'
       and tablename = 'sms_permission_confirmations'
       and policyname = 'staff_read_sms_permission_confirmations'
  ) then
    create policy staff_read_sms_permission_confirmations
      on public.sms_permission_confirmations
      for select to authenticated
      using (public.is_staff());
  end if;
end;
$sms_confirmation_policy$;

-- ── 2. Confirm ──────────────────────────────────────────────
create or replace function public.staff_confirm_sms_permission(
  p_human_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_reason text := btrim(coalesce(p_reason, ''));
  v_human public.humans%rowtype;
  v_name text;
  v_audit uuid;
begin
  if not public.is_staff() then
    raise exception 'staff only' using errcode = '42501';
  end if;
  if length(v_reason) < 10 then
    raise exception 'Record how the customer said texts are fine'
      using errcode = 'P0001', detail = 'reason_required';
  end if;

  select * into v_human from public.humans where id = p_human_id for update;
  if not found then
    raise exception 'Unknown customer' using errcode = 'P0001', detail = 'unknown_customer';
  end if;
  if coalesce(btrim(v_human.phone), '') = '' then
    raise exception 'This customer has no mobile number to text'
      using errcode = 'P0001', detail = 'no_phone';
  end if;
  if v_human.sms_opted_out then
    raise exception 'This customer has opted out of texts, so they cannot be confirmed here'
      using errcode = 'P0001', detail = 'sms_opted_out';
  end if;
  if v_human.whatsapp_opted_out is not true then
    raise exception 'Texts are not paused for this customer'
      using errcode = 'P0001', detail = 'nothing_to_confirm';
  end if;
  if v_human.preferred_channel is not distinct from 'sms' then
    raise exception 'Texts are already confirmed for this customer'
      using errcode = 'P0001', detail = 'already_confirmed';
  end if;

  select display_name into v_name from public.staff_profiles where user_id = auth.uid() limit 1;

  perform set_config('smarter_dog.sms_confirmation', 'on', true);
  update public.humans set preferred_channel = 'sms' where id = p_human_id;
  perform set_config('smarter_dog.sms_confirmation', 'off', true);

  insert into public.sms_permission_confirmations
    (human_id, action, reason, confirmed_by, confirmed_by_name, previous_preferred_channel, whatsapp_opted_out_at)
  values
    (p_human_id, 'confirmed', v_reason, auth.uid(), v_name, v_human.preferred_channel, v_human.whatsapp_opted_out_at)
  returning id into v_audit;

  return jsonb_build_object('human_id', p_human_id, 'audit_id', v_audit, 'preferred_channel', 'sms');
end;
$$;

-- ── 3. Withdraw ─────────────────────────────────────────────
create or replace function public.staff_withdraw_sms_permission(
  p_human_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_reason text := btrim(coalesce(p_reason, ''));
  v_human public.humans%rowtype;
  v_name text;
  v_audit uuid;
begin
  if not public.is_staff() then
    raise exception 'staff only' using errcode = '42501';
  end if;
  if length(v_reason) < 10 then
    raise exception 'Record why texts are being paused again'
      using errcode = 'P0001', detail = 'reason_required';
  end if;

  select * into v_human from public.humans where id = p_human_id for update;
  if not found then
    raise exception 'Unknown customer' using errcode = 'P0001', detail = 'unknown_customer';
  end if;
  if v_human.preferred_channel is distinct from 'sms' then
    raise exception 'No SMS confirmation to withdraw'
      using errcode = 'P0001', detail = 'nothing_to_withdraw';
  end if;

  select display_name into v_name from public.staff_profiles where user_id = auth.uid() limit 1;

  update public.humans set preferred_channel = null where id = p_human_id;

  insert into public.sms_permission_confirmations
    (human_id, action, reason, confirmed_by, confirmed_by_name, previous_preferred_channel, whatsapp_opted_out_at)
  values
    (p_human_id, 'withdrawn', v_reason, auth.uid(), v_name, v_human.preferred_channel, v_human.whatsapp_opted_out_at)
  returning id into v_audit;

  return jsonb_build_object('human_id', p_human_id, 'audit_id', v_audit, 'preferred_channel', null);
end;
$$;

revoke all on function public.staff_confirm_sms_permission(uuid, text) from public;
revoke all on function public.staff_confirm_sms_permission(uuid, text) from anon;
grant execute on function public.staff_confirm_sms_permission(uuid, text) to authenticated;
revoke all on function public.staff_withdraw_sms_permission(uuid, text) from public;
revoke all on function public.staff_withdraw_sms_permission(uuid, text) from anon;
grant execute on function public.staff_withdraw_sms_permission(uuid, text) to authenticated;

-- ── 4. The guard ────────────────────────────────────────────
-- preferred_channel = 'sms' is the proof that staff clarified a STOP, so it must
-- not be settable any other way while WhatsApp is stopped, and a new STOP must
-- not quietly inherit an old confirmation.
create or replace function public.humans_guard_sms_confirmation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- (a) A STOP arriving now supersedes any earlier confirmation: the customer
  -- has told us to stop again, so staff must clarify again. Recorded, because the
  -- text pause returning is something staff will want to explain.
  if tg_op = 'UPDATE'
     and new.whatsapp_opted_out is true
     and old.whatsapp_opted_out is not true
     and new.preferred_channel is not distinct from 'sms' then
    new.preferred_channel := null;
    insert into public.sms_permission_confirmations
      (human_id, action, reason, previous_preferred_channel, whatsapp_opted_out_at)
    values
      (new.id, 'superseded_by_stop',
       'A new WhatsApp STOP cleared the earlier confirmation that texts are fine. Check again which channels they allow.',
       'sms', new.whatsapp_opted_out_at);
  end if;

  -- (b) While WhatsApp is stopped, 'sms' is set only by staff_confirm_sms_permission.
  if new.whatsapp_opted_out is true
     and new.preferred_channel is not distinct from 'sms'
     and (tg_op = 'INSERT' or old.preferred_channel is distinct from 'sms')
     and coalesce(current_setting('smarter_dog.sms_confirmation', true), '') <> 'on' then
    if tg_op = 'INSERT' then
      -- No row to attach an audit entry to yet, and nothing sets this on insert:
      -- drop the unaudited claim rather than refuse to create a customer.
      new.preferred_channel := null;
    else
      raise exception 'This customer replied STOP on WhatsApp. Confirm that texts are fine with the customer''s permission instead.'
        using errcode = 'P0001', detail = 'sms_confirmation_needs_staff_action';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.humans_guard_sms_confirmation() from public;
revoke all on function public.humans_guard_sms_confirmation() from anon;
revoke all on function public.humans_guard_sms_confirmation() from authenticated;

-- Named to fire after the other BEFORE triggers on humans (they run in name
-- order), so a whatsapp_opted_out that one of them carries onto the row is seen.
create or replace trigger zz_humans_sms_confirmation_guard
  before insert or update of preferred_channel, whatsapp_opted_out on public.humans
  for each row
  execute function public.humans_guard_sms_confirmation();
