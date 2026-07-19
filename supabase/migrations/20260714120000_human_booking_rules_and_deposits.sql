-- ============================================================
-- Human booking rules + deposit-required flow.
--
-- Spec: docs/superpowers/specs/2026-07-14-human-booking-rules-deposit-design.md
-- (reviewed version). Three per-human controls (preferred slots, blocked
-- slots, deposit tag) + the deposit workflow (reference, 12h hold, staff
-- confirm, hourly auto-release).
--
-- Idempotent; apply to prod BY HAND before merging dependent app code.
-- ============================================================

-- ── 1. humans: the three per-customer controls ──────────────
-- Staff-managed. Customers CANNOT edit these: the broad customer UPDATE on
-- humans was removed 2026-07-12 (legal_risk_tranche1); customer profile
-- writes go through fixed-column SECURITY DEFINER functions.
alter table public.humans
  add column if not exists preferred_slots text[] not null default '{}',
  add column if not exists blocked_slots  text[] not null default '{}',
  add column if not exists deposit_required boolean not null default false;

comment on column public.humans.preferred_slots is
  'Steering only, never enforced: slots (HH:MM) this customer usually wants. Staff hint + portal "Your usual time" star.';
comment on column public.humans.blocked_slots is
  'Slots (HH:MM) this customer cannot book. DB-enforced for non-staff by enforce_human_slot_blocks(); staff book them deliberately.';
comment on column public.humans.deposit_required is
  'Deposit tag: every booking for this owner is created awaiting a bank-transfer deposit (see stamp_booking_deposit).';

-- Slot-shape check (HH:MM). Helper is IMMUTABLE so it is legal in a CHECK.
create or replace function public.slots_are_hhmm(p_slots text[])
returns boolean
language sql
immutable
as $$
  select coalesce(
    (select bool_and(s ~ '^[0-2][0-9]:[0-5][0-9]$') from unnest(p_slots) s),
    true
  );
$$;
comment on function public.slots_are_hhmm(text[]) is
  'CHECK helper: every element is HH:MM. Empty/null arrays pass.';
revoke all on function public.slots_are_hhmm(text[]) from public, anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'humans_preferred_slots_hhmm') then
    alter table public.humans
      add constraint humans_preferred_slots_hhmm check (public.slots_are_hhmm(preferred_slots));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'humans_blocked_slots_hhmm') then
    alter table public.humans
      add constraint humans_blocked_slots_hhmm check (public.slots_are_hhmm(blocked_slots));
  end if;
end $$;

-- ── 2. bookings: deposit workflow columns ───────────────────
alter table public.bookings
  add column if not exists deposit_required boolean not null default false,
  add column if not exists deposit_reference text,
  add column if not exists deposit_due_by timestamptz,
  add column if not exists deposit_received_at timestamptz;

comment on column public.bookings.deposit_required is
  'Stamped true at insert when the dog''s owner is deposit-tagged. The awaiting-deposit chip keys off this + payment state + deposit_received_at.';
comment on column public.bookings.deposit_reference is
  'Bank payment reference (SDG-XXXX), derived from owner id + booking_date so every row in a same-day visit shares one reference. SQL is the only author.';
comment on column public.bookings.deposit_due_by is
  'least(created_at + depositReleaseHours, appointment start). Recomputed if a still-awaiting booking is rescheduled. The hourly sweep cancels past-due unpaid rows.';
comment on column public.bookings.deposit_received_at is
  'Trigger-stamped when payment transitions into Deposit Paid / Paid in Full on a deposit_required row (mirrors paid_at); cleared if moved back out.';

-- ── 3. Blocked-slots gate (INSERT OR UPDATE — reschedules are UPDATEs) ──
-- Pattern: calendar/capacity gates, NOT the pregnancy gate (INSERT-only).
-- The WhatsApp manage-booking path updates bookings in place
-- (20260619130000); autonomous applies run as service role (is_staff()
-- false), so the UPDATE arm is load-bearing, not belt-and-braces.
create or replace function public.enforce_human_slot_blocks()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_blocked text[];
begin
  if is_staff() then
    return new;
  end if;

  -- Cancelling (or already cancelled) rows are never gated.
  if coalesce(new.status, 'Booked') = 'Cancelled' then
    return new;
  end if;

  -- Metadata-only updates pass; validate when slot or date moves, or a
  -- Cancelled row is reactivated (same guard shape as validate_booking_capacity).
  if tg_op = 'UPDATE'
     and new.slot is not distinct from old.slot
     and new.booking_date is not distinct from old.booking_date
     and not (old.status = 'Cancelled' and new.status is distinct from 'Cancelled')
  then
    return new;
  end if;

  select h.blocked_slots into v_blocked
    from public.dogs d
    join public.humans h on h.id = d.human_id
   where d.id = new.dog_id;

  if v_blocked is not null and new.slot = any (v_blocked) then
    -- Distinct, customer-mappable message (wizard + WhatsApp Flow map on
    -- error.code/message; must not collide with calendar/capacity/pregnancy).
    raise exception using errcode = 'P0001',
      message = 'That time isn''t available for your account — please pick a different time or message the salon.';
  end if;

  return new;
end;
$$;

comment on function public.enforce_human_slot_blocks() is
  'BEFORE INSERT OR UPDATE gate on bookings: non-staff cannot book (or be rescheduled into) a slot in the owner''s humans.blocked_slots. Staff bypass via is_staff(). Skips cancellations and metadata-only updates.';
revoke all on function public.enforce_human_slot_blocks() from public, anon, authenticated;

drop trigger if exists trg_enforce_human_slot_blocks on public.bookings;
create trigger trg_enforce_human_slot_blocks
  before insert or update on public.bookings
  for each row execute function public.enforce_human_slot_blocks();

-- ── 4. Deposit reference + due-by helpers ───────────────────
-- Reference: SDG- + 4 chars from a 32-char unambiguous alphabet (no 0/O/1/I),
-- md5-derived from owner + date → every row of a same-day visit shares one
-- reference with zero cross-row coordination, on EVERY route (staff groups
-- deliberately have no group_id, so group-id derivation would split refs).
create or replace function public.deposit_reference_for(p_owner uuid, p_date date)
returns text
language plpgsql
immutable
as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_hash text := md5(p_owner::text || ':' || p_date::text);
  v_out text := '';
  i int;
begin
  for i in 0..3 loop
    v_out := v_out || substr(
      v_alphabet,
      ((('x' || substr(v_hash, i * 2 + 1, 2))::bit(8)::int) % 32) + 1,
      1
    );
  end loop;
  return 'SDG-' || v_out;
end;
$$;
comment on function public.deposit_reference_for(uuid, date) is
  'Deterministic bank reference for a customer-visit: SDG- + 4 chars (alphabet ABCDEFGHJKLMNPQRSTUVWXYZ23456789) from md5(owner:date). SQL is the only author of references.';
revoke all on function public.deposit_reference_for(uuid, date) from public, anon, authenticated;

-- Due-by: least(created + release window, appointment start in Europe/London).
-- Window from salon_config.settings->>'depositReleaseHours' (camelCase — the
-- app persists SalonSettings keys as-is), default 12.
create or replace function public.deposit_due_by_for(
  p_created timestamptz,
  p_date date,
  p_slot text
)
returns timestamptz
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_hours numeric;
  v_start timestamptz;
begin
  select coalesce((sc.settings ->> 'depositReleaseHours')::numeric, 12)
    into v_hours
    from public.salon_config sc
   limit 1;
  if v_hours is null or v_hours <= 0 then
    v_hours := 12;
  end if;

  v_start := (p_date::text || ' ' || p_slot)::timestamp at time zone 'Europe/London';
  return least(p_created + (v_hours || ' hours')::interval, v_start);
end;
$$;
comment on function public.deposit_due_by_for(timestamptz, date, text) is
  'least(created + depositReleaseHours (settings, default 12h), appointment start Europe/London). Used by the stamping trigger on insert and on reschedule of an awaiting row.';
revoke all on function public.deposit_due_by_for(timestamptz, date, text) from public, anon, authenticated;

-- ── 5. Deposit stamping (ALL inserts — staff insert directly via RLS) ──
create or replace function public.stamp_booking_deposit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_required boolean;
  v_owner uuid;
begin
  if tg_op = 'INSERT' then
    select coalesce(h.deposit_required, false), h.id
      into v_required, v_owner
      from public.dogs d
      join public.humans h on h.id = d.human_id
     where d.id = new.dog_id;

    if not coalesce(v_required, false) then
      return new;
    end if;

    new.deposit_required := true;
    new.deposit_reference := public.deposit_reference_for(v_owner, new.booking_date);
    -- Column defaults are applied before BEFORE-ROW triggers, so created_at
    -- is already set; coalesce is a safety net only.
    new.deposit_due_by := public.deposit_due_by_for(
      coalesce(new.created_at, now()), new.booking_date, new.slot);
    return new;
  end if;

  -- UPDATE: a still-awaiting booking moved to a new date/slot gets a fresh
  -- due-by against the new appointment (keeps the original created_at base
  -- and the original reference; never touches received/paid rows).
  if new.deposit_required
     and new.deposit_received_at is null
     and coalesce(new.payment, 'Due at Pick-up') not in ('Deposit Paid', 'Paid in Full')
     and (new.booking_date is distinct from old.booking_date
          or new.slot is distinct from old.slot)
  then
    new.deposit_due_by := public.deposit_due_by_for(
      coalesce(new.created_at, old.created_at, now()), new.booking_date, new.slot);
  end if;
  return new;
end;
$$;

comment on function public.stamp_booking_deposit() is
  'BEFORE INSERT on bookings: when the dog''s owner is deposit-tagged, stamps deposit_required + deposit_reference (owner+date derived) + deposit_due_by. BEFORE UPDATE OF booking_date, slot: recomputes due-by for still-awaiting rows.';
revoke all on function public.stamp_booking_deposit() from public, anon, authenticated;

drop trigger if exists trg_stamp_booking_deposit on public.bookings;
create trigger trg_stamp_booking_deposit
  before insert on public.bookings
  for each row execute function public.stamp_booking_deposit();

drop trigger if exists trg_stamp_booking_deposit_reschedule on public.bookings;
create trigger trg_stamp_booking_deposit_reschedule
  before update of booking_date, slot on public.bookings
  for each row execute function public.stamp_booking_deposit();

-- ── 6. deposit_received_at: payment-transition stamp (mirrors paid_at) ──
create or replace function public.set_booking_deposit_received_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.deposit_required then
    if new.payment in ('Deposit Paid', 'Paid in Full') then
      new.deposit_received_at := coalesce(new.deposit_received_at, now());
    else
      new.deposit_received_at := null;
    end if;
  end if;
  return new;
end;
$$;
comment on function public.set_booking_deposit_received_at() is
  'BEFORE UPDATE (payment changed): stamps deposit_received_at when a deposit_required booking''s payment enters Deposit Paid / Paid in Full; clears it when moved back out. Mirrors set_booking_paid_at.';
revoke all on function public.set_booking_deposit_received_at() from public, anon, authenticated;

drop trigger if exists trg_set_booking_deposit_received_at on public.bookings;
create trigger trg_set_booking_deposit_received_at
  before update on public.bookings
  for each row
  when (old.payment is distinct from new.payment)
  execute function public.set_booking_deposit_received_at();

-- ── 7. Hourly auto-release sweep ────────────────────────────
-- Only status='Booked' rows: an arrived / in-bath / ready dog is being
-- groomed — never auto-cancel it over an unmatched bank transfer.
-- 'Paid in Full' counts as satisfied (customer paid everything up front).
-- Cancellation is a plain status UPDATE: the capacity/calendar/blocked gates
-- all skip rows whose resulting status is Cancelled, and the existing
-- AFTER-UPDATE notification + booking_events triggers carry the customer
-- message and staff push — pure SQL, no edge-function call, no Vault secret.
create extension if not exists pg_cron;

select cron.unschedule(jobid) from cron.job where jobname = 'deposit-auto-release';
select cron.schedule(
  'deposit-auto-release',
  '20 * * * *',
  $$
    update public.bookings
       set status = 'Cancelled',
           cancel_reason = 'Deposit not received'
     where deposit_required
       and deposit_received_at is null
       and coalesce(payment, 'Due at Pick-up') not in ('Deposit Paid', 'Paid in Full')
       and status = 'Booked'
       and deposit_due_by is not null
       and now() > deposit_due_by
  $$
);

-- Partial index so the hourly sweep and the Today "awaiting" list stay
-- cheap. Predicate must be immutable — payment/received filters live in
-- the queries.
create index if not exists idx_bookings_deposit_awaiting
  on public.bookings (deposit_due_by)
  where deposit_required and status = 'Booked';
