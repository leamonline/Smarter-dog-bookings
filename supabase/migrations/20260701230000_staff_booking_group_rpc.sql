-- ============================================================
-- Staff atomic group-booking RPC (AUDIT-3)
--
-- WHY
-- The staff New Booking modal (and the New Client wizard) save a multi-dog
-- booking as independent INSERTs via Promise.all. If dog 2 of 3 is rejected
-- (capacity race, duplicate), dogs 1 and 3 persist while the modal reports
-- one generic failure — and a staff retry of the whole group then trips the
-- (dog_id, booking_date, slot) unique constraint on the dogs that DID land.
-- The customer portal (create_customer_booking_group) and the WhatsApp Flow
-- (create_whatsapp_booking_group) are already atomic; this closes the gap
-- for the staff path.
--
-- WHAT
-- create_staff_booking_group(p_bookings, p_booking_date): all rows insert in
-- one transaction — any rejection rolls back the whole group and the caller
-- gets the trigger's own message (P0001 capacity copy, 23505 duplicate).
--
-- SECURITY: **INVOKER**, deliberately — staff already INSERT into bookings
-- directly under RLS, so this function adds atomicity, NOT privilege. It
-- runs as the calling staff user: the staff INSERT policy and all three
-- BEFORE-INSERT gates (calendar, capacity, pregnancy — each honouring
-- is_staff()) apply byte-for-byte as they do to the direct inserts it
-- replaces. A non-staff caller fails the explicit is_staff() check below
-- (and would be stopped by RLS regardless). This intentionally does NOT
-- create a new SECURITY DEFINER surface.
--
-- Per-row payload (jsonb array, 1-10 elements):
--   id            optional uuid — client-generated so the optimistic row,
--                 the returned row and the realtime INSERT echo all share
--                 one id (the staff UI's echo-matching contract)
--   dog_id        required
--   slot          required
--   service       required
--   size          optional — staff-authoritative (staff may override a
--                 dog's stored size per booking, unlike the customer RPC);
--                 falls back to dogs.size when absent
--   status        optional, default 'Booked' (bookings CHECK validates)
--   confirmed     optional, default false
--   addons        optional text array
--   payment       optional, default 'Due at Pick-up'
--   pickup_by_id  optional uuid
--   staff_capacity_override  optional boolean (trigger forces false for
--                            non-staff, exactly as on a direct insert)
--   notify_human_ids         optional uuid array
--   confirmation_channel     optional, default 'auto' (= column default)
--
-- group_id is deliberately NOT assigned: the staff flow has never grouped
-- multi-dog bookings under a group_id (see buildWizardBookings.js) and
-- changing that would alter cancel/reschedule semantics — out of scope.
--
-- Idempotent: create or replace.
-- ============================================================

create or replace function public.create_staff_booking_group(
  p_bookings     jsonb,
  p_booking_date date
)
returns setof public.bookings
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_count     int;
  v_elem      jsonb;
  v_idx       int;
  v_id        uuid;
  v_dog_id    uuid;
  v_slot      text;
  v_service   text;
  v_in_size   text;
  v_dog_size  text;
  v_size      text;
  v_status    text;
  v_confirmed boolean;
  v_addons    text[];
  v_payment   text;
  v_pickup    uuid;
  v_override  boolean;
  v_notify    uuid[];
  v_channel   text;
  v_slot_list text[];
  v_lock_slot text;
begin
  -- Clean staff-only error up front. RLS (the staff INSERT policy) is the
  -- actual enforcement — this function runs as the caller.
  if not public.is_staff() then
    raise exception 'Staff only' using errcode = '42501';
  end if;

  if p_bookings is null or jsonb_typeof(p_bookings) <> 'array' then
    raise exception 'bookings payload must be a JSON array' using errcode = '22023';
  end if;

  v_count := jsonb_array_length(p_bookings);
  if v_count < 1 or v_count > 10 then
    raise exception 'A booking group must have between 1 and 10 rows (got %)', v_count
      using errcode = '22023';
  end if;

  if p_booking_date is null then
    raise exception 'booking_date is required' using errcode = '22023';
  end if;

  -- No (dog, slot) pair twice in one group — it would only trip the unique
  -- constraint mid-transaction anyway; fail fast with a clear message.
  if (select count(*) <> count(distinct ((e->>'dog_id') || '|' || (e->>'slot')))
        from jsonb_array_elements(p_bookings) e) then
    raise exception 'The same dog is listed twice for one slot' using errcode = '22023';
  end if;

  -- Pre-acquire the per-slot advisory locks (the same key expression the
  -- capacity trigger uses) in deterministic sorted order, so two concurrent
  -- groups touching the same slots can't deadlock. The trigger re-locking
  -- inside this transaction is a harmless no-op. (Same pattern as
  -- create_customer_booking_group / create_whatsapp_booking_group.)
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

    v_id      := coalesce(nullif(v_elem->>'id', '')::uuid, gen_random_uuid());
    v_dog_id  := nullif(v_elem->>'dog_id', '')::uuid;
    v_slot    := nullif(v_elem->>'slot', '');
    v_service := nullif(trim(coalesce(v_elem->>'service', '')), '');
    v_in_size := nullif(trim(lower(coalesce(v_elem->>'size', ''))), '');

    if v_dog_id  is null then raise exception 'Row %: dog_id is required',  v_idx using errcode = '22023'; end if;
    if v_slot    is null then raise exception 'Row %: slot is required',    v_idx using errcode = '22023'; end if;
    if v_service is null then raise exception 'Row %: service is required', v_idx using errcode = '22023'; end if;

    -- The dog must exist (clean message instead of an FK error). Staff can
    -- book any dog — no ownership scoping, unlike the customer RPC.
    select d.size into v_dog_size
      from public.dogs d
     where d.id = v_dog_id;

    if not found then
      raise exception 'Row %: no dog with that id', v_idx using errcode = '42704';
    end if;

    -- Staff-authoritative size: the caller's value wins (the booking-row
    -- size override is a documented staff capability); the stored dog size
    -- is only the fallback. The mirror image of the customer RPC.
    v_size := coalesce(v_in_size, nullif(trim(lower(coalesce(v_dog_size, ''))), ''));
    if v_size is null then
      raise exception 'Row %: this dog has no size set', v_idx using errcode = '22023';
    end if;
    if v_size not in ('small', 'medium', 'large') then
      raise exception 'Row %: invalid size "%"', v_idx, v_size using errcode = '22023';
    end if;

    v_status    := coalesce(nullif(trim(coalesce(v_elem->>'status', '')), ''), 'Booked');
    v_confirmed := coalesce((v_elem->>'confirmed')::boolean, false);
    v_payment   := coalesce(nullif(v_elem->>'payment', ''), 'Due at Pick-up');
    v_pickup    := nullif(v_elem->>'pickup_by_id', '')::uuid;
    v_override  := coalesce((v_elem->>'staff_capacity_override')::boolean, false);
    v_channel   := coalesce(nullif(v_elem->>'confirmation_channel', ''), 'auto');

    v_addons := coalesce(
      array(select jsonb_array_elements_text(
        case when jsonb_typeof(v_elem->'addons') = 'array' then v_elem->'addons' else '[]'::jsonb end)),
      '{}'::text[]);

    v_notify := case
      when jsonb_typeof(v_elem->'notify_human_ids') = 'array'
        and jsonb_array_length(v_elem->'notify_human_ids') > 0
      then array(select (jsonb_array_elements_text(v_elem->'notify_human_ids'))::uuid)
      else null
    end;

    -- The three BEFORE-INSERT gates (calendar, capacity, pregnancy) fire
    -- here per row; any P0001 aborts the whole group — that's the point.
    return query
    insert into public.bookings (
      id, booking_date, slot, dog_id, size, service,
      status, confirmed, addons, payment, pickup_by_id,
      staff_capacity_override, notify_human_ids, confirmation_channel
    ) values (
      v_id, p_booking_date, v_slot, v_dog_id, v_size, v_service,
      v_status, v_confirmed, v_addons, v_payment, v_pickup,
      v_override, v_notify, v_channel
    )
    returning *;
  end loop;

  return;
end;
$$;

comment on function public.create_staff_booking_group(jsonb, date) is
  'Atomic staff write path for a same-date multi-dog booking group (AUDIT-3). SECURITY INVOKER on purpose: staff already insert directly under RLS, so this adds atomicity, not privilege — the staff INSERT policy and the three BEFORE-INSERT gates apply exactly as on the direct inserts it replaces. All rows insert in one transaction; any rejection rolls the whole group back. Accepts client-generated row ids so the staff UI''s optimistic rows and realtime echoes match. No group_id (matches the existing staff flow).';

-- Convention (docs/migrations.md): every new function gets an explicit revoke
-- block. Grant authenticated ONLY — the function is SECURITY INVOKER and gated
-- on is_staff(), which is false for a service-role call (no auth.uid()), so a
-- service_role grant would be dead code. The sole caller is the staff browser
-- client (createStaffBookingGroup in src/supabase/rpc.ts).
revoke all on function public.create_staff_booking_group(jsonb, date) from public;
revoke all on function public.create_staff_booking_group(jsonb, date) from anon;
revoke all on function public.create_staff_booking_group(jsonb, date) from authenticated;
grant execute on function public.create_staff_booking_group(jsonb, date) to authenticated;
