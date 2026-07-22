-- ============================================================
-- Booking visit foundation (previous_day_1500_v1 programme, phase 1)
--
-- Adds the visit aggregate above the one-row-per-dog bookings table:
--   * booking_policy_versions  — immutable policy registry; the new
--     previous_day_1500_v1 policy is seeded INACTIVE (effective_at null).
--   * booking_lineages         — durable reschedule lineage per customer.
--   * booking_visits           — one customer + one date + one or more dogs;
--     three independent axes (lifecycle / approval / confirmation).
--   * bookings.visit_id        — nullable during the compatibility rollout.
--
-- Every legacy write path dual-writes a safe `legacy_compat` visit via a
-- BEFORE INSERT trigger; legacy status/deposit behaviour remains
-- authoritative until the policy activation instant. Nothing in this
-- migration changes customer-visible behaviour.
--
-- Idempotent: guarded creates, create-or-replace functions.
-- Spec: docs/superpowers/specs/2026-07-22-booking-cancellation-rescheduling-policy-design.md
-- Plan: docs/superpowers/plans/2026-07-22-booking-policy-foundation.md (Task 1)
-- ============================================================

-- ── 1. Policy version registry (immutable, inactive v1) ─────────────

create table if not exists public.booking_policy_versions (
  code text primary key,
  change_rule text not null check (change_rule in ('rolling_24h','previous_day_1500')),
  effective_at timestamptz,
  created_at timestamptz not null default now(),
  check (
    case when code = 'legacy_24h'
      then effective_at is not null and effective_at = '-infinity'::timestamptz
      else true
    end
  )
);

insert into public.booking_policy_versions(code, change_rule, effective_at)
values
  ('legacy_24h', 'rolling_24h', '-infinity'::timestamptz),
  ('previous_day_1500_v1', 'previous_day_1500', null)
on conflict (code) do nothing;

-- Policy rows are append-only facts. Code/rule never change; an effective
-- instant, once set, never changes; setting one at all is reserved for the
-- private persisted-latch function added by the rollout plan, which announces
-- itself through a transaction-local latch key. A plain GUC is not treated as
-- authorisation by itself: application roles hold no UPDATE privilege on this
-- table at all, so the only callers that reach this trigger are the owner and
-- future owner-owned functions, and the latch key stops the owner making an
-- accidental ad hoc update.
create or replace function public.guard_booking_policy_versions()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'booking policy versions are immutable' using errcode = 'P0001';
  end if;
  if new.code is distinct from old.code
     or new.change_rule is distinct from old.change_rule
     or new.created_at is distinct from old.created_at then
    raise exception 'booking policy versions are immutable' using errcode = 'P0001';
  end if;
  if new.effective_at is distinct from old.effective_at then
    if old.effective_at is not null then
      raise exception 'a booking policy effective instant cannot be changed once set'
        using errcode = 'P0001';
    end if;
    if coalesce(current_setting('smarter_dog.booking_policy_latch', true), '') <> new.code then
      raise exception 'the booking policy effective instant may only be set by the activation latch'
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_booking_policy_versions on public.booking_policy_versions;
create trigger trg_guard_booking_policy_versions
  before update or delete on public.booking_policy_versions
  for each row execute function public.guard_booking_policy_versions();

alter table public.booking_policy_versions enable row level security;
revoke all on public.booking_policy_versions from public;
revoke all on public.booking_policy_versions from anon, authenticated;

-- ── 2. Reschedule lineages ──────────────────────────────────────────

create table if not exists public.booking_lineages (
  id uuid primary key default gen_random_uuid(),
  human_id uuid not null references public.humans(id),
  self_service_reschedule_count smallint not null default 0
    check (self_service_reschedule_count between 0 and 3),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, human_id)
);

drop trigger if exists booking_lineages_updated on public.booking_lineages;
create trigger booking_lineages_updated before update on public.booking_lineages
  for each row execute function update_modified_column();

alter table public.booking_lineages enable row level security;
revoke all on public.booking_lineages from public;
revoke all on public.booking_lineages from anon, authenticated;

-- ── 3. The visit aggregate ──────────────────────────────────────────

-- Plain CREATE TABLE by design: the static migration contract pins this exact
-- statement. The migration is applied exactly once per environment.
create table public.booking_visits (
  id uuid primary key default gen_random_uuid(),
  lineage_id uuid not null,
  human_id uuid not null references public.humans(id),
  revision smallint not null default 1 check (revision > 0),
  booking_date date not null,
  lifecycle_state text not null default 'active',
  approval_state text not null default 'not_required',
  confirmation_state text not null default 'unconfirmed',
  policy_code text references public.booking_policy_versions(code),
  source text not null default 'staff',
  requested_at timestamptz not null default now(),
  commercial_eligibility_at timestamptz,
  eligibility_policy_code text references public.booking_policy_versions(code),
  runtime_generation text not null default 'legacy_compat'
    check (runtime_generation in ('legacy_compat','visit_v1')),
  legacy_compat_key text,
  confirmed_at timestamptz,
  customer_change_deadline_at timestamptz,
  is_last_minute boolean not null default false,
  supersedes_visit_id uuid references public.booking_visits(id),
  continues_cancelled_visit_id uuid references public.booking_visits(id),
  cancelled_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint booking_visits_lifecycle_check check (lifecycle_state in (
    'active','superseded','cancelled','withdrawn','declined','completed'
  )),
  constraint booking_visits_approval_check check (approval_state in (
    'not_required','waiting_staff','approved','alternative_pending'
  )),
  constraint booking_visits_confirmation_state_check check (
    confirmation_state in ('unconfirmed','confirmed')
  ),
  constraint booking_visits_eligibility_snapshot_check check (
    (commercial_eligibility_at is null) = (eligibility_policy_code is null)
  ),
  constraint booking_visits_legacy_key_check check (
    runtime_generation <> 'legacy_compat' or nullif(trim(legacy_compat_key),'') is not null
  ),
  constraint booking_visits_confirmation_check check (
    (confirmation_state = 'confirmed' and confirmed_at is not null and policy_code is not null)
    or (confirmation_state = 'unconfirmed' and confirmed_at is null and policy_code is null)
  ),
  constraint booking_visits_one_predecessor_kind check (
    num_nonnulls(supersedes_visit_id, continues_cancelled_visit_id) <= 1
  ),
  unique (id, human_id),
  foreign key (lineage_id, human_id)
    references public.booking_lineages(id, human_id)
);

alter table public.bookings
  add column if not exists visit_id uuid references public.booking_visits(id),
  add column if not exists visit_membership_state text not null default 'included'
    check (visit_membership_state in ('included','removed'));

create unique index if not exists booking_visits_one_replacement
  on public.booking_visits(supersedes_visit_id)
  where supersedes_visit_id is not null;
create unique index if not exists booking_visits_one_cancellation_continuation
  on public.booking_visits(continues_cancelled_visit_id)
  where continues_cancelled_visit_id is not null;
create unique index if not exists booking_visits_lineage_revision
  on public.booking_visits(lineage_id, revision);
create unique index if not exists booking_visits_one_active_lineage
  on public.booking_visits(lineage_id)
  where lifecycle_state = 'active';
create index if not exists bookings_visit_id_idx on public.bookings(visit_id);
create index if not exists booking_visits_human_date_idx
  on public.booking_visits(human_id, booking_date);
create unique index if not exists booking_visits_legacy_compat_identity
  on public.booking_visits(human_id, booking_date, legacy_compat_key)
  where runtime_generation = 'legacy_compat';
create unique index if not exists bookings_one_dog_per_visit
  on public.bookings(visit_id, dog_id)
  where visit_id is not null;

drop trigger if exists booking_visits_updated on public.booking_visits;
create trigger booking_visits_updated before update on public.booking_visits
  for each row execute function update_modified_column();

alter table public.booking_visits enable row level security;
revoke all on public.booking_visits from public;
revoke all on public.booking_visits from anon, authenticated;

-- ── 4. Visit axis matrix (lifecycle × approval × confirmation) ──────
--
-- Deferred so an atomic command may pass through intermediate states and be
-- judged on its committed result. The function re-reads the row: a
-- constraint-trigger event may describe a row version that a later statement
-- in the same transaction has already superseded.

create or replace function public.check_booking_visit_axes()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v record;
begin
  select * into v from public.booking_visits where id = new.id;
  if not found then
    return null; -- row deleted later in the same transaction
  end if;

  -- waiting_staff / alternative_pending exist only on active, unconfirmed visits
  if v.approval_state in ('waiting_staff','alternative_pending')
     and (v.lifecycle_state <> 'active' or v.confirmation_state <> 'unconfirmed') then
    raise exception 'visit %: % approval requires an active unconfirmed visit',
      v.id, v.approval_state using errcode = 'P0001';
  end if;

  -- a confirmed visit is either not_required or approved
  if v.confirmation_state = 'confirmed'
     and v.approval_state not in ('not_required','approved') then
    raise exception 'visit %: confirmed visits cannot be awaiting approval', v.id
      using errcode = 'P0001';
  end if;

  -- completed / superseded visits are confirmed; withdrawn / declined never are
  if v.lifecycle_state in ('completed','superseded')
     and v.confirmation_state <> 'confirmed' then
    raise exception 'visit %: % visits must be confirmed', v.id, v.lifecycle_state
      using errcode = 'P0001';
  end if;
  if v.lifecycle_state in ('withdrawn','declined')
     and v.confirmation_state <> 'unconfirmed' then
    raise exception 'visit %: % visits must be unconfirmed', v.id, v.lifecycle_state
      using errcode = 'P0001';
  end if;

  -- lifecycle timestamps appear exactly for their matching terminal state
  if (v.cancelled_at is not null) <> (v.lifecycle_state = 'cancelled') then
    raise exception 'visit %: cancelled_at must match a cancelled lifecycle', v.id
      using errcode = 'P0001';
  end if;
  if (v.completed_at is not null) <> (v.lifecycle_state = 'completed') then
    raise exception 'visit %: completed_at must match a completed lifecycle', v.id
      using errcode = 'P0001';
  end if;

  -- the customer change deadline exists exactly when the visit is confirmed
  if (v.customer_change_deadline_at is not null) <> (v.confirmation_state = 'confirmed') then
    raise exception 'visit %: change deadline must accompany confirmation', v.id
      using errcode = 'P0001';
  end if;

  return null;
end;
$$;

drop trigger if exists ct_booking_visit_axes on public.booking_visits;
create constraint trigger ct_booking_visit_axes
  after insert or update on public.booking_visits
  deferrable initially deferred
  for each row execute function public.check_booking_visit_axes();

-- ── 5. Lineage edges (reschedule replacement / cancellation rebook) ─

create or replace function public.check_booking_visit_lineage_edges()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v record;
  pred record;
  v_pred_pairs text[];
  v_new_pairs text[];
begin
  select * into v from public.booking_visits where id = new.id;
  if not found then
    return null;
  end if;

  if v.supersedes_visit_id is not null then
    select * into pred from public.booking_visits where id = v.supersedes_visit_id;
    if not found
       or pred.human_id <> v.human_id
       or pred.lineage_id <> v.lineage_id then
      raise exception 'visit %: a replacement must stay in its predecessor''s lineage', v.id
        using errcode = 'P0001';
    end if;
    if v.revision <> pred.revision + 1 then
      raise exception 'visit %: replacement revision must follow its predecessor', v.id
        using errcode = 'P0001';
    end if;
    if pred.lifecycle_state <> 'superseded' then
      raise exception 'visit %: a replaced visit must be superseded at commit', v.id
        using errcode = 'P0001';
    end if;
  end if;

  if v.continues_cancelled_visit_id is not null then
    select * into pred from public.booking_visits where id = v.continues_cancelled_visit_id;
    if not found
       or pred.human_id <> v.human_id
       or pred.lineage_id <> v.lineage_id then
      raise exception 'visit %: a cancellation rebook must stay in its lineage', v.id
        using errcode = 'P0001';
    end if;
    if v.revision <> pred.revision + 1 then
      raise exception 'visit %: rebook revision must follow its predecessor', v.id
        using errcode = 'P0001';
    end if;
    if pred.lifecycle_state <> 'cancelled' or pred.cancelled_at is null then
      raise exception 'visit %: a rebook must continue a cancelled visit', v.id
        using errcode = 'P0001';
    end if;
    if v.created_at < pred.cancelled_at
       or v.created_at > pred.cancelled_at + interval '24 hours' then
      raise exception 'visit %: a lineage-preserving rebook must commit within 24 hours of cancellation', v.id
        using errcode = 'P0001';
    end if;
    -- Same canonical dog/service pairs. Add-ons and prices deliberately excluded.
    select array_agg(b.dog_id::text || ':' || b.service order by b.dog_id::text || ':' || b.service)
      into v_pred_pairs
      from public.bookings b
     where b.visit_id = pred.id and b.visit_membership_state = 'included';
    select array_agg(b.dog_id::text || ':' || b.service order by b.dog_id::text || ':' || b.service)
      into v_new_pairs
      from public.bookings b
     where b.visit_id = v.id and b.visit_membership_state = 'included';
    if v_pred_pairs is distinct from v_new_pairs or v_new_pairs is null then
      raise exception 'visit %: a lineage-preserving rebook must keep the same dogs and services', v.id
        using errcode = 'P0001';
    end if;
  end if;

  return null;
end;
$$;

drop trigger if exists ct_booking_visit_lineage_edges on public.booking_visits;
create constraint trigger ct_booking_visit_lineage_edges
  after insert or update on public.booking_visits
  deferrable initially deferred
  for each row execute function public.check_booking_visit_lineage_edges();

-- Linkage columns are write-once, and once a successor exists neither row's
-- lineage/revision/linkage may move again.
create or replace function public.guard_booking_visit_linkage()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.supersedes_visit_id is not null
     and new.supersedes_visit_id is distinct from old.supersedes_visit_id then
    raise exception 'visit %: replacement linkage is immutable', old.id using errcode = 'P0001';
  end if;
  if old.continues_cancelled_visit_id is not null
     and new.continues_cancelled_visit_id is distinct from old.continues_cancelled_visit_id then
    raise exception 'visit %: rebook linkage is immutable', old.id using errcode = 'P0001';
  end if;
  if (new.lineage_id is distinct from old.lineage_id
      or new.revision is distinct from old.revision
      or new.supersedes_visit_id is distinct from old.supersedes_visit_id
      or new.continues_cancelled_visit_id is distinct from old.continues_cancelled_visit_id)
     and exists (
       select 1 from public.booking_visits s
        where s.supersedes_visit_id = old.id
           or s.continues_cancelled_visit_id = old.id
     ) then
    raise exception 'visit %: lineage is immutable once a successor exists', old.id
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_booking_visit_linkage on public.booking_visits;
create trigger trg_guard_booking_visit_linkage
  before update on public.booking_visits
  for each row execute function public.guard_booking_visit_linkage();

-- ── 6. Private visit helpers ────────────────────────────────────────

create or replace function public.visit_rows(p_visit_id uuid)
returns setof public.bookings
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select b.* from public.bookings b
   where b.visit_id = p_visit_id
     and b.visit_membership_state = 'included'
   order by b.slot, b.created_at;
$$;

create or replace function public.visit_start_at(p_visit_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select min(
           (b.booking_date::text || ' ' ||
            case when b.slot ~ '^[0-2][0-9]:[0-5][0-9]$' then b.slot else '08:30' end
           )::timestamp at time zone 'Europe/London')
    from public.bookings b
   where b.visit_id = p_visit_id
     and b.visit_membership_state = 'included';
$$;

revoke all on function public.visit_rows(uuid) from public, anon, authenticated;
revoke all on function public.visit_start_at(uuid) from public, anon, authenticated;

-- ── 7. Legacy compatibility dual-write ──────────────────────────────
--
-- The legacy rolling-24h deadline, preserved byte-for-byte: London wall-clock
-- subtraction from the earliest slot of the visit's date.
create or replace function public.legacy_visit_change_deadline(p_date date, p_slot text)
returns timestamptz
language sql
immutable
set search_path = public, pg_temp
as $$
  select ((p_date::text || ' ' ||
           case when p_slot ~ '^[0-2][0-9]:[0-5][0-9]$' then p_slot else '08:30' end
          )::timestamp - interval '24 hours') at time zone 'Europe/London';
$$;
revoke all on function public.legacy_visit_change_deadline(date, text) from public, anon, authenticated;

-- Find-or-create one legacy_compat visit for (human, date, key) under a
-- transaction advisory lock so simultaneous first rows for one group resolve
-- to a single visit.
create or replace function public.find_or_create_legacy_visit(
  p_human_id uuid,
  p_date date,
  p_key text
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_visit_id uuid;
  v_lineage_id uuid;
begin
  perform pg_advisory_xact_lock(
    hashtextextended('sd_legacy_visit|' || p_human_id::text || '|' || p_date::text || '|' || p_key, 0));

  select id into v_visit_id
    from public.booking_visits
   where human_id = p_human_id
     and booking_date = p_date
     and legacy_compat_key = p_key
     and runtime_generation = 'legacy_compat';
  if found then
    return v_visit_id;
  end if;

  insert into public.booking_lineages (human_id)
  values (p_human_id)
  returning id into v_lineage_id;

  insert into public.booking_visits (
    lineage_id, human_id, booking_date,
    lifecycle_state, approval_state, confirmation_state,
    runtime_generation, legacy_compat_key
  ) values (
    v_lineage_id, p_human_id, p_date,
    'active', 'not_required', 'unconfirmed',
    'legacy_compat', p_key
  )
  on conflict (human_id, booking_date, legacy_compat_key)
    where runtime_generation = 'legacy_compat'
  do nothing
  returning id into v_visit_id;

  if v_visit_id is null then
    select id into v_visit_id
      from public.booking_visits
     where human_id = p_human_id
       and booking_date = p_date
       and legacy_compat_key = p_key
       and runtime_generation = 'legacy_compat';
  end if;
  return v_visit_id;
end;
$$;
revoke all on function public.find_or_create_legacy_visit(uuid, date, text) from public, anon, authenticated;

-- Recompute a legacy_compat visit's lifecycle/confirmation from its children.
-- Dual-write only: it writes the new aggregate and never mutates bookings.
create or replace function public.recompute_legacy_booking_visit(p_visit_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v record;
  c record;
  v_lifecycle text;
  v_confirm boolean;
begin
  if p_visit_id is null then
    return;
  end if;
  select * into v from public.booking_visits
   where id = p_visit_id and runtime_generation = 'legacy_compat'
   for update;
  if not found then
    return;
  end if;
  -- Only recompute states the legacy engine owns; never touch a visit that a
  -- v1 command has already moved into a v1-only shape.
  if v.lifecycle_state in ('superseded','withdrawn','declined') then
    return;
  end if;

  select
    count(*) filter (where visit_membership_state = 'included') as n_total,
    count(*) filter (where visit_membership_state = 'included' and status = 'Cancelled') as n_cancelled,
    count(*) filter (where visit_membership_state = 'included' and status = 'Completed') as n_completed,
    count(*) filter (where visit_membership_state = 'included'
                       and status not in ('Cancelled','Completed')) as n_open,
    bool_or(visit_membership_state = 'included'
            and deposit_required
            and deposit_received_at is null
            and coalesce(payment, '') not in ('Deposit Paid','Paid in Full')
            and status not in ('Cancelled','Completed')) as anomaly,
    min(slot) filter (where visit_membership_state = 'included') as min_slot,
    max(updated_at) as max_updated
  into c
  from public.bookings
  where visit_id = p_visit_id;

  if c.n_total = 0 then
    v_lifecycle := 'cancelled'; -- every row moved away or was excluded
  elsif c.n_open > 0 then
    v_lifecycle := 'active';
  elsif c.n_completed > 0 then
    v_lifecycle := 'completed'; -- mixed terminal favours the visit that happened
  else
    v_lifecycle := 'cancelled';
  end if;

  -- Confirmation only ever moves forward for legacy visits.
  v_confirm := v.confirmation_state = 'confirmed'
    or v_lifecycle = 'completed'
    or (v_lifecycle in ('active','cancelled') and c.n_total > 0 and not coalesce(c.anomaly, false));

  update public.booking_visits
     set lifecycle_state = v_lifecycle,
         cancelled_at = case when v_lifecycle = 'cancelled'
                             then coalesce(cancelled_at, coalesce(c.max_updated, now()))
                             else null end,
         completed_at = case when v_lifecycle = 'completed'
                             then coalesce(completed_at, coalesce(c.max_updated, now()))
                             else null end,
         confirmation_state = case when v_confirm then 'confirmed' else 'unconfirmed' end,
         confirmed_at = case when v_confirm then coalesce(confirmed_at, now()) else null end,
         policy_code = case when v_confirm then coalesce(policy_code, 'legacy_24h') else null end,
         customer_change_deadline_at = case
           when v_confirm then coalesce(
             customer_change_deadline_at,
             public.legacy_visit_change_deadline(v.booking_date, c.min_slot))
           else null end
   where id = p_visit_id;
end;
$$;
revoke all on function public.recompute_legacy_booking_visit(uuid) from public, anon, authenticated;

-- BEFORE INSERT: assign every legacy write a visit. No-op on populated rows.
-- Named aa_* so it runs before trg_stamp_booking_deposit (alphabetical order).
create or replace function public.ensure_legacy_booking_visit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_human uuid;
  v_key text;
begin
  if new.visit_id is not null then
    return new;
  end if;
  select human_id into v_human from public.dogs where id = new.dog_id;
  if v_human is null then
    return new; -- the FK will reject this insert with its own error
  end if;
  if new.id is null then
    new.id := gen_random_uuid();
  end if;
  v_key := case
    when new.group_id is not null then 'group:' || new.group_id::text
    else 'row:' || new.id::text
  end;
  -- One dog appears at most once per visit. A legacy re-insert of the same
  -- dog under the same group key (for example a second slot on the same day)
  -- becomes its own singleton visit instead of tripping the unique index.
  if new.group_id is not null and exists (
    select 1
      from public.booking_visits v
      join public.bookings b on b.visit_id = v.id
     where v.human_id = v_human
       and v.booking_date = new.booking_date
       and v.legacy_compat_key = v_key
       and v.runtime_generation = 'legacy_compat'
       and b.dog_id = new.dog_id
  ) then
    v_key := 'row:' || new.id::text;
  end if;
  new.visit_id := public.find_or_create_legacy_visit(v_human, new.booking_date, v_key);
  return new;
end;
$$;

drop trigger if exists aa_ensure_legacy_booking_visit on public.bookings;
create trigger aa_ensure_legacy_booking_visit
  before insert on public.bookings
  for each row execute function public.ensure_legacy_booking_visit();

-- BEFORE UPDATE: a legacy in-place move (date or dog change) re-homes the row
-- onto the matching visit for the new identity, so the deferred consistency
-- check below stays satisfiable without changing any legacy behaviour.
create or replace function public.reassign_legacy_booking_visit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_generation text;
  v_human uuid;
  v_key text;
begin
  if new.visit_id is null then
    return new;
  end if;
  if new.booking_date = old.booking_date and new.dog_id = old.dog_id then
    return new;
  end if;
  select runtime_generation into v_generation
    from public.booking_visits where id = new.visit_id;
  if v_generation is distinct from 'legacy_compat' then
    return new; -- v1 visits move via atomic commands; the deferred check rejects drift
  end if;
  select human_id into v_human from public.dogs where id = new.dog_id;
  if v_human is null then
    return new;
  end if;
  v_key := case
    when new.group_id is not null then 'group:' || new.group_id::text
    else 'row:' || new.id::text
  end;
  if new.group_id is not null and exists (
    select 1
      from public.booking_visits v
      join public.bookings b on b.visit_id = v.id
     where v.human_id = v_human
       and v.booking_date = new.booking_date
       and v.legacy_compat_key = v_key
       and v.runtime_generation = 'legacy_compat'
       and b.dog_id = new.dog_id
       and b.id <> new.id
  ) then
    v_key := 'row:' || new.id::text;
  end if;
  new.visit_id := public.find_or_create_legacy_visit(v_human, new.booking_date, v_key);
  return new;
end;
$$;

drop trigger if exists aa_reassign_legacy_booking_visit on public.bookings;
create trigger aa_reassign_legacy_booking_visit
  before update of booking_date, dog_id on public.bookings
  for each row execute function public.reassign_legacy_booking_visit();

-- AFTER row change: ripple child status/deposit/membership changes into the
-- owning legacy visit(s).
create or replace function public.sync_legacy_booking_visit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    perform public.recompute_legacy_booking_visit(new.visit_id);
  elsif tg_op = 'UPDATE' then
    perform public.recompute_legacy_booking_visit(new.visit_id);
    if old.visit_id is distinct from new.visit_id then
      perform public.recompute_legacy_booking_visit(old.visit_id);
    end if;
  elsif tg_op = 'DELETE' then
    perform public.recompute_legacy_booking_visit(old.visit_id);
  end if;
  return null;
end;
$$;

drop trigger if exists zz_sync_legacy_booking_visit on public.bookings;
create trigger zz_sync_legacy_booking_visit
  after insert or delete
     or update of status, payment, deposit_required, deposit_received_at,
                  booking_date, dog_id, visit_id, visit_membership_state
  on public.bookings
  for each row execute function public.sync_legacy_booking_visit();

-- Deferred consistency: every attached row matches its visit's date and owner.
create or replace function public.check_booking_visit_consistency()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  b record;
  v record;
  v_owner uuid;
begin
  select * into b from public.bookings where id = new.id;
  if not found or b.visit_id is null then
    return null;
  end if;
  select * into v from public.booking_visits where id = b.visit_id;
  if not found then
    raise exception 'booking %: visit % does not exist', b.id, b.visit_id
      using errcode = 'P0001';
  end if;
  if v.booking_date <> b.booking_date then
    raise exception 'booking %: date does not match its visit', b.id using errcode = 'P0001';
  end if;
  select human_id into v_owner from public.dogs where id = b.dog_id;
  if v_owner is distinct from v.human_id then
    raise exception 'booking %: dog owner does not match its visit', b.id using errcode = 'P0001';
  end if;
  return null;
end;
$$;

drop trigger if exists ct_booking_visit_consistency on public.bookings;
create constraint trigger ct_booking_visit_consistency
  after insert or update on public.bookings
  deferrable initially deferred
  for each row execute function public.check_booking_visit_consistency();

-- ── 8. Backfill every existing booking into a legacy visit ──────────
--
-- One visit per (group_id, booking_date, owner); one singleton visit per
-- null-group row. Recurring chains sharing a group_id split by date. The
-- backfill never guesses that unrelated null-group rows form one visit —
-- possible multi-dog matches surface in the staff review view instead.

do $$
declare
  g record;
  v_visit_id uuid;
  v_confirm boolean;
  v_lifecycle text;
begin
  for g in
    with keyed as (
      select
        b.*,
        d.human_id as owner_id,
        case when b.group_id is not null then 'group:' || b.group_id::text
             else 'row:' || b.id::text end as base_key,
        row_number() over (
          partition by d.human_id, b.booking_date, b.dog_id,
            case when b.group_id is not null then 'group:' || b.group_id::text
                 else 'row:' || b.id::text end
          order by b.created_at, b.id
        ) as dog_occurrence
      from public.bookings b
      join public.dogs d on d.id = b.dog_id
      where b.visit_id is null
    )
    select
      -- A dog can appear only once per visit: any repeat of the same dog
      -- under one group key falls back to its own singleton visit.
      case when b.dog_occurrence > 1 then 'row:' || b.id::text
           else b.base_key end as legacy_key,
      b.owner_id as human_id,
      b.booking_date,
      count(*) as n_total,
      count(*) filter (where b.status = 'Cancelled') as n_cancelled,
      count(*) filter (where b.status = 'Completed') as n_completed,
      count(*) filter (where b.status not in ('Cancelled','Completed')) as n_open,
      bool_or(b.deposit_required
              and b.deposit_received_at is null
              and coalesce(b.payment, '') not in ('Deposit Paid','Paid in Full')
              and b.status not in ('Cancelled','Completed')) as anomaly,
      min(b.slot) as min_slot,
      min(b.created_at) as min_created,
      max(b.updated_at) as max_updated,
      array_agg(b.id) as booking_ids
    from keyed b
    group by 1, 2, 3
  loop
    if g.n_open > 0 then
      v_lifecycle := 'active';
    elsif g.n_completed > 0 then
      v_lifecycle := 'completed';
    else
      v_lifecycle := 'cancelled';
    end if;

    -- Ordinary rows are commercially confirmed under the legacy rule; an
    -- unresolved deposit anomaly stays unconfirmed for staff reconciliation.
    v_confirm := v_lifecycle = 'completed' or not coalesce(g.anomaly, false);

    v_visit_id := public.find_or_create_legacy_visit(g.human_id, g.booking_date, g.legacy_key);

    update public.booking_visits
       set lifecycle_state = v_lifecycle,
           requested_at = g.min_created,
           cancelled_at = case when v_lifecycle = 'cancelled' then g.max_updated else null end,
           completed_at = case when v_lifecycle = 'completed' then g.max_updated else null end,
           confirmation_state = case when v_confirm then 'confirmed' else 'unconfirmed' end,
           confirmed_at = case when v_confirm then g.min_created else null end,
           policy_code = case when v_confirm then 'legacy_24h' else null end,
           customer_change_deadline_at = case when v_confirm
             then public.legacy_visit_change_deadline(g.booking_date, g.min_slot)
             else null end
     where id = v_visit_id;

    update public.bookings
       set visit_id = v_visit_id
     where id = any (g.booking_ids)
       and visit_id is null;
  end loop;
end;
$$;

-- ── 9. Staff group RPC creates one visit per command ────────────────

create or replace function public.create_staff_visit(
  p_human_id uuid,
  p_date date,
  p_key text
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_staff() then
    raise exception 'Staff only' using errcode = '42501';
  end if;
  return public.find_or_create_legacy_visit(p_human_id, p_date, p_key);
end;
$$;
revoke all on function public.create_staff_visit(uuid, date, text) from public;
revoke all on function public.create_staff_visit(uuid, date, text) from anon;
revoke all on function public.create_staff_visit(uuid, date, text) from authenticated;
grant execute on function public.create_staff_visit(uuid, date, text) to authenticated;

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
  v_dog_owner uuid;
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
  v_command_key text;
  v_visit_ids jsonb := '{}'::jsonb;
  v_visit_id  uuid;
  v_seen_dogs uuid[] := '{}'::uuid[];
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

  -- One visit per owner for this command. The staff flow deliberately has no
  -- group_id, so the visit carries a command-scoped compatibility key.
  v_command_key := 'staffcmd:' || gen_random_uuid()::text;

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
    select d.size, d.human_id into v_dog_size, v_dog_owner
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

    -- One legacy_compat visit per dog owner for this command (the modal books
    -- one customer, so ordinarily exactly one visit is created). A repeat of
    -- the same dog in a second slot gets its own singleton visit — one dog
    -- appears at most once per visit.
    if v_seen_dogs @> array[v_dog_id] then
      v_visit_id := public.create_staff_visit(
        v_dog_owner, p_booking_date, v_command_key || ':dup:' || v_idx::text);
    elsif v_visit_ids ? v_dog_owner::text then
      v_visit_id := (v_visit_ids ->> v_dog_owner::text)::uuid;
    else
      v_visit_id := public.create_staff_visit(v_dog_owner, p_booking_date, v_command_key);
      v_visit_ids := v_visit_ids || jsonb_build_object(v_dog_owner::text, v_visit_id::text);
    end if;
    v_seen_dogs := v_seen_dogs || v_dog_id;

    -- The three BEFORE-INSERT gates (calendar, capacity, pregnancy) fire
    -- here per row; any P0001 aborts the whole group — that's the point.
    return query
    insert into public.bookings (
      id, booking_date, slot, dog_id, size, service,
      status, confirmed, addons, payment, pickup_by_id,
      staff_capacity_override, notify_human_ids, confirmation_channel,
      visit_id
    ) values (
      v_id, p_booking_date, v_slot, v_dog_id, v_size, v_service,
      v_status, v_confirmed, v_addons, v_payment, v_pickup,
      v_override, v_notify, v_channel,
      v_visit_id
    )
    returning *;
  end loop;

  return;
end;
$$;

comment on function public.create_staff_booking_group(jsonb, date) is
  'Atomic staff write path for a same-date multi-dog booking group (AUDIT-3). SECURITY INVOKER on purpose: staff already insert directly under RLS, so this adds atomicity, not privilege — the staff INSERT policy and the three BEFORE-INSERT gates apply exactly as on the direct inserts it replaces. All rows insert in one transaction; any rejection rolls the whole group back. Accepts client-generated row ids so the staff UI''s optimistic rows and realtime echoes match. No group_id (matches the existing staff flow); since the visit foundation it dual-writes exactly one legacy_compat booking_visits row per command and owner.';

revoke all on function public.create_staff_booking_group(jsonb, date) from public;
revoke all on function public.create_staff_booking_group(jsonb, date) from anon;
revoke all on function public.create_staff_booking_group(jsonb, date) from authenticated;
grant execute on function public.create_staff_booking_group(jsonb, date) to authenticated;

-- ── 10. Backfill review + audited reconciliation ────────────────────

-- The immutable audit ledger comes first: the review view references it to
-- decide which items are already resolved.
create table if not exists public.booking_visit_backfill_reconciliation_audit (
  id uuid primary key default gen_random_uuid(),
  review_key text not null,
  action text not null check (action in (
    'split_visit','merge_singletons','exclude_terminal_children','set_commercial_state'
  )),
  payload jsonb not null,
  reason text not null check (nullif(trim(reason),'') is not null),
  row_set_hash text not null,
  before_state jsonb not null,
  after_state jsonb not null,
  actor text not null,
  idempotency_key uuid not null unique,
  created_at timestamptz not null default now()
);

alter table public.booking_visit_backfill_reconciliation_audit enable row level security;
revoke all on public.booking_visit_backfill_reconciliation_audit from public;
revoke all on public.booking_visit_backfill_reconciliation_audit from anon, authenticated;

create or replace function public.guard_backfill_reconciliation_audit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  raise exception 'backfill reconciliation audit rows are immutable' using errcode = 'P0001';
end;
$$;

drop trigger if exists trg_guard_backfill_reconciliation_audit
  on public.booking_visit_backfill_reconciliation_audit;
create trigger trg_guard_backfill_reconciliation_audit
  before update or delete on public.booking_visit_backfill_reconciliation_audit
  for each row execute function public.guard_backfill_reconciliation_audit();

create or replace view public.booking_visit_backfill_review
with (security_invoker = true) as
with visit_children as (
  select
    v.id as visit_id,
    v.human_id,
    v.booking_date,
    v.confirmation_state,
    v.lifecycle_state,
    count(b.id) as n_children,
    count(*) filter (where b.status = 'Cancelled') as n_cancelled,
    count(*) filter (where b.status = 'Completed') as n_completed,
    count(*) filter (where b.status not in ('Cancelled','Completed')) as n_open,
    count(distinct coalesce(b.payment, '')) as n_payments,
    count(distinct b.deposit_required::text) as n_deposit_flags,
    array_agg(b.id order by b.id) as booking_ids,
    md5(string_agg(
      b.id::text || '|' || b.status || '|' || coalesce(b.payment,'') || '|' ||
      b.deposit_required::text || '|' || coalesce(b.deposit_received_at::text,'') || '|' ||
      b.visit_membership_state,
      ';' order by b.id)) as row_set_hash
  from public.booking_visits v
  join public.bookings b on b.visit_id = v.id
  where v.runtime_generation = 'legacy_compat'
  group by v.id
),
items as (
  -- Structural: a visit whose children mix open and terminal work.
  select
    'mixedstatus:' || vc.visit_id::text as review_key,
    'structural_mixed_status' as reason_code,
    'structural' as kind,
    vc.human_id, vc.booking_date,
    array[vc.visit_id] as visit_ids,
    vc.booking_ids,
    vc.row_set_hash,
    jsonb_build_object('open', vc.n_open, 'cancelled', vc.n_cancelled,
                       'completed', vc.n_completed) as details
  from visit_children vc
  where vc.n_open > 0 and (vc.n_cancelled > 0 or vc.n_completed > 0)

  union all
  -- Commercial: mixed per-dog deposit/payment values inside one visit.
  select
    'mixedmoney:' || vc.visit_id::text,
    'commercial_mixed_money', 'commercial',
    vc.human_id, vc.booking_date,
    array[vc.visit_id], vc.booking_ids, vc.row_set_hash,
    jsonb_build_object('distinctPayments', vc.n_payments,
                       'distinctDepositFlags', vc.n_deposit_flags)
  from visit_children vc
  where vc.n_children > 1 and (vc.n_payments > 1 or vc.n_deposit_flags > 1)

  union all
  -- Commercial: confirmation could not be inferred safely at backfill.
  select
    'commercial:' || vc.visit_id::text,
    'commercial_unconfirmed_deposit', 'commercial',
    vc.human_id, vc.booking_date,
    array[vc.visit_id], vc.booking_ids, vc.row_set_hash,
    jsonb_build_object('lifecycle', vc.lifecycle_state)
  from visit_children vc
  where vc.confirmation_state = 'unconfirmed' and vc.lifecycle_state = 'active'

  union all
  -- Structural: singleton null-group visits for the same human and date whose
  -- rows were created within five seconds — a possible legacy multi-dog visit.
  select
    'nullgroupcluster:' || cl.human_id::text || ':' || cl.booking_date::text
      || ':' || cl.first_booking_id::text,
    'structural_possible_multi_dog', 'structural',
    cl.human_id, cl.booking_date,
    cl.visit_ids, cl.booking_ids, cl.row_set_hash,
    jsonb_build_object('rowCount', cardinality(cl.booking_ids))
  from (
    select
      v.human_id,
      v.booking_date,
      (array_agg(b.id order by b.id))[1] as first_booking_id,
      array_agg(distinct v.id) as visit_ids,
      array_agg(b.id order by b.id) as booking_ids,
      md5(string_agg(
        b.id::text || '|' || b.status || '|' || coalesce(b.payment,'') || '|' ||
        b.deposit_required::text || '|' || coalesce(b.deposit_received_at::text,'') || '|' ||
        b.visit_membership_state,
        ';' order by b.id)) as row_set_hash,
      max(b.created_at) - min(b.created_at) as spread
    from public.booking_visits v
    join public.bookings b on b.visit_id = v.id
    where v.runtime_generation = 'legacy_compat'
      and v.legacy_compat_key like 'row:%'
    group by v.human_id, v.booking_date
    having count(distinct v.id) > 1
       and max(b.created_at) - min(b.created_at) <= interval '5 seconds'
  ) cl
)
select i.*
from items i
left join lateral (
  select a.row_set_hash
  from public.booking_visit_backfill_reconciliation_audit a
  where a.review_key = i.review_key
  order by a.created_at desc
  limit 1
) resolved on true
where resolved.row_set_hash is distinct from i.row_set_hash;

revoke all on public.booking_visit_backfill_review from public;
revoke all on public.booking_visit_backfill_review from anon, authenticated;

-- Staff read the review list through one gated RPC only.
create or replace function public.get_booking_visit_backfill_review()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_staff() then
    raise exception 'Staff only' using errcode = '42501';
  end if;
  return coalesce(
    (select jsonb_agg(to_jsonb(r) order by r.booking_date, r.review_key)
       from public.booking_visit_backfill_review r),
    '[]'::jsonb);
end;
$$;
revoke all on function public.get_booking_visit_backfill_review() from public;
revoke all on function public.get_booking_visit_backfill_review() from anon;
revoke all on function public.get_booking_visit_backfill_review() from authenticated;
grant execute on function public.get_booking_visit_backfill_review() to authenticated;

-- Shared snapshot of a review item's visit graph for preview/apply audit.
create or replace function public.booking_visit_reconciliation_snapshot(p_visit_ids uuid[])
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'visitId', v.id,
    'humanId', v.human_id,
    'bookingDate', v.booking_date,
    'lifecycleState', v.lifecycle_state,
    'approvalState', v.approval_state,
    'confirmationState', v.confirmation_state,
    'legacyCompatKey', v.legacy_compat_key,
    'children', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'bookingId', b.id,
        'dogId', b.dog_id,
        'slot', b.slot,
        'status', b.status,
        'payment', b.payment,
        'membership', b.visit_membership_state
      ) order by b.id), '[]'::jsonb)
      from public.bookings b where b.visit_id = v.id
    )
  ) order by v.id), '[]'::jsonb)
  from public.booking_visits v
  where v.id = any (p_visit_ids);
$$;
revoke all on function public.booking_visit_reconciliation_snapshot(uuid[]) from public, anon, authenticated;

create or replace function public.preview_booking_visit_backfill_reconciliation(
  p_review_key text,
  p_action text,
  p_payload jsonb
) returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  item record;
  v_blockers jsonb := '[]'::jsonb;
begin
  if not public.is_staff() then
    raise exception 'Staff only' using errcode = '42501';
  end if;
  if p_action not in ('split_visit','merge_singletons','exclude_terminal_children','set_commercial_state') then
    raise exception 'unknown reconciliation action' using errcode = '22023';
  end if;

  select * into item
    from public.booking_visit_backfill_review r
   where r.review_key = p_review_key;
  if not found then
    raise exception 'unknown or already resolved review item' using errcode = 'P0001';
  end if;

  if p_action = 'merge_singletons' and item.reason_code <> 'structural_possible_multi_dog' then
    v_blockers := v_blockers || jsonb_build_array('merge applies only to null-group clusters');
  end if;
  if p_action = 'set_commercial_state' and item.kind <> 'commercial' then
    v_blockers := v_blockers || jsonb_build_array('commercial action on a structural item');
  end if;

  return jsonb_build_object(
    'reviewKey', item.review_key,
    'action', p_action,
    'payload', coalesce(p_payload, '{}'::jsonb),
    'candidateBookingIds', to_jsonb(item.booking_ids),
    'candidateVisitIds', to_jsonb(item.visit_ids),
    'before', public.booking_visit_reconciliation_snapshot(item.visit_ids),
    'blockers', v_blockers,
    'expectedHash', item.row_set_hash
  );
end;
$$;
revoke all on function public.preview_booking_visit_backfill_reconciliation(text, text, jsonb) from public;
revoke all on function public.preview_booking_visit_backfill_reconciliation(text, text, jsonb) from anon;
revoke all on function public.preview_booking_visit_backfill_reconciliation(text, text, jsonb) from authenticated;
grant execute on function public.preview_booking_visit_backfill_reconciliation(text, text, jsonb) to authenticated;

-- Owner-only apply: NOT granted to any application role. It moves membership
-- or corrects the compatibility aggregate, never deletes or rewrites child
-- history, never erases a terminal state, never invents a payment and never
-- touches a financial ledger.
create or replace function public.apply_booking_visit_backfill_reconciliation(
  p_review_key text,
  p_expected_hash text,
  p_action text,
  p_payload jsonb,
  p_reason text,
  p_idempotency_key uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  item record;
  prior record;
  v_before jsonb;
  v_after jsonb;
  v_booking record;
  v_target uuid;
  v_new_visit uuid;
  v_move_ids uuid[];
  v_sources uuid[];
  v_visit record;
  v_confirmation text;
  v_min_slot text;
  v_lock_key text;
begin
  if nullif(trim(coalesce(p_reason,'')),'') is null then
    raise exception 'a reconciliation apply requires a reason' using errcode = '22023';
  end if;
  if p_idempotency_key is null then
    raise exception 'a reconciliation apply requires an idempotency key' using errcode = '22023';
  end if;

  select * into prior
    from public.booking_visit_backfill_reconciliation_audit
   where idempotency_key = p_idempotency_key;
  if found then
    if prior.review_key = p_review_key and prior.action = p_action then
      return jsonb_build_object('replayed', true, 'auditId', prior.id,
                                'after', prior.after_state);
    end if;
    raise exception 'idempotency key already used for a different apply' using errcode = 'P0001';
  end if;

  select * into item
    from public.booking_visit_backfill_review r
   where r.review_key = p_review_key;
  if not found then
    raise exception 'unknown or already resolved review item' using errcode = 'P0001';
  end if;
  if item.row_set_hash <> p_expected_hash then
    raise exception 'stale_review_hash: the underlying rows changed since preview'
      using errcode = 'P0001';
  end if;

  -- Same aggregate/capacity locks as live commands, in sorted order.
  for v_lock_key in
    select distinct b.booking_date::text || '|' || b.slot
      from public.bookings b
     where b.id = any (item.booking_ids)
     order by 1
  loop
    perform pg_advisory_xact_lock(hashtextextended(v_lock_key, 0));
  end loop;

  v_before := public.booking_visit_reconciliation_snapshot(item.visit_ids);

  if p_action = 'merge_singletons' then
    if item.reason_code <> 'structural_possible_multi_dog' then
      raise exception 'merge applies only to null-group clusters' using errcode = 'P0001';
    end if;
    v_target := nullif(p_payload->>'targetVisitId','')::uuid;
    if v_target is null or not (v_target = any (item.visit_ids)) then
      raise exception 'targetVisitId must be one of the review item''s visits' using errcode = '22023';
    end if;
    select array_agg(x) into v_sources
      from unnest(item.visit_ids) x where x <> v_target;
    update public.bookings b
       set visit_id = v_target
     where b.visit_id = any (v_sources);
    -- Emptied source visits settle to cancelled via the sync trigger.

  elsif p_action = 'split_visit' then
    v_move_ids := coalesce(
      (select array_agg(value::uuid) from jsonb_array_elements_text(p_payload->'moveBookingIds')),
      '{}'::uuid[]);
    if cardinality(v_move_ids) = 0 then
      raise exception 'split_visit requires moveBookingIds' using errcode = '22023';
    end if;
    if exists (select 1 from unnest(v_move_ids) m where not (m = any (item.booking_ids))) then
      raise exception 'moveBookingIds must belong to the review item' using errcode = '22023';
    end if;
    if not exists (
      select 1 from public.bookings b
       where b.visit_id = any (item.visit_ids)
         and not (b.id = any (v_move_ids))
    ) then
      raise exception 'split_visit must leave at least one row behind' using errcode = 'P0001';
    end if;
    v_new_visit := public.find_or_create_legacy_visit(
      item.human_id, item.booking_date, 'recon:' || p_idempotency_key::text);
    update public.bookings b
       set visit_id = v_new_visit
     where b.id = any (v_move_ids);

  elsif p_action = 'exclude_terminal_children' then
    v_move_ids := coalesce(
      (select array_agg(value::uuid) from jsonb_array_elements_text(p_payload->'bookingIds')),
      '{}'::uuid[]);
    if cardinality(v_move_ids) = 0 then
      raise exception 'exclude_terminal_children requires bookingIds' using errcode = '22023';
    end if;
    for v_booking in
      select * from public.bookings b where b.id = any (v_move_ids)
    loop
      if not (v_booking.id = any (item.booking_ids)) then
        raise exception 'bookingIds must belong to the review item' using errcode = '22023';
      end if;
      if v_booking.status not in ('Cancelled','Completed') then
        raise exception 'only terminal rows may be excluded from a visit' using errcode = 'P0001';
      end if;
    end loop;
    update public.bookings b
       set visit_membership_state = 'removed'
     where b.id = any (v_move_ids);

  elsif p_action = 'set_commercial_state' then
    if item.kind <> 'commercial' then
      raise exception 'commercial action on a structural item' using errcode = 'P0001';
    end if;
    v_confirmation := p_payload->>'confirmation';
    if v_confirmation not in ('confirmed','unconfirmed') then
      raise exception 'set_commercial_state requires confirmation confirmed|unconfirmed'
        using errcode = '22023';
    end if;
    select * into v_visit from public.booking_visits
     where id = item.visit_ids[1] for update;
    if v_visit.lifecycle_state in ('completed','superseded') and v_confirmation = 'unconfirmed' then
      raise exception 'a completed visit cannot be made unconfirmed' using errcode = 'P0001';
    end if;
    select min(b.slot) into v_min_slot
      from public.bookings b
     where b.visit_id = v_visit.id and b.visit_membership_state = 'included';
    update public.booking_visits
       set confirmation_state = v_confirmation,
           confirmed_at = case when v_confirmation = 'confirmed'
                               then coalesce(confirmed_at, now()) else null end,
           policy_code = case when v_confirmation = 'confirmed'
                              then coalesce(policy_code, 'legacy_24h') else null end,
           customer_change_deadline_at = case when v_confirmation = 'confirmed'
             then coalesce(customer_change_deadline_at,
                           public.legacy_visit_change_deadline(v_visit.booking_date, v_min_slot))
             else null end
     where id = v_visit.id;

  else
    raise exception 'unknown reconciliation action' using errcode = '22023';
  end if;

  -- Structural invariants recheck: every touched row still matches its visit.
  perform 1
    from public.bookings b
    join public.booking_visits v on v.id = b.visit_id
    join public.dogs d on d.id = b.dog_id
   where b.id = any (item.booking_ids)
     and (v.booking_date <> b.booking_date or v.human_id <> d.human_id);
  if found then
    raise exception 'reconciliation would break visit consistency' using errcode = 'P0001';
  end if;

  v_after := public.booking_visit_reconciliation_snapshot(
    (select array_agg(distinct x.vid) from (
       select unnest(item.visit_ids) as vid
       union
       select b.visit_id from public.bookings b
        where b.id = any (item.booking_ids) and b.visit_id is not null
     ) x));

  insert into public.booking_visit_backfill_reconciliation_audit (
    review_key, action, payload, reason, row_set_hash,
    before_state, after_state, actor, idempotency_key
  ) values (
    p_review_key, p_action, coalesce(p_payload, '{}'::jsonb), p_reason,
    p_expected_hash, v_before, v_after, current_user, p_idempotency_key
  );

  return jsonb_build_object('replayed', false, 'after', v_after);
end;
$$;
revoke all on function public.apply_booking_visit_backfill_reconciliation(text, text, text, jsonb, text, uuid) from public;
revoke all on function public.apply_booking_visit_backfill_reconciliation(text, text, text, jsonb, text, uuid) from anon;
revoke all on function public.apply_booking_visit_backfill_reconciliation(text, text, text, jsonb, text, uuid) from authenticated;
revoke all on function public.apply_booking_visit_backfill_reconciliation(text, text, text, jsonb, text, uuid) from service_role;

comment on table public.booking_visits is
  'Visit aggregate: one customer, one appointment date, one or more dogs. Three independent axes (lifecycle/approval/confirmation). legacy_compat rows dual-write the live behaviour until previous_day_1500_v1 activates.';
comment on table public.booking_policy_versions is
  'Immutable booking policy registry. previous_day_1500_v1 stays inactive (effective_at null) until the audited activation latch fires.';
comment on table public.booking_lineages is
  'Durable reschedule lineage per customer; self-service reschedules are capped at three per lineage.';
