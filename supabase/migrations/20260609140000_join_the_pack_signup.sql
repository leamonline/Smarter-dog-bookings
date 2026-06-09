-- ============================================================
-- "Join the Pack" — new-customer self-signup with staff approval
--
-- WHY
-- Until now a customer could only sign in if staff had already added
-- them to `humans`; an unknown phone hit a dead-end. This lets a
-- prospective customer self-register from the portal: verify a mobile
-- by SMS, set a password, answer owner + dog questions, and land in a
-- PENDING state. Staff get a to-do prompt and approve/reject from the
-- customer's record; on approval the customer can book.
--
-- WHAT (all additive / idempotent)
--   1. humans: approved_at (the booking gate + pending signal),
--      signup_submitted_at, approved_by. `source` already exists.
--   2. dogs: dob, sex (mandatory at signup) + optional microchip,
--      neutered, vet, colour.
--   3. salon_todos: human_id + kind, so the review prompt links to the
--      customer and can auto-resolve on approval.
--   4. RPCs: create_pending_customer, submit_customer_signup (customer
--      SECURITY DEFINER), approve_customer_signup, reject_customer_signup
--      (staff-gated).
--   5. create_customer_booking_group gains an approval gate alongside
--      the existing profile-completeness gate.
--
-- APPROVAL MODEL
-- humans.approved_at DEFAULT now() means every existing row and every
-- future staff-created customer is auto-approved. ONLY create_pending_customer
-- sets it NULL, so "approved_at IS NULL" cleanly identifies a self-signup
-- that hasn't been approved yet. No existing customer is ever locked out.
-- ============================================================

-- ── 1. humans columns ───────────────────────────────────────
alter table public.humans add column if not exists approved_at         timestamptz default now();
alter table public.humans add column if not exists signup_submitted_at timestamptz;
alter table public.humans add column if not exists approved_by         uuid;

comment on column public.humans.approved_at is
  'When this customer was approved to book. DEFAULT now() = auto-approved (all existing + staff-created rows). Only the self-signup path (create_pending_customer) sets it NULL; staff clear the pending state via approve_customer_signup. NULL = awaiting approval, booking blocked.';
comment on column public.humans.signup_submitted_at is
  'When a self-signup customer finished the Join the Pack onboarding (owner + dog details). Drives the staff review queue. NULL for staff-created customers.';
comment on column public.humans.approved_by is
  'auth.uid() of the staff member who approved the self-signup (audit).';

-- ── 2. dogs columns ─────────────────────────────────────────
alter table public.dogs add column if not exists dob       text;  -- "YYYY-MM" (month & year of birth)
alter table public.dogs add column if not exists sex       text check (sex in ('male', 'female'));
alter table public.dogs add column if not exists microchip text;
alter table public.dogs add column if not exists neutered  boolean;
alter table public.dogs add column if not exists vet       text;
alter table public.dogs add column if not exists colour    text;

comment on column public.dogs.dob is 'Month & year of birth as "YYYY-MM" (no day). Captured at signup / dog edit.';
comment on column public.dogs.sex is 'Dog sex: male | female.';

-- ── 3. salon_todos: link + kind ─────────────────────────────
alter table public.salon_todos add column if not exists human_id uuid references public.humans(id) on delete cascade;
alter table public.salon_todos add column if not exists kind     text not null default 'general';

comment on column public.salon_todos.human_id is 'Optional link to the customer this to-do is about (e.g. a signup review). NULL for free-form tasks.';
comment on column public.salon_todos.kind is 'Category of to-do: general | signup_review. Lets the signup review item be found + auto-resolved on approval.';

-- ── 4a. create_pending_customer() ───────────────────────────
-- Creates the "shell" humans row for a freshly-verified phone that has no
-- record yet. Called by the portal only after link_customer_to_human()
-- returns nothing (so there is genuinely no matching/unclaimed human) —
-- hence a pure INSERT: it never UPDATEs customer_user_id, sidestepping the
-- prevent_customer_critical_column_update trigger. Idempotent: if a human
-- is already linked to this account it just returns it.
--
-- The unique(name, surname) + NOT NULL constraints on humans force a
-- non-null, unique placeholder; submit_customer_signup overwrites name /
-- surname with the real values. Phone is stored E.164 (+44…) so the
-- pre-auth login lookup (customer_phone_login_state) matches on return.
create or replace function public.create_pending_customer()
returns table (id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid       uuid := (select auth.uid());
  v_phone     text;
  v_clean     text;
  v_national  text;
  v_existing  uuid;
  v_new_id    uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  -- Idempotent: already have a linked human? Return it.
  select h.id into v_existing
  from   public.humans h
  where  h.customer_user_id = v_uid
  limit  1;
  if v_existing is not null then
    id := v_existing; return next; return;
  end if;

  -- Phone from auth.users (GoTrue stores digits, no '+').
  select u.phone into v_phone from auth.users u where u.id = v_uid;
  if v_phone is null or v_phone = '' then
    raise exception 'no_verified_phone' using errcode = '28000';
  end if;
  v_clean := regexp_replace(v_phone, '\D', '', 'g');
  v_national := case
    when v_clean like '44%' then substring(v_clean from 3)
    when v_clean like '0%'  then substring(v_clean from 2)
    else v_clean
  end;

  insert into public.humans (name, surname, phone, source, customer_user_id, approved_at)
  values ('New member', 'Pending ' || v_national, '+44' || v_national, 'self_signup', v_uid, null)
  returning humans.id into v_new_id;

  id := v_new_id; return next;
end;
$$;

revoke all on function public.create_pending_customer() from public;
revoke all on function public.create_pending_customer() from anon;
grant execute on function public.create_pending_customer() to authenticated;

comment on function public.create_pending_customer() is
  'Creates the pending "shell" humans row (approved_at NULL, source self_signup) for a verified phone with no record. Idempotent; INSERT-only. Called by the Join the Pack flow after link_customer_to_human() finds nothing.';

-- ── 4b. submit_customer_signup(owner, dogs) ─────────────────
-- Finalises a self-signup: writes the real owner details + policy
-- agreement onto the caller's shell, inserts 1+ dogs, stamps
-- signup_submitted_at, and drops a linked review row into salon_todos —
-- atomically. Only ever updates columns a customer is allowed to change
-- (name/surname/address/postcode/email/sms/whatsapp/policies_* + the
-- signup columns); never phone / customer_user_id / history_flag, so the
-- prevent_customer_critical_column_update trigger passes.
create or replace function public.submit_customer_signup(p_owner jsonb, p_dogs jsonb)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid      uuid := (select auth.uid());
  v_human    public.humans%rowtype;
  v_name     text;
  v_surname  text;
  v_address  text;
  v_elem     jsonb;
  v_dogcount int;
  v_full     text;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select * into v_human from public.humans h where h.customer_user_id = v_uid limit 1;
  if v_human.id is null then
    raise exception 'No account is linked to set up' using errcode = '28000';
  end if;

  v_name    := trim(coalesce(p_owner->>'name', ''));
  v_surname := trim(coalesce(p_owner->>'surname', ''));
  v_address := trim(coalesce(p_owner->>'address', ''));
  if v_name = '' or v_surname = '' or v_address = '' then
    raise exception 'Please give your name and address.' using errcode = 'P0001';
  end if;

  if p_dogs is null or jsonb_typeof(p_dogs) <> 'array' or jsonb_array_length(p_dogs) < 1 then
    raise exception 'Please tell us about at least one dog.' using errcode = 'P0001';
  end if;
  v_dogcount := jsonb_array_length(p_dogs);

  -- Owner details + policy agreement. (Unique(name,surname): a clashing
  -- real name surfaces as a friendly error to the caller.)
  begin
    update public.humans h set
      name                 = v_name,
      surname              = v_surname,
      address              = v_address,
      postcode             = nullif(trim(coalesce(p_owner->>'postcode', '')), ''),
      email                = nullif(trim(coalesce(p_owner->>'email', '')), ''),
      sms                  = coalesce((p_owner->>'sms')::boolean, false),
      whatsapp             = coalesce((p_owner->>'whatsapp')::boolean, false),
      policies_accepted_at = now(),
      policies_version     = nullif(trim(coalesce(p_owner->>'policies_version', '')), ''),
      signup_submitted_at  = now()
    where h.id = v_human.id;
  exception when unique_violation then
    raise exception 'We may already have you on file under that name — please contact the salon.'
      using errcode = 'P0001';
  end;

  -- Dogs.
  for v_elem in select * from jsonb_array_elements(p_dogs) loop
    if trim(coalesce(v_elem->>'name', '')) = '' or trim(coalesce(v_elem->>'breed', '')) = '' then
      raise exception 'Each dog needs a name and breed.' using errcode = 'P0001';
    end if;
    insert into public.dogs (
      human_id, name, breed, size, sex, dob,
      microchip, neutered, vet, colour, groom_notes, alerts
    ) values (
      v_human.id,
      trim(v_elem->>'name'),
      trim(v_elem->>'breed'),
      nullif(trim(lower(coalesce(v_elem->>'size', ''))), ''),
      nullif(trim(lower(coalesce(v_elem->>'sex', ''))), ''),
      nullif(trim(coalesce(v_elem->>'dob', '')), ''),
      nullif(trim(coalesce(v_elem->>'microchip', '')), ''),
      (v_elem->>'neutered')::boolean,
      nullif(trim(coalesce(v_elem->>'vet', '')), ''),
      nullif(trim(coalesce(v_elem->>'colour', '')), ''),
      coalesce(trim(v_elem->>'groom_notes'), ''),
      coalesce(
        array(select jsonb_array_elements_text(
          case when jsonb_typeof(v_elem->'alerts') = 'array' then v_elem->'alerts' else '[]'::jsonb end)),
        '{}'::text[])
    );
  end loop;

  -- Staff review prompt in the shared to-do list.
  v_full := trim(v_name || ' ' || v_surname);
  insert into public.salon_todos (text, kind, human_id, sort_order)
  values (
    'Review new customer: ' || v_full || ' (' || v_dogcount || ' dog' || case when v_dogcount = 1 then '' else 's' end || ')',
    'signup_review',
    v_human.id,
    -1000  -- float to the top of the list
  );
end;
$$;

revoke all on function public.submit_customer_signup(jsonb, jsonb) from public;
revoke all on function public.submit_customer_signup(jsonb, jsonb) from anon;
grant execute on function public.submit_customer_signup(jsonb, jsonb) to authenticated;

comment on function public.submit_customer_signup(jsonb, jsonb) is
  'Finalises a Join the Pack signup: writes owner details + policy agreement onto the caller''s shell human, inserts dogs, stamps signup_submitted_at, and adds a signup_review salon_todos row — atomically. SECURITY DEFINER; touches only customer-permitted columns.';

-- ── 4c. approve / reject (staff-gated) ──────────────────────
create or replace function public.approve_customer_signup(p_human_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not is_staff() then
    raise exception 'Staff only' using errcode = '42501';
  end if;

  update public.humans
  set    approved_at = now(),
         approved_by = (select auth.uid())
  where  id = p_human_id
    and  approved_at is null;

  if not found then
    return;  -- already approved or unknown id — no-op
  end if;

  update public.salon_todos
  set    done = true
  where  human_id = p_human_id and kind = 'signup_review' and not done;
end;
$$;

create or replace function public.reject_customer_signup(p_human_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not is_staff() then
    raise exception 'Staff only' using errcode = '42501';
  end if;

  update public.humans
  set    archived_at  = now(),
         history_flag = trim(coalesce(history_flag, '') || ' Signup rejected: ' || coalesce(nullif(trim(p_reason), ''), 'no reason given'))
  where  id = p_human_id
    and  approved_at is null;

  update public.salon_todos
  set    done = true
  where  human_id = p_human_id and kind = 'signup_review' and not done;
end;
$$;

revoke all on function public.approve_customer_signup(uuid) from public;
revoke all on function public.approve_customer_signup(uuid) from anon;
grant execute on function public.approve_customer_signup(uuid) to authenticated;
revoke all on function public.reject_customer_signup(uuid, text) from public;
revoke all on function public.reject_customer_signup(uuid, text) from anon;
grant execute on function public.reject_customer_signup(uuid, text) to authenticated;

comment on function public.approve_customer_signup(uuid) is
  'Staff-only. Approves a pending self-signup (sets approved_at/approved_by) and resolves its signup_review to-do. No-op if already approved.';
comment on function public.reject_customer_signup(uuid, text) is
  'Staff-only. Rejects a pending self-signup (archives the human with a reason) and resolves its signup_review to-do.';

-- ── 5. Booking gate: also require approval ──────────────────
-- Re-creates create_customer_booking_group with one added gate: a pending
-- (approved_at IS NULL) customer cannot book. Body is otherwise the live
-- definition from 20260608160000.
create or replace function public.create_customer_booking_group(
  p_bookings     jsonb,
  p_booking_date date
)
returns table (id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid        uuid := (select auth.uid());
  v_human_id   uuid;
  v_name       text;
  v_surname    text;
  v_address    text;
  v_policies_at timestamptz;
  v_approved_at timestamptz;
  v_count      int;
  v_group_id   uuid;
  v_elem       jsonb;
  v_idx        int;
  v_dog_id     uuid;
  v_slot       text;
  v_service    text;
  v_in_size    text;
  v_dog_size   text;
  v_size       text;
  v_addons     text[];
  v_payment    text;
  v_new_id     uuid;
  v_slot_list  text[];
  v_lock_slot  text;
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;

  select h.id, h.name, h.surname, h.address, h.policies_accepted_at, h.approved_at
    into v_human_id, v_name, v_surname, v_address, v_policies_at, v_approved_at
    from public.humans h
   where h.customer_user_id = v_uid
   limit 1;

  if v_human_id is null then
    raise exception 'No customer record is linked to this account' using errcode = '28000';
  end if;

  -- Approval gate: a self-signup awaiting staff review can't book yet.
  if v_approved_at is null then
    raise exception 'Your account is awaiting approval. We''ll be in touch as soon as you''re set up.'
      using errcode = 'P0001';
  end if;

  -- Profile completeness gate (name + surname + address + policy agreement).
  if coalesce(trim(v_name), '') = ''
     or coalesce(trim(v_surname), '') = ''
     or coalesce(trim(v_address), '') = ''
     or v_policies_at is null then
    raise exception 'Please complete your profile (name, address and policy agreement) before booking'
      using errcode = 'P0001';
  end if;

  if p_bookings is null or jsonb_typeof(p_bookings) <> 'array' then
    raise exception 'bookings payload must be a JSON array' using errcode = '22023';
  end if;

  v_count := jsonb_array_length(p_bookings);
  if v_count < 1 or v_count > 4 then
    raise exception 'A booking group must have between 1 and 4 dogs (got %)', v_count
      using errcode = '22023';
  end if;

  if p_booking_date is null then
    raise exception 'booking_date is required' using errcode = '22023';
  end if;

  if (select count(*) <> count(distinct (e->>'dog_id'))
        from jsonb_array_elements(p_bookings) e) then
    raise exception 'The same dog is listed more than once' using errcode = '22023';
  end if;

  v_group_id := case when v_count > 1 then gen_random_uuid() else null end;

  select array_agg(distinct (e->>'slot') order by (e->>'slot'))
    into v_slot_list
    from jsonb_array_elements(p_bookings) e
   where nullif(e->>'slot', '') is not null;

  if v_slot_list is not null then
    foreach v_lock_slot in array v_slot_list loop
      perform pg_advisory_xact_lock(
        hashtextextended(p_booking_date::text || '|' || v_lock_slot, 0));
    end loop;
  end if;

  v_idx := 0;
  for v_elem in select * from jsonb_array_elements(p_bookings) loop
    v_idx := v_idx + 1;

    v_dog_id  := nullif(v_elem->>'dog_id', '')::uuid;
    v_slot    := nullif(v_elem->>'slot', '');
    v_service := nullif(trim(coalesce(v_elem->>'service', '')), '');
    v_in_size := nullif(trim(lower(coalesce(v_elem->>'size', ''))), '');

    if v_dog_id  is null then raise exception 'Row %: dog_id is required',  v_idx using errcode = '22023'; end if;
    if v_slot    is null then raise exception 'Row %: slot is required',    v_idx using errcode = '22023'; end if;
    if v_service is null then raise exception 'Row %: service is required', v_idx using errcode = '22023'; end if;

    select d.size into v_dog_size
      from public.dogs d
     where d.id = v_dog_id and d.human_id = v_human_id;

    if not found then
      raise exception 'Row %: that dog is not on your account', v_idx using errcode = '42704';
    end if;

    v_size := coalesce(nullif(trim(lower(coalesce(v_dog_size, ''))), ''), v_in_size);
    if v_size is null then
      raise exception 'Row %: this dog has no size set', v_idx using errcode = '22023';
    end if;
    if v_size not in ('small', 'medium', 'large') then
      raise exception 'Row %: invalid size "%"', v_idx, v_size using errcode = '22023';
    end if;

    v_addons := coalesce(
      array(select jsonb_array_elements_text(
        case when jsonb_typeof(v_elem->'addons') = 'array' then v_elem->'addons' else '[]'::jsonb end)),
      '{}'::text[]);
    v_payment := coalesce(nullif(v_elem->>'payment', ''), 'Due at Pick-up');

    insert into public.bookings (
      booking_date, slot, dog_id, size, service,
      status, confirmed, addons, payment, group_id
    ) values (
      p_booking_date, v_slot, v_dog_id, v_size, v_service,
      'Booked', false, v_addons, v_payment, v_group_id
    )
    returning bookings.id into v_new_id;

    id := v_new_id;
    return next;
  end loop;

  return;
end;
$$;

revoke all on function public.create_customer_booking_group(jsonb, date) from public;
revoke all on function public.create_customer_booking_group(jsonb, date) from anon;
revoke all on function public.create_customer_booking_group(jsonb, date) from authenticated;
grant execute on function public.create_customer_booking_group(jsonb, date) to authenticated;

comment on function public.create_customer_booking_group(jsonb, date) is
  'Sole customer write path into bookings. Requires an APPROVED account (approved_at not null) and a complete profile (name, surname, address, policies_accepted_at) before booking; then validates 1-4 dogs, no duplicate dogs, per-dog ownership, and server-authoritative size. SECURITY DEFINER.';

-- ── 6. notification_log: allow the 'welcome' trigger type ───
-- The Join the Pack welcome message (notify-customer-welcome) logs its send
-- here like the other notify-* functions. Extend the CHECK so the row (and the
-- idempotency pre-check that skips a second welcome) persists.
alter table public.notification_log
  drop constraint if exists notification_log_trigger_type_check;
alter table public.notification_log
  add constraint notification_log_trigger_type_check
  check (trigger_type in ('confirmed', 'reminder', 'cancelled', 'waitlist_joined', 'ready', 'welcome'));
