-- Atomic, idempotent WhatsApp Flow rescheduling.
--
-- The source visit is frozen as group-or-booking + booking_date. The command
-- takes the same membership advisory lock as validate_booking_capacity before
-- deterministically locking booking rows and their dogs, then revalidates the
-- complete reviewed snapshot. Cancellation, replacement creation, receipt
-- persistence and Flow-session completion commit or roll back together.

create table if not exists public.whatsapp_reschedule_receipts (
  flow_token            text primary key,
  request_hash          text not null,
  new_booking_ids       uuid[] not null,
  cancelled_booking_ids uuid[] not null,
  created_at            timestamptz not null default now()
);

-- Remove the raw human identifier and its FK if an earlier in-development
-- revision of this migration was applied locally. Human binding is verified
-- against whatsapp_flow_sessions under the token lock instead.
alter table public.whatsapp_reschedule_receipts
  drop column if exists human_id;

alter table public.whatsapp_reschedule_receipts enable row level security;
revoke all on table public.whatsapp_reschedule_receipts
  from public, anon, authenticated, service_role;

comment on table public.whatsapp_reschedule_receipts is
  'Private immutable receipts for committed WhatsApp reschedules. No human or booking foreign keys: retention cannot block deletion and later booking deletion cannot erase replay protection. The matching Flow session supplies identity binding under the same advisory token lock.';

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

revoke all on function public.guard_whatsapp_reschedule_receipt()
  from public, anon, authenticated, service_role;

drop trigger if exists trg_guard_whatsapp_reschedule_receipt
  on public.whatsapp_reschedule_receipts;
create trigger trg_guard_whatsapp_reschedule_receipt
  before update on public.whatsapp_reschedule_receipts
  for each row execute function public.guard_whatsapp_reschedule_receipt();

-- Cancellation notifications must be held until replacement confirmation
-- notifications have been queued. Constraint triggers are the only triggers
-- that SET CONSTRAINTS can defer.
drop trigger if exists notify_booking_cancelled_trigger on public.bookings;
create constraint trigger notify_booking_cancelled_trigger
  after update on public.bookings
  deferrable initially immediate
  for each row
  when (old.status is distinct from new.status and new.status = 'Cancelled')
  execute function public.notify_on_booking_cancelled();

-- Defensive cleanup of every in-development overload, especially the prior
-- eleven-argument signature before adding the trailing exact snapshot.
drop function if exists public.reschedule_whatsapp_booking_group(
  jsonb, date, uuid, uuid, uuid, uuid[], text);
drop function if exists public.reschedule_whatsapp_booking_group(
  jsonb, date, uuid, uuid, uuid, uuid[], text, text);
drop function if exists public.reschedule_whatsapp_booking_group(
  jsonb, date, uuid, uuid, uuid, uuid[], text, text, date, text, jsonb);
drop function if exists public.reschedule_whatsapp_booking_group(
  jsonb, date, uuid, uuid, uuid, uuid[], text, text, date, text, jsonb, jsonb);

create function public.reschedule_whatsapp_booking_group(
  p_bookings             jsonb,
  p_booking_date         date,
  p_human_id             uuid,
  p_old_group_id         uuid    default null,
  p_old_booking_id       uuid    default null,
  p_expected_old_ids     uuid[]  default null,
  p_reason               text    default 'Rescheduled via WhatsApp',
  p_flow_token           text    default null,
  p_expected_old_date    date    default null,
  p_expected_old_slot    text    default null,
  p_expected_services    jsonb   default null,
  p_expected_old_snapshot jsonb  default null
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
  v_token                 text := p_flow_token;
  v_reason                text := left(coalesce(p_reason, 'Rescheduled via WhatsApp'), 500);
  v_request_hash          text;
  v_canonical_bookings    jsonb;
  v_canonical_snapshot    jsonb;
  v_canonical_ids         uuid[];
  v_prior_hash            text;
  v_prior_new_ids         uuid[];
  v_prior_cancelled_ids   uuid[];
  v_session_human_id      uuid;
  v_session_type          text;
  v_session_status        text;
  v_session_expires_at    timestamptz;
  v_anchor_booking_id     uuid;
  v_anchor_group_id       uuid;
  v_source_group_id       uuid;
  v_source_date           date;
  v_scope_count           integer;
  v_owned_count           integer;
  v_booked_count          integer;
  v_anchor_count          integer;
  v_expected_count        integer;
  v_old_ids               uuid[];
  v_old_dog_ids           uuid[];
  v_replacement_dog_ids   uuid[];
  v_live_snapshot         jsonb;
  v_live_slot             text;
  v_live_services         jsonb;
  v_cancelled_ids         uuid[];
  v_created_ids           uuid[];
  v_lock_keys             text[];
  v_lock_key              text;
  v_updated_count         integer;
begin
  if p_human_id is null then
    raise exception 'human_id is required' using errcode = '22023';
  end if;
  if p_flow_token is null or btrim(p_flow_token) = '' then
    raise exception 'flow_token is required' using errcode = '22023';
  end if;
  if p_old_group_id is null and p_old_booking_id is null then
    raise exception 'the old visit must be identified by group id or booking id'
      using errcode = '22023';
  end if;
  if p_bookings is null or jsonb_typeof(p_bookings) <> 'array' then
    raise exception 'bookings payload must be a JSON array'
      using errcode = '22023';
  end if;
  if p_expected_old_ids is null then
    raise exception 'expected_old_ids is required'
      using errcode = '22023';
  end if;
  if cardinality(p_expected_old_ids) = 0 then
    raise exception 'expected_old_ids must not be empty'
      using errcode = '22023';
  end if;
  if p_expected_old_snapshot is null then
    raise exception 'expected_old_snapshot is required'
      using errcode = '22023';
  end if;
  if jsonb_typeof(p_expected_old_snapshot) <> 'array' then
    raise exception 'expected old snapshot must be a JSON array'
      using errcode = '22023';
  end if;
  if jsonb_array_length(p_expected_old_snapshot) = 0 then
    raise exception 'expected_old_snapshot must not be empty'
      using errcode = '22023';
  end if;

  v_expected_count := jsonb_array_length(p_bookings);
  if v_expected_count < 1 or v_expected_count > 4 then
    raise exception 'A booking group must have between 1 and 4 dogs (got %)',
      v_expected_count using errcode = '22023';
  end if;
  if p_booking_date is null then
    raise exception 'booking_date is required' using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(e order by
           coalesce(e->>'dog_id', ''),
           coalesce(e->>'slot', ''),
           coalesce(e->>'service', ''),
           e::text), '[]'::jsonb)
    into v_canonical_bookings
    from jsonb_array_elements(p_bookings) e;

  select coalesce(array_agg(id order by id), '{}'::uuid[])
    into v_canonical_ids
    from unnest(coalesce(p_expected_old_ids, '{}'::uuid[])) id;

  select coalesce(jsonb_agg(e order by
           coalesce(e->>'booking_id', ''), e::text), '[]'::jsonb)
    into v_canonical_snapshot
    from jsonb_array_elements(coalesce(p_expected_old_snapshot, '[]'::jsonb)) e;

  -- JSONB object text is canonical for key order. Arrays that are sets are
  -- sorted above, so semantically identical redeliveries share one hash while
  -- reviewed IDs, cancellation reason, exact row snapshot and destination
  -- payload are all bound.
  v_request_hash := md5(jsonb_build_object(
    'version', 2,
    'bookings', v_canonical_bookings,
    'booking_date', p_booking_date,
    'human_id', p_human_id,
    'old_group_id', p_old_group_id,
    'old_booking_id', p_old_booking_id,
    'expected_old_ids', v_canonical_ids,
    'reason', v_reason,
    'expected_old_date', p_expected_old_date,
    'expected_old_slot', p_expected_old_slot,
    'expected_services', p_expected_services,
    'expected_old_snapshot', v_canonical_snapshot
  )::text);

  -- 1. Token advisory lock.
  perform pg_advisory_xact_lock(
    hashtextextended('wa_resched|' || v_token, 0)
  );

  -- 2. Flow session row lock and identity/type binding. Completed sessions are
  -- allowed through this lookup so an existing receipt can still replay.
  select fs.human_id, fs.flow_type, fs.status, fs.expires_at
    into v_session_human_id, v_session_type, v_session_status, v_session_expires_at
    from public.whatsapp_flow_sessions fs
   where fs.flow_token = v_token
   for update;

  if not found
     or v_session_human_id is distinct from p_human_id
     or v_session_type is distinct from 'cancel_reschedule' then
    raise exception 'reschedule_flow_session_mismatch' using errcode = 'P0002';
  end if;

  select r.request_hash, r.new_booking_ids, r.cancelled_booking_ids
    into v_prior_hash, v_prior_new_ids, v_prior_cancelled_ids
    from public.whatsapp_reschedule_receipts r
   where r.flow_token = v_token;

  if found then
    if v_prior_hash <> v_request_hash then
      raise exception 'reschedule_idempotency_conflict' using errcode = 'P0002';
    end if;
    new_booking_ids := v_prior_new_ids;
    cancelled_booking_ids := v_prior_cancelled_ids;
    replayed := true;
    return next;
    return;
  end if;

  -- Receipt pruning never reopens a completed Flow, regardless of the legacy
  -- representative booking_id marker.
  if v_session_status = 'completed' then
    raise exception 'reschedule_already_completed' using errcode = 'P0002',
      detail = 'this completed Flow receipt has been pruned';
  end if;
  if v_session_status <> 'active' or v_session_expires_at <= now() then
    raise exception 'reschedule_flow_session_mismatch' using errcode = 'P0002';
  end if;

  -- Resolve a real anchor before taking the membership lock. This read is
  -- intentionally provisional and is revalidated after every blocking lock.
  if p_old_booking_id is not null then
    select b.id, b.group_id, b.booking_date
      into v_anchor_booking_id, v_anchor_group_id, v_source_date
      from public.bookings b
     where b.id = p_old_booking_id;
  elsif cardinality(v_canonical_ids) > 0 then
    select b.id, b.group_id, b.booking_date
      into v_anchor_booking_id, v_anchor_group_id, v_source_date
      from unnest(v_canonical_ids) expected(id)
      join public.bookings b on b.id = expected.id
     where p_old_group_id is null or b.group_id = p_old_group_id
     order by b.id
     limit 1;
  elsif jsonb_array_length(v_canonical_snapshot) > 0 then
    select b.id, b.group_id, b.booking_date
      into v_anchor_booking_id, v_anchor_group_id, v_source_date
      from jsonb_array_elements(v_canonical_snapshot) snap
      join public.bookings b on b.id = nullif(snap->>'booking_id', '')::uuid
     where p_old_group_id is null or b.group_id = p_old_group_id
     order by b.id
     limit 1;
  elsif p_expected_old_date is not null then
    select b.id, b.group_id, b.booking_date
      into v_anchor_booking_id, v_anchor_group_id, v_source_date
      from public.bookings b
     where b.group_id = p_old_group_id
       and b.booking_date = p_expected_old_date
     order by b.id
     limit 1;
  else
    select b.id, b.group_id, b.booking_date
      into v_anchor_booking_id, v_anchor_group_id, v_source_date
      from public.bookings b
     where b.group_id = p_old_group_id
     order by b.booking_date, b.id
     limit 1;
  end if;

  if v_anchor_booking_id is null then
    raise exception 'reschedule_old_visit_unavailable' using errcode = 'P0002';
  end if;
  v_source_group_id := coalesce(p_old_group_id, v_anchor_group_id);

  -- 3. Exact group-or-booking + source-date membership advisory lock. This is
  -- the key validate_booking_capacity takes on INSERT and membership changes.
  perform pg_advisory_xact_lock(
    hashtextextended(
      'customer_booking_cancellation|'
        || coalesce(v_source_group_id, v_anchor_booking_id)::text
        || '|'
        || v_source_date::text,
      0
    )
  );

  -- 4. Deterministic booking locks over the entire scope, including rows that
  -- are cancelled or belong to another owner; those facts are checked only
  -- after the lock set is stable.
  perform b.id
    from public.bookings b
   where (v_source_group_id is not null
          and b.group_id = v_source_group_id
          and b.booking_date = v_source_date)
      or (v_source_group_id is null and b.id = v_anchor_booking_id)
   order by b.id
   for update;

  -- 5. Deterministic dog locks prevent an ownership reassignment between
  -- validation and mutation.
  perform d.id
    from public.dogs d
   where d.id in (
     select b.dog_id
       from public.bookings b
      where (v_source_group_id is not null
             and b.group_id = v_source_group_id
             and b.booking_date = v_source_date)
         or (v_source_group_id is null and b.id = v_anchor_booking_id)
   )
   order by d.id
   for update;

  select
    count(*)::integer,
    count(*) filter (where d.human_id = p_human_id)::integer,
    count(*) filter (where b.status = 'Booked')::integer,
    count(*) filter (
      where b.id = v_anchor_booking_id
        and b.group_id is not distinct from v_anchor_group_id
        and b.booking_date = v_source_date
    )::integer,
    coalesce(array_agg(b.id order by b.id), '{}'::uuid[]),
    coalesce(array_agg(b.dog_id order by b.dog_id), '{}'::uuid[]),
    coalesce(jsonb_agg(
      jsonb_build_object(
        'booking_id', b.id,
        'dog_id', b.dog_id,
        'booking_date', b.booking_date,
        'slot', b.slot,
        'service', b.service
      ) order by b.id
    ), '[]'::jsonb),
    min(b.slot),
    coalesce(jsonb_object_agg(b.dog_id::text, b.service), '{}'::jsonb)
    into
      v_scope_count,
      v_owned_count,
      v_booked_count,
      v_anchor_count,
      v_old_ids,
      v_old_dog_ids,
      v_live_snapshot,
      v_live_slot,
      v_live_services
    from public.bookings b
    join public.dogs d on d.id = b.dog_id
   where (v_source_group_id is not null
          and b.group_id = v_source_group_id
          and b.booking_date = v_source_date)
      or (v_source_group_id is null and b.id = v_anchor_booking_id);

  if v_scope_count = 0
     or v_owned_count <> v_scope_count
     or v_booked_count <> v_scope_count
     or v_anchor_count <> 1
     or (p_old_group_id is not null
         and v_anchor_group_id is distinct from p_old_group_id) then
    raise exception 'reschedule_old_visit_unavailable' using errcode = 'P0002';
  end if;

  if p_expected_old_ids is not null
     and v_old_ids is distinct from v_canonical_ids then
    raise exception 'reschedule_old_visit_changed' using errcode = 'P0002';
  end if;
  if p_expected_old_date is not null
     and v_source_date is distinct from p_expected_old_date then
    raise exception 'reschedule_old_visit_changed' using errcode = 'P0002';
  end if;
  if p_expected_old_slot is not null
     and v_live_slot is distinct from p_expected_old_slot then
    raise exception 'reschedule_old_visit_changed' using errcode = 'P0002';
  end if;
  if p_expected_services is not null
     and v_live_services is distinct from p_expected_services then
    raise exception 'reschedule_old_visit_changed' using errcode = 'P0002';
  end if;
  if p_expected_old_snapshot is not null
     and v_live_snapshot is distinct from v_canonical_snapshot then
    raise exception 'reschedule_old_visit_changed' using errcode = 'P0002';
  end if;

  -- A reschedule is a complete replacement: exactly the same dog set and row
  -- cardinality, with no duplicate destination dog.
  select coalesce(array_agg((e->>'dog_id')::uuid order by (e->>'dog_id')::uuid),
                  '{}'::uuid[])
    into v_replacement_dog_ids
    from jsonb_array_elements(p_bookings) e;

  if cardinality(v_old_dog_ids) <> v_expected_count
     or cardinality(v_replacement_dog_ids) <> v_expected_count
     or cardinality(array(select distinct unnest(v_replacement_dog_ids)))
          <> v_expected_count
     or v_old_dog_ids is distinct from v_replacement_dog_ids then
    raise exception 'reschedule_replacement_dog_mismatch'
      using errcode = 'P0002';
  end if;

  -- 6. Old and destination capacity locks in one sorted order.
  select array_agg(distinct key order by key)
    into v_lock_keys
    from (
      select b.booking_date::text || '|' || b.slot as key
        from public.bookings b
       where b.id = any(v_old_ids)
      union
      select p_booking_date::text || '|' || (e->>'slot')
        from jsonb_array_elements(p_bookings) e
       where nullif(e->>'slot', '') is not null
    ) locks;

  if v_lock_keys is not null then
    foreach v_lock_key in array v_lock_keys loop
      perform pg_advisory_xact_lock(hashtextextended(v_lock_key, 0));
    end loop;
  end if;

  -- Queue confirmations before cancellations. The cancellation constraint
  -- trigger remains deferred until replacement creation and cardinality
  -- checks have succeeded; any exception rolls every notification row back.
  set constraints notify_booking_cancelled_trigger deferred;

  with cancelled as (
    update public.bookings b
       set status = 'Cancelled',
           cancel_reason = v_reason
     where b.id = any(v_old_ids)
       and b.status = 'Booked'
    returning b.id
  )
  select coalesce(array_agg(id order by id), '{}'::uuid[])
    into v_cancelled_ids
    from cancelled;

  if v_cancelled_ids is distinct from v_old_ids then
    raise exception 'reschedule_old_visit_unavailable' using errcode = 'P0002';
  end if;

  select coalesce(array_agg(created.id order by created.id), '{}'::uuid[])
    into v_created_ids
    from public.create_whatsapp_booking_group(
      p_bookings,
      p_booking_date,
      p_human_id
    ) created;

  if cardinality(v_created_ids) <> v_expected_count
     or cardinality(array(select distinct unnest(v_created_ids)))
          <> v_expected_count then
    raise exception 'reschedule_replacement_booking_count_mismatch'
      using errcode = 'P0002';
  end if;

  set constraints notify_booking_cancelled_trigger immediate;

  insert into public.whatsapp_reschedule_receipts (
    flow_token,
    request_hash,
    new_booking_ids,
    cancelled_booking_ids
  ) values (
    v_token,
    v_request_hash,
    v_created_ids,
    v_cancelled_ids
  );

  update public.whatsapp_flow_sessions fs
     set status = 'completed',
         booking_id = v_created_ids[1],
         updated_at = now()
   where fs.flow_token = v_token
     and fs.human_id = p_human_id
     and fs.flow_type = 'cancel_reschedule'
     and fs.status = 'active';
  get diagnostics v_updated_count = row_count;

  if v_updated_count <> 1 then
    raise exception 'reschedule_flow_session_mismatch' using errcode = 'P0002';
  end if;

  new_booking_ids := v_created_ids;
  cancelled_booking_ids := v_cancelled_ids;
  replayed := false;
  return next;
end;
$$;

comment on function public.reschedule_whatsapp_booking_group(
  jsonb, date, uuid, uuid, uuid, uuid[], text, text, date, text, jsonb, jsonb
) is
  'Service-role WhatsApp reschedule command. Binds a nonblank token to an active cancel_reschedule session, freezes exact group/date membership and dog ownership, verifies the reviewed snapshot and exact replacement dog set, then atomically cancels, creates, receipts and completes the Flow.';

revoke all on function public.reschedule_whatsapp_booking_group(
  jsonb, date, uuid, uuid, uuid, uuid[], text, text, date, text, jsonb, jsonb
) from public, anon, authenticated;
grant execute on function public.reschedule_whatsapp_booking_group(
  jsonb, date, uuid, uuid, uuid, uuid[], text, text, date, text, jsonb, jsonb
) to service_role;

-- Private service-role replay lookup used by the endpoint before it trusts a
-- stale in-memory active session or rejects a completed/expired delivery.
create or replace function public.replay_whatsapp_reschedule_receipt(
  p_flow_token text,
  p_human_id uuid
)
returns table (
  new_booking_ids uuid[],
  cancelled_booking_ids uuid[]
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_token text := p_flow_token;
  v_bound_human_id uuid;
  v_flow_type text;
begin
  if p_flow_token is null or btrim(p_flow_token) = '' then
    raise exception 'flow_token is required' using errcode = '22023';
  end if;
  if p_human_id is null then
    raise exception 'human_id is required' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('wa_resched|' || v_token, 0)
  );

  select fs.human_id, fs.flow_type
    into v_bound_human_id, v_flow_type
    from public.whatsapp_flow_sessions fs
   where fs.flow_token = v_token
   for update;

  if not found
     or v_bound_human_id is distinct from p_human_id
     or v_flow_type is distinct from 'cancel_reschedule' then
    raise exception 'reschedule_flow_session_mismatch' using errcode = 'P0002';
  end if;

  return query
  select r.new_booking_ids, r.cancelled_booking_ids
    from public.whatsapp_reschedule_receipts r
   where r.flow_token = v_token;
end;
$$;

comment on function public.replay_whatsapp_reschedule_receipt(text, uuid) is
  'Service-role receipt replay. Takes the writer token lock and verifies Flow-session human binding before returning private multi-row replacement IDs.';

revoke all on function public.replay_whatsapp_reschedule_receipt(text, uuid)
  from public, anon, authenticated;
grant execute on function public.replay_whatsapp_reschedule_receipt(text, uuid)
  to service_role;
