-- A customer's same-day cancellation is a no-show; two no-shows in 12 months
-- require a deposit.
--
-- Owner decision, 24 November 2026 (ADR 015, plan
-- docs/plans/active/2026-11-24-same-day-no-show-policy.md):
--   * A customer who cancels on the appointment's own London date is recorded
--     as status 'No-show'. A cancellation on an earlier date stays 'Cancelled'
--     with no penalty. The notice window (minCancellationHours) no longer
--     decides penalties; it still governs online rescheduling.
--   * Staff can still mark a no-show by hand. Both count.
--   * Two no-show appointments in the preceding 12 months, counted from the
--     moment this migration is applied (everyone starts from zero), turn the
--     owner's deposit tag on. Replaces the first-no-show rule of 20261122160000
--     and ADR 013's three-strike review.
--   * No warning step for the customer (owner decision).
--
-- Classification lives in ONE table-level BEFORE trigger, like the booking
-- gates, so every customer path inherits it: the portal and iPhone
-- (cancel_customer_booking -> cancel_booking_impl), WhatsApp
-- (cancel_whatsapp_booking_group / _by_id) and staff recording a customer's
-- request with cancellation_cause = 'customer'. Reschedule releases carry
-- cause 'reschedule' and are never reclassified.
--
-- A no-show still frees its seat exactly as a cancellation does (the unique
-- indexes and capacity already exclude 'No-show'). The customer still gets the
-- cancellation message (section 5), and staff alerts still see a cancellation
-- event (section 4).
--
-- Idempotent: safe to re-run. Apply to production by hand, with the
-- approval-gated workflow, BEFORE merging client code that depends on it.

begin;

-- ── 1. When the new rule started ────────────────────────────────────
-- Everyone starts from zero: only no-shows on or after this date count.
-- Written once; a re-run keeps the original start.
create table if not exists smarter_dog_private.policy_milestones (
  key text primary key,
  effective_at timestamptz not null
);
alter table smarter_dog_private.policy_milestones enable row level security;
revoke all on table smarter_dog_private.policy_milestones from public, anon, authenticated;
comment on table smarter_dog_private.policy_milestones is
  'When a booking policy took effect. same_day_no_show_v1: the no-show count for deposits starts at this moment (ADR 015).';

insert into smarter_dog_private.policy_milestones (key, effective_at)
values ('same_day_no_show_v1', now())
on conflict (key) do nothing;

-- ── 2. Same-day customer cancellation becomes a no-show ─────────────
create or replace function smarter_dog_private.classify_same_day_customer_cancellation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if new.status = 'Cancelled'
     and old.status in ('Booked', 'Reconfirmed')
     and new.cancellation_cause = 'customer'
     and new.booking_date = (now() at time zone 'Europe/London')::date then
    new.status := 'No-show';
  end if;
  return new;
end;
$$;
revoke all on function smarter_dog_private.classify_same_day_customer_cancellation()
  from public, anon, authenticated, service_role;
comment on function smarter_dog_private.classify_same_day_customer_cancellation() is
  'BEFORE UPDATE OF status: a customer-caused cancellation committed on the appointment''s own London date is saved as No-show (ADR 015).';

-- "aa_c" sorts before every other BEFORE UPDATE trigger on bookings
-- (aa_ensure_legacy_booking_visit, clear_cancellation_cause, the lifecycle
-- stamps), so each of them sees the final status.
drop trigger if exists aa_classify_same_day_customer_cancellation on public.bookings;
create trigger aa_classify_same_day_customer_cancellation
  before update of status on public.bookings
  for each row
  when (new.status = 'Cancelled' and old.status is distinct from new.status)
  execute function smarter_dog_private.classify_same_day_customer_cancellation();

-- ── 3. Keep the customer cause on a customer no-show ─────────────────
create or replace function smarter_dog_private.clear_cancellation_cause()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  -- CHANGE (20261124200000): a customer's same-day no-show keeps its cause, so
  -- the no-show can be told apart from one staff recorded.
  if new.status not in ('Cancelled', 'No-show') then new.cancellation_cause := null; end if;
  return new;
end; $$;
revoke all on function smarter_dog_private.clear_cancellation_cause() from public,anon,authenticated,service_role;

-- ── 4. A customer no-show still emits the cancellation event ────────
-- Identical to 20260825100000 apart from the marked v_cancelled line.
create or replace function public.emit_booking_update_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_party       record;
  v_actor       record;
  v_rescheduled boolean;
  v_cancelled   boolean;
  v_reconfirmed boolean;
begin
  v_rescheduled := (new.booking_date is distinct from old.booking_date)
                 or (new.slot is distinct from old.slot);
  -- CHANGE (20261124200000): a customer's same-day cancellation is saved as
  -- No-show (section 2) but is still a cancellation the customer made, so it
  -- emits the same 'cancelled' event. Staff alerts, the customer timeline and
  -- the cancel command's receipt replay all read that event.
  v_cancelled := (old.status is distinct from 'Cancelled'
                  and new.status = 'Cancelled')
              or (old.status is distinct from 'No-show'
                  and old.status is distinct from 'Cancelled'
                  and new.status = 'No-show'
                  and new.cancellation_cause = 'customer');
  v_reconfirmed := new.reminder_confirmed_at is not null
               and (old.reminder_confirmed_at is null
                    or old.reminder_confirmed_source
                       is distinct from new.reminder_confirmed_source);

  if not v_rescheduled and not v_cancelled and not v_reconfirmed then
    return new;
  end if;

  select * into v_party from booking_event_party(new);
  select * into v_actor from resolve_event_actor(new.source);

  if v_rescheduled then
    insert into booking_events (
      booking_id, event_type, customer_name, dog_name, dog_breed,
      service, booking_date, slot,
      previous_booking_date, previous_slot,
      actor_id, actor_role, actor_name,
      occurred_at
    ) values (
      new.id, 'rescheduled', v_party.customer_name, v_party.dog_name, v_party.dog_breed,
      new.service, new.booking_date, new.slot,
      old.booking_date, old.slot,
      v_actor.actor_id, v_actor.actor_role, v_actor.actor_name,
      now()
    );
  end if;

  if v_cancelled then
    insert into booking_events (
      booking_id, event_type, customer_name, dog_name, dog_breed,
      service, booking_date, slot, cancel_reason,
      actor_id, actor_role, actor_name,
      occurred_at
    ) values (
      new.id, 'cancelled', v_party.customer_name, v_party.dog_name, v_party.dog_breed,
      new.service, new.booking_date, new.slot, new.cancel_reason,
      v_actor.actor_id, v_actor.actor_role, v_actor.actor_name,
      now()
    );
  end if;

  if v_reconfirmed then
    if new.reminder_confirmed_source = 'staff' then
      -- Staff confirmed over the phone / in person: a plain staff UPDATE, so
      -- auth.uid() is the staff member and resolve_event_actor names them.
      insert into booking_events (
        booking_id, event_type, customer_name, dog_name, dog_breed,
        service, booking_date, slot,
        actor_id, actor_role, actor_name,
        occurred_at
      ) values (
        new.id, 'reconfirmed', v_party.customer_name, v_party.dog_name, v_party.dog_breed,
        new.service, new.booking_date, new.slot,
        v_actor.actor_id, v_actor.actor_role, v_actor.actor_name,
        now()
      );
    else
      -- Customer confirm runs service-role (auth.uid() null), so the actor is
      -- the booking's OWNER. actor_id stays null (we don't resolve the
      -- owner's auth user and don't need it for the sentence).
      insert into booking_events (
        booking_id, event_type, customer_name, dog_name, dog_breed,
        service, booking_date, slot,
        actor_id, actor_role, actor_name,
        occurred_at
      ) values (
        new.id, 'reconfirmed', v_party.customer_name, v_party.dog_name, v_party.dog_breed,
        new.service, new.booking_date, new.slot,
        null, 'customer', v_party.customer_name,
        now()
      );
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function public.emit_booking_update_event() from public, anon, authenticated;

-- ── 5. The customer still gets the cancellation message ─────────────
-- Same constraint trigger as 20260723090000, widened to a customer no-show.
drop trigger if exists notify_booking_cancelled_trigger on public.bookings;
create constraint trigger notify_booking_cancelled_trigger
  after update on public.bookings
  deferrable initially immediate
  for each row
  when (old.status is distinct from new.status
        and (new.status = 'Cancelled'
             or (new.status = 'No-show'
                 and new.cancellation_cause = 'customer'
                 and old.status is distinct from 'Cancelled')))
  execute function public.notify_on_booking_cancelled();

-- ── 6. Receipt replay recognises a same-day no-show ─────────────────
-- Identical to 20261110140000 apart from the two replay checks, which now
-- accept status 'No-show' as well as 'Cancelled'.
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
          and current_target.status in ('Cancelled', 'No-show')
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
            and current_target.status in ('Cancelled', 'No-show')
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

-- ── 7. Notice-window strikes stop ───────────────────────────────────
-- late_cancellation_history and its staff read stay as history. No new rows.
drop trigger if exists record_late_customer_cancellation on public.bookings;

-- ── 8. The no-show count ────────────────────────────────────────────
-- One day counts once: an owner's dogs missing the same date are one no-show.
-- (Staff multi-dog bookings carry no group_id, so the owner and date are the
-- appointment.) Counts both customer same-day cancellations and staff-marked
-- no-shows, from the policy start and within the last 12 London months.
create or replace function smarter_dog_private.no_show_count(p_human_id uuid)
returns integer
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select count(distinct b.booking_date)::integer
    from public.bookings b
    join public.dogs d on d.id = b.dog_id
   where d.human_id = p_human_id
     and b.status = 'No-show'
     and b.booking_date >= greatest(
           ((select m.effective_at from smarter_dog_private.policy_milestones m
              where m.key = 'same_day_no_show_v1') at time zone 'Europe/London')::date,
           ((now() at time zone 'Europe/London') - interval '12 months')::date
         );
$$;
revoke all on function smarter_dog_private.no_show_count(uuid) from public, anon, authenticated, service_role;

-- ── 9. Deposit at the second no-show ────────────────────────────────
create or replace function public.flag_deposit_after_no_show()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_human_id uuid;
  v_dog_name text;
  v_reason text;
begin
  if tg_op is distinct from 'UPDATE' then
    return new;
  end if;
  if new.status is not distinct from old.status or new.status is distinct from 'No-show' then
    return new;
  end if;

  select d.human_id, d.name
    into v_human_id, v_dog_name
    from public.dogs d
   where d.id = new.dog_id;

  if v_human_id is null then
    return new;
  end if;

  -- CHANGE (20261124200000): two no-show appointments in 12 months, not one.
  if smarter_dog_private.no_show_count(v_human_id) < 2 then
    return new;
  end if;

  -- UK date, independent of the database locale. Day has no leading zero.
  v_reason :=
    'Deposit required after 2 no-shows in 12 months'
    || case
         when nullif(btrim(coalesce(v_dog_name, '')), '') is not null
           then ': ' || btrim(v_dog_name)
         else ''
       end
    || ' on '
    || to_char(new.booking_date, 'FMDD')
    || ' '
    || (array['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'])[extract(month from new.booking_date)::integer]
    || ' '
    || to_char(new.booking_date, 'YYYY');

  -- The WHERE keeps a deposit staff already required, and the note that
  -- explained it. Only the transition that turns the tag on records a reason.
  update public.humans
     set deposit_required = true,
         deposit_required_reason = v_reason,
         deposit_required_set_at = statement_timestamp(),
         updated_at = statement_timestamp()
   where id = v_human_id
     and deposit_required = false;

  return new;
end;
$$;

comment on function public.flag_deposit_after_no_show() is
  'AFTER UPDATE of bookings.status to No-show: at the owner''s second no-show appointment in 12 months (counted from the same_day_no_show_v1 start) turn on humans.deposit_required and record the appointment that did it. Never clears the tag.';

revoke all on function public.flag_deposit_after_no_show() from public;
revoke all on function public.flag_deposit_after_no_show() from anon;
revoke all on function public.flag_deposit_after_no_show() from authenticated;

-- ── 10. Staff read of the no-show count ─────────────────────────────
-- Additive: the customer card switches to this in a follow-up change; the
-- old staff_customer_cancellation_history stays for the legacy history.
create or replace function public.staff_customer_no_show_history(p_human_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_since date;
  v_items jsonb;
begin
  if not coalesce(public.is_staff(), false) then
    raise exception 'staff_only' using errcode = '42501';
  end if;

  select ((m.effective_at at time zone 'Europe/London')::date)
    into v_since
    from smarter_dog_private.policy_milestones m
   where m.key = 'same_day_no_show_v1';

  select coalesce(jsonb_agg(item order by item->>'bookingDate' desc), '[]'::jsonb)
    into v_items
    from (
      select jsonb_build_object(
               'bookingDate', b.booking_date,
               'slot', min(b.slot),
               'dogNames', jsonb_agg(distinct d.name),
               'customerCancelled', bool_or(b.cancellation_cause = 'customer'),
               'reason', max(b.cancel_reason)
             ) as item
        from public.bookings b
        join public.dogs d on d.id = b.dog_id
       where d.human_id = p_human_id
         and b.status = 'No-show'
       group by b.booking_date
       order by b.booking_date desc
       limit 50
    ) items;

  return jsonb_build_object(
    'count', smarter_dog_private.no_show_count(p_human_id),
    'threshold', 2,
    'windowMonths', 12,
    'since', v_since,
    'items', v_items
  );
end;
$$;
revoke all on function public.staff_customer_no_show_history(uuid) from public, anon, authenticated, service_role;
grant execute on function public.staff_customer_no_show_history(uuid) to authenticated;

commit;
