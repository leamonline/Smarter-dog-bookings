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

-- ── Durable idempotency receipt ──────────────────────────────────────
--
-- whatsapp_flow_sessions.flow_token is already the Flow's durable identity,
-- so it is the idempotency key. The endpoint's existing session.booking_id
-- check is a fast path only: two concurrent completions both read it as null,
-- so it cannot serialise a retry on its own, and it stores one id where a
-- multi-dog visit has several.
--
-- This table stores the complete committed result. Combined with the advisory
-- lock taken at the top of the function, a duplicate submission either waits
-- for the first to commit and then replays its exact receipt, or (if it
-- carries different data) is rejected rather than silently answered with
-- someone else's result.
create table if not exists public.whatsapp_reschedule_receipts (
  flow_token            text primary key,
  human_id              uuid not null references public.humans(id),
  request_hash          text not null,
  new_booking_ids       uuid[] not null,
  cancelled_booking_ids uuid[] not null,
  created_at            timestamptz not null default now()
);

alter table public.whatsapp_reschedule_receipts enable row level security;
revoke all on public.whatsapp_reschedule_receipts from public;
revoke all on public.whatsapp_reschedule_receipts from anon, authenticated;

comment on table public.whatsapp_reschedule_receipts is
  'Durable idempotency receipts for committed WhatsApp Flow reschedules, keyed by flow_token. A retry replays the stored booking ids instead of creating a second replacement. Deliberately NO foreign key to bookings: a later cancellation of either the old or new booking must not cascade-delete or null the recorded response, or a retry after that cancellation would re-run the reschedule. Stores only booking ids and the request hash — no name, phone or other customer PII. Retention: prune rows older than the Flow session lifetime (24h) plus a safety margin; a monthly cron deleting rows older than 30 days is sufficient and is out of scope for this hotfix.';

-- The committed result is immutable: once written, a receipt is only ever read
-- (to replay). This trigger turns an accidental UPDATE into a loud error
-- rather than a silently corrupted idempotency record. DELETE is deliberately
-- allowed so retention pruning can remove long-expired rows — a receipt older
-- than the 24h Flow-session lifetime can never be replayed against anyway, so
-- deleting it is safe; corrupting a live one is not. INSERT is unaffected.
create or replace function public.guard_whatsapp_reschedule_receipt()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  raise exception 'whatsapp_reschedule_receipts rows are immutable (update not allowed)'
    using errcode = 'P0001';
end;
$$;
revoke all on function public.guard_whatsapp_reschedule_receipt() from public, anon, authenticated;

drop trigger if exists trg_guard_whatsapp_reschedule_receipt on public.whatsapp_reschedule_receipts;
create trigger trg_guard_whatsapp_reschedule_receipt
  before update on public.whatsapp_reschedule_receipts
  for each row execute function public.guard_whatsapp_reschedule_receipt();

-- An earlier in-development revision of this function had no p_flow_token
-- argument. It was never merged or deployed, but drop it defensively so a
-- checkout that ran the earlier file cannot end up with two overloads and an
-- ambiguous call. Harmless where it never existed.
drop function if exists public.reschedule_whatsapp_booking_group(
  jsonb, date, uuid, uuid, uuid, uuid[], text);
drop function if exists public.reschedule_whatsapp_booking_group(
  jsonb, date, uuid, uuid, uuid, uuid[], text, text);

create or replace function public.reschedule_whatsapp_booking_group(
  p_bookings         jsonb,
  p_booking_date     date,
  p_human_id         uuid,
  p_old_group_id     uuid    default null,
  p_old_booking_id   uuid    default null,
  p_expected_old_ids uuid[]  default null,
  p_reason           text    default 'Rescheduled via WhatsApp',
  p_flow_token       text    default null,
  -- The material facts the customer reviewed when the Flow opened. Revalidated
  -- INSIDE the lock, because the endpoint's pre-flight check is a separate
  -- query and therefore a time-of-check/time-of-use race.
  p_expected_old_date date   default null,
  p_expected_old_slot text   default null,
  p_expected_services jsonb  default null
)
returns table (
  new_booking_ids       uuid[],
  cancelled_booking_ids uuid[],
  replayed              boolean
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
  v_prior       public.whatsapp_reschedule_receipts%rowtype;
  v_hash        text;
  v_group_ids   uuid[];
  v_group_id    uuid;
  v_live_date   date;
  v_live_slot   text;
  v_live_svc    jsonb;
begin
  if p_human_id is null then
    raise exception 'human_id is required' using errcode = '22023';
  end if;
  if p_old_group_id is null and p_old_booking_id is null then
    raise exception 'the old visit must be identified by group id or booking id'
      using errcode = '22023';
  end if;

  -- ── 0. Serialise and replay on the Flow's durable token ──
  --
  -- The advisory lock is what makes two concurrent completions safe: the
  -- second blocks here until the first commits, then finds its receipt below
  -- and replays it instead of creating a second replacement.
  if p_flow_token is not null then
    perform pg_advisory_xact_lock(hashtextextended('wa_resched|' || p_flow_token, 0));

    v_hash := md5(
      coalesce(p_bookings::text, '') || '|' || coalesce(p_booking_date::text, '') || '|' ||
      coalesce(p_human_id::text, '') || '|' || coalesce(p_old_group_id::text, '') || '|' ||
      coalesce(p_old_booking_id::text, '') || '|' ||
      coalesce(p_expected_old_date::text, '') || '|' ||
      coalesce(p_expected_old_slot, '') || '|' ||
      coalesce(p_expected_services::text, ''));

    select * into v_prior from public.whatsapp_reschedule_receipts
     where flow_token = p_flow_token;

    if found then
      if v_prior.request_hash <> v_hash or v_prior.human_id <> p_human_id then
        -- A retry that carries different details is a bug or an attack, never
        -- an ordinary redelivery. Refuse rather than answer it with the
        -- earlier customer's result.
        raise exception 'reschedule_idempotency_conflict' using errcode = 'P0002';
      end if;
      new_booking_ids := v_prior.new_booking_ids;
      cancelled_booking_ids := v_prior.cancelled_booking_ids;
      replayed := true;
      return next;
      return;
    end if;
  end if;

  -- ── 1. Resolve and lock the old visit's still-Booked owned rows ──
  --
  -- Ownership is via dogs.human_id, exactly as the existing cancel RPCs do.
  -- FOR UPDATE on bookings holds the rows for the whole transaction so a
  -- concurrent staff edit cannot slip between the check and the cancel.
  -- ── 1a. Resolve a single booking id up to its whole group ──
  --
  -- Cancelling one dog out of a multi-dog group would leave the rest of the
  -- family booked on the old date while the replacement covers everyone. When
  -- the caller names one row, the group it belongs to is the real source.
  if p_old_group_id is null and p_old_booking_id is not null then
    select b.group_id into v_group_id
      from public.bookings b
      join public.dogs d on d.id = b.dog_id
     where b.id = p_old_booking_id
       and d.human_id = p_human_id
       and b.status = 'Booked';
  else
    v_group_id := p_old_group_id;
  end if;

  -- Two steps by necessity: FOR UPDATE cannot be combined with an aggregate.
  -- Take the row locks first, then read the locked set — holding the locks
  -- makes that second read stable for the rest of the transaction and blocks
  -- a concurrent attempt on the same source group.
  perform 1
    from public.bookings b
    join public.dogs d on d.id = b.dog_id
   where d.human_id = p_human_id
     and b.status = 'Booked'
     and (
       (v_group_id is not null and b.group_id = v_group_id)
       or (v_group_id is null and b.id = p_old_booking_id)
     )
   for update of b;

  select coalesce(array_agg(b.id order by b.id), '{}'::uuid[]),
         coalesce(array_agg(distinct b.group_id) filter (where b.group_id is not null), '{}'::uuid[])
    into v_old_ids, v_group_ids
    from public.bookings b
    join public.dogs d on d.id = b.dog_id
   where d.human_id = p_human_id
     and b.status = 'Booked'
     and (
       (v_group_id is not null and b.group_id = v_group_id)
       or (v_group_id is null and b.id = p_old_booking_id)
     );

  -- The active source must be exactly one group (or one ungrouped row).
  if cardinality(v_group_ids) > 1 then
    raise exception 'reschedule_old_visit_changed' using errcode = 'P0002';
  end if;

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
    -- Set equality, deliberately in both directions. `@>` alone would accept
    -- an incomplete subset of a multi-dog group (cancelling dogs the customer
    -- did review while leaving others behind), and would also accept extra
    -- ids the customer never saw.
    if not (v_old_ids @> p_expected_old_ids and p_expected_old_ids @> v_old_ids) then
      raise exception 'reschedule_old_visit_changed' using errcode = 'P0002';
    end if;
  end if;

  -- ── 2b. Revalidate every material fact under the lock ──
  --
  -- Set equality of booking ids catches an added or removed dog, but NOT an
  -- in-place staff edit that keeps the same row ids — a staff move of the same
  -- booking to a different time is invisible to an id comparison. These
  -- checks close that hole, and they run here, inside the transaction that
  -- holds the row locks, rather than in a separate pre-flight query.
  --
  -- Material facts are compared directly rather than via updated_at: an
  -- immaterial edit (a groom note) would change updated_at and reject a
  -- perfectly valid reschedule, while these comparisons reject exactly the
  -- changes that would make the customer's review wrong.
  select min(b.booking_date), min(b.slot)
    into v_live_date, v_live_slot
    from public.bookings b
   where b.id = any (v_old_ids);

  if p_expected_old_date is not null and v_live_date <> p_expected_old_date then
    raise exception 'reschedule_old_visit_changed' using errcode = 'P0002',
      detail = 'the source appointment date changed after the customer reviewed it';
  end if;
  if p_expected_old_slot is not null and v_live_slot <> p_expected_old_slot then
    raise exception 'reschedule_old_visit_changed' using errcode = 'P0002',
      detail = 'the source arrival time changed after the customer reviewed it';
  end if;

  -- Service (and therefore the size/allocation basis) per dog.
  if p_expected_services is not null then
    select coalesce(jsonb_object_agg(b.dog_id::text, b.service), '{}'::jsonb)
      into v_live_svc
      from public.bookings b
     where b.id = any (v_old_ids);
    if v_live_svc <> p_expected_services then
      raise exception 'reschedule_old_visit_changed' using errcode = 'P0002',
        detail = 'the source services changed after the customer reviewed it';
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

  -- ── 6. Record the receipt so a retry replays instead of re-running ──
  if p_flow_token is not null then
    insert into public.whatsapp_reschedule_receipts
      (flow_token, human_id, request_hash, new_booking_ids, cancelled_booking_ids)
    values (p_flow_token, p_human_id, v_hash, v_new_ids, v_cancelled);
  end if;

  new_booking_ids := v_new_ids;
  cancelled_booking_ids := v_cancelled;
  replayed := false;
  return next;
end;
$$;

comment on function public.reschedule_whatsapp_booking_group(jsonb, date, uuid, uuid, uuid, uuid[], text, text, date, text, jsonb) is
  'Atomic service-role WhatsApp reschedule. Cancels the old owned Booked rows and creates the replacement in ONE transaction, so a failure can never leave two active appointments. Cancels first so freed seats are available to the replacement; delegates creation to create_whatsapp_booking_group, inheriting its ownership, size-authority and all three BEFORE-INSERT gates. Raises P0002 reschedule_old_visit_unavailable / reschedule_old_visit_changed when the old visit is gone or no longer matches the reviewed snapshot, and lets capacity P0001 propagate so the caller can offer another time. Contains no booking-policy or deadline logic.';

-- Supabase auto-grants EXECUTE to anon/authenticated on new public functions,
-- so revoke explicitly and grant only the service role (the Flow endpoint and
-- the WhatsApp agent), matching create_whatsapp_booking_group.
revoke all on function public.reschedule_whatsapp_booking_group(jsonb, date, uuid, uuid, uuid, uuid[], text, text, date, text, jsonb) from public;
revoke all on function public.reschedule_whatsapp_booking_group(jsonb, date, uuid, uuid, uuid, uuid[], text, text, date, text, jsonb) from anon;
revoke all on function public.reschedule_whatsapp_booking_group(jsonb, date, uuid, uuid, uuid, uuid[], text, text, date, text, jsonb) from authenticated;
grant execute on function public.reschedule_whatsapp_booking_group(jsonb, date, uuid, uuid, uuid, uuid[], text, text, date, text, jsonb) to service_role;
