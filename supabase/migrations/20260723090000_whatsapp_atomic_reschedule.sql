-- ============================================================
-- Atomic WhatsApp reschedule (defect fix)
--
-- BUG
-- The WhatsApp Flow reschedule creates the new booking group first and then
-- cancels the old visit in a second, separate statement. When that cancel
-- fails or only partially succeeds, the endpoint logs "DUPLICATE-RISK" and
-- STILL returns success to the customer — leaving two active appointments for
-- the same dogs, occupying two sets of seats, with the customer told only
-- about the new one.
--
-- The original comment ("new-first, cancel-old-second so a failure never
-- loses the original") chose duplication over loss. This function removes the
-- choice: both halves happen in one transaction, so the outcome is either the
-- complete move or nothing at all.
--
-- ORDER: cancel first, then create.
-- Cancelled rows free their seats, so moving to an adjacent slot on the same
-- day cannot fail capacity against the booking it is replacing. If the create
-- then fails for any reason, the whole transaction rolls back and the original
-- visit is untouched — the failure mode becomes "nothing changed" instead of
-- "two live appointments".
--
-- This function contains NO policy logic: no deadline test, no visit
-- aggregate, no incident. It preserves the deployed behaviour exactly and is
-- deliberately independent of the previous_day_1500_v1 programme.
--
-- Idempotent: create or replace.
-- ============================================================

create or replace function public.reschedule_whatsapp_booking_group(
  p_bookings         jsonb,
  p_booking_date     date,
  p_human_id         uuid,
  p_old_group_id     uuid    default null,
  p_old_booking_id   uuid    default null,
  p_expected_old_ids uuid[]  default null,
  p_reason           text    default 'Rescheduled via WhatsApp'
)
returns table (
  new_booking_ids       uuid[],
  cancelled_booking_ids uuid[]
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_old_ids     uuid[];
  v_cancelled   uuid[];
  v_new_ids     uuid[];
  v_lock_keys   text[];
  v_lock_key    text;
begin
  if p_human_id is null then
    raise exception 'human_id is required' using errcode = '22023';
  end if;
  if p_old_group_id is null and p_old_booking_id is null then
    raise exception 'the old visit must be identified by group id or booking id'
      using errcode = '22023';
  end if;

  -- ── 1. Resolve and lock the old visit's still-Booked owned rows ──
  --
  -- Ownership is via dogs.human_id, exactly as the existing cancel RPCs do.
  -- FOR UPDATE on bookings holds the rows for the whole transaction so a
  -- concurrent staff edit cannot slip between the check and the cancel.
  -- Two steps by necessity: FOR UPDATE cannot be combined with an aggregate.
  -- Take the row locks first, then read the locked set — holding the locks
  -- makes that second read stable for the rest of the transaction.
  perform 1
    from public.bookings b
    join public.dogs d on d.id = b.dog_id
   where d.human_id = p_human_id
     and b.status = 'Booked'
     and (
       (p_old_group_id is not null and b.group_id = p_old_group_id)
       or (p_old_group_id is null and b.id = p_old_booking_id)
     )
   for update of b;

  select coalesce(array_agg(b.id order by b.id), '{}'::uuid[])
    into v_old_ids
    from public.bookings b
    join public.dogs d on d.id = b.dog_id
   where d.human_id = p_human_id
     and b.status = 'Booked'
     and (
       (p_old_group_id is not null and b.group_id = p_old_group_id)
       or (p_old_group_id is null and b.id = p_old_booking_id)
     );

  if cardinality(v_old_ids) = 0 then
    -- Nothing cancellable: the visit was already cancelled, already moved, or
    -- never belonged to this customer. Never create a new booking in this
    -- case — that is precisely how a duplicate appears.
    raise exception 'reschedule_old_visit_unavailable' using errcode = 'P0002';
  end if;

  -- ── 2. Optional guard: the old visit must still be what was shown ──
  --
  -- The Flow snapshots the old booking ids when it opens. If staff have since
  -- added or removed a dog, cancelling "the visit" would cancel something the
  -- customer never reviewed, so refuse and let them start again.
  if p_expected_old_ids is not null and cardinality(p_expected_old_ids) > 0 then
    if not (v_old_ids @> p_expected_old_ids and p_expected_old_ids @> v_old_ids) then
      raise exception 'reschedule_old_visit_changed' using errcode = 'P0002';
    end if;
  end if;

  -- ── 3. Lock every affected slot, old and new, in one sorted order ──
  --
  -- Same key expression as the capacity trigger. Taking the union in sorted
  -- order means two concurrent reschedules touching the same slots cannot
  -- deadlock; create_whatsapp_booking_group re-locking inside this
  -- transaction is a harmless no-op.
  select array_agg(distinct k order by k) into v_lock_keys
  from (
    select b.booking_date::text || '|' || b.slot as k
      from public.bookings b
     where b.id = any (v_old_ids)
    union
    select p_booking_date::text || '|' || (e->>'slot')
      from jsonb_array_elements(coalesce(p_bookings, '[]'::jsonb)) e
     where nullif(e->>'slot', '') is not null
  ) keys;

  if v_lock_keys is not null then
    foreach v_lock_key in array v_lock_keys loop
      perform pg_advisory_xact_lock(hashtextextended(v_lock_key, 0));
    end loop;
  end if;

  -- ── 4. Cancel the old rows FIRST so their seats are free ──
  with cancelled as (
    update public.bookings b
       set status = 'Cancelled',
           cancel_reason = left(coalesce(p_reason, 'Rescheduled via WhatsApp'), 500)
     where b.id = any (v_old_ids)
       and b.status = 'Booked'
    returning b.id
  )
  select coalesce(array_agg(id order by id), '{}'::uuid[]) into v_cancelled from cancelled;

  if cardinality(v_cancelled) <> cardinality(v_old_ids) then
    -- Cannot happen while we hold FOR UPDATE on those rows; if it ever does,
    -- roll back rather than proceed to create.
    raise exception 'reschedule_old_visit_unavailable' using errcode = 'P0002';
  end if;

  -- ── 5. Create the replacement in the same transaction ──
  --
  -- Delegates to the existing create RPC so ownership, authoritative dog
  -- size, duplicate-dog rejection, group_id assignment, source tagging and
  -- all three BEFORE-INSERT gates (calendar, capacity, pregnancy) apply
  -- byte-for-byte as they do today. Any P0001 from those gates propagates to
  -- the caller and rolls back the cancellation above, so the customer keeps
  -- the appointment they already had.
  select coalesce(array_agg(c.id), '{}'::uuid[])
    into v_new_ids
    from public.create_whatsapp_booking_group(p_bookings, p_booking_date, p_human_id) c;

  if cardinality(v_new_ids) = 0 then
    raise exception 'reschedule_create_failed' using errcode = 'P0002';
  end if;

  new_booking_ids := v_new_ids;
  cancelled_booking_ids := v_cancelled;
  return next;
end;
$$;

comment on function public.reschedule_whatsapp_booking_group(jsonb, date, uuid, uuid, uuid, uuid[], text) is
  'Atomic service-role WhatsApp reschedule. Cancels the old owned Booked rows and creates the replacement in ONE transaction, so a failure can never leave two active appointments. Cancels first so freed seats are available to the replacement; delegates creation to create_whatsapp_booking_group, inheriting its ownership, size-authority and all three BEFORE-INSERT gates. Raises P0002 reschedule_old_visit_unavailable / reschedule_old_visit_changed when the old visit is gone or no longer matches the reviewed snapshot, and lets capacity P0001 propagate so the caller can offer another time. Contains no booking-policy or deadline logic.';

-- Supabase auto-grants EXECUTE to anon/authenticated on new public functions,
-- so revoke explicitly and grant only the service role (the Flow endpoint and
-- the WhatsApp agent), matching create_whatsapp_booking_group.
revoke all on function public.reschedule_whatsapp_booking_group(jsonb, date, uuid, uuid, uuid, uuid[], text) from public;
revoke all on function public.reschedule_whatsapp_booking_group(jsonb, date, uuid, uuid, uuid, uuid[], text) from anon;
revoke all on function public.reschedule_whatsapp_booking_group(jsonb, date, uuid, uuid, uuid, uuid[], text) from authenticated;
grant execute on function public.reschedule_whatsapp_booking_group(jsonb, date, uuid, uuid, uuid, uuid[], text) to service_role;
