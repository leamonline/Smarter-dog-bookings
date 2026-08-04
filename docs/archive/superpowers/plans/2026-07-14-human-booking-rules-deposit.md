# Human Booking Rules & Deposit-Required Flow — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Per-human preferred/blocked timeslots plus a deposit-required tag whose bookings await a bank-transfer deposit (unique reference, 12-hour hold, staff confirm, hourly auto-cancel).

**Architecture:** One migration adds `humans`/`bookings` columns, a `BEFORE INSERT OR UPDATE` blocked-slots gate, a deposit-stamping trigger (reference + due-by computed in SQL), a payment-transition stamp for `deposit_received_at`, and an hourly `pg_cron` sweep. Pure-TS helpers in `src/engine/deposits.ts` drive all UI decisions. Staff UI = human-card Booking rules panel + awaiting-deposit chip/actions + Today section. Portal = slot filter/star + deposit panels. Settings = bank details + release hours.

**Tech Stack:** Postgres (plpgsql triggers, pg_cron), React 19 + Vite, Vitest (logic: node; component: jsdom), Tailwind 4.

**Spec:** `docs/superpowers/specs/2026-07-14-human-booking-rules-deposit-design.md` (the reviewed version, commit 2dd8b41).

## Global Constraints

- Branch `feat/human-booking-rules-deposit`; never push to `main`.
- CI bar before push: `npm run lint && npm run typecheck && npm run check:migrations && npm run test && npm run build` — all green.
- Migration idempotent; every new SQL function ends with a revoke block (`revoke all ... from public, anon, authenticated`); applied to prod BY HAND before merging dependent code.
- Payment-state literals are exactly `"Due at Pick-up"`, `"Deposit Paid"`, `"Paid in Full"`.
- Status literals from `BOOKING_STATUS` in `src/constants/salon.ts` (`Booked`, `Cancelled`, …) — never bare strings in app code.
- No bare `console` in `src/` (use `src/lib/logger.ts`); no `.js` extension on imports whose target is `.ts`.
- Settings keys persist camelCase in `salon_config.settings` jsonb: `depositBank`, `depositReleaseHours` (SQL reads `settings->>'depositReleaseHours'`).
- **Deviation from spec (deliberate):** the reference derivation lives ONLY in SQL (`deposit_reference_for`). The TS engine validates/format-checks but never generates — one author, no ×2 drift. UK English in all copy.

---

### Task 1: Migration — columns, gates, stamping, cron sweep

**Files:**
- Create: `supabase/migrations/20260714120000_human_booking_rules_and_deposits.sql`

**Interfaces:**
- Produces (DB): `humans.preferred_slots text[]`, `humans.blocked_slots text[]`, `humans.deposit_required boolean`; `bookings.deposit_required boolean`, `bookings.deposit_reference text`, `bookings.deposit_due_by timestamptz`, `bookings.deposit_received_at timestamptz`; functions `deposit_reference_for(uuid, date)`, `deposit_due_by_for(timestamptz, date, text)`, triggers `trg_enforce_human_slot_blocks`, `trg_stamp_booking_deposit`, `trg_set_booking_deposit_received_at`; cron job `deposit-auto-release`.
- Reference format: `SDG-` + 4 chars of `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (32 chars, no 0/O/1/I), derived from `md5(owner_id:booking_date)`.

- [ ] **Step 1: Write the migration**

```sql
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
          or new.slot is not distinct from old.slot is false)
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
```

- [ ] **Step 2: Validate ordering + lint**

Run: `npm run check:migrations`
Expected: passes (filename `20260714120000_...` sorts after `20260712115759_...`).

- [ ] **Step 3: Verify the WhatsApp Flow's P0001 surface (read-only check)**

Run: `grep -n "P0001\|sqlerrm\|exception" supabase/migrations/20260619120000_whatsapp_group_booking_rpc.sql supabase/functions/_shared/manageBooking.ts | head -20`
Expected: confirm the Flow RPC / edge shared code re-raises or forwards the trigger's message text to the customer. If it swallows it into a generic error, note the file+line in the commit message as a follow-up — do NOT widen scope here.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260714120000_human_booking_rules_and_deposits.sql
git commit -m "feat(db): human booking rules columns, blocked-slot gate, deposit stamping + auto-release"
```

---

### Task 2: Engine — `src/engine/deposits.ts` (TDD)

**Files:**
- Create: `src/engine/deposits.ts`
- Create: `src/engine/deposits.test.ts`

**Interfaces:**
- Consumes: `londonWallClockToUtcMs(dateStr, timeHHMM)` from `src/engine/today.ts`; `BOOKING_STATUS` from `../constants/salon`.
- Produces:
  - `DEFAULT_DEPOSIT_RELEASE_HOURS = 12`
  - `DEPOSIT_REFERENCE_PATTERN: RegExp` and `isDepositReference(value: string): boolean`
  - `SETTLED_PAYMENT_STATES: readonly string[]` (`["Deposit Paid", "Paid in Full"]`)
  - `depositDueByMs(createdAtMs: number, bookingDate: string, slot: string, releaseHours?: number): number`
  - `isAwaitingDeposit(b: { depositRequired?: boolean | null; depositReceivedAt?: string | null; payment?: string | null; status?: string | null }): boolean`
  - `partitionSlotsForHuman<T extends { dropOffTime: string }>(allocations: T[], rules: { blockedSlots?: string[] | null; preferredSlots?: string[] | null }): { preferred: T[]; rest: T[] }`
  - `buildAwaitingDeposits(bookings: Array<Booking-like>, now: Date): AwaitingDeposit[]` where `AwaitingDeposit = { booking; dueByMs: number | null; minutesLeft: number | null; overdue: boolean }`, sorted soonest-due first, overdue first.

- [ ] **Step 1: Write the failing tests** (`src/engine/deposits.test.ts`)

```ts
import { describe, it, expect } from "vitest";
import {
  DEFAULT_DEPOSIT_RELEASE_HOURS,
  isDepositReference,
  depositDueByMs,
  isAwaitingDeposit,
  partitionSlotsForHuman,
  buildAwaitingDeposits,
} from "./deposits";
import { londonWallClockToUtcMs } from "./today";

describe("isDepositReference", () => {
  it("accepts SDG- plus four unambiguous chars", () => {
    expect(isDepositReference("SDG-7K3M")).toBe(true);
    expect(isDepositReference("SDG-ABCD")).toBe(true);
  });
  it("rejects ambiguous chars, wrong length, wrong prefix", () => {
    expect(isDepositReference("SDG-0OIL")).toBe(false); // 0/O/I excluded... L allowed? no: 1/I excluded, L allowed — 0 and O and I make this fail
    expect(isDepositReference("SDG-AB")).toBe(false);
    expect(isDepositReference("XXX-ABCD")).toBe(false);
    expect(isDepositReference("")).toBe(false);
  });
});

describe("depositDueByMs", () => {
  // Booking made Mon 2026-07-13 09:00 UTC for Wed 2026-07-15 10:00 London.
  const created = Date.UTC(2026, 6, 13, 9, 0, 0);
  it("is created + 12h when the appointment is further away", () => {
    expect(depositDueByMs(created, "2026-07-15", "10:00")).toBe(
      created + DEFAULT_DEPOSIT_RELEASE_HOURS * 3_600_000,
    );
  });
  it("caps at the appointment start when that is sooner", () => {
    // Same-day: created 09:00 UTC (=10:00 London), appointment 13:00 London.
    const start = londonWallClockToUtcMs("2026-07-13", "13:00");
    expect(depositDueByMs(created, "2026-07-13", "13:00")).toBe(start);
  });
  it("honours a custom release window", () => {
    expect(depositDueByMs(created, "2026-07-20", "10:00", 2)).toBe(
      created + 2 * 3_600_000,
    );
  });
});

describe("isAwaitingDeposit", () => {
  const base = { depositRequired: true, depositReceivedAt: null, payment: "Due at Pick-up", status: "Booked" };
  it("is true for an unpaid deposit-required Booked row", () => {
    expect(isAwaitingDeposit(base)).toBe(true);
  });
  it("is false once Deposit Paid, Paid in Full, received stamp, cancelled, or untagged", () => {
    expect(isAwaitingDeposit({ ...base, payment: "Deposit Paid" })).toBe(false);
    expect(isAwaitingDeposit({ ...base, payment: "Paid in Full" })).toBe(false);
    expect(isAwaitingDeposit({ ...base, depositReceivedAt: "2026-07-13T10:00:00Z" })).toBe(false);
    expect(isAwaitingDeposit({ ...base, status: "Cancelled" })).toBe(false);
    expect(isAwaitingDeposit({ ...base, depositRequired: false })).toBe(false);
  });
});

describe("partitionSlotsForHuman", () => {
  const slots = [{ dropOffTime: "08:30" }, { dropOffTime: "09:00" }, { dropOffTime: "10:00" }];
  it("drops blocked slots and floats preferred first", () => {
    const { preferred, rest } = partitionSlotsForHuman(slots, {
      blockedSlots: ["09:00"],
      preferredSlots: ["10:00"],
    });
    expect(preferred.map((s) => s.dropOffTime)).toEqual(["10:00"]);
    expect(rest.map((s) => s.dropOffTime)).toEqual(["08:30"]);
  });
  it("passes everything through untouched with no rules", () => {
    const { preferred, rest } = partitionSlotsForHuman(slots, {});
    expect(preferred).toEqual([]);
    expect(rest).toEqual(slots);
  });
});

describe("buildAwaitingDeposits", () => {
  const now = new Date("2026-07-13T10:00:00Z");
  const mk = (id: string, dueBy: string | null, extra = {}) => ({
    id, status: "Booked", payment: "Due at Pick-up",
    depositRequired: true, depositReceivedAt: null, depositDueBy: dueBy,
    ...extra,
  });
  it("lists awaiting rows, overdue first then soonest-due", () => {
    const rows = [
      mk("later", "2026-07-13T20:00:00Z"),
      mk("overdue", "2026-07-13T09:00:00Z"),
      mk("soon", "2026-07-13T11:00:00Z"),
      mk("paid", "2026-07-13T11:00:00Z", { payment: "Deposit Paid" }),
      mk("untagged", null, { depositRequired: false }),
    ];
    const out = buildAwaitingDeposits(rows as never[], now);
    expect(out.map((e) => (e.booking as { id: string }).id)).toEqual(["overdue", "soon", "later"]);
    expect(out[0].overdue).toBe(true);
    expect(out[1].minutesLeft).toBe(60);
  });
});
```

- [ ] **Step 2: Run — verify fail**

Run: `npx vitest run src/engine/deposits.test.ts`
Expected: FAIL — module `./deposits` not found.

- [ ] **Step 3: Implement `src/engine/deposits.ts`**

```ts
// Deposit-required flow + per-human slot rules: pure selectors, zero React.
// The DB is the authority (stamping trigger + hourly sweep, migration
// 20260714120000); everything here mirrors those rules for display and
// defence-in-depth filtering. The reference itself is SQL-generated ONLY
// (deposit_reference_for) — this module validates, never derives.
import { BOOKING_STATUS } from "../constants/salon";
import { londonWallClockToUtcMs } from "./today";

export const DEFAULT_DEPOSIT_RELEASE_HOURS = 12;

/** SDG- + 4 chars of the unambiguous alphabet (no 0/O/1/I). */
export const DEPOSIT_REFERENCE_PATTERN = /^SDG-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/;

export function isDepositReference(value: string): boolean {
  return DEPOSIT_REFERENCE_PATTERN.test(value);
}

/** Payment states that satisfy a required deposit. Exact DB literals. */
export const SETTLED_PAYMENT_STATES = ["Deposit Paid", "Paid in Full"] as const;

/** least(created + window, appointment start) — Europe/London aware. */
export function depositDueByMs(
  createdAtMs: number,
  bookingDate: string,
  slot: string,
  releaseHours: number = DEFAULT_DEPOSIT_RELEASE_HOURS,
): number {
  const windowEnd = createdAtMs + releaseHours * 3_600_000;
  const appointmentStart = londonWallClockToUtcMs(bookingDate, slot);
  return Math.min(windowEnd, appointmentStart);
}

export interface DepositStateFields {
  depositRequired?: boolean | null;
  depositReceivedAt?: string | null;
  payment?: string | null;
  status?: string | null;
}

/** Mirrors the sweep predicate (migration 20260714120000). */
export function isAwaitingDeposit(b: DepositStateFields): boolean {
  if (!b.depositRequired) return false;
  if (b.depositReceivedAt) return false;
  if (b.status === BOOKING_STATUS.CANCELLED) return false;
  const payment = b.payment || "Due at Pick-up";
  return !(SETTLED_PAYMENT_STATES as readonly string[]).includes(payment);
}

export interface HumanSlotRules {
  blockedSlots?: string[] | null;
  preferredSlots?: string[] | null;
}

/**
 * Portal slot list: blocked slots vanish (defence in depth in front of the
 * trigger), preferred slots float to the top ("Your usual time").
 */
export function partitionSlotsForHuman<T extends { dropOffTime: string }>(
  allocations: T[],
  rules: HumanSlotRules,
): { preferred: T[]; rest: T[] } {
  const blocked = new Set(rules.blockedSlots ?? []);
  const preferredSet = new Set(rules.preferredSlots ?? []);
  const visible = allocations.filter((a) => !blocked.has(a.dropOffTime));
  return {
    preferred: visible.filter((a) => preferredSet.has(a.dropOffTime)),
    rest: visible.filter((a) => !preferredSet.has(a.dropOffTime)),
  };
}

export interface AwaitingDepositFields extends DepositStateFields {
  depositDueBy?: string | null;
}

export interface AwaitingDeposit<T extends AwaitingDepositFields = AwaitingDepositFields> {
  booking: T;
  dueByMs: number | null;
  minutesLeft: number | null;
  overdue: boolean;
}

/**
 * Today view "awaiting deposit" section: every unpaid deposit booking with
 * time left, overdue rows first (the cron sweep takes them at :20 past),
 * then soonest-due.
 */
export function buildAwaitingDeposits<T extends AwaitingDepositFields>(
  bookings: T[],
  now: Date,
): AwaitingDeposit<T>[] {
  const nowMs = now.getTime();
  const items: AwaitingDeposit<T>[] = [];
  for (const b of bookings) {
    if (!isAwaitingDeposit(b)) continue;
    const dueByMs = b.depositDueBy ? new Date(b.depositDueBy).getTime() : null;
    const minutesLeft = dueByMs == null ? null : Math.round((dueByMs - nowMs) / 60_000);
    items.push({
      booking: b,
      dueByMs,
      minutesLeft,
      overdue: minutesLeft != null && minutesLeft < 0,
    });
  }
  return items.sort((a, c) => {
    if (a.overdue !== c.overdue) return a.overdue ? -1 : 1;
    return (a.dueByMs ?? Infinity) - (c.dueByMs ?? Infinity);
  });
}
```

- [ ] **Step 4: Run — verify pass**

Run: `npx vitest run src/engine/deposits.test.ts`
Expected: PASS (all suites).

- [ ] **Step 5: Commit**

```bash
git add src/engine/deposits.ts src/engine/deposits.test.ts
git commit -m "feat(engine): deposit due-by/awaiting selectors + per-human slot partitioning"
```

---

### Task 3: Types, transforms, humans mapping, repo readers (TDD)

**Files:**
- Modify: `src/types/index.ts` (Human + Booking interfaces)
- Modify: `src/supabase/transforms.ts` (`DbHumanRow`, `DbBookingRow`, booking transform ~line 388)
- Modify: `src/supabase/hooks/humans/helpers.ts` (`buildHumanMapEntry`)
- Modify: `src/supabase/hooks/humans/useHumanMutations.ts` (dbUpdates + savedHuman)
- Modify: `src/supabase/repositories/humansRepo.ts` (new reader)
- Modify: `src/supabase/repositories/bookingsRepo.ts` (new reader)
- Test: `src/supabase/repositories/humansRepo.test.ts` (extend)

**Interfaces:**
- Produces (app objects): `Human.preferredSlots: string[]`, `Human.blockedSlots: string[]`, `Human.depositRequired: boolean`; `Booking.depositRequired: boolean`, `Booking.depositReference: string | null`, `Booking.depositDueBy: string | null`, `Booking.depositReceivedAt: string | null`.
- Produces (repos):
  - `getBookingRules(client, humanId): Promise<{ preferredSlots: string[]; blockedSlots: string[]; depositRequired: boolean } | null>` in `humansRepo.ts` (returns null on error/missing — callers fail open to "no rules").
  - `getDepositSettings(client): Promise<{ bank: { accountName: string; sortCode: string; accountNumber: string } | null; releaseHours: number }>` in `bookingsRepo.ts` (reads `salon_config.settings`; customer SELECT policy exists; degrades to `{ bank: null, releaseHours: 12 }`).

- [ ] **Step 1: Extend `src/types/index.ts`**

In `interface Human` (after `reminderChannels: string[];`):

```ts
  /** Booking rules (staff-managed on the human card). */
  preferredSlots: string[];
  blockedSlots: string[];
  depositRequired: boolean;
```

In `interface Booking` (find it near `depositAmount?: number | null;` at src/types/index.ts:89 and add alongside):

```ts
  /** Deposit-required workflow (owner tagged; DB-stamped, read-only here). */
  depositRequired?: boolean;
  depositReference?: string | null;
  depositDueBy?: string | null;
  depositReceivedAt?: string | null;
```

- [ ] **Step 2: Extend transforms**

`src/supabase/transforms.ts` — `DbHumanRow` gains:

```ts
  preferred_slots?: string[] | null;
  blocked_slots?: string[] | null;
  deposit_required?: boolean | null;
```

`DbBookingRow` gains:

```ts
  deposit_required?: boolean | null;
  deposit_reference?: string | null;
  deposit_due_by?: string | null;
  deposit_received_at?: string | null;
```

Booking transform output (immediately after `depositAmount: row.deposit_amount ?? null,` at src/supabase/transforms.ts:388):

```ts
      // Deposit-required workflow (migration 20260714120000). DB-stamped;
      // the app reads these, never writes them.
      depositRequired: row.deposit_required === true,
      depositReference: row.deposit_reference ?? null,
      depositDueBy: row.deposit_due_by ?? null,
      depositReceivedAt: row.deposit_received_at ?? null,
```

- [ ] **Step 3: Extend the humans map entry + mutations**

`src/supabase/hooks/humans/helpers.ts` — in `buildHumanMapEntry`'s returned object (after `reminderChannels`):

```ts
    preferredSlots: row.preferred_slots || [],
    blockedSlots: row.blocked_slots || [],
    depositRequired: row.deposit_required === true,
```

`src/supabase/hooks/humans/useHumanMutations.ts` — in `updateHuman`'s `dbUpdates` mapping (after the `reminderChannels` lines at :104-105):

```ts
      if (updates.preferredSlots !== undefined)
        dbUpdates.preferred_slots = updates.preferredSlots;
      if (updates.blockedSlots !== undefined)
        dbUpdates.blocked_slots = updates.blockedSlots;
      if (updates.depositRequired !== undefined)
        dbUpdates.deposit_required = updates.depositRequired;
```

And in the `savedHuman` object (after `reminderChannels: ...`):

```ts
        preferredSlots: savedRow.preferred_slots || [],
        blockedSlots: savedRow.blocked_slots || [],
        depositRequired: savedRow.deposit_required === true,
```

- [ ] **Step 4: Repo readers**

Append to `src/supabase/repositories/humansRepo.ts`:

```ts
export interface HumanBookingRules {
  preferredSlots: string[];
  blockedSlots: string[];
  depositRequired: boolean;
}

/**
 * Per-human booking rules for the portal wizard (customers can SELECT their
 * own humans row). Returns null on any error — callers treat that as "no
 * rules" and rely on the DB trigger as the authority.
 */
export async function getBookingRules(
  client: SupabaseClient,
  humanId: string,
): Promise<HumanBookingRules | null> {
  if (!client || !humanId) return null;
  const { data, error } = await client
    .from("humans")
    .select("preferred_slots, blocked_slots, deposit_required")
    .eq("id", humanId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    preferredSlots: data.preferred_slots || [],
    blockedSlots: data.blocked_slots || [],
    depositRequired: data.deposit_required === true,
  };
}
```

Append to `src/supabase/repositories/bookingsRepo.ts` (import nothing new beyond the existing `SupabaseClient` type):

```ts
export interface DepositSettings {
  bank: { accountName: string; sortCode: string; accountNumber: string } | null;
  releaseHours: number;
}

/**
 * Bank details + release window for the deposit panels. Reads
 * salon_config.settings (customers hold a SELECT policy). Degrades to
 * { bank: null, releaseHours: 12 } — panels then show the reference and
 * amount without bank details rather than erroring.
 */
export async function getDepositSettings(client: SupabaseClient): Promise<DepositSettings> {
  const fallback: DepositSettings = { bank: null, releaseHours: 12 };
  if (!client) return fallback;
  const { data, error } = await client
    .from("salon_config")
    .select("settings")
    .limit(1)
    .maybeSingle();
  if (error || !data?.settings) return fallback;
  const s = data.settings as {
    depositBank?: { accountName?: string; sortCode?: string; accountNumber?: string } | null;
    depositReleaseHours?: number | null;
  };
  const bank = s.depositBank;
  const complete = Boolean(bank?.accountName && bank?.sortCode && bank?.accountNumber);
  return {
    bank: complete
      ? { accountName: bank!.accountName!, sortCode: bank!.sortCode!, accountNumber: bank!.accountNumber! }
      : null,
    releaseHours:
      typeof s.depositReleaseHours === "number" && s.depositReleaseHours > 0
        ? s.depositReleaseHours
        : 12,
  };
}
```

- [ ] **Step 5: Unit tests** — extend `src/supabase/repositories/humansRepo.test.ts` with a `getBookingRules` block following the file's existing mock-client pattern (read the top of the file first and reuse its client stub helper):

```ts
describe("getBookingRules", () => {
  it("maps snake_case rules and defaults empties", async () => {
    const client = mockClientReturning({
      preferred_slots: ["09:00"], blocked_slots: null, deposit_required: true,
    });
    expect(await getBookingRules(client, "h1")).toEqual({
      preferredSlots: ["09:00"], blockedSlots: [], depositRequired: true,
    });
  });
  it("returns null on error", async () => {
    expect(await getBookingRules(mockClientErroring(), "h1")).toBeNull();
  });
});
```

(If the existing file has no reusable stub, build the minimal chainable stub inline: `{ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data, error }) }) }) }) }`.)

- [ ] **Step 6: Run the affected tests + typecheck**

Run: `npx vitest run src/supabase/repositories/humansRepo.test.ts && npm run typecheck`
Expected: PASS / clean.

- [ ] **Step 7: Commit**

```bash
git add src/types/index.ts src/supabase/transforms.ts src/supabase/hooks/humans/helpers.ts src/supabase/hooks/humans/useHumanMutations.ts src/supabase/repositories/humansRepo.ts src/supabase/repositories/bookingsRepo.ts src/supabase/repositories/humansRepo.test.ts
git commit -m "feat(data): booking-rules + deposit fields through types, transforms and repos"
```

---

### Task 4: Human card — Booking rules panel + header chip

**Files:**
- Create: `src/components/modals/human-card/BookingRulesPanel.jsx`
- Create: `src/components/modals/human-card/BookingRulesPanel.component.test.jsx`
- Modify: `src/components/modals/HumanCardModal.jsx` (render the panel)
- Modify: `src/components/modals/human-card/HumanHeader.jsx` (deposit chip + blocks indicator)
- Modify: `src/components/modals/human-card/index.js` (export)

**Interfaces:**
- Consumes: `SALON_SLOTS` from `src/constants/salon.ts`; the human draft/save flow of `HumanCardModal` (read `useHumanDraft.js` + how `NotesPanel`/`RemindersPanel` receive `draft`/`onChange` props and copy that wiring exactly — panels receive current values and an update callback; saves flow through the modal's existing save path into `updateHuman`).
- Produces: `<BookingRulesPanel preferredSlots blockedSlots depositRequired onChange={...} disabled />` calling `onChange({ preferredSlots?, blockedSlots?, depositRequired? })` with camelCase keys matching Task 3's `updateHuman` mapping.

- [ ] **Step 1: Write the failing component test**

```jsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { BookingRulesPanel } from "./BookingRulesPanel.jsx";

describe("BookingRulesPanel", () => {
  it("marks a preferred slot and reports it", () => {
    const onChange = vi.fn();
    render(<BookingRulesPanel preferredSlots={[]} blockedSlots={[]} depositRequired={false} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /preferred 09:00/i }));
    expect(onChange).toHaveBeenCalledWith({ preferredSlots: ["09:00"] });
  });

  it("blocking a slot clears it from preferred (mutual exclusion)", () => {
    const onChange = vi.fn();
    render(<BookingRulesPanel preferredSlots={["09:00"]} blockedSlots={[]} depositRequired={false} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /blocked 09:00/i }));
    expect(onChange).toHaveBeenCalledWith({ blockedSlots: ["09:00"], preferredSlots: [] });
  });

  it("toggles the deposit tag", () => {
    const onChange = vi.fn();
    render(<BookingRulesPanel preferredSlots={[]} blockedSlots={[]} depositRequired={false} onChange={onChange} />);
    fireEvent.click(screen.getByRole("switch", { name: /deposit required/i }));
    expect(onChange).toHaveBeenCalledWith({ depositRequired: true });
  });
});
```

Run: `npx vitest run src/components/modals/human-card/BookingRulesPanel.component.test.jsx` → FAIL (module missing).

- [ ] **Step 2: Implement the panel**

Before writing, read `src/components/modals/human-card/RemindersPanel.jsx` and copy its Card/section chrome + class names so the panel matches the modal's look. Core behaviour (adapt markup classes to match siblings):

```jsx
// Booking rules — staff-only controls on the human card:
//  • preferred slots: steering only (portal stars them, never enforced)
//  • blocked slots: DB-enforced for non-staff (trigger 20260714120000);
//    staff can still book them deliberately
//  • deposit required: every booking for this customer is created
//    awaiting a bank-transfer deposit (12h hold, then auto-released)
// A slot can't be both preferred and blocked — picking one clears the other.
import { SALON_SLOTS } from "../../../constants/salon";

export function BookingRulesPanel({
  preferredSlots = [],
  blockedSlots = [],
  depositRequired = false,
  onChange,
  disabled = false,
}) {
  const toggle = (list, slot) =>
    list.includes(slot) ? list.filter((s) => s !== slot) : [...list, slot].sort();

  const togglePreferred = (slot) => {
    const next = { preferredSlots: toggle(preferredSlots, slot) };
    if (blockedSlots.includes(slot)) next.blockedSlots = blockedSlots.filter((s) => s !== slot);
    onChange(next);
  };

  const toggleBlocked = (slot) => {
    const next = { blockedSlots: toggle(blockedSlots, slot) };
    if (preferredSlots.includes(slot)) next.preferredSlots = preferredSlots.filter((s) => s !== slot);
    onChange(next);
  };

  const slotRow = (kind, selected, onToggle) => (
    <div className="flex flex-wrap gap-1.5">
      {SALON_SLOTS.map((slot) => {
        const on = selected.includes(slot);
        return (
          <button
            key={slot}
            type="button"
            aria-label={`${kind} ${slot}`}
            aria-pressed={on}
            disabled={disabled}
            onClick={() => onToggle(slot)}
            className={/* match sibling pill classes; active state per kind */ ""}
          >
            {slot}
          </button>
        );
      })}
    </div>
  );

  return (
    <section aria-label="Booking rules">
      {/* Preferred */}
      <h4>Preferred times</h4>
      <p>Shown to you and gently starred for them in the portal — never enforced.</p>
      {slotRow("preferred", preferredSlots, togglePreferred)}

      {/* Blocked */}
      <h4>Blocked times</h4>
      <p>They can't book these themselves — you still can, deliberately.</p>
      {slotRow("blocked", blockedSlots, toggleBlocked)}

      {/* Deposit */}
      <label>
        <span>Deposit required</span>
        <button
          type="button"
          role="switch"
          aria-checked={depositRequired}
          aria-label="Deposit required"
          disabled={disabled}
          onClick={() => onChange({ depositRequired: !depositRequired })}
        />
      </label>
      <p>
        Every booking for this customer holds its slot awaiting a £10 bank
        transfer (unique reference, 12-hour window) and is released
        automatically if it doesn't arrive.
      </p>
    </section>
  );
}
```

- [ ] **Step 3: Wire into `HumanCardModal.jsx`** — render `<BookingRulesPanel />` alongside `RemindersPanel` (same draft plumbing: pass current values from the human/draft, and route `onChange` patches into the same state the other panels use so the modal's existing save calls `updateHuman` with the new camelCase keys). Export from `human-card/index.js` if siblings are exported there.

- [ ] **Step 4: Header chip** — in `HumanHeader.jsx`, next to the existing badges (find the pending-signup badge block), add:

```jsx
{human?.depositRequired && (
  <span className="...badge classes matching siblings..." title="Every booking awaits a deposit">
    Deposit customer
  </span>
)}
{(human?.blockedSlots?.length ?? 0) > 0 && (
  <span className="...muted badge..." title={`Blocked times: ${human.blockedSlots.join(", ")}`}>
    {human.blockedSlots.length} blocked {human.blockedSlots.length === 1 ? "time" : "times"}
  </span>
)}
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/components/modals/human-card/ && npm run lint`
Expected: new test PASS, existing human-card tests still PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/modals/human-card/ src/components/modals/HumanCardModal.jsx
git commit -m "feat(staff): booking rules panel + deposit chip on the human card"
```

---

### Task 5: Staff booking surfaces — awaiting chip, deposit panel, one-tap received

**Files:**
- Modify: `src/components/modals/BookingDetailModal.jsx` (+ its `booking-detail/` part if a new section file fits better: create `src/components/modals/booking-detail/DepositSection.jsx`)
- Modify: `src/components/booking/BookingCardNew.jsx` (chip)
- Test: `src/components/modals/booking-detail/DepositSection.component.test.jsx`

**Interfaces:**
- Consumes: `isAwaitingDeposit`, from `src/engine/deposits`; `Booking.depositReference/.depositDueBy/.depositAmount`; `getDepositSettings` from `src/supabase/repositories/bookingsRepo`; the modal's existing save path (`useBookingSave` → `updateBooking` — payment changes already persist through it; `deposit_received_at` is trigger-stamped, so "Deposit received" ONLY sets `payment: "Deposit Paid"`).
- Produces: `<DepositSection booking onMarkReceived />`.

- [ ] **Step 1: Failing component test** (`DepositSection.component.test.jsx`)

```jsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { DepositSection } from "./DepositSection.jsx";

const awaiting = {
  id: "b1", status: "Booked", payment: "Due at Pick-up",
  depositRequired: true, depositReference: "SDG-7K3M",
  depositDueBy: "2026-07-15T09:00:00Z", depositReceivedAt: null,
  depositAmount: 10,
};

describe("DepositSection", () => {
  it("shows reference + due time and fires mark-received", () => {
    const onMarkReceived = vi.fn();
    render(<DepositSection booking={awaiting} onMarkReceived={onMarkReceived} />);
    expect(screen.getByText("SDG-7K3M")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /deposit received/i }));
    expect(onMarkReceived).toHaveBeenCalled();
  });

  it("renders nothing when not awaiting", () => {
    const { container } = render(
      <DepositSection booking={{ ...awaiting, payment: "Deposit Paid" }} onMarkReceived={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
```

Run: `npx vitest run src/components/modals/booking-detail/DepositSection.component.test.jsx` → FAIL.

- [ ] **Step 2: Implement `DepositSection.jsx`** — read `PaymentStateSection.jsx` first and reuse its section chrome. Behaviour:

```jsx
// Awaiting-deposit panel on the booking detail modal. Renders only while
// the booking is awaiting (isAwaitingDeposit); shows amount, reference,
// due time and a copy-ready WhatsApp line; "Deposit received" sets the
// existing Deposit Paid payment state (deposit_received_at is stamped by
// the DB trigger — nothing else to write).
import { useEffect, useState } from "react";
import { supabase } from "../../../supabase/client.js";
import { getDepositSettings } from "../../../supabase/repositories/bookingsRepo";
import { isAwaitingDeposit } from "../../../engine/deposits";

export function DepositSection({ booking, onMarkReceived }) {
  const [bank, setBank] = useState(null);
  const awaiting = isAwaitingDeposit(booking);

  useEffect(() => {
    if (!awaiting) return;
    let cancelled = false;
    getDepositSettings(supabase).then((s) => { if (!cancelled) setBank(s.bank); });
    return () => { cancelled = true; };
  }, [awaiting]);

  if (!awaiting) return null;

  const dueLabel = booking.depositDueBy
    ? new Date(booking.depositDueBy).toLocaleString("en-GB", {
        weekday: "short", hour: "2-digit", minute: "2-digit",
      })
    : null;
  const amount = booking.depositAmount ?? 10;
  const pasteLine = [
    `To hold your booking, please send the £${amount} deposit`,
    bank ? `to ${bank.accountName}, sort code ${bank.sortCode}, account ${bank.accountNumber}` : null,
    `with reference ${booking.depositReference}`,
    dueLabel ? `by ${dueLabel}` : null,
  ].filter(Boolean).join(" ") + ". Deposits are non-refundable and can't be transferred if you don't show.";

  return (
    <section aria-label="Deposit">
      <h4>Awaiting deposit</h4>
      <p>
        £{amount} · reference <strong>{booking.depositReference}</strong>
        {dueLabel ? <> · due {dueLabel}</> : null}
      </p>
      <button type="button" onClick={() => navigator.clipboard?.writeText(pasteLine)}>
        Copy WhatsApp message
      </button>
      <button type="button" onClick={onMarkReceived}>
        Deposit received
      </button>
    </section>
  );
}
```

- [ ] **Step 3: Wire into `BookingDetailModal.jsx`** — render `<DepositSection booking={booking} onMarkReceived={...} />` near `PaymentStateSection`; `onMarkReceived` reuses the modal's existing payment-change path to set `payment: "Deposit Paid"` and save (the same code path the payment `<select>` uses via `useBookingSave` — do not write `deposit_received_at` from the client).

- [ ] **Step 4: Chip on `BookingCardNew.jsx`** — where status/payment chips render, add (import `isAwaitingDeposit`):

```jsx
{isAwaitingDeposit(booking) && (
  <span className="...chip classes matching siblings...">Awaiting deposit</span>
)}
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/components/modals/booking-detail/ src/components/booking/BookingCardNew.component.test.jsx`
Expected: PASS (new + existing).

- [ ] **Step 6: Commit**

```bash
git add src/components/modals/booking-detail/ src/components/modals/BookingDetailModal.jsx src/components/booking/BookingCardNew.jsx
git commit -m "feat(staff): awaiting-deposit chip, deposit panel + one-tap received"
```

---

### Task 6: Today view — awaiting-deposit attention section

**Files:**
- Modify: `src/components/views/TodayView.jsx` (new section)
- Create: `src/components/views/today/AwaitingDepositsCard.jsx`
- Test: `src/components/views/today/AwaitingDepositsCard.component.test.jsx`

**Interfaces:**
- Consumes: `buildAwaitingDeposits` from `src/engine/deposits` (Task 2); the bookings TodayView already holds; the card patterns in `src/components/views/today/parts.jsx`.
- Produces: `<AwaitingDepositsCard bookings now onOpenBooking />` — renders nothing when no awaiting rows (today's Today view stays untouched for everyone else).

- [ ] **Step 1: Failing test**

```jsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { AwaitingDepositsCard } from "./AwaitingDepositsCard.jsx";

const awaiting = {
  id: "b1", dogName: "Rex", status: "Booked", payment: "Due at Pick-up",
  depositRequired: true, depositReference: "SDG-7K3M",
  depositDueBy: "2026-07-14T18:00:00Z", depositReceivedAt: null, slot: "09:00",
};

describe("AwaitingDepositsCard", () => {
  it("lists awaiting bookings with time left", () => {
    render(
      <AwaitingDepositsCard bookings={[awaiting]} now={new Date("2026-07-14T16:00:00Z")} onOpenBooking={() => {}} />,
    );
    expect(screen.getByText(/awaiting deposit/i)).toBeInTheDocument();
    expect(screen.getByText(/Rex/)).toBeInTheDocument();
    expect(screen.getByText(/2h left/i)).toBeInTheDocument();
  });
  it("renders nothing when none are awaiting", () => {
    const { container } = render(
      <AwaitingDepositsCard bookings={[]} now={new Date()} onOpenBooking={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
```

Run → FAIL.

- [ ] **Step 2: Implement** — follow the card chrome in `parts.jsx`:

```jsx
import { buildAwaitingDeposits } from "../../../engine/deposits";

function timeLeftLabel(minutesLeft, overdue) {
  if (overdue) return "overdue — releases at 20 past";
  if (minutesLeft == null) return "";
  if (minutesLeft >= 120) return `${Math.floor(minutesLeft / 60)}h left`;
  if (minutesLeft >= 60) return `1h ${minutesLeft - 60}m left`;
  return `${minutesLeft}m left`;
}

export function AwaitingDepositsCard({ bookings, now, onOpenBooking }) {
  const items = buildAwaitingDeposits(bookings || [], now);
  if (items.length === 0) return null;
  return (
    <section aria-label="Awaiting deposit">
      <h3>Awaiting deposit</h3>
      <ul>
        {items.map(({ booking, minutesLeft, overdue }) => (
          <li key={booking.id}>
            <button type="button" onClick={() => onOpenBooking(booking)}>
              <span>{booking.dogName}</span>
              <span>{booking.depositReference}</span>
              <span>{timeLeftLabel(minutesLeft, overdue)}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

Note: `buildAwaitingDeposits` needs bookings **including future dates** to be useful (a deposit booking for Friday made today). TodayView holds today's bookings — check what booking collections it receives; if only today's, scope v1 to today's awaiting rows and say so in a code comment (`// v1: today's diary only — future awaiting rows surface on their day`). Do not add a new data fetch in this task.

- [ ] **Step 3: Wire into `TodayView.jsx`** below the existing concern sections, passing the same `bookings` + `now` the other sections use and the existing open-booking handler.

- [ ] **Step 4: Run**

Run: `npx vitest run src/components/views/today/`
Expected: PASS (new + existing today tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/views/today/ src/components/views/TodayView.jsx
git commit -m "feat(today): awaiting-deposit attention card"
```

---

### Task 7: Portal wizard — slot filter/star + deposit confirmation panel

**Files:**
- Modify: `src/components/customer/booking/SlotSelection.tsx`
- Modify: `src/components/customer/booking/BookingWizard.tsx`
- Modify: `src/components/customer/booking/BookingConfirmation.tsx`
- Test: `src/components/customer/booking/SlotSelection.rules.component.test.tsx`

**Interfaces:**
- Consumes: `partitionSlotsForHuman` (Task 2), `getBookingRules` (Task 3), `getDepositSettings` (Task 3), `humanRecord.id` (BookingWizard prop), `customerSupabase` client.
- Produces: `SlotSelection` gains an optional `humanId?: string` prop; `BookingConfirmation` gains optional `deposit?: { amount: number; reference: string | null; dueBy: string | null; bank: { accountName: string; sortCode: string; accountNumber: string } | null }`.

- [ ] **Step 1: Failing test** (`SlotSelection.rules.component.test.tsx`) — follow the mocking style of `SlotSelection.lastminute.component.test.tsx` (read it first; it mocks the repo module). Mock `getBookingRules` to return `{ preferredSlots: ["09:00"], blockedSlots: ["10:00"], depositRequired: false }` and the availability fetches to offer 09:00 + 10:00; assert 10:00 is absent and 09:00 renders inside the "Your usual time" group with a star.

- [ ] **Step 2: Implement in `SlotSelection.tsx`**
  - Add `humanId` to `SlotSelectionProps`; add `getBookingRules` to the repo imports and `partitionSlotsForHuman` from `../../../engine/deposits`.
  - In the availability `Promise.all`, add `humanId ? getBookingRules(supabase, humanId) : Promise.resolve(null)`.
  - After the last-minute filter: `const { preferred, rest } = partitionSlotsForHuman(results, rules ?? {});` and store both.
  - Render a "Your usual time" group above "Morning drop-offs" for `preferred` (star icon, reuse `renderSlotTile` with a `⭐`/`Star` icon variant); `rest` feeds the existing morning/afternoon split.
  - The empty state must key off `preferred.length + rest.length === 0`.

- [ ] **Step 3: Wire `humanId` in `BookingWizard.tsx`** — pass `humanId={humanRecord.id}` where `<SlotSelection ...>` is rendered.

- [ ] **Step 4: Deposit panel on the confirmation step** — in `BookingWizard.tsx`, on mount (or lazily at the confirm step) fetch `getBookingRules(supabase, humanRecord.id)`; when `depositRequired`, after a successful create, fetch the created rows' `deposit_reference`/`deposit_due_by` (the create path returns the rows — check `createMany`/`create_customer_booking_group` return shape; if rows aren't returned with the new columns, re-select the new booking ids with `.select("deposit_reference, deposit_due_by, deposit_amount")`), plus `getDepositSettings`, and pass `deposit` into `BookingConfirmation`. In `BookingConfirmation.tsx` render, when `deposit` present:

```tsx
{deposit && (
  <div className="wizard-card" role="status" aria-label="Deposit needed">
    <h3>One last step — your £{deposit.amount} deposit</h3>
    {deposit.bank && (
      <p>
        Please send £{deposit.amount} to <strong>{deposit.bank.accountName}</strong>,
        sort code <strong>{deposit.bank.sortCode}</strong>, account{" "}
        <strong>{deposit.bank.accountNumber}</strong>.
      </p>
    )}
    <p>
      Use the reference <strong>{deposit.reference}</strong>
      {deposit.dueBy
        ? <> by <strong>{new Date(deposit.dueBy).toLocaleString("en-GB", { weekday: "long", hour: "2-digit", minute: "2-digit" })}</strong></>
        : null}.
    </p>
    <p>
      Your booking is confirmed once your deposit arrives. Deposits are
      non-refundable and can't be transferred to another date if you don't show.
    </p>
  </div>
)}
```

- [ ] **Step 5: Run**

Run: `npx vitest run src/components/customer/booking/ && npm run typecheck`
Expected: PASS / clean.

- [ ] **Step 6: Commit**

```bash
git add src/components/customer/booking/
git commit -m "feat(portal): blocked-slot filtering, preferred stars + deposit instructions"
```

---

### Task 8: Portal dashboard — awaiting-deposit panel on appointments

**Files:**
- Modify: `src/components/customer/AppointmentsSection.jsx` (or `BookingCard.jsx` if the per-booking card is the better seam — read both, pick the one that owns per-booking detail copy)
- Test: `src/components/customer/AppointmentsSection.component.test.jsx` (create if absent; follow `BookingCard.component.test.jsx` style)

**Interfaces:**
- Consumes: `isAwaitingDeposit` (Task 2), `getDepositSettings` (Task 3), booking objects from CustomerDashboard's `select("*", dogs(...))` — the new columns arrive automatically but snake_case: map them where the dashboard shapes its booking objects (find where `payment`/`deposit_amount` are read in `CustomerDashboard.jsx` around lines 102-130 and mirror: `depositRequired: row.deposit_required === true`, `depositReference: row.deposit_reference ?? null`, `depositDueBy: row.deposit_due_by ?? null`, `depositReceivedAt: row.deposit_received_at ?? null`).

- [ ] **Step 1: Failing test** — render the appointments card with an awaiting booking; assert amount, reference `SDG-…`, due time, and the policy line ("confirmed once your deposit arrives") appear; assert nothing deposit-related renders for a normal booking.

- [ ] **Step 2: Implement** — inside the upcoming-booking card, when `isAwaitingDeposit(booking)`:

```jsx
<div className="portal-alert" role="status">
  <strong>Deposit needed to hold this booking.</strong>{" "}
  Send £{booking.depositAmount ?? 10}
  {bank ? <> to {bank.accountName} (sort code {bank.sortCode}, account {bank.accountNumber})</> : null}
  {" "}with reference <strong>{booking.depositReference}</strong>
  {booking.depositDueBy ? <> by {new Date(booking.depositDueBy).toLocaleString("en-GB", { weekday: "long", hour: "2-digit", minute: "2-digit" })}</> : null}.
  {" "}Your booking is confirmed once your deposit arrives. Deposits are
  non-refundable and can't be transferred to another date if you don't show.
</div>
```

`bank` from `getDepositSettings(customerSupabase)` fetched once in the section (null-safe).

- [ ] **Step 3: Run**

Run: `npx vitest run src/components/customer/`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/customer/
git commit -m "feat(portal): awaiting-deposit instructions on the dashboard"
```

---

### Task 9: Settings — bank details + release window, then the full CI bar

**Files:**
- Modify: `src/types/index.ts` (`SalonSettings`)
- Modify: `src/constants/salonSettings.ts` (defaults + merge)
- Modify: `src/components/views/settings/BookingRulesSettings.jsx` (deposit fields)
- Test: extend `src/components/views/settings/` tests if a BookingRulesSettings test exists; otherwise cover via the merge-defaults unit test below.

**Interfaces:**
- Produces: `SalonSettings.depositBank: { accountName: string; sortCode: string; accountNumber: string }`, `SalonSettings.depositReleaseHours: number` — persisted camelCase in `salon_config.settings` (these exact keys are what the SQL `deposit_due_by_for` and `getDepositSettings` read).

- [ ] **Step 1: Types + defaults**

`src/types/index.ts`, in `SalonSettings` (after `autoConfirm: boolean;`):

```ts
  /** Bank details customers are GIVEN to pay deposits into (not secrets). */
  depositBank: { accountName: string; sortCode: string; accountNumber: string };
  /** Hours an unpaid deposit booking holds its slot (default 12). */
  depositReleaseHours: number;
```

`src/constants/salonSettings.ts`:

```ts
export const DEFAULT_DEPOSIT_BANK: SalonSettings["depositBank"] = {
  accountName: "",
  sortCode: "",
  accountNumber: "",
};
export const DEFAULT_DEPOSIT_RELEASE_HOURS = 12;
```

Add both to `createDefaultSalonSettings()` (`depositBank: cloneJson(DEFAULT_DEPOSIT_BANK), depositReleaseHours: DEFAULT_DEPOSIT_RELEASE_HOURS,`) and make sure `mergeSalonSettings` deep-merges `depositBank` the same way it handles `customerPortal` (read its body; copy the nested-object merge branch).

- [ ] **Step 2: Unit test the merge** — in the existing salonSettings test file (find with `ls src/constants/*.test.ts` — if none exists, add `src/constants/salonSettings.test.ts`):

```ts
import { describe, it, expect } from "vitest";
import { mergeSalonSettings } from "./salonSettings";

describe("deposit settings defaults", () => {
  it("defaults releaseHours 12 and empty bank", () => {
    const s = mergeSalonSettings(null);
    expect(s.depositReleaseHours).toBe(12);
    expect(s.depositBank).toEqual({ accountName: "", sortCode: "", accountNumber: "" });
  });
  it("keeps persisted values and fills gaps", () => {
    const s = mergeSalonSettings({ depositBank: { accountName: "Smarter Dog" } } as never);
    expect(s.depositBank.accountName).toBe("Smarter Dog");
    expect(s.depositBank.sortCode).toBe("");
  });
});
```

- [ ] **Step 3: Settings UI** — in `BookingRulesSettings.jsx`, after the existing `InlineField`s, add a "Deposits" group using the same `InlineField`/`SettingRow` primitives:

```jsx
<InlineField
  label="Deposit hold window"
  sublabel="Hours an unpaid deposit booking keeps its slot"
  suffix="hours"
  value={config?.depositReleaseHours ?? 12}
  onChange={(e) => updateNumericField("depositReleaseHours", e.target.value)}
  disabled={!canEdit}
  error={errors.depositReleaseHours}
/>
<InlineField
  label="Deposit account name"
  sublabel="Shown to customers with their payment reference"
  value={config?.depositBank?.accountName ?? ""}
  onChange={(e) => updateConfigField("depositBank", { ...(config?.depositBank ?? {}), accountName: e.target.value })}
  disabled={!canEdit}
/>
<InlineField
  label="Sort code"
  value={config?.depositBank?.sortCode ?? ""}
  onChange={(e) => updateConfigField("depositBank", { ...(config?.depositBank ?? {}), sortCode: e.target.value })}
  disabled={!canEdit}
/>
<InlineField
  label="Account number"
  value={config?.depositBank?.accountNumber ?? ""}
  onChange={(e) => updateConfigField("depositBank", { ...(config?.depositBank ?? {}), accountNumber: e.target.value })}
  disabled={!canEdit}
/>
```

(If `InlineField` requires a `suffix`, pass `suffix=""` or check its signature in `shared.jsx` first.)

- [ ] **Step 4: The full CI bar**

Run: `npm run lint && npm run typecheck && npm run check:migrations && npm run test && npm run build`
Expected: ALL pass. (Local caveat from memory: ~6 directory tests fail locally only via localStorage isolation — compare failures against a clean `git stash` run before chasing.)

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts src/constants/salonSettings.ts src/constants/salonSettings.test.ts src/components/views/settings/BookingRulesSettings.jsx
git commit -m "feat(settings): deposit bank details + release window"
```

---

## Deploy order (after all tasks green — from the spec)

1. Apply `20260714120000_human_booking_rules_and_deposits.sql` to prod BY HAND (verify with a `select` that columns/triggers/cron exist).
2. Push the branch, open the PR (CI must be green), merge — Vercel deploys the frontend.
3. Smoke-check: tag a test human, staff-book them, confirm the reference/chip appear; untag after.
