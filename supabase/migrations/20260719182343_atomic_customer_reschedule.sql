-- A customer reschedule must be all-or-nothing. The previous portal path
-- created the replacement first and cancelled the original in a second RPC;
-- losing route state or either request failing could leave both visits active.
--
-- Keep an exact private receipt as well. If the browser loses the successful
-- response and retries the same command, return the committed replacement IDs
-- instead of attempting another cancellation or creating another visit.
create table if not exists smarter_dog_private.customer_reschedule_receipts (
  id uuid primary key default gen_random_uuid(),
  customer_user_id uuid not null,
  target_booking_id uuid not null,
  request_fingerprint text not null,
  request_bookings jsonb not null,
  replacement_booking_date date not null,
  reschedule_reason text not null,
  replacement_booking_ids uuid[] not null,
  cancelled_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (char_length(request_fingerprint) = 32),
  check (jsonb_typeof(request_bookings) = 'array'),
  check (cardinality(replacement_booking_ids) between 1 and 4),
  unique (
    customer_user_id,
    target_booking_id,
    request_fingerprint,
    cancelled_at
  )
);

comment on table smarter_dog_private.customer_reschedule_receipts is
  'Private idempotency receipts for committed customer reschedules. No foreign keys: later booking deletion or regrouping must not erase the exact response IDs.';

revoke all on table smarter_dog_private.customer_reschedule_receipts
  from public, anon, authenticated, service_role;

create or replace function public.reschedule_customer_booking(
  p_booking_id uuid,
  p_bookings jsonb,
  p_booking_date date,
  p_reason text
)
returns table (id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := (select auth.uid());
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_request_fingerprint text;
  v_expected_count integer;
  v_original_group_id uuid;
  v_original_booking_date date;
  v_expected_booking_ids uuid[];
  v_cancelled_count integer;
  v_cancelled_group_id uuid;
  v_cancelled_booking_ids uuid[];
  v_cancelled_at timestamptz;
  v_cancelled_scope_matches boolean;
  v_original_dog_ids uuid[];
  v_replacement_dog_ids uuid[];
  v_created_ids uuid[] := '{}'::uuid[];
  v_created_id uuid;
  v_replayed_ids uuid[];
  v_slot_list text[];
  v_lock_slot text;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if p_booking_id is null then
    raise exception 'booking_not_cancellable' using errcode = 'SDC03';
  end if;

  if v_reason is null or char_length(v_reason) > 500 then
    raise exception 'reschedule_reason_must_be_1_to_500_characters'
      using errcode = '22023';
  end if;

  if p_bookings is null or jsonb_typeof(p_bookings) <> 'array' then
    raise exception 'bookings payload must be a JSON array'
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

  -- jsonb text has deterministic key ordering, so the same semantic request
  -- produces the same compact lookup key. The exact inputs are also compared
  -- below, meaning even a theoretical MD5 collision cannot replay a different
  -- command.
  v_request_fingerprint := md5(
    jsonb_build_object(
      'target_booking_id', p_booking_id,
      'replacement_booking_date', p_booking_date,
      'reschedule_reason', v_reason,
      'bookings', p_bookings
    )::text
  );

  -- Serialise all reschedule attempts for this customer + target before the
  -- receipt lookup. A concurrent retry waits for the first transaction, then
  -- sees and replays its committed result.
  perform pg_advisory_xact_lock(
    hashtextextended(
      'customer_booking_reschedule|'
        || v_uid::text
        || '|'
        || p_booking_id::text,
      0
    )
  );

  select r.replacement_booking_ids
    into v_replayed_ids
    from smarter_dog_private.customer_reschedule_receipts r
   where r.customer_user_id = v_uid
     and r.target_booking_id = p_booking_id
     and r.request_fingerprint = v_request_fingerprint
     and r.request_bookings = p_bookings
     and r.replacement_booking_date = p_booking_date
     and r.reschedule_reason = v_reason
     and (
       not exists (
         select 1
           from public.bookings current_target
          where current_target.id = p_booking_id
       )
       or exists (
         select 1
           from public.bookings current_target
          where current_target.id = p_booking_id
            and current_target.status = 'Cancelled'
            and current_target.cancel_reason = v_reason
            and r.cancelled_at = (
              select max(cancellation_event.occurred_at)
                from public.booking_events cancellation_event
               where cancellation_event.booking_id = p_booking_id
                 and cancellation_event.event_type = 'cancelled'
            )
            and (
              select count(*)
                from public.booking_events same_event
               where same_event.booking_id = p_booking_id
                 and same_event.event_type = 'cancelled'
                 and same_event.occurred_at = r.cancelled_at
            ) = 1
       )
     )
   order by r.cancelled_at desc, r.id desc
   limit 1;

  if found then
    foreach v_created_id in array v_replayed_ids loop
      id := v_created_id;
      return next;
    end loop;
    return;
  end if;

  -- Resolve only an owned, still-active target. A different request cannot
  -- reuse the cancellation receipt from an earlier successful reschedule.
  select b.group_id, b.booking_date
    into v_original_group_id, v_original_booking_date
    from public.bookings b
    join public.dogs d on d.id = b.dog_id
    join public.humans h on h.id = d.human_id
   where b.id = p_booking_id
     and b.status = 'Booked'
     and h.customer_user_id = v_uid;

  if not found then
    raise exception 'booking_not_cancellable' using errcode = 'SDC03';
  end if;

  -- Match create_customer_booking_group's destination-lock order before the
  -- cancellation takes visit + dog locks. Re-locking these slots in the nested
  -- create call is a no-op in this transaction.
  select array_agg(distinct (e->>'slot') order by (e->>'slot'))
    into v_slot_list
    from jsonb_array_elements(p_bookings) e
   where nullif(e->>'slot', '') is not null;

  if v_slot_list is not null then
    foreach v_lock_slot in array v_slot_list loop
      perform pg_advisory_xact_lock(
        hashtextextended(p_booking_date::text || '|' || v_lock_slot, 0)
      );
    end loop;
  end if;

  -- Coordinate with ordinary customer cancellation too. Recheck after taking
  -- its visit lock so a cancellation racing this command cannot be mistaken
  -- for our own and followed by a replacement insert.
  perform pg_advisory_xact_lock(
    hashtextextended(
      'customer_booking_cancellation|'
        || coalesce(v_original_group_id, p_booking_id)::text
        || '|'
        || v_original_booking_date::text,
      0
    )
  );

  -- Freeze every row in the resolved source visit before calling the shared
  -- cancellation command. The membership advisory lock prevents a new row
  -- joining this group/date while these deterministic row locks prevent a
  -- concurrent staff move or regroup from changing the source underneath us.
  perform b.id
    from public.bookings b
   where (v_original_group_id is not null
          and b.group_id = v_original_group_id
          and b.booking_date = v_original_booking_date)
      or (v_original_group_id is null and b.id = p_booking_id)
   order by b.id
   for update;

  perform 1
    from public.bookings b
    join public.dogs d on d.id = b.dog_id
    join public.humans h on h.id = d.human_id
   where b.id = p_booking_id
     and b.status = 'Booked'
     and b.group_id is not distinct from v_original_group_id
     and b.booking_date = v_original_booking_date
     and h.customer_user_id = v_uid;

  if not found then
    raise exception 'booking_not_cancellable' using errcode = 'SDC03';
  end if;

  select coalesce(array_agg(b.id order by b.id), '{}'::uuid[])
    into v_expected_booking_ids
    from public.bookings b
   where (v_original_group_id is not null
          and b.group_id = v_original_group_id
          and b.booking_date = v_original_booking_date)
      or (v_original_group_id is null and b.id = p_booking_id);

  select
    cancellation.booking_group_id,
    cancellation.cancelled_count,
    cancellation.cancelled_booking_ids,
    cancellation.cancelled_at
    into
      v_cancelled_group_id,
      v_cancelled_count,
      v_cancelled_booking_ids,
      v_cancelled_at
    from public.cancel_customer_booking(p_booking_id, v_reason) cancellation;

  if v_cancelled_count is null or v_cancelled_count < 1 then
    raise exception 'original_booking_cancellation_failed'
      using errcode = 'SDC03';
  end if;

  -- Bind the nested command's result to the exact source snapshot. This is a
  -- second line of defence against a stale or replayed cancellation result;
  -- raising here rolls the nested cancellation back with the whole command.
  select coalesce(
           count(*) = cardinality(v_cancelled_booking_ids)
           and bool_and(b.booking_date = v_original_booking_date)
           and bool_and(b.group_id is not distinct from v_original_group_id),
           false
         )
    into v_cancelled_scope_matches
    from public.bookings b
   where b.id = any(v_cancelled_booking_ids);

  if v_cancelled_booking_ids is distinct from v_expected_booking_ids
     or v_cancelled_group_id is distinct from v_original_group_id
     or not v_cancelled_scope_matches then
    raise exception 'booking_not_cancellable' using errcode = 'SDC03';
  end if;

  -- Rescheduling changes only date, time and service. It must not silently
  -- drop a dog from a grouped groom, add a different dog, or turn a null-group
  -- singleton into a multi-dog replacement. Any error here rolls the nested
  -- cancellation and its receipt back.
  select array_agg(b.dog_id order by b.dog_id)
    into v_original_dog_ids
    from public.bookings b
   where b.id = any(v_cancelled_booking_ids);

  select array_agg((e->>'dog_id')::uuid order by (e->>'dog_id')::uuid)
    into v_replacement_dog_ids
    from jsonb_array_elements(p_bookings) e;

  if v_cancelled_count <> v_expected_count
     or v_original_dog_ids is distinct from v_replacement_dog_ids then
    raise exception 'replacement_visit_mismatch'
      using errcode = 'SDC04';
  end if;

  for v_created_id in
    select replacement.id
      from public.create_customer_booking_group(
        p_bookings,
        p_booking_date
      ) replacement
  loop
    v_created_ids := array_append(v_created_ids, v_created_id);
  end loop;

  if cardinality(v_created_ids) <> v_expected_count then
    raise exception 'replacement_booking_count_mismatch'
      using errcode = 'P0001';
  end if;

  insert into smarter_dog_private.customer_reschedule_receipts (
    customer_user_id,
    target_booking_id,
    request_fingerprint,
    request_bookings,
    replacement_booking_date,
    reschedule_reason,
    replacement_booking_ids,
    cancelled_at
  ) values (
    v_uid,
    p_booking_id,
    v_request_fingerprint,
    p_bookings,
    p_booking_date,
    v_reason,
    v_created_ids,
    v_cancelled_at
  );

  foreach v_created_id in array v_created_ids loop
    id := v_created_id;
    return next;
  end loop;

  return;
end;
$$;

comment on function public.reschedule_customer_booking(uuid, jsonb, date, text) is
  'Authenticated idempotent customer reschedule command. Locks and cancels the owned original visit, requires the exact same dogs, creates the replacement atomically, and replays the committed IDs on an exact retry.';

revoke all on function public.reschedule_customer_booking(uuid, jsonb, date, text)
  from public, anon, service_role;
grant execute on function public.reschedule_customer_booking(uuid, jsonb, date, text)
  to authenticated;
