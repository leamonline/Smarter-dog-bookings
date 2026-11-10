-- Portal switches: enforce the setting the Settings screen actually writes.
--
-- THE DEFECT
--
-- Settings -> Customer Portal saves "Allow cancellations" and "Allow
-- rescheduling" through update_booking_rules(), which writes the typed
-- singleton public.booking_policy_settings. The enforcing function,
-- smarter_dog_private.cancel_booking_impl(), read
-- salon_config.settings #> '{customerPortal,allowCancellations}' instead: a
-- legacy JSON key no screen has written since 20260726144001. So switching
-- cancellations off changed what current_customer_booking_rules() told the
-- customer and changed nothing about what the database allowed.
--
-- Two further faults sat behind it. "Allow rescheduling" was enforced nowhere.
-- And because a customer reschedule releases the original appointment through
-- this same function, the one legacy key would have governed BOTH actions.
--
-- WHAT CHANGES
--
--   1. cancel_booking_impl() reads its switch from booking_policy_settings.
--      A direct cancellation reads allow_customer_cancellations; a reschedule
--      reads allow_customer_rescheduling. Neither switch affects the other.
--   2. A disabled reschedule raises a code of its own, SDR05
--      (online_rescheduling_disabled). A disabled cancellation keeps SDC01.
--   3. customer_change_deadline_preview() reads the same two columns and adds
--      an "allowRescheduling" key. Existing keys keep their names and meaning.
--   4. A missing settings row refuses (SDC01, booking_policy_settings_missing).
--
-- WHAT DOES NOT CHANGE
--
-- The notice hours (still salon_config.settings.minCancellationHours, still
-- closing rescheduling only), the rule that a customer may cancel until the
-- appointment starts with a late cancellation recorded, receipts, idempotent
-- replay, locking, scope checks, the non-singleton salon_config refusal, and
-- every grant. No table, column, row, trigger or policy is touched.
--
-- Both bodies below are the definitions from 20261001160000 and
-- 20260906100000 with only the marked blocks altered. Idempotent: create or
-- replace, plus the same revokes and grant those migrations issued.
--
-- ROLLBACK: re-run the two previous definitions from those migrations.

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
  v_hours_value jsonb;
  v_action_allowed boolean;
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

  -- CHANGE (20261110140000): the on/off switch is read from the typed
  -- singleton the Settings screen writes, and each path reads its OWN switch.
  -- p_enforce_notice is true only when the customer reschedule command
  -- (reschedule_customer_booking_direct_unchecked) calls this to release the
  -- original appointment, so it identifies a reschedule.
  select case
           when p_enforce_notice then s.allow_customer_rescheduling
           else s.allow_customer_cancellations
         end
    into v_action_allowed
    from public.booking_policy_settings s;

  -- The singleton is seeded by its own migration. A missing row is a broken
  -- install, not permission: refuse rather than guess.
  if not found then
    raise exception 'online_cancellation_disabled'
      using errcode = 'SDC01',
            detail = 'booking_policy_settings_missing',
            hint = 'contact_staff';
  end if;

  if not v_action_allowed then
    if p_enforce_notice then
      raise exception 'online_rescheduling_disabled'
        using errcode = 'SDR05',
              detail = 'customerPortal.allowRescheduling=false',
              hint = 'contact_staff';
    end if;
    raise exception 'online_cancellation_disabled'
      using errcode = 'SDC01',
            detail = 'customerPortal.allowCancellations=false',
            hint = 'contact_staff';
  end if;

  -- UNCHANGED: the notice hours still come from salon_config.settings. A
  -- malformed or missing value falls back to the documented default rather
  -- than letting a JSON cast error escape to a customer.

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

revoke all on function smarter_dog_private.cancel_booking_impl(uuid,text,boolean)
  from public, anon, authenticated, service_role;

create or replace function public.customer_change_deadline_preview(
  p_booking_date date,
  p_slot text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_start timestamp without time zone;
  v_settings jsonb := '{}'::jsonb;
  v_settings_count integer;
  v_hours_value jsonb;
  v_allow_cancellations boolean := false;
  v_allow_rescheduling boolean := false;
  v_config_ambiguous boolean := false;
  v_min_cancellation_hours numeric := 24;
  v_deadline timestamp without time zone;
begin
  if p_booking_date is null or p_slot is null then
    return null;
  end if;

  -- An unparseable slot means "unknown", not "fine". Null tells the caller to
  -- render nothing rather than promise something it cannot substantiate.
  begin
    v_start := p_booking_date + p_slot::time;
  exception
    when invalid_datetime_format or datetime_field_overflow then
      return null;
  end;

  select count(*)::integer,
         coalesce((array_agg(sc.settings order by sc.id))[1], '{}'::jsonb)
    into v_settings_count, v_settings
    from public.salon_config sc;

  if v_settings_count > 1 then
    -- cancel_customer_booking treats a non-singleton salon_config as online
    -- cancellation being off (SDC01, detail salon_config_not_singleton).
    -- Mirror that rather than guessing a deadline from an ambiguous row.
    v_config_ambiguous := true;
  else
    if v_settings_count = 0 or jsonb_typeof(v_settings) <> 'object' then
      v_settings := '{}'::jsonb;
    end if;

    -- UNCHANGED: a malformed or missing hours value falls back to the
    -- documented default, the same way the enforcing function does.
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
  end if;

  -- CHANGE (20261110140000): both switches come from the typed singleton the
  -- enforcing function now reads. A missing row leaves both false, matching
  -- its refusal; so does an ambiguous salon_config, which it also refuses.
  if not v_config_ambiguous then
    select s.allow_customer_cancellations, s.allow_customer_rescheduling
      into v_allow_cancellations, v_allow_rescheduling
      from public.booking_policy_settings s;
    if not found then
      v_allow_cancellations := false;
      v_allow_rescheduling := false;
    end if;
  end if;

  v_deadline := v_start - (v_min_cancellation_hours * interval '1 hour');

  return jsonb_build_object(
    'allowCancellations', v_allow_cancellations,
    'allowRescheduling', v_allow_rescheduling,
    'minCancellationHours', v_min_cancellation_hours,
    -- Europe/London wall clock, the same frame the deadline is enforced in.
    'deadline', to_char(v_deadline, 'YYYY-MM-DD"T"HH24:MI:SS'),
    -- Byte-for-byte the enforcing comparison: London wall time on both sides,
    -- and exactly on the deadline is still allowed.
    'passed', (now() at time zone 'Europe/London') > v_deadline
  );
end;
$$;

revoke all on function public.customer_change_deadline_preview(date, text) from public;
revoke all on function public.customer_change_deadline_preview(date, text) from anon;
revoke all on function public.customer_change_deadline_preview(date, text) from authenticated;
grant execute on function public.customer_change_deadline_preview(date, text) to authenticated;
