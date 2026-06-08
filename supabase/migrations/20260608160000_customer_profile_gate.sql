-- ============================================================
-- Customer profile gate: address + policy agreement before booking
--
-- WHY
-- Customers should have a first name, surname, address and explicit
-- agreement to Smarter Dog's policies (Terms, Matted Coat Policy,
-- Privacy) on file before they can book through the customer portal.
-- The front-end shows a blocking onboarding screen, but the booking
-- RPC is the real write path — so we enforce the same requirement
-- server-side here, where a direct API call can't dodge it.
--
-- WHAT
-- 1. Additive columns on humans: postcode, policies_accepted_at,
--    policies_version. The existing single-line `address` column is
--    reused for the composed address (staff views unchanged).
-- 2. create_customer_booking_group() gains a completeness gate right
--    after it resolves the linked human: missing name / surname /
--    address, or no recorded policy agreement, raises P0001. Body is
--    otherwise byte-for-byte the live definition.
--
-- SCOPE: only the customer-portal path is gated. The WhatsApp
-- autonomous path (apply_whatsapp_booking_action) and the WhatsApp
-- Flow endpoint use other write paths and are intentionally left
-- untouched — those contacts may have no address and we don't want to
-- break the AI receptionist.
--
-- Idempotent: add column if not exists + create or replace. Grants are
-- re-asserted (Supabase auto-grants EXECUTE to anon on new functions).
-- ============================================================

-- ── 1. Additive columns ─────────────────────────────────────
alter table public.humans add column if not exists postcode             text;
alter table public.humans add column if not exists policies_accepted_at timestamptz;
alter table public.humans add column if not exists policies_version     text;

comment on column public.humans.postcode is
  'Customer postcode captured during portal onboarding (validated via postcodes.io). The composed full address still lives in humans.address.';
comment on column public.humans.policies_accepted_at is
  'When the customer agreed to Smarter Dog''s policies (Terms, Matted Coat, Privacy) in the portal. NULL = not yet agreed.';
comment on column public.humans.policies_version is
  'Which policy version the customer agreed to (see src/constants/salonPolicies.ts POLICIES_VERSION).';

-- ── 2. Booking RPC with completeness gate ───────────────────
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
  -- Auth + linked customer record.
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;

  select h.id, h.name, h.surname, h.address, h.policies_accepted_at
    into v_human_id, v_name, v_surname, v_address, v_policies_at
    from public.humans h
   where h.customer_user_id = v_uid
   limit 1;

  if v_human_id is null then
    raise exception 'No customer record is linked to this account' using errcode = '28000';
  end if;

  -- Profile completeness gate. Mirrors the front-end onboarding screen so
  -- the "name + surname + address + policy agreement before booking"
  -- requirement holds even for a direct API call.
  if coalesce(trim(v_name), '') = ''
     or coalesce(trim(v_surname), '') = ''
     or coalesce(trim(v_address), '') = ''
     or v_policies_at is null then
    raise exception 'Please complete your profile (name, address and policy agreement) before booking'
      using errcode = 'P0001';
  end if;

  -- Payload shape: a JSON array of 1-4 dogs.
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

  -- No dog listed twice in one group.
  if (select count(*) <> count(distinct (e->>'dog_id'))
        from jsonb_array_elements(p_bookings) e) then
    raise exception 'The same dog is listed more than once' using errcode = '22023';
  end if;

  -- One group_id for a multi-dog booking; null for a single dog.
  v_group_id := case when v_count > 1 then gen_random_uuid() else null end;

  -- Pre-acquire the per-slot advisory locks in deterministic sorted order.
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

    -- Ownership + authoritative size in one lookup.
    select d.size into v_dog_size
      from public.dogs d
     where d.id = v_dog_id and d.human_id = v_human_id;

    if not found then
      raise exception 'Row %: that dog is not on your account', v_idx using errcode = '42704';
    end if;

    -- Trust the stored size; only fall back to the caller's value when the
    -- dog has no size on file.
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

comment on function public.create_customer_booking_group(jsonb, date) is
  'Sole customer write path into bookings. Requires a complete profile (name, surname, address, policies_accepted_at) before booking; then validates auth + linked human, 1-4 dogs, no duplicate dogs, per-dog ownership, and server-authoritative size (from dogs.size); assigns group_id server-side; inserts atomically. Calendar safety + seat capacity enforced by the bookings BEFORE-INSERT triggers. SECURITY DEFINER; is_staff() is false for a customer so customer rules apply.';

-- Lock down: Supabase auto-grants EXECUTE to anon on new public functions.
revoke all on function public.create_customer_booking_group(jsonb, date) from public;
revoke all on function public.create_customer_booking_group(jsonb, date) from anon;
revoke all on function public.create_customer_booking_group(jsonb, date) from authenticated;
grant execute on function public.create_customer_booking_group(jsonb, date) to authenticated;
