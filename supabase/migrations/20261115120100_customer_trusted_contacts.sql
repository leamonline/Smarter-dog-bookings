-- 20261115120100_customer_trusted_contacts.sql
--
-- Customers can add, edit and remove their own trusted humans (people allowed
-- to drop off or collect their dog) from the portal, live straight away.
--
-- Product decision (salon owner, 15 November 2026): a customer-added contact
-- is trusted as soon as it is saved, with no acceptance step. This replaces
-- the July legal-risk plan's "invitation lifecycle" for this surface; see
-- ADR 014 (docs/architecture/decisions/014-customer-added-trusted-humans-live-on-save.md).
-- What July actually closed stays closed:
--
--   * No lookup against existing customers. The old add_customer_trusted_human
--     matched the typed phone to an existing humans row and returned that
--     person's name, revealing who owns a number, and linked them. Contacts
--     here live in their own table, are never matched to humans rows and
--     return only what the customer typed.
--   * No humans rows for third parties. Nothing here creates a customer
--     record, so a contact cannot sign in as, be messaged as, or be merged
--     into a customer, and phone sign-in can never land on a record someone
--     else created.
--   * human_trusted_contacts is untouched: customers still cannot insert into
--     it, and add_customer_trusted_human stays dropped (pgTAP 120 unchanged).
--
-- Staff see these contacts, marked "Added by customer", wherever trusted
-- humans are shown, and may remove one. Customers reach the table only through
-- the four SECURITY DEFINER functions below; they have no table privilege.
--
-- merge_humans is re-issued byte-for-byte except one added statement that
-- moves the losing record's customer-added contacts to the winner, so a merge
-- never silently deletes them (the table cascades on owner delete).
--
-- Expand-only and idempotent apart from that function re-issue; safe to apply
-- before the portal change deploys (nothing reads the table yet).

set local lock_timeout = '5s';

-- ── 1. Table ─────────────────────────────────────────────────
create table if not exists public.customer_trusted_contacts (
  id uuid primary key default gen_random_uuid(),
  owner_human_id uuid not null references public.humans(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  surname text check (surname is null or char_length(surname) <= 80),
  phone text not null check (char_length(phone) between 10 and 30),
  relationship text check (relationship is null or char_length(relationship) <= 40),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.customer_trusted_contacts is
  'Trusted humans a customer added in the portal (allowed to drop off / collect their dog). Live on save. Never matched to or stored as humans rows. Customers write only through the *_customer_trusted_contact functions (20261115120100).';

create index if not exists customer_trusted_contacts_owner_idx
  on public.customer_trusted_contacts (owner_human_id);

alter table public.customer_trusted_contacts enable row level security;

revoke all on table public.customer_trusted_contacts from public;
revoke all on table public.customer_trusted_contacts from anon;
revoke all on table public.customer_trusted_contacts from authenticated;
-- Staff and customers share the authenticated role; RLS limits both
-- privileges to staff. Customers get no policy, so no direct access.
grant select, delete on table public.customer_trusted_contacts to authenticated;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'customer_trusted_contacts' and policyname = 'staff_select_customer_trusted_contacts') then
    create policy staff_select_customer_trusted_contacts on public.customer_trusted_contacts
      for select to authenticated
      using ((select public.is_staff()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'customer_trusted_contacts' and policyname = 'staff_delete_customer_trusted_contacts') then
    create policy staff_delete_customer_trusted_contacts on public.customer_trusted_contacts
      for delete to authenticated
      using ((select public.is_staff()));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'customer_trusted_contacts_updated'
      and tgrelid = 'public.customer_trusted_contacts'::regclass
  ) then
    create trigger customer_trusted_contacts_updated
      before update on public.customer_trusted_contacts
      for each row execute function public.update_modified_column();
  end if;
end $$;

-- ── 2. Phone rule (mirrors src/utils/phone.js validateContactPhone) ──
-- A UK mobile, typed any usual way, is stored as +447XXXXXXXXX. Something
-- that looks like a UK mobile but has the wrong number of digits is refused
-- (it would fail silently on WhatsApp/SMS). Landlines and non-UK numbers are
-- kept as typed (trimmed) when they have at least 10 digits.
create or replace function public.normalise_trusted_contact_phone(p_raw text)
returns text
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_typed text;
  v_compact text;
  v_digits text;
  v_national text;
begin
  -- Invisible format characters (copied numbers from iOS Contacts/WhatsApp).
  v_typed := btrim(regexp_replace(
    coalesce(p_raw, ''),
    '[​-‏‪-‮⁦-⁩﻿­]', '', 'g'));
  if v_typed = '' then
    raise exception 'phone_required' using errcode = '22023';
  end if;

  v_compact := regexp_replace(v_typed, '[[:space:]().-]', '', 'g');
  if v_compact like '00%' then v_compact := '+' || substr(v_compact, 3); end if;
  v_compact := regexp_replace(v_compact, '^\+440', '+44');
  if v_compact ~ '^447[0-9]{9}$' then v_compact := '+' || v_compact; end if;
  if v_compact ~ '^07[0-9]{9}$' then v_compact := '+44' || substr(v_compact, 2); end if;
  if v_compact ~ '^\+447[0-9]{9}$' then
    return v_compact;
  end if;

  v_digits := regexp_replace(v_typed, '[^0-9]', '', 'g');
  v_digits := regexp_replace(v_digits, '^00', '');
  v_digits := regexp_replace(v_digits, '^440(7[0-9]{9})$', '44\1');
  v_national := case
    when v_digits like '44%' then substr(v_digits, 3)
    when v_digits like '0%' then substr(v_digits, 2)
    else v_digits
  end;
  if v_national like '7%' then
    raise exception 'invalid_mobile' using errcode = '22023';
  end if;
  if char_length(v_digits) < 10
     or char_length(v_typed) > 30
     or v_typed !~ '^[0-9+(). -]+$' then
    raise exception 'invalid_phone' using errcode = '22023';
  end if;
  return v_typed;
end;
$$;

revoke all on function public.normalise_trusted_contact_phone(text) from public;
revoke all on function public.normalise_trusted_contact_phone(text) from anon;
revoke all on function public.normalise_trusted_contact_phone(text) from authenticated;

-- ── 3. Customer commands ─────────────────────────────────────
create or replace function public.list_customer_trusted_contacts()
returns table (
  id uuid,
  name text,
  surname text,
  phone text,
  relationship text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select c.id, c.name, c.surname, c.phone, c.relationship
  from public.customer_trusted_contacts c
  join public.humans owner on owner.id = c.owner_human_id
  where owner.customer_user_id = (select auth.uid())
  order by c.created_at, c.id;
$$;

revoke all on function public.list_customer_trusted_contacts() from public;
revoke all on function public.list_customer_trusted_contacts() from anon;
revoke all on function public.list_customer_trusted_contacts() from authenticated;
grant execute on function public.list_customer_trusted_contacts() to authenticated;

create or replace function public.save_customer_trusted_contact(
  p_id uuid,
  p_name text,
  p_surname text,
  p_phone text,
  p_relationship text
)
returns table (
  id uuid,
  name text,
  surname text,
  phone text,
  relationship text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := (select auth.uid());
  v_my_id uuid;
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
  v_surname text := nullif(btrim(coalesce(p_surname, '')), '');
  v_relationship text := nullif(btrim(coalesce(p_relationship, '')), '');
  v_phone text;
  v_row public.customer_trusted_contacts%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  -- Owner-row lock, as every customer write takes: it also serialises the
  -- contact-count check below against a concurrent add.
  select h.id into v_my_id
  from public.humans h
  where h.customer_user_id = v_uid
  limit 1
  for update;

  if v_my_id is null then
    raise exception 'no_linked_human' using errcode = '28000';
  end if;

  if v_name is null then
    raise exception 'name_required' using errcode = '22023';
  end if;
  if char_length(v_name) > 80 or char_length(coalesce(v_surname, '')) > 80 then
    raise exception 'name_too_long' using errcode = '22023';
  end if;
  if char_length(coalesce(v_relationship, '')) > 40 then
    raise exception 'relationship_too_long' using errcode = '22023';
  end if;
  v_phone := public.normalise_trusted_contact_phone(p_phone);

  if p_id is null then
    if (select count(*) from public.customer_trusted_contacts c where c.owner_human_id = v_my_id) >= 6 then
      raise exception 'too_many_contacts' using errcode = '22023';
    end if;
    insert into public.customer_trusted_contacts (owner_human_id, name, surname, phone, relationship)
    values (v_my_id, v_name, v_surname, v_phone, v_relationship)
    returning * into v_row;
  else
    update public.customer_trusted_contacts c
    set name = v_name,
        surname = v_surname,
        phone = v_phone,
        relationship = v_relationship
    where c.id = p_id
      and c.owner_human_id = v_my_id
    returning * into v_row;
    if v_row.id is null then
      raise exception 'contact_not_found' using errcode = '42704';
    end if;
  end if;

  return query select v_row.id, v_row.name, v_row.surname, v_row.phone, v_row.relationship;
end;
$$;

comment on function public.save_customer_trusted_contact(uuid, text, text, text, text) is
  'Customer-only. Adds (p_id null) or edits one of the caller''s own trusted contacts. Never looks up or links a humans row. At most 6 per customer (20261115120100).';

revoke all on function public.save_customer_trusted_contact(uuid, text, text, text, text) from public;
revoke all on function public.save_customer_trusted_contact(uuid, text, text, text, text) from anon;
revoke all on function public.save_customer_trusted_contact(uuid, text, text, text, text) from authenticated;
grant execute on function public.save_customer_trusted_contact(uuid, text, text, text, text) to authenticated;

create or replace function public.remove_customer_trusted_contact(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := (select auth.uid());
  v_my_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select h.id into v_my_id
  from public.humans h
  where h.customer_user_id = v_uid
  limit 1
  for update;

  if v_my_id is null then
    raise exception 'no_linked_human' using errcode = '28000';
  end if;

  delete from public.customer_trusted_contacts c
  where c.id = p_id
    and c.owner_human_id = v_my_id;
  if not found then
    raise exception 'contact_not_found' using errcode = '42704';
  end if;
  return true;
end;
$$;

comment on function public.remove_customer_trusted_contact(uuid) is
  'Customer-only. Removes one of the caller''s own trusted contacts (20261115120100).';

revoke all on function public.remove_customer_trusted_contact(uuid) from public;
revoke all on function public.remove_customer_trusted_contact(uuid) from anon;
revoke all on function public.remove_customer_trusted_contact(uuid) from authenticated;
grant execute on function public.remove_customer_trusted_contact(uuid) to authenticated;

-- ── 4. merge_humans keeps customer-added contacts ────────────
create or replace function public.merge_humans(p_winner uuid, p_loser uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  l public.humans%rowtype;
begin
  if not public.is_staff() then
    raise exception 'merge_humans: staff only';
  end if;
  if p_winner is null or p_loser is null then
    raise exception 'merge_humans: winner and loser are required';
  end if;
  if p_winner = p_loser then
    raise exception 'merge_humans: winner and loser must differ';
  end if;

  -- Lock both people first, in UUID order. Customer dog creation/editing and
  -- signup approval take the same owner-row lock before touching dogs.
  perform h.id
  from public.humans h
  where h.id = any(array[p_winner, p_loser])
  order by h.id
  for update;

  select * into l
  from public.humans
  where id = p_loser;
  if not found then
    raise exception 'merge_humans: loser % not found', p_loser;
  end if;
  if not exists (select 1 from public.humans where id = p_winner) then
    raise exception 'merge_humans: winner % not found', p_winner;
  end if;

  -- Cancellation takes booking rows before their dog rows. Lock every booking
  -- that either belongs to a loser-owned dog or directly names the loser as
  -- collector, then lock the loser-owned dogs in UUID order.
  perform b.id
  from public.bookings b
  left join public.dogs d on d.id = b.dog_id
  where b.pickup_by_id = p_loser
     or d.human_id = p_loser
  order by b.id
  for update of b;

  perform d.id
  from public.dogs d
  where d.human_id = p_loser
  order by d.id
  for update of d;

  -- Reassign references from loser -> winner before deleting the loser. The
  -- booking and dog mutations follow the same order as the locks above.
  update public.bookings
  set pickup_by_id = p_winner
  where pickup_by_id = p_loser;

  update public.dogs
  set human_id = p_winner
  where human_id = p_loser;

  update public.waitlist_entries
  set human_id = p_winner
  where human_id = p_loser;

  update public.whatsapp_conversations
  set human_id = p_winner
  where human_id = p_loser;

  update public.notification_log
  set human_id = p_winner
  where human_id = p_loser;

  update public.human_trusted_contacts t
  set human_id = p_winner
  where t.human_id = p_loser
    and t.trusted_id <> p_winner
    and not exists (
      select 1
      from public.human_trusted_contacts e
      where e.human_id = p_winner
        and e.trusted_id = t.trusted_id
    );

  update public.human_trusted_contacts t
  set trusted_id = p_winner
  where t.trusted_id = p_loser
    and t.human_id <> p_winner
    and not exists (
      select 1
      from public.human_trusted_contacts e
      where e.human_id = t.human_id
        and e.trusted_id = p_winner
    );

  -- Deletion frees the unique phone and intentionally removes the loser's
  -- private calendar tokens plus any remaining duplicate trusted links.
  -- Keep customer cancellation history on the surviving file. The audit
  -- trigger records the former owner; a unique conflict aborts the entire merge.
  update smarter_dog_private.late_cancellation_history
    set human_id=p_winner where human_id=p_loser;
  update public.customer_trusted_contacts
    set owner_human_id=p_winner where owner_human_id=p_loser;
  delete from public.humans where id = p_loser;

  update public.humans w
  set phone = coalesce(nullif(w.phone, ''), l.phone),
      email = coalesce(nullif(w.email, ''), l.email),
      address = case
        when coalesce(w.address, '') = '' then l.address else w.address
      end,
      fb = case when coalesce(w.fb, '') = '' then l.fb else w.fb end,
      insta = case when coalesce(w.insta, '') = '' then l.insta else w.insta end,
      tiktok = case when coalesce(w.tiktok, '') = '' then l.tiktok else w.tiktok end,
      history_flag = case
        when coalesce(w.history_flag, '') = '' then l.history_flag
        else w.history_flag
      end,
      notes = case
        when coalesce(l.notes, '') = '' then w.notes
        when coalesce(w.notes, '') = '' then l.notes
        else w.notes || E'\n\n' || l.notes
      end,
      sms = w.sms or l.sms,
      whatsapp = w.whatsapp or l.whatsapp,
      -- Channel setup is additive, but an explicit opt-out is a hard
      -- suppression. Keep each timestamp/reason pair from one source record so
      -- two separate opt-out events cannot be presented as one audit event.
      sms_opted_out = w.sms_opted_out or l.sms_opted_out,
      sms_opted_out_at = case
        when w.sms_opted_out and (
          w.sms_opted_out_at is not null
          or nullif(trim(w.sms_opted_out_reason), '') is not null
        ) then w.sms_opted_out_at
        when l.sms_opted_out then l.sms_opted_out_at
        when w.sms_opted_out then w.sms_opted_out_at
        when w.sms_opted_out_at is not null
          or nullif(trim(w.sms_opted_out_reason), '') is not null
          then w.sms_opted_out_at
        else l.sms_opted_out_at
      end,
      sms_opted_out_reason = case
        when w.sms_opted_out and (
          w.sms_opted_out_at is not null
          or nullif(trim(w.sms_opted_out_reason), '') is not null
        ) then w.sms_opted_out_reason
        when l.sms_opted_out then l.sms_opted_out_reason
        when w.sms_opted_out then w.sms_opted_out_reason
        when w.sms_opted_out_at is not null
          or nullif(trim(w.sms_opted_out_reason), '') is not null
          then w.sms_opted_out_reason
        else l.sms_opted_out_reason
      end,
      whatsapp_opted_out = w.whatsapp_opted_out or l.whatsapp_opted_out,
      whatsapp_opted_out_at = case
        when (w.whatsapp_opted_out is true and w.whatsapp_opted_out_reason = 'asked_on_whatsapp')
          or (l.whatsapp_opted_out is true and l.whatsapp_opted_out_reason = 'asked_on_whatsapp')
          then coalesce(
            least(
              case when w.whatsapp_opted_out is true and w.whatsapp_opted_out_reason = 'asked_on_whatsapp' then w.whatsapp_opted_out_at end,
              case when l.whatsapp_opted_out is true and l.whatsapp_opted_out_reason = 'asked_on_whatsapp' then l.whatsapp_opted_out_at end),
            w.whatsapp_opted_out_at, l.whatsapp_opted_out_at, now())
        when w.whatsapp_opted_out and (
          w.whatsapp_opted_out_at is not null
          or nullif(trim(w.whatsapp_opted_out_reason), '') is not null
        ) then w.whatsapp_opted_out_at
        when l.whatsapp_opted_out then l.whatsapp_opted_out_at
        when w.whatsapp_opted_out then w.whatsapp_opted_out_at
        when w.whatsapp_opted_out_at is not null
          or nullif(trim(w.whatsapp_opted_out_reason), '') is not null
          then w.whatsapp_opted_out_at
        else l.whatsapp_opted_out_at
      end,
      whatsapp_opted_out_reason = case
        when (w.whatsapp_opted_out is true and w.whatsapp_opted_out_reason = 'asked_on_whatsapp')
          or (l.whatsapp_opted_out is true and l.whatsapp_opted_out_reason = 'asked_on_whatsapp')
          then 'asked_on_whatsapp'
        when w.whatsapp_opted_out and (
          w.whatsapp_opted_out_at is not null
          or nullif(trim(w.whatsapp_opted_out_reason), '') is not null
        ) then w.whatsapp_opted_out_reason
        when l.whatsapp_opted_out then l.whatsapp_opted_out_reason
        when w.whatsapp_opted_out then w.whatsapp_opted_out_reason
        when w.whatsapp_opted_out_at is not null
          or nullif(trim(w.whatsapp_opted_out_reason), '') is not null
          then w.whatsapp_opted_out_reason
        else l.whatsapp_opted_out_reason
      end,
      email_opted_out = w.email_opted_out or l.email_opted_out,
      email_opted_out_at = case
        when w.email_opted_out and (
          w.email_opted_out_at is not null
          or nullif(trim(w.email_opted_out_reason), '') is not null
        ) then w.email_opted_out_at
        when l.email_opted_out then l.email_opted_out_at
        when w.email_opted_out then w.email_opted_out_at
        when w.email_opted_out_at is not null
          or nullif(trim(w.email_opted_out_reason), '') is not null
          then w.email_opted_out_at
        else l.email_opted_out_at
      end,
      email_opted_out_reason = case
        when w.email_opted_out and (
          w.email_opted_out_at is not null
          or nullif(trim(w.email_opted_out_reason), '') is not null
        ) then w.email_opted_out_reason
        when l.email_opted_out then l.email_opted_out_reason
        when w.email_opted_out then w.email_opted_out_reason
        when w.email_opted_out_at is not null
          or nullif(trim(w.email_opted_out_reason), '') is not null
          then w.email_opted_out_reason
        else l.email_opted_out_reason
      end
  where w.id = p_winner;
end;
$$;

comment on function public.merge_humans(uuid, uuid) is
  'Staff-only. Reassigns every reference from the loser human to the winner using deterministic human, booking and dog locks, backfills blank contact fields, then deletes the loser. A STOP label on either record is kept (20261016120000). Customer-added trusted contacts move to the winner (20261115120100).';

revoke all on function public.merge_humans(uuid, uuid) from public;
revoke all on function public.merge_humans(uuid, uuid) from anon;
revoke all on function public.merge_humans(uuid, uuid) from authenticated;
grant execute on function public.merge_humans(uuid, uuid) to authenticated;
