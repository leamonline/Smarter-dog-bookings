-- Staff capacity overrides are deliberate diary exceptions. Customers may
-- suggest a different date and time, but the exception must stay in place
-- until a staff member explicitly accepts the move.

alter table public.booking_change_requests
  add column if not exists target_booking_id uuid references public.bookings(id);

alter table public.booking_change_requests
  drop constraint if exists booking_change_requests_reason_code_check;
alter table public.booking_change_requests
  add constraint booking_change_requests_reason_code_check check (reason_code in (
    'on_time_customer_change','salon_change','accepted_late_customer_request',
    'source_deadline_late','destination_last_minute_staff_review',
    'auto_confirm_disabled_staff_review','staff_alternative','staff_partial_change',
    'staff_capacity_override'
  ));

alter table public.salon_todos
  add column if not exists booking_change_request_id uuid
    references public.booking_change_requests(id) on delete set null;

create index if not exists booking_change_requests_target_booking_idx
  on public.booking_change_requests(target_booking_id)
  where target_booking_id is not null;

create unique index if not exists salon_todos_one_booking_change_request
  on public.salon_todos(booking_change_request_id)
  where booking_change_request_id is not null;

comment on column public.booking_change_requests.target_booking_id is
  'Customer-selected booking row used to bind an override reschedule request to its original active visit.';
comment on column public.salon_todos.booking_change_request_id is
  'For reschedule_request tasks, the immutable booking change request that staff must approve or deny.';

-- Destination and identity fields remain immutable while staff consider the
-- request. target_booking_id is part of that identity for override requests.
create or replace function public.guard_booking_change_request_destination()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.requested_booking_date is distinct from old.requested_booking_date
     or new.requested_slot_assignments is distinct from old.requested_slot_assignments
     or new.requested_destination_hash is distinct from old.requested_destination_hash
     or new.source_visit_id is distinct from old.source_visit_id
     or new.human_id is distinct from old.human_id
     or new.target_booking_id is distinct from old.target_booking_id
     or new.kind is distinct from old.kind then
    raise exception 'change request %: destination and identity are immutable', old.id
      using errcode = 'P0001';
  end if;
  if new.revision < old.revision then
    raise exception 'change request %: revision cannot move backwards', old.id
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- Preserve the existing direct reschedule implementation for ordinary
-- bookings, but make it unreachable from browser roles. The public wrapper
-- below adds the override gate before delegating to it.
alter function public.reschedule_customer_booking(uuid, jsonb, date, text)
  rename to reschedule_customer_booking_direct_unchecked;

revoke all on function public.reschedule_customer_booking_direct_unchecked(
  uuid, jsonb, date, text
) from public, anon, authenticated, service_role;

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
  v_visit_id uuid;
  v_group_id uuid;
  v_booking_date date;
  v_booking_status text;
  v_has_staff_override boolean;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if p_booking_id is null then
    raise exception 'booking_not_cancellable' using errcode = 'SDC03';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'customer_booking_reschedule|' || v_uid::text || '|' || p_booking_id::text,
      0
    )
  );

  select b.visit_id, b.group_id, b.booking_date, b.status
    into v_visit_id, v_group_id, v_booking_date, v_booking_status
    from public.bookings b
    join public.dogs d on d.id = b.dog_id
    join public.humans h on h.id = d.human_id
   where b.id = p_booking_id
     and h.customer_user_id = v_uid;

  if not found then
    raise exception 'booking_not_cancellable' using errcode = 'SDC03';
  end if;

  -- The unchanged direct implementation owns replay semantics. A completed
  -- source may therefore reach it so an exact retry can return its original
  -- receipt; only active visits need the new override gate.
  if v_booking_status = 'Booked' then
    perform b.id
      from public.bookings b
     where (
         v_visit_id is not null
         and b.visit_id = v_visit_id
         and b.visit_membership_state = 'included'
       )
        or (
         v_visit_id is null
         and v_group_id is not null
         and b.group_id = v_group_id
         and b.booking_date = v_booking_date
       )
        or (v_visit_id is null and v_group_id is null and b.id = p_booking_id)
     order by b.id
     for update;

    select coalesce(bool_or(b.staff_capacity_override), false)
      into v_has_staff_override
      from public.bookings b
     where (
         v_visit_id is not null
         and b.visit_id = v_visit_id
         and b.visit_membership_state = 'included'
       )
        or (
         v_visit_id is null
         and v_group_id is not null
         and b.group_id = v_group_id
         and b.booking_date = v_booking_date
       )
        or (v_visit_id is null and v_group_id is null and b.id = p_booking_id);

    if v_has_staff_override then
      raise exception 'staff_override_requires_approval'
        using errcode = 'SDR01';
    end if;
  end if;

  return query
    select direct.id
      from public.reschedule_customer_booking_direct_unchecked(
        p_booking_id,
        p_bookings,
        p_booking_date,
        p_reason
      ) direct;
end;
$$;

comment on function public.reschedule_customer_booking(uuid, jsonb, date, text) is
  'Customer reschedule wrapper. Staff-capacity-override visits fail closed with SDR01; ordinary visits retain the existing atomic reschedule behaviour.';

revoke all on function public.reschedule_customer_booking(uuid, jsonb, date, text)
  from public, anon, service_role;
grant execute on function public.reschedule_customer_booking(uuid, jsonb, date, text)
  to authenticated;

-- Store a customer's preferred destination and create one linked staff task.
-- No booking row is updated here: the original appointment remains the
-- authoritative diary entry until a staff decision.
create or replace function public.request_customer_override_reschedule(
  p_booking_id uuid,
  p_bookings jsonb,
  p_booking_date date,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := (select auth.uid());
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_target public.bookings%rowtype;
  v_visit public.booking_visits%rowtype;
  v_human_name text;
  v_source_dog_names text;
  v_source_slots text;
  v_requested_slots text;
  v_source_dog_ids uuid[];
  v_requested_dog_ids uuid[];
  v_destination_hash text;
  v_existing public.booking_change_requests%rowtype;
  v_request_id uuid;
  v_sort_order integer;
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

  if p_booking_date is null or p_booking_date < current_date then
    raise exception 'requested_booking_date_must_not_be_in_the_past'
      using errcode = '22023';
  end if;

  if p_bookings is null
     or jsonb_typeof(p_bookings) <> 'array'
     or jsonb_array_length(p_bookings) < 1
     or jsonb_array_length(p_bookings) > 4 then
    raise exception 'A booking group must have between 1 and 4 dogs'
      using errcode = '22023';
  end if;

  if exists (
    select 1
      from jsonb_array_elements(p_bookings) e
     where coalesce(e->>'dog_id', '') !~
             '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
        or coalesce(e->>'slot', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
        or nullif(trim(coalesce(e->>'service', '')), '') is null
        or (
          e ? 'addons'
          and jsonb_typeof(e->'addons') <> 'array'
        )
  ) then
    raise exception 'invalid_reschedule_request_payload'
      using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'customer_override_reschedule_request|'
        || v_uid::text
        || '|'
        || p_booking_id::text,
      0
    )
  );

  select b.*
    into v_target
    from public.bookings b
    join public.dogs d on d.id = b.dog_id
    join public.humans h on h.id = d.human_id
   where b.id = p_booking_id
     and b.status = 'Booked'
     and b.visit_membership_state = 'included'
     and h.customer_user_id = v_uid;

  if not found or v_target.visit_id is null then
    raise exception 'booking_not_cancellable' using errcode = 'SDC03';
  end if;

  select *
    into v_visit
    from public.booking_visits
   where id = v_target.visit_id
     and lifecycle_state = 'active'
   for update;

  if not found then
    raise exception 'booking_not_cancellable' using errcode = 'SDC03';
  end if;

  perform b.id
    from public.bookings b
   where b.visit_id = v_visit.id
     and b.visit_membership_state = 'included'
   order by b.id
   for update;

  -- Recheck the target after taking locks in aggregate-first order. A staff
  -- move that won the race may have attached it to a different visit.
  perform 1
    from public.bookings b
    join public.dogs d on d.id = b.dog_id
    join public.humans h on h.id = d.human_id
   where b.id = p_booking_id
     and b.visit_id = v_visit.id
     and b.status = 'Booked'
     and b.visit_membership_state = 'included'
     and h.customer_user_id = v_uid;

  if not found then
    raise exception 'booking_not_cancellable' using errcode = 'SDC03';
  end if;

  if not exists (
    select 1
      from public.bookings b
     where b.visit_id = v_visit.id
       and b.visit_membership_state = 'included'
       and b.status = 'Booked'
       and b.staff_capacity_override
  ) then
    raise exception 'booking_does_not_require_staff_override_approval'
      using errcode = 'SDR04';
  end if;

  if exists (
    select 1
      from public.bookings b
      join public.dogs d on d.id = b.dog_id
      join public.humans h on h.id = d.human_id
     where b.visit_id = v_visit.id
       and b.visit_membership_state = 'included'
       and (
         b.status <> 'Booked'
         or h.customer_user_id is distinct from v_uid
       )
  ) then
    raise exception 'booking_not_cancellable' using errcode = 'SDC03';
  end if;

  select array_agg(b.dog_id order by b.dog_id)
    into v_source_dog_ids
    from public.bookings b
   where b.visit_id = v_visit.id
     and b.visit_membership_state = 'included'
     and b.status = 'Booked';

  select array_agg((e->>'dog_id')::uuid order by (e->>'dog_id')::uuid)
    into v_requested_dog_ids
    from jsonb_array_elements(p_bookings) e;

  if v_source_dog_ids is distinct from v_requested_dog_ids then
    raise exception 'replacement_visit_mismatch'
      using errcode = 'SDC04';
  end if;

  v_destination_hash :=
    smarter_dog_private.destination_hash(p_booking_date, p_bookings);

  select *
    into v_existing
    from public.booking_change_requests
   where source_visit_id = v_visit.id
     and status in ('pending_staff', 'waiting_customer')
   order by received_at desc, id
   limit 1
   for update;

  if found then
    if v_existing.reason_code = 'staff_capacity_override'
       and v_existing.target_booking_id = p_booking_id
       and v_existing.requested_booking_date = p_booking_date
       and v_existing.requested_slot_assignments = p_bookings
       and v_existing.requested_destination_hash = v_destination_hash
       and v_existing.customer_message = v_reason then
      return jsonb_build_object(
        'request_id', v_existing.id,
        'status', v_existing.status,
        'replayed', true
      );
    end if;

    raise exception 'reschedule_request_already_pending'
      using errcode = 'SDR02';
  end if;

  insert into public.booking_change_requests (
    source_visit_id,
    human_id,
    target_booking_id,
    kind,
    channel,
    reason_code,
    status,
    requested_at,
    customer_message,
    requested_booking_date,
    requested_slot_assignments,
    requested_destination_hash,
    source_revision
  ) values (
    v_visit.id,
    v_visit.human_id,
    p_booking_id,
    'reschedule',
    'website',
    'staff_capacity_override',
    'pending_staff',
    statement_timestamp(),
    v_reason,
    p_booking_date,
    p_bookings,
    v_destination_hash,
    v_visit.row_revision
  )
  returning id into v_request_id;

  select trim(concat_ws(' ', h.name, h.surname))
    into v_human_name
    from public.humans h
   where h.id = v_visit.human_id;

  select
    string_agg(d.name, ', ' order by d.name),
    string_agg(distinct b.slot, ', ' order by b.slot)
    into v_source_dog_names, v_source_slots
    from public.bookings b
    join public.dogs d on d.id = b.dog_id
   where b.visit_id = v_visit.id
     and b.visit_membership_state = 'included'
     and b.status = 'Booked';

  select string_agg(distinct e->>'slot', ', ' order by e->>'slot')
    into v_requested_slots
    from jsonb_array_elements(p_bookings) e;

  select coalesce(max(t.sort_order), -1) + 1
    into v_sort_order
    from public.salon_todos t;

  insert into public.salon_todos (
    text,
    done,
    sort_order,
    human_id,
    kind,
    booking_change_request_id
  ) values (
    'Review ' || coalesce(nullif(v_human_name, ''), 'customer')
      || '''s reschedule request: '
      || coalesce(v_source_dog_names, 'booking')
      || ' from ' || to_char(v_visit.booking_date, 'Dy DD Mon')
      || ' at ' || coalesce(v_source_slots, 'unknown time')
      || ' to ' || to_char(p_booking_date, 'Dy DD Mon')
      || ' at ' || coalesce(v_requested_slots, 'unknown time'),
    false,
    v_sort_order,
    v_visit.human_id,
    'reschedule_request',
    v_request_id
  );

  return jsonb_build_object(
    'request_id', v_request_id,
    'status', 'pending_staff',
    'replayed', false
  );
end;
$$;

comment on function public.request_customer_override_reschedule(
  uuid, jsonb, date, text
) is
  'Customer-owned request command for staff-capacity-override visits. Records the immutable preferred destination and creates one staff to-do without changing any booking row.';

revoke all on function public.request_customer_override_reschedule(
  uuid, jsonb, date, text
) from public, anon, service_role;
grant execute on function public.request_customer_override_reschedule(
  uuid, jsonb, date, text
) to authenticated;

-- Staff decide the request in the same transaction that moves the original
-- rows. Approval preserves booking IDs and reapplies the deliberate capacity
-- override; denial only closes the request and its task.
create or replace function public.decide_customer_override_reschedule_request(
  p_request_id uuid,
  p_decision text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_source_visit_id uuid;
  v_visit public.booking_visits%rowtype;
  v_request public.booking_change_requests%rowtype;
  v_booking_ids uuid[];
  v_source_dog_ids uuid[];
  v_requested_dog_ids uuid[];
  v_element jsonb;
  v_booking_id uuid;
  v_updated_count integer := 0;
  v_new_visit_id uuid;
begin
  perform smarter_dog_private.require_staff();

  if p_request_id is null or p_decision not in ('approve', 'deny') then
    raise exception 'decision_must_be_approve_or_deny'
      using errcode = '22023';
  end if;

  if v_reason is null or char_length(v_reason) > 500 then
    raise exception 'decision_reason_must_be_1_to_500_characters'
      using errcode = '22023';
  end if;

  select source_visit_id
    into v_source_visit_id
    from public.booking_change_requests
   where id = p_request_id;

  if not found then
    raise exception 'unknown_reschedule_request' using errcode = 'SDR03';
  end if;

  select *
    into v_visit
    from public.booking_visits
   where id = v_source_visit_id
   for update;

  select *
    into v_request
    from public.booking_change_requests
   where id = p_request_id
   for update;

  if v_request.status in ('accepted', 'declined') then
    if (p_decision = 'approve' and v_request.status = 'accepted')
       or (p_decision = 'deny' and v_request.status = 'declined') then
      return jsonb_build_object(
        'request_id', v_request.id,
        'decision', p_decision,
        'status', v_request.status,
        'replayed', true
      );
    end if;
    raise exception 'reschedule_request_already_decided'
      using errcode = 'SDR03';
  end if;

  if v_request.status <> 'pending_staff'
     or v_request.kind <> 'reschedule'
     or v_request.reason_code <> 'staff_capacity_override'
     or v_request.target_booking_id is null then
    raise exception 'unknown_reschedule_request' using errcode = 'SDR03';
  end if;

  -- Denial never touches the diary, so staff may safely close a request even
  -- when the source changed after the customer sent it.
  if p_decision = 'deny' then
    update public.booking_change_requests
       set status = 'declined',
           decided_at = statement_timestamp(),
           decided_by = auth.uid(),
           decision_reason = v_reason,
           revision = revision + 1
     where id = p_request_id;

    update public.salon_todos
       set done = true,
           updated_at = statement_timestamp()
     where booking_change_request_id = p_request_id;

    return jsonb_build_object(
      'request_id', p_request_id,
      'decision', p_decision,
      'status', 'declined',
      'replayed', false
    );
  end if;

  select
    array_agg(source.id order by source.id),
    array_agg(source.dog_id order by source.dog_id)
    into v_booking_ids, v_source_dog_ids
    from (
      select b.id, b.dog_id
        from public.bookings b
       where b.visit_id = v_request.source_visit_id
         and b.visit_membership_state = 'included'
         and b.status = 'Booked'
       order by b.id
       for update
    ) source;

  select array_agg((e->>'dog_id')::uuid order by (e->>'dog_id')::uuid)
    into v_requested_dog_ids
    from jsonb_array_elements(v_request.requested_slot_assignments) e;

  if v_visit.id is null
     or v_visit.lifecycle_state <> 'active'
     or v_visit.row_revision <> v_request.source_revision
     or v_booking_ids is null
     or not (v_request.target_booking_id = any(v_booking_ids))
     or v_source_dog_ids is distinct from v_requested_dog_ids
     or not exists (
       select 1
         from public.bookings b
        where b.id = any(v_booking_ids)
          and b.staff_capacity_override
     ) then
    raise exception 'reschedule_request_source_changed'
      using errcode = 'SDR03';
  end if;

  for v_element in
    select value from jsonb_array_elements(v_request.requested_slot_assignments)
  loop
    select b.id
      into v_booking_id
      from public.bookings b
     where b.id = any(v_booking_ids)
       and b.dog_id = (v_element->>'dog_id')::uuid;

    if not found then
      raise exception 'reschedule_request_source_changed'
        using errcode = 'SDR03';
    end if;

    update public.bookings
       set booking_date = v_request.requested_booking_date,
           slot = v_element->>'slot',
           service = trim(v_element->>'service'),
           staff_capacity_override = true
     where id = v_booking_id;

    v_updated_count := v_updated_count + 1;
  end loop;

  if v_updated_count <> cardinality(v_booking_ids) then
    raise exception 'reschedule_request_source_changed'
      using errcode = 'SDR03';
  end if;

  select b.visit_id
    into v_new_visit_id
    from public.bookings b
   where b.id = v_request.target_booking_id;

  update public.booking_change_requests
     set status = 'accepted',
         proposed_visit_id = v_new_visit_id,
         decided_at = statement_timestamp(),
         decided_by = auth.uid(),
         decision_reason = v_reason,
         revision = revision + 1
   where id = p_request_id;

  update public.salon_todos
     set done = true,
         updated_at = statement_timestamp()
   where booking_change_request_id = p_request_id;

  return jsonb_build_object(
    'request_id', p_request_id,
    'decision', p_decision,
    'status', 'accepted',
    'replayed', false
  );
end;
$$;

comment on function public.decide_customer_override_reschedule_request(
  uuid, text, text
) is
  'Staff-only atomic decision for an override reschedule request. Denial leaves the diary untouched; approval moves every original booking row in place and reapplies staff_capacity_override.';

revoke all on function public.decide_customer_override_reschedule_request(
  uuid, text, text
) from public, anon, service_role;
grant execute on function public.decide_customer_override_reschedule_request(
  uuid, text, text
) to authenticated;
