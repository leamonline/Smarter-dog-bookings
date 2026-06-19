-- ============================================================
-- WhatsApp Flow group-booking RPC (service-role write path)
--
-- WHY
-- create_customer_booking_group(p_bookings, p_booking_date) is the customer
-- portal's grouped (1-4 dog) write path, but it derives the owner from
-- auth.uid() and is granted to `authenticated` only. The WhatsApp Flow Data
-- Endpoint runs as the service role with NO end-user JWT, so it cannot call
-- that function (auth.uid() is null -> "Not signed in"). The single-dog Flow
-- has so far inserted into bookings directly (one row at a time), which can't
-- create an atomic, shared-group_id multi-dog booking.
--
-- WHAT
-- create_whatsapp_booking_group(p_bookings, p_booking_date, p_human_id) — a
-- mirror of create_customer_booking_group with the owner passed explicitly
-- (resolved server-side from the trusted whatsapp_flow_sessions.human_id, never
-- from client input). Per-dog ownership is checked against p_human_id;
-- size is taken authoritatively from dogs.size; the group_id is assigned
-- server-side (null for a single dog); inserts are atomic. Calendar safety
-- (trg_enforce_booking_calendar) and seat capacity (trg_validate_booking_capacity)
-- both fire on the inserts here — is_staff() is false in a service-role call
-- (auth.uid() is null), so customer rules apply, exactly as for the portal RPC.
--
-- Grant: service_role only. Supabase auto-grants EXECUTE to anon on new public
-- functions, so revoke public/anon/authenticated explicitly first.
--
-- Idempotent: create or replace.
-- ============================================================

create or replace function public.create_whatsapp_booking_group(
  p_bookings     jsonb,
  p_booking_date date,
  p_human_id     uuid
)
returns table (id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
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
  -- Owner is passed in (from the server-side flow session), not derived from
  -- auth.uid(). The caller (service role) is trusted to resolve it; the dog
  -- ownership check below is the real guard against booking for someone else.
  if p_human_id is null then
    raise exception 'human_id is required' using errcode = '22023';
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
    -- passed human's account. `not found` is the ownership rejection.
    select d.size into v_dog_size
      from public.dogs d
     where d.id = v_dog_id and d.human_id = p_human_id;

    if not found then
      raise exception 'Row %: that dog is not on this account', v_idx using errcode = '42704';
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

    -- source='whatsapp_flow' so these are distinguishable from portal bookings.
    -- status='Booked' explicitly: the column default would not satisfy the
    -- bookings status CHECK in every environment. Calendar safety is enforced
    -- by trg_enforce_booking_calendar and seat capacity by
    -- trg_validate_booking_capacity, both firing on this insert.
    insert into public.bookings (
      booking_date, slot, dog_id, size, service,
      status, confirmed, addons, payment, group_id, source
    ) values (
      p_booking_date, v_slot, v_dog_id, v_size, v_service,
      'Booked', false, v_addons, v_payment, v_group_id, 'whatsapp_flow'
    )
    returning bookings.id into v_new_id;

    id := v_new_id;
    return next;
  end loop;

  return;
end;
$$;

comment on function public.create_whatsapp_booking_group(jsonb, date, uuid) is
  'Service-role WhatsApp Flow write path into bookings. Like create_customer_booking_group but the owner (p_human_id) is passed explicitly from the trusted flow session instead of auth.uid(). Validates 1-4 dogs, no duplicate dogs, per-dog ownership against p_human_id, server-authoritative size (from dogs.size); assigns group_id server-side; inserts atomically with source=whatsapp_flow. Calendar safety and seat capacity are enforced by the bookings BEFORE-INSERT triggers (is_staff() is false in a service-role call).';

-- Lock down: Supabase auto-grants EXECUTE to anon on new public functions, so
-- revoke explicitly, then grant only the service role (the Flow endpoint).
revoke all on function public.create_whatsapp_booking_group(jsonb, date, uuid) from public;
revoke all on function public.create_whatsapp_booking_group(jsonb, date, uuid) from anon;
revoke all on function public.create_whatsapp_booking_group(jsonb, date, uuid) from authenticated;
grant execute on function public.create_whatsapp_booking_group(jsonb, date, uuid) to service_role;
