-- Owner decision #930: allow cancellation inside the notice window, record
-- late customer cancellations once per appointment, review deposits at three
-- within 12 calendar months. No dormant visit-policy activation.

alter table public.bookings add column cancellation_cause text
  check (cancellation_cause in ('customer','salon','reschedule','system'));
comment on column public.bookings.cancellation_cause is
  'Explicit cause of cancellation; actor is separate. Null/legacy/system/salon/reschedule cancellations do not create customer strikes.';

create or replace function smarter_dog_private.cancel_booking_impl(
  p_booking_id uuid,
  p_reason text,
  p_enforce_notice boolean
)
returns table (
  target_booking_id uuid,
  booking_group_id uuid,
  cancelled_booking_ids uuid[],
  cancelled_count integer,
  cancelled_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := (select auth.uid());
  v_human_id uuid;
  v_group_id uuid;
  v_booking_date date;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_scope_count integer;
  v_owned_count integer;
  v_booked_count integer;
  v_target_scope_matches boolean;
  v_booking_ids uuid[];
  v_earliest_start timestamp without time zone;
  v_settings jsonb := '{}'::jsonb;
  v_settings_count integer;
  v_allow_value jsonb;
  v_hours_value jsonb;
  v_allow_cancellations boolean := true;
  v_min_cancellation_hours numeric := 24;
  v_cancelled_count integer;
  v_cancelled_at timestamptz := now();
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if p_booking_id is null then
    raise exception 'booking_not_cancellable' using errcode = 'SDC03';
  end if;

  if v_reason is null or char_length(v_reason) > 500 then
    raise exception 'cancellation_reason_must_be_1_to_500_characters'
      using errcode = '22023';
  end if;

  select h.id
    into v_human_id
    from public.humans h
   where h.customer_user_id = v_uid
   limit 1;

  if v_human_id is null then
    raise exception 'no_linked_human' using errcode = '28000';
  end if;

  -- BEGIN: durable cancellation receipt replay
  -- A committed receipt belongs to the authenticated customer, exact target
  -- and normalised reason. Return it before reconstructing current group
  -- membership so later regrouping or deletion cannot shrink the original ID
  -- set. A currently reactivated or differently cancelled target suppresses
  -- replay so a new lifecycle cannot be mistaken for the old cancellation.
  select
    r.booking_group_id,
    r.cancelled_booking_ids,
    r.cancelled_count,
    r.cancelled_at
  into
    booking_group_id,
    cancelled_booking_ids,
    cancelled_count,
    cancelled_at
  from smarter_dog_private.customer_cancellation_receipts r
  where r.customer_user_id = v_uid
    and r.target_booking_id = p_booking_id
    and r.cancel_reason = v_reason
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
    target_booking_id := p_booking_id;
    return next;
    return;
  end if;
  -- END: durable cancellation receipt replay

  -- Resolve only an owned target. A missing target and another customer's
  -- target deliberately produce the same non-disclosing outcome.
  select b.group_id, b.booking_date
    into v_group_id, v_booking_date
    from public.bookings b
    join public.dogs d on d.id = b.dog_id
   where b.id = p_booking_id
     and d.human_id = v_human_id;

  if not found then
    raise exception 'booking_not_cancellable' using errcode = 'SDC03';
  end if;

  -- Serialise cancellation attempts for one stored visit. Recurring staff
  -- bookings reuse group_id across dates, so the visit key includes the
  -- target date as well as its group (or singleton target) identifier.
  perform pg_advisory_xact_lock(
    hashtextextended(
      'customer_booking_cancellation|'
        || coalesce(v_group_id, p_booking_id)::text
        || '|'
        || v_booking_date::text,
      0
    )
  );

  -- Lock every scoped row in deterministic order before checking status or
  -- ownership. Revalidation after the advisory lock closes the gap between
  -- resolving the target and taking row locks.
  perform b.id
    from public.bookings b
   where (v_group_id is not null
          and b.group_id = v_group_id
          and b.booking_date = v_booking_date)
      or (v_group_id is null and b.id = p_booking_id)
   order by b.id
   for update;

  -- Ownership lives on dogs, not bookings. Hold those rows as well so a staff
  -- merge cannot reassign a scoped dog after validation but before mutation.
  perform d.id
    from public.dogs d
    join public.bookings b on b.dog_id = d.id
   where (v_group_id is not null
          and b.group_id = v_group_id
          and b.booking_date = v_booking_date)
      or (v_group_id is null and b.id = p_booking_id)
   order by d.id
   for update of d;

  select
    count(*)::integer,
    count(*) filter (where d.human_id = v_human_id)::integer,
    count(*) filter (where b.status = 'Booked')::integer,
    coalesce(
      bool_or(
        b.id = p_booking_id
        and b.group_id is not distinct from v_group_id
        and b.booking_date is not distinct from v_booking_date
      ),
      false
    ),
    coalesce(array_agg(b.id order by b.id), '{}'::uuid[]),
    min(b.booking_date + b.slot::time)
  into
    v_scope_count,
    v_owned_count,
    v_booked_count,
    v_target_scope_matches,
    v_booking_ids,
    v_earliest_start
  from public.bookings b
  left join public.dogs d on d.id = b.dog_id
  where (v_group_id is not null
         and b.group_id = v_group_id
         and b.booking_date = v_booking_date)
     or (v_group_id is null and b.id = p_booking_id);

  if v_scope_count < 1
     or not v_target_scope_matches
     or v_owned_count <> v_scope_count
     or v_earliest_start is null then
    raise exception 'booking_not_cancellable' using errcode = 'SDC03';
  end if;

  if v_booked_count <> v_scope_count then
    -- A duplicate request can begin before the first transaction commits and
    -- therefore miss the early replay lookup. The shared visit lock above
    -- makes the committed receipt visible here before returning failure.
    select
      r.booking_group_id,
      r.cancelled_booking_ids,
      r.cancelled_count,
      r.cancelled_at
    into
      booking_group_id,
      cancelled_booking_ids,
      cancelled_count,
      cancelled_at
    from smarter_dog_private.customer_cancellation_receipts r
    where r.customer_user_id = v_uid
      and r.target_booking_id = p_booking_id
      and r.cancel_reason = v_reason
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
      target_booking_id := p_booking_id;
      return next;
      return;
    end if;

    raise exception 'booking_not_cancellable' using errcode = 'SDC03';
  end if;

  select count(*)::integer,
         coalesce(
           (array_agg(sc.settings order by sc.id))[1],
           '{}'::jsonb
         )
    into v_settings_count, v_settings
    from public.salon_config sc;

  if v_settings_count > 1 then
    raise exception 'online_cancellation_disabled'
      using errcode = 'SDC01',
            detail = 'salon_config_not_singleton',
            hint = 'contact_staff';
  end if;

  if v_settings_count = 0 or jsonb_typeof(v_settings) <> 'object' then
    v_settings := '{}'::jsonb;
  end if;

  -- Treat malformed or missing values as the documented defaults rather
  -- than allowing a JSON cast error to escape to a customer.
  v_allow_value := v_settings #> '{customerPortal,allowCancellations}';
  if jsonb_typeof(v_allow_value) = 'boolean' then
    v_allow_cancellations := v_allow_value = 'true'::jsonb;
  end if;

  if not v_allow_cancellations then
    raise exception 'online_cancellation_disabled'
      using errcode = 'SDC01',
            detail = 'customerPortal.allowCancellations=false',
            hint = 'contact_staff';
  end if;

  v_hours_value := v_settings -> 'minCancellationHours';
  if jsonb_typeof(v_hours_value) = 'number'
     and (v_hours_value #>> '{}') ~ '^[0-9]+([.][0-9]+)?$' then
    begin
      v_min_cancellation_hours := (v_hours_value #>> '{}')::numeric;
      if v_min_cancellation_hours > 876000 then
        v_min_cancellation_hours := 24;
      end if;
    exception
      when numeric_value_out_of_range or invalid_text_representation then
        v_min_cancellation_hours := 24;
    end;
  end if;

  -- Work entirely in London wall time. Exactly on the deadline remains
  -- cancellable; only a request made after it is rejected.
  if p_enforce_notice and (now() at time zone 'Europe/London')
       > v_earliest_start - (v_min_cancellation_hours * interval '1 hour') then
    raise exception 'cancellation_deadline_passed'
      using errcode = 'SDC02', hint = 'contact_staff';
  end if;

  if not p_enforce_notice and (now() at time zone 'Europe/London') >= v_earliest_start then
    raise exception 'appointment_already_started' using errcode = 'SDC03';
  end if;

  update public.bookings b
     set status = 'Cancelled',
         cancellation_cause = case when p_enforce_notice then 'reschedule' else 'customer' end,
         cancel_reason = v_reason
   where b.id = any(v_booking_ids)
     and b.status = 'Booked';

  get diagnostics v_cancelled_count = row_count;

  if v_cancelled_count <> v_scope_count then
    raise exception 'booking_not_cancellable' using errcode = 'SDC03';
  end if;

  insert into smarter_dog_private.customer_cancellation_receipts (
    customer_user_id,
    target_booking_id,
    booking_group_id,
    cancel_reason,
    cancelled_booking_ids,
    cancelled_count,
    cancelled_at
  ) values (
    v_uid,
    p_booking_id,
    v_group_id,
    v_reason,
    v_booking_ids,
    v_cancelled_count,
    v_cancelled_at
  );

  target_booking_id := p_booking_id;
  booking_group_id := v_group_id;
  cancelled_booking_ids := v_booking_ids;
  cancelled_count := v_cancelled_count;
  cancelled_at := v_cancelled_at;
  return next;
end;
$$;


revoke all on function smarter_dog_private.cancel_booking_impl(uuid,text,boolean)
  from public, anon, authenticated, service_role;

create or replace function public.cancel_customer_booking(p_booking_id uuid, p_reason text)
returns table (target_booking_id uuid, booking_group_id uuid, cancelled_booking_ids uuid[],
  cancelled_count integer, cancelled_at timestamptz)
language sql security definer set search_path = public, pg_temp as $$
  select * from smarter_dog_private.cancel_booking_impl(p_booking_id, p_reason, false);
$$;
revoke all on function public.cancel_customer_booking(uuid,text) from public,anon,authenticated;
grant execute on function public.cancel_customer_booking(uuid,text) to authenticated;
create or replace function public.reschedule_customer_booking_direct_unchecked(
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
    from smarter_dog_private.cancel_booking_impl(p_booking_id, v_reason, true) cancellation;

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


-- No foreign keys: editing/deleting a booking must not erase its incident.
create table smarter_dog_private.late_cancellation_history (
  id uuid primary key default gen_random_uuid(),
  human_id uuid not null,
  appointment_key uuid not null,
  booking_date date not null,
  booking_ids uuid[] not null,
  appointment_start timestamptz not null,
  notice_deadline timestamptz not null,
  requested_at timestamptz not null,
  reason text not null,
  actor_id uuid,
  actor_scope text not null,
  waived_at timestamptz,
  waived_by uuid,
  waiver_reason text,
  check ((waived_at is null and waived_by is null and waiver_reason is null)
    or (waived_at is not null and waived_by is not null and length(trim(waiver_reason)) between 1 and 500)),
  check (requested_at > notice_deadline),
  unique (human_id, appointment_key, booking_date)
);
revoke all on table smarter_dog_private.late_cancellation_history from public,anon,authenticated,service_role;
create index late_cancellation_history_customer_time on smarter_dog_private.late_cancellation_history(human_id,requested_at desc);

create table smarter_dog_private.late_cancellation_history_audit (
  id bigint generated always as identity primary key,
  incident_id uuid not null,
  actor_id uuid,
  occurred_at timestamptz not null default now(),
  action text not null,
  before_state jsonb,
  after_state jsonb not null
);
revoke all on table smarter_dog_private.late_cancellation_history_audit from public,anon,authenticated,service_role;

create or replace function smarter_dog_private.cancellation_notice_hours()
returns numeric language plpgsql stable security definer set search_path = public,pg_temp as $$
declare v_value jsonb; v_hours numeric := 24; v_count integer;
begin
  select count(*) into v_count from public.salon_config;
  if v_count>1 then raise exception 'cancellation_settings_ambiguous'; end if;
  select settings->'minCancellationHours' into v_value from public.salon_config;
  if jsonb_typeof(v_value)='number' and (v_value#>>'{}') ~ '^[0-9]+([.][0-9]+)?$' then
    begin
      v_hours := (v_value#>>'{}')::numeric;
      if v_hours > 876000 then v_hours := 24; end if;
    exception when numeric_value_out_of_range or invalid_text_representation then v_hours := 24;
    end;
  end if;
  return v_hours;
end; $$;
revoke all on function smarter_dog_private.cancellation_notice_hours() from public,anon,authenticated,service_role;

create or replace function smarter_dog_private.audit_late_cancellation()
returns trigger language plpgsql security definer set search_path = public,pg_temp as $$
begin
  insert into smarter_dog_private.late_cancellation_history_audit(incident_id,actor_id,action,before_state,after_state)
  values(new.id,auth.uid(),case when tg_op='INSERT' then 'recorded' else 'corrected' end,
    case when tg_op='UPDATE' then to_jsonb(old) else null end,to_jsonb(new));
  return new;
end; $$;
revoke all on function smarter_dog_private.audit_late_cancellation() from public,anon,authenticated,service_role;
create trigger audit_late_cancellation after insert or update on smarter_dog_private.late_cancellation_history
  for each row execute function smarter_dog_private.audit_late_cancellation();

create or replace function smarter_dog_private.record_late_cancellation()
returns trigger language plpgsql security definer set search_path = public,pg_temp as $$
declare
  v_human uuid; v_key uuid; v_start timestamp; v_deadline timestamp; v_actor uuid := auth.uid();
begin
  -- An audited staff undo removes the strike only once every affected row is restored.
  if old.status='Cancelled' and new.status in ('Booked','Reconfirmed') and public.is_staff() then
    update smarter_dog_private.late_cancellation_history h
      set waived_at=now(),waived_by=v_actor,waiver_reason='Customer cancellation undone by staff'
      where old.id=any(h.booking_ids) and h.waived_at is null and not exists
        (select 1 from public.bookings b where b.id=any(h.booking_ids) and b.status='Cancelled' and b.cancellation_cause='customer');
    return new;
  end if;
  -- Only an explicitly customer-caused committed cancellation is a strike.
  if old.status is not distinct from new.status or new.status <> 'Cancelled'
    or new.cancellation_cause is distinct from 'customer' then return new; end if;
  if old.status not in ('Booked','Reconfirmed') then return new; end if;
  if nullif(trim(new.cancel_reason),'') is null or length(new.cancel_reason)>500 then
    raise exception 'customer_cancellation_reason_required' using errcode='22023';
  end if;
  select human_id into v_human from public.dogs where id=old.dog_id;
  if v_human is null then raise exception 'customer_cancellation_owner_required'; end if;
  v_key := coalesce(old.group_id,old.id);
  select min(b.booking_date+b.slot::time) into v_start from public.bookings b
    where ((old.group_id is not null and b.group_id=old.group_id and b.booking_date=old.booking_date)
      or (old.group_id is null and b.id=old.id));
  v_deadline := v_start - smarter_dog_private.cancellation_notice_hours()*interval '1 hour';
  if now() >= (v_start at time zone 'Europe/London') and not public.is_staff() then
    raise exception 'appointment_already_started' using errcode='SDC03';
  end if;
  if now() <= (v_deadline at time zone 'Europe/London') or now() >= (v_start at time zone 'Europe/London') then return new; end if;
  insert into smarter_dog_private.late_cancellation_history as existing
    (human_id,appointment_key,booking_date,booking_ids,appointment_start,notice_deadline,requested_at,reason,actor_id,actor_scope)
  values(v_human,v_key,old.booking_date,array[old.id],v_start at time zone 'Europe/London',
    v_deadline at time zone 'Europe/London',now(),trim(new.cancel_reason),v_actor,
    case when public.is_staff() then 'staff_customer_request' when v_actor is null then 'customer_whatsapp' else 'customer' end)
  on conflict(human_id,appointment_key,booking_date) do update set booking_ids =
    (select array_agg(distinct id order by id) from unnest(existing.booking_ids || excluded.booking_ids) id),
    waived_at=null,waived_by=null,waiver_reason=null,
    requested_at=case when existing.waived_at is not null then excluded.requested_at else existing.requested_at end,
    reason=case when existing.waived_at is not null then excluded.reason else existing.reason end,
    appointment_start=case when existing.waived_at is not null then excluded.appointment_start else existing.appointment_start end,
    notice_deadline=case when existing.waived_at is not null then excluded.notice_deadline else existing.notice_deadline end,
    actor_id=case when existing.waived_at is not null then excluded.actor_id else existing.actor_id end,
    actor_scope=case when existing.waived_at is not null then excluded.actor_scope else existing.actor_scope end
    where existing.waived_at is not null or not (excluded.booking_ids <@ existing.booking_ids);
  return new;
end; $$;
revoke all on function smarter_dog_private.record_late_cancellation() from public,anon,authenticated,service_role;
create trigger record_late_customer_cancellation after update of status on public.bookings
  for each row execute function smarter_dog_private.record_late_cancellation();

-- Staff may correct an incident with a reason; the original snapshot and audit survive.
create or replace function public.waive_late_cancellation(p_incident_id uuid,p_reason text)
returns void language plpgsql security definer set search_path = public,pg_temp as $$
begin
  if not coalesce(public.is_staff(),false) then raise exception 'staff_only' using errcode='42501'; end if;
  if nullif(trim(p_reason),'') is null or length(p_reason)>500 then raise exception 'waiver_reason_required' using errcode='22023'; end if;
  update smarter_dog_private.late_cancellation_history set waived_at=now(),waived_by=auth.uid(),waiver_reason=trim(p_reason)
    where id=p_incident_id and waived_at is null;
  if not found then raise exception 'incident_missing_or_already_waived'; end if;
end; $$;
revoke all on function public.waive_late_cancellation(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.waive_late_cancellation(uuid,text) to authenticated;

create or replace function public.staff_customer_cancellation_history(p_human_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public,pg_temp as $$
declare v_count integer; v_items jsonb;
begin
  if not coalesce(public.is_staff(),false) then raise exception 'staff_only' using errcode='42501'; end if;
  select count(*)::integer into v_count from smarter_dog_private.late_cancellation_history
    where human_id=p_human_id and waived_at is null and requested_at >= ((now() at time zone 'Europe/London')-interval '12 months') at time zone 'Europe/London';
  select coalesce(jsonb_agg(to_jsonb(i) order by i.requested_at desc),'[]'::jsonb) into v_items from
    (select id,booking_date,appointment_start,notice_deadline,requested_at,reason,actor_scope,waived_at,waiver_reason
      from smarter_dog_private.late_cancellation_history where human_id=p_human_id order by requested_at desc limit 50) i;
  return jsonb_build_object('count',v_count,'windowMonths',12,'reviewRequired',v_count>=3,'items',v_items);
end; $$;
revoke all on function public.staff_customer_cancellation_history(uuid) from public,anon,authenticated,service_role;
grant execute on function public.staff_customer_cancellation_history(uuid) to authenticated;

-- Clearing provenance on restoration prevents a future unattributed staff/system
-- cancellation from reusing the old customer cause.
create or replace function smarter_dog_private.clear_cancellation_cause()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.status <> 'Cancelled' then new.cancellation_cause := null; end if;
  return new;
end; $$;
revoke all on function smarter_dog_private.clear_cancellation_cause() from public,anon,authenticated,service_role;
create trigger clear_cancellation_cause before update of status on public.bookings
  for each row execute function smarter_dog_private.clear_cancellation_cause();

create or replace function public.current_customer_booking_rules()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'intakeEnabled', s.customer_intake_enabled,
    'bookingHorizonDays', s.booking_horizon_days,
    'termsUrl', s.terms_url,
    'changeDeadline', case
      when public.booking_policy_runtime() = 'active'
        then jsonb_build_object(
          'rule', 'previous_day_1500',
          'description', 'Changes close at 3:00 pm the day before your appointment.')
        else jsonb_build_object(
          'rule', 'rolling_24h',
          'description', format('Rescheduling closes %s hours before your appointment. You can cancel before your appointment starts; late cancellations are recorded.', smarter_dog_private.cancellation_notice_hours()))
    end,
    'customerPortal', jsonb_build_object(
      'allowCancellations', s.allow_customer_cancellations,
      'allowRescheduling', s.allow_customer_rescheduling,
      'allowRepeatBooking', s.allow_repeat_booking,
      'showHistory', s.show_customer_history
    )
  )
  from public.booking_policy_settings s
  where s.singleton;
$$;
revoke all on function public.current_customer_booking_rules() from public;
revoke all on function public.current_customer_booking_rules() from anon;
revoke all on function public.current_customer_booking_rules() from authenticated;
grant execute on function public.current_customer_booking_rules() to authenticated;


revoke all on function public.reschedule_customer_booking_direct_unchecked(uuid,jsonb,date,text) from public,anon,authenticated,service_role;

-- Existing service-role WhatsApp contracts, with explicit cancellation provenance.
create or replace function public.cancel_whatsapp_booking_group(
  p_group_id uuid,
  p_human_id uuid,
  p_reason   text default 'Customer cancelled via WhatsApp'
)
returns table (cancelled_count int, booking_ids uuid[], group_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_human_id is null then
    raise exception 'human_id is required' using errcode = '22023';
  end if;
  if p_group_id is null then
    raise exception 'group_id is required' using errcode = '22023';
  end if;

  if (select count(distinct b.booking_date) from public.bookings b join public.dogs d on d.id=b.dog_id where b.group_id=p_group_id and d.human_id=p_human_id and b.status='Booked') > 1 then
    raise exception 'ambiguous_recurring_group' using errcode='22023';
  end if;

  -- Cancel every Booked row in the group that the caller actually owns
  -- (ownership via dogs.human_id). Ownership + status are the guard; a
  -- mismatched group/owner simply cancels nothing (cancelled_count = 0).
  with cancelled as (
    update public.bookings b
       set status = 'Cancelled',
           cancellation_cause = 'customer',
           cancel_reason = left(coalesce(p_reason, 'Customer cancelled via WhatsApp'), 500)
      from public.dogs d
     where b.dog_id = d.id
       and d.human_id = p_human_id
       and b.group_id = p_group_id
       and b.status = 'Booked'
       and (select min(x.booking_date+x.slot::time) from public.bookings x where x.booking_date=b.booking_date and ((b.group_id is not null and x.group_id=b.group_id) or (b.group_id is null and x.id=b.id))) > (now() at time zone 'Europe/London')
    returning b.id
  )
  select count(*)::int, coalesce(array_agg(id), '{}'::uuid[]), p_group_id
    into cancelled_count, booking_ids, group_id
    from cancelled;

  return next;
end;
$$;

comment on function public.cancel_whatsapp_booking_group(uuid, uuid, text) is
  'Service-role WhatsApp cancel: cancels every Booked row in p_group_id owned by p_human_id (ownership via dogs.human_id), sets cancel_reason, lets notify_on_booking_cancelled fire. Returns (cancelled_count, booking_ids, group_id) — a 0 count means nothing was cancellable and the caller must NOT treat it as success.';

-- ── Cancel by booking id (resolves to the whole visit/group) ─
create or replace function public.cancel_whatsapp_booking_by_id(
  p_booking_id uuid,
  p_human_id   uuid,
  p_reason     text default 'Customer cancelled via WhatsApp'
)
returns table (cancelled_count int, booking_ids uuid[], group_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_group_id uuid;
  v_booking_date date;
begin
  if p_human_id is null then
    raise exception 'human_id is required' using errcode = '22023';
  end if;
  if p_booking_id is null then
    raise exception 'booking_id is required' using errcode = '22023';
  end if;

  -- Resolve the visit: if the booking is part of a group, cancel the whole
  -- group; otherwise just the single booking. (Whole-visit granularity.)
  select b.group_id, b.booking_date into v_group_id, v_booking_date from public.bookings b where b.id = p_booking_id;

  with cancelled as (
    update public.bookings b
       set status = 'Cancelled',
           cancellation_cause = 'customer',
           cancel_reason = left(coalesce(p_reason, 'Customer cancelled via WhatsApp'), 500)
      from public.dogs d
     where b.dog_id = d.id
       and d.human_id = p_human_id
       and b.status = 'Booked'
       and (select min(x.booking_date+x.slot::time) from public.bookings x where x.booking_date=b.booking_date and ((b.group_id is not null and x.group_id=b.group_id) or (b.group_id is null and x.id=b.id))) > (now() at time zone 'Europe/London')
       and b.booking_date = v_booking_date
       and (
         (v_group_id is not null and b.group_id = v_group_id)
         or (v_group_id is null and b.id = p_booking_id)
       )
    returning b.id
  )
  select count(*)::int, coalesce(array_agg(id), '{}'::uuid[]), v_group_id
    into cancelled_count, booking_ids, group_id
    from cancelled;

  return next;
end;
$$;

comment on function public.cancel_whatsapp_booking_by_id(uuid, uuid, text) is
  'Service-role WhatsApp cancel by booking id: resolves the booking''s group (whole-visit) and cancels every Booked row in it owned by p_human_id. Returns (cancelled_count, booking_ids, group_id). Used by apply-customer-confirm (confirm-buttons cancel) and the reschedule cancel-old step.';

revoke all on function public.cancel_whatsapp_booking_group(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.cancel_whatsapp_booking_by_id(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.cancel_whatsapp_booking_group(uuid, uuid, text) to service_role;
grant execute on function public.cancel_whatsapp_booking_by_id(uuid, uuid, text) to service_role;
create or replace function public.cancel_whatsapp_booking_group_for_reschedule(
  p_group_id uuid,
  p_human_id uuid,
  p_reason   text default 'Customer cancelled via WhatsApp'
)
returns table (cancelled_count int, booking_ids uuid[], group_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_human_id is null then
    raise exception 'human_id is required' using errcode = '22023';
  end if;
  if p_group_id is null then
    raise exception 'group_id is required' using errcode = '22023';
  end if;

  if (select count(distinct b.booking_date) from public.bookings b join public.dogs d on d.id=b.dog_id where b.group_id=p_group_id and d.human_id=p_human_id and b.status='Booked') > 1 then
    raise exception 'ambiguous_recurring_group' using errcode='22023';
  end if;

  -- Cancel every Booked row in the group that the caller actually owns
  -- (ownership via dogs.human_id). Ownership + status are the guard; a
  -- mismatched group/owner simply cancels nothing (cancelled_count = 0).
  with cancelled as (
    update public.bookings b
       set status = 'Cancelled',
           cancellation_cause = 'reschedule',
           cancel_reason = left(coalesce(p_reason, 'Customer cancelled via WhatsApp'), 500)
      from public.dogs d
     where b.dog_id = d.id
       and d.human_id = p_human_id
       and b.group_id = p_group_id
       and b.status = 'Booked'
    returning b.id
  )
  select count(*)::int, coalesce(array_agg(id), '{}'::uuid[]), p_group_id
    into cancelled_count, booking_ids, group_id
    from cancelled;

  return next;
end;
$$;

comment on function public.cancel_whatsapp_booking_group_for_reschedule(uuid, uuid, text) is
  'Service-role WhatsApp cancel: cancels every Booked row in p_group_id owned by p_human_id (ownership via dogs.human_id), sets cancel_reason, lets notify_on_booking_cancelled fire. Returns (cancelled_count, booking_ids, group_id) — a 0 count means nothing was cancellable and the caller must NOT treat it as success.';

-- ── Cancel by booking id (resolves to the whole visit/group) ─
create or replace function public.cancel_whatsapp_booking_by_id_for_reschedule(
  p_booking_id uuid,
  p_human_id   uuid,
  p_reason     text default 'Customer cancelled via WhatsApp'
)
returns table (cancelled_count int, booking_ids uuid[], group_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_group_id uuid;
  v_booking_date date;
begin
  if p_human_id is null then
    raise exception 'human_id is required' using errcode = '22023';
  end if;
  if p_booking_id is null then
    raise exception 'booking_id is required' using errcode = '22023';
  end if;

  -- Resolve the visit: if the booking is part of a group, cancel the whole
  -- group; otherwise just the single booking. (Whole-visit granularity.)
  select b.group_id, b.booking_date into v_group_id, v_booking_date from public.bookings b where b.id = p_booking_id;

  with cancelled as (
    update public.bookings b
       set status = 'Cancelled',
           cancellation_cause = 'reschedule',
           cancel_reason = left(coalesce(p_reason, 'Customer cancelled via WhatsApp'), 500)
      from public.dogs d
     where b.dog_id = d.id
       and d.human_id = p_human_id
       and b.status = 'Booked'
       and b.booking_date = v_booking_date
       and (
         (v_group_id is not null and b.group_id = v_group_id)
         or (v_group_id is null and b.id = p_booking_id)
       )
    returning b.id
  )
  select count(*)::int, coalesce(array_agg(id), '{}'::uuid[]), v_group_id
    into cancelled_count, booking_ids, group_id
    from cancelled;

  return next;
end;
$$;

comment on function public.cancel_whatsapp_booking_by_id_for_reschedule(uuid, uuid, text) is
  'Service-role WhatsApp cancel by booking id: resolves the booking''s group (whole-visit) and cancels every Booked row in it owned by p_human_id. Returns (cancelled_count, booking_ids, group_id). Used by apply-customer-confirm (confirm-buttons cancel) and the reschedule cancel-old step.';

revoke all on function public.cancel_whatsapp_booking_group_for_reschedule(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.cancel_whatsapp_booking_by_id_for_reschedule(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.cancel_whatsapp_booking_group_for_reschedule(uuid, uuid, text) to service_role;
grant execute on function public.cancel_whatsapp_booking_by_id_for_reschedule(uuid, uuid, text) to service_role;
-- Preserve the existing guarded merge, including private customer history.
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
