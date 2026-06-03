-- ============================================================
-- Calendar-safe booking writes (additive — safe to apply immediately)
--
-- WHY
-- The capacity trigger validate_booking_capacity() enforces seat rules
-- (2-2-1, large-dog, early-close) but reads NEITHER day_settings.is_open
-- NOR day_settings.overrides, and never checks booking_date >= current_date.
-- Those gates lived only in the UI, so a direct API call (any logged-in
-- customer token, the WhatsApp autonomous path, or the WhatsApp Flow
-- endpoint) could create a booking on a CLOSED day, a PAST date, or a
-- manually-blocked slot.
--
-- WHAT
-- 1. validate_booking_calendar(date, slot) — one shared "is this date+slot
--    bookable?" gate. Same open-day rule as get_small_medium_availability
--    (open Mon-Wed by default; day_settings.is_open overrides) and the same
--    "both seats blocked = slot closed" override rule.
-- 2. enforce_booking_calendar() + a BEFORE INSERT trigger that runs the gate
--    for every NON-staff insert — covering the customer portal, the WhatsApp
--    autonomous path (apply_whatsapp_booking_action, service-role), and the
--    WhatsApp Flow endpoint (service-role) in ONE place. Staff (is_staff())
--    keep their latitude to book closed/past days, exactly like the capacity
--    trigger. Named to sort before trg_validate_booking_capacity so a
--    closed/past/blocked error takes precedence over "Slot is full".
-- 3. create_customer_booking_group(p_bookings, p_booking_date) — the new
--    customer write path: verifies ownership, takes size from dogs.size
--    (so a client can't claim a large dog is "small" to dodge large-dog
--    rules), assigns the group_id server-side, and inserts 1-4 rows
--    atomically. Calendar safety comes from the trigger above; seat capacity
--    from the existing validate_booking_capacity trigger (both fire on the
--    inserts here, and is_staff() is false for a customer even though this
--    function is SECURITY DEFINER, because is_staff() keys off auth.uid()).
--
-- The companion migration 20260603140100_lock_customer_booking_inserts.sql
-- removes the raw customer INSERT policy; apply it only AFTER the frontend
-- that calls this RPC has shipped (see that file's header).
--
-- Idempotent: create or replace + drop trigger if exists.
-- ============================================================

-- ── 1. Shared calendar gate ─────────────────────────────────
create or replace function public.validate_booking_calendar(
  p_booking_date date,
  p_slot         text
)
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_is_open   boolean;
  v_overrides jsonb;
begin
  -- Slot must be a real bookable slot.
  if p_slot is null or not (p_slot = any (active_slots())) then
    raise exception 'Invalid slot: %', coalesce(p_slot, '(null)') using errcode = 'P0001';
  end if;

  -- Future-only.
  if p_booking_date is null or p_booking_date < current_date then
    raise exception 'Cannot book a date in the past' using errcode = 'P0001';
  end if;

  select ds.is_open, ds.overrides
    into v_is_open, v_overrides
    from day_settings ds
   where ds.setting_date = p_booking_date;

  -- No day_settings row (or is_open NULL) -> weekly default: open Mon-Wed.
  -- Matches coalesce(is_open, isodow in (1,2,3)) in get_small_medium_availability.
  if not coalesce(v_is_open, extract(isodow from p_booking_date) in (1, 2, 3)) then
    raise exception 'The salon is closed on that date' using errcode = 'P0001';
  end if;

  -- "Both seats blocked" = slot manually closed by staff. Single-seat blocks
  -- are intentionally NOT honoured here (mirrors get_small_medium_availability);
  -- the capacity trigger still caps the remaining seats.
  v_overrides := coalesce(v_overrides, '{}'::jsonb);
  if (v_overrides -> p_slot ->> '0') = 'blocked'
     and (v_overrides -> p_slot ->> '1') = 'blocked' then
    raise exception 'That time slot is closed on this date' using errcode = 'P0001';
  end if;
end;
$$;

comment on function public.validate_booking_calendar(date, text) is
  'Shared "is this date+slot bookable?" gate: raises P0001 for an invalid slot, a past date, a closed day (open Mon-Wed by default; day_settings.is_open overrides), or a slot with BOTH seats blocked in day_settings.overrides. Internal-only — called by the enforce_booking_calendar trigger. SECURITY DEFINER so it can read the staff-only day_settings table.';

-- Internal-only: the SECURITY DEFINER trigger below calls it as the owner.
revoke all on function public.validate_booking_calendar(date, text) from public, anon, authenticated, service_role;

-- ── 2. Enforcement trigger (all non-staff inserts) ──────────
create or replace function public.enforce_booking_calendar()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Staff keep their latitude to book closed/past days (matches the capacity
  -- trigger). Every NON-staff insert is gated: the customer RPC, the WhatsApp
  -- autonomous path (apply_whatsapp_booking_action, service-role) and the
  -- WhatsApp Flow endpoint (service-role) all land here. is_staff() reads
  -- auth.uid() (the JWT claim), which SECURITY DEFINER does not change.
  if not is_staff() then
    perform validate_booking_calendar(new.booking_date, new.slot);
  end if;
  return new;
end;
$$;

comment on function public.enforce_booking_calendar() is
  'BEFORE INSERT trigger on bookings: runs validate_booking_calendar for every non-staff insert so a booking can never land on a closed/past/blocked slot, regardless of which path created it. Staff bypass via is_staff().';

revoke all on function public.enforce_booking_calendar() from public, anon, authenticated, service_role;

drop trigger if exists trg_enforce_booking_calendar on public.bookings;
create trigger trg_enforce_booking_calendar
  before insert on public.bookings
  for each row execute function enforce_booking_calendar();

-- ── 3. Customer booking RPC (sole customer write path) ──────
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
  v_uid       uuid := (select auth.uid());
  v_human_id  uuid;
  v_count     int;
  v_group_id  uuid;
  v_elem      jsonb;
  v_idx       int;
  v_dog_id    uuid;
  v_slot      text;
  v_service   text;
  v_in_size   text;
  v_dog_size  text;
  v_size      text;
  v_addons    text[];
  v_payment   text;
  v_new_id    uuid;
  v_slot_list text[];
  v_lock_slot text;
begin
  -- Auth + linked customer record.
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;

  select h.id into v_human_id
    from public.humans h
   where h.customer_user_id = v_uid
   limit 1;

  if v_human_id is null then
    raise exception 'No customer record is linked to this account' using errcode = '28000';
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

  -- One group_id for a multi-dog booking; null for a single dog. Server-side
  -- so the client can't smuggle in an arbitrary or colliding group id.
  v_group_id := case when v_count > 1 then gen_random_uuid() else null end;

  -- Pre-acquire the per-slot advisory locks (same key the capacity trigger
  -- uses) in deterministic sorted order, so two concurrent multi-dog groups
  -- touching the same slots can't deadlock. Re-locking inside the trigger is
  -- a harmless no-op within this transaction.
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

    -- Ownership + authoritative size in one lookup: the dog must be on the
    -- caller's account. `not found` is the ownership rejection.
    select d.size into v_dog_size
      from public.dogs d
     where d.id = v_dog_id and d.human_id = v_human_id;

    if not found then
      raise exception 'Row %: that dog is not on your account', v_idx using errcode = '42704';
    end if;

    -- Trust the stored size; only fall back to the caller's value when the
    -- dog has no size on file. Closes the "claim a large dog is small" hole.
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

    -- status='Booked' explicitly: the column default would not satisfy the
    -- bookings status CHECK in every environment. Calendar safety is enforced
    -- by trg_enforce_booking_calendar and seat capacity by
    -- trg_validate_booking_capacity, both firing on this insert.
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
  'Sole customer write path into bookings. Validates auth + linked human, 1-4 dogs, no duplicate dogs, per-dog ownership, and server-authoritative size (from dogs.size); assigns group_id server-side; inserts atomically. Calendar safety (open/future/unblocked) and seat capacity are enforced by the bookings BEFORE-INSERT triggers. SECURITY DEFINER; is_staff() is false for a customer so customer rules apply.';

-- Lock down: Supabase auto-grants EXECUTE to anon on new public functions, so
-- revoke explicitly, then grant only authenticated.
revoke all on function public.create_customer_booking_group(jsonb, date) from public;
revoke all on function public.create_customer_booking_group(jsonb, date) from anon;
revoke all on function public.create_customer_booking_group(jsonb, date) from authenticated;
grant execute on function public.create_customer_booking_group(jsonb, date) to authenticated;
