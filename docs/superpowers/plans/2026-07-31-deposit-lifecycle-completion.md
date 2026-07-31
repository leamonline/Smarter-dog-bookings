# Deposit Lifecycle Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When staff verify a deposit, the customer is told, the money change is audited, the visit ledger is mirrored, and staff can see outstanding deposits — all without activating booking-policy v1.

**Architecture:** A thin `AFTER UPDATE` trigger observes the `deposit_received_at` null → not-null transition and makes three durable writes in the staff member's own transaction (audit event, `legacy_import` ledger mirror, outbox row) with no network I/O. A cron drain hands outbox rows to an extensible dispatcher that routes via a target map shared with the existing staff resend path.

**Tech Stack:** Postgres 15 (plpgsql triggers, pg_cron, pg_net), Supabase Edge Functions (Deno), React 19 + TypeScript, pgTAP, Vitest.

## Global Constraints

- **Legacy booking writes remain authoritative.** Never replace `bookings.payment` → `deposit_received_at` as the write path.
- **The trigger observes, it does not command.** No RPC, no UI call, no `SECURITY DEFINER` entry point for acknowledgement.
- **The visit ledger is mirrored via `legacy_import` only.** `origin='legacy_import'`, `satisfaction_source='legacy_import'`.
- **The outbox is intent. `notification_log` is delivery history.** Never resolve recipients or channels in SQL.
- **No booking-policy v1 mutation command is activated.** `src/security/bookingPolicyInactiveIsolation.test.ts` must stay green and unmodified.
- **Every new function ends with an explicit revoke block** (`docs/migrations.md`), and `supabase/tests/179_trigger_function_grants.test.sql` must stay green.
- **Migration timestamp:** `20260731110000` — sorts after `20260731100000_revoke_anon_trigger_function_grants.sql`.
- **Prod project ref:** `nlzhllhkigmsvrzduefz`. Migrations are applied to prod **by hand, before** the code that depends on them merges.
- **No bare `console` in `src/`** — use `src/lib/logger.ts`.
- **pgTAP runs in CI** (`DB Tests (pgTAP)` workflow, needs Docker). Local pgTAP requires the Homebrew bootstrap in `local-pgtap-without-docker`; the practical verification loop for SQL tasks is *push the branch and read the workflow*.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `supabase/migrations/20260731110000_deposit_lifecycle_completion.sql` | Outbox table, unique indexes, both observer triggers, drain cron. One migration, built across Tasks 1–3 and 6. |
| `supabase/tests/180_deposit_lifecycle.test.sql` | pgTAP: idempotency, non-rollback, release semantics. |
| `supabase/functions/_shared/notificationTargets.ts` | The single `kind`/`trigger_type` → `{fn, key}` routing map. Shared by the staff resend path and the automated dispatcher. |
| `supabase/functions/_shared/notificationTargets.test.ts` | Deno tests for the map. |
| `supabase/functions/resend-booking-notification/index.ts` | Modify: import the shared map instead of its local `TARGET`. |
| `supabase/functions/notification-dispatch/index.ts` | New: server-to-server outbox drain, routes via the shared map. |
| `src/engine/today.ts` | Modify: add the `deposit` attention kind. |
| `src/engine/today.test.ts` | Vitest for inclusion rules and sort order. |

---

### Task 1: Outbox table and database-level uniqueness

**Files:**
- Create: `supabase/migrations/20260731110000_deposit_lifecycle_completion.sql`
- Create: `supabase/tests/180_deposit_lifecycle.test.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: table `public.booking_notification_outbox` with columns `id uuid`, `booking_id uuid`, `kind text`, `enqueued_at timestamptz`, `claimed_at timestamptz`, `delivered_at timestamptz`, `attempts integer`, `last_error text`; unique constraint on `(booking_id, kind)`. Partial unique index `booking_events_deposit_once` on `booking_events (booking_id, event_type)`.

- [ ] **Step 1: Write the migration header and outbox table**

Create `supabase/migrations/20260731110000_deposit_lifecycle_completion.sql`:

```sql
-- ============================================================
-- Deposit lifecycle completion
--
-- The 2026-07-31 truthfulness release stopped notify-booking-confirmed
-- claiming "booked in / see you then" while a deposit was outstanding. Nothing
-- sent anything afterwards, so the suppression became silence. This closes the
-- loop: when staff verify the money, the customer is told, the change is
-- audited, and the visit ledger is mirrored.
--
-- Design: docs/superpowers/specs/2026-07-31-deposit-lifecycle-design.md
--
-- Constraints held here:
--   * the legacy write path (bookings.payment -> deposit_received_at) stays
--     authoritative; this migration only observes it
--   * no booking-policy v1 mutation command is called or activated
--   * the outbox records INTENT; notification_log remains delivery history
--   * idempotency is enforced by unique indexes, not by careful code
--
-- Idempotent; apply individually (migrations are not auto-applied on deploy).
-- ============================================================

-- ── 1. Notification outbox ──────────────────────────────────
-- Generic on purpose. Deposits are its first user, not its purpose: a future
-- kind (deposit_request, rebooking nudge) adds one check value and one line in
-- _shared/notificationTargets.ts — no new table, no new cron job.
create table if not exists public.booking_notification_outbox (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  kind text not null check (kind in ('deposit_received')),
  enqueued_at timestamptz not null default now(),
  claimed_at timestamptz,
  delivered_at timestamptz,
  attempts integer not null default 0,
  last_error text,
  constraint booking_notification_outbox_once unique (booking_id, kind)
);

comment on table public.booking_notification_outbox is
  'Durable intent to notify about a booking. One row per (booking_id, kind). Delivery history lives in notification_log; this table only records that a notification is owed and how many times dispatch has been attempted.';

-- Drain lookup: pending rows, oldest first.
create index if not exists idx_booking_notification_outbox_pending
  on public.booking_notification_outbox (enqueued_at)
  where delivered_at is null;

alter table public.booking_notification_outbox enable row level security;
-- No policies: service-role only. Staff read outstanding deposits from
-- bookings, not from the outbox.

revoke all on public.booking_notification_outbox from anon, authenticated;
```

- [ ] **Step 2: Add the partial unique index on the deposit event types**

Append to the same migration file:

```sql
-- ── 2. One deposit event per booking, enforced by the database ──
-- Partial: 'rescheduled' and friends legitimately repeat, the deposit
-- lifecycle events do not.
create unique index if not exists booking_events_deposit_once
  on public.booking_events (booking_id, event_type)
  where event_type in ('deposit_received', 'deposit_not_received');
```

- [ ] **Step 3: Write the failing pgTAP test for the constraints**

Create `supabase/tests/180_deposit_lifecycle.test.sql`:

```sql
-- Deposit lifecycle: durable records, database-enforced idempotency, and a
-- release path that audits without notifying twice.

begin;
create extension if not exists pgtap with schema extensions;
select plan(4);
\ir fixtures/ensure_local_vault_secrets.psql

insert into auth.users (id) values
  ('18000000-0000-4000-8000-000000000001');

insert into public.staff_profiles (user_id, role, display_name) values
  ('18000000-0000-4000-8000-000000000001', 'owner', 'Deposit Test Owner');

insert into public.humans (id, name, surname) values
  ('18000000-0000-4000-8000-000000000010', 'Dana', 'Deposit');

insert into public.dogs (id, name, breed, size, human_id) values
  ('18000000-0000-4000-8000-000000000020', 'Pepper', 'Cockapoo', 'small',
   '18000000-0000-4000-8000-000000000010');

select has_table('public', 'booking_notification_outbox', 'outbox table exists');

select has_index(
  'public', 'booking_events', 'booking_events_deposit_once',
  'deposit events carry a database-level uniqueness guarantee'
);

-- The outbox rejects a duplicate (booking_id, kind) outright.
insert into public.bookings (id, dog_id, booking_date, slot, service, status, deposit_required)
values ('18000000-0000-4000-8000-000000000030',
        '18000000-0000-4000-8000-000000000020',
        current_date + 7, '09:00', 'Full Groom', 'Booked', true);

insert into public.booking_notification_outbox (booking_id, kind)
values ('18000000-0000-4000-8000-000000000030', 'deposit_received');

select throws_ok(
  $$insert into public.booking_notification_outbox (booking_id, kind)
    values ('18000000-0000-4000-8000-000000000030', 'deposit_received')$$,
  '23505',
  null,
  'a second outbox row for the same booking and kind is rejected by the database'
);

select is(
  (select count(*)::int from public.booking_notification_outbox
    where booking_id = '18000000-0000-4000-8000-000000000030'),
  1,
  'exactly one outbox row survives the duplicate attempt'
);

select * from finish();
rollback;
```

- [ ] **Step 4: Run the test to verify it fails**

Push the branch and read the `DB Tests (pgTAP)` workflow:

```bash
git add supabase/tests/180_deposit_lifecycle.test.sql
git commit -m "test(db): pin deposit outbox uniqueness (failing)"
git push origin HEAD
```

Expected: `180_deposit_lifecycle.test.sql` FAILS with `relation "public.booking_notification_outbox" does not exist` (the migration is not committed yet).

- [ ] **Step 5: Commit the migration and re-run**

```bash
git add supabase/migrations/20260731110000_deposit_lifecycle_completion.sql
git commit -m "feat(db): add generic booking notification outbox

Durable intent to notify, one row per (booking_id, kind), with database-level
uniqueness rather than careful code. Generic from the start: deposits are its
first user, not its purpose. Delivery history stays in notification_log."
git push origin HEAD
```

Expected: `180_deposit_lifecycle.test.sql .... ok`, `All tests successful.`

---

### Task 2: The deposit-received observer trigger

**Files:**
- Modify: `supabase/migrations/20260731110000_deposit_lifecycle_completion.sql` (append)
- Modify: `supabase/tests/180_deposit_lifecycle.test.sql` (raise plan, add cases)

**Interfaces:**
- Consumes: `booking_notification_outbox` (Task 1), existing `booking_event_party(bookings)` returning `(customer_name, dog_name, dog_breed)`, existing `resolve_event_actor(text)` returning `(actor_id, actor_role, actor_name)`.
- Produces: `public.record_booking_deposit_acknowledged()` returns `trigger`; trigger `trg_booking_deposit_acknowledged` on `public.bookings`.

- [ ] **Step 1: Write the failing test for the acknowledgement**

In `supabase/tests/180_deposit_lifecycle.test.sql`, change `select plan(4);` to `select plan(9);` and insert before `select * from finish();`:

```sql
-- ── Acknowledgement: one transition, three durable records ──
set local role postgres;

insert into public.bookings (id, dog_id, booking_date, slot, service, status,
                             deposit_required, visit_id)
values ('18000000-0000-4000-8000-000000000040',
        '18000000-0000-4000-8000-000000000020',
        current_date + 7, '10:00', 'Full Groom', 'Booked', true,
        (select visit_id from public.bookings
          where id = '18000000-0000-4000-8000-000000000030'));

-- The legacy write path: staff set payment, the existing BEFORE trigger stamps
-- deposit_received_at, our observer reacts to that transition.
update public.bookings
   set payment = 'Deposit Paid'
 where id = '18000000-0000-4000-8000-000000000040';

select is(
  (select count(*)::int from public.booking_events
    where booking_id = '18000000-0000-4000-8000-000000000040'
      and event_type = 'deposit_received'),
  1,
  'acknowledging a deposit records exactly one deposit_received event'
);

select is(
  (select count(*)::int from public.booking_notification_outbox
    where booking_id = '18000000-0000-4000-8000-000000000040'
      and kind = 'deposit_received'),
  1,
  'acknowledging a deposit enqueues exactly one outbox row'
);

select is(
  (select state from public.booking_visit_deposits
    where visit_id = (select visit_id from public.bookings
                       where id = '18000000-0000-4000-8000-000000000040')),
  'received',
  'the visit ledger is mirrored as received'
);

select is(
  (select origin || '/' || satisfaction_source
     from public.booking_visit_deposits
    where visit_id = (select visit_id from public.bookings
                       where id = '18000000-0000-4000-8000-000000000040')),
  'legacy_import/legacy_import',
  'the mirror is explicitly a legacy import, not a v1 write'
);

-- ── Repeating the update must not duplicate anything ──
update public.bookings
   set payment = 'Paid in Full'
 where id = '18000000-0000-4000-8000-000000000040';

select is(
  (select count(*)::int from public.booking_events
    where booking_id = '18000000-0000-4000-8000-000000000040'
      and event_type = 'deposit_received')
  + (select count(*)::int from public.booking_notification_outbox
      where booking_id = '18000000-0000-4000-8000-000000000040'),
  2,
  'a repeated payment update creates no duplicate event or outbox row'
);
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
git add supabase/tests/180_deposit_lifecycle.test.sql
git commit -m "test(db): pin deposit acknowledgement records (failing)"
git push origin HEAD
```

Expected: FAIL — `deposit_received` event count is `0`, because no observer trigger exists.

- [ ] **Step 3: Write the observer trigger**

Append to `supabase/migrations/20260731110000_deposit_lifecycle_completion.sql`:

```sql
-- ── 3. The acknowledgement observer ─────────────────────────
-- Hangs off the FACT (deposit_received_at became non-null), not the route, so
-- the booking modal, a bulk action, the SQL editor and an MCP session all
-- produce the same lifecycle. Three durable writes, zero network I/O: a failed
-- notification must never be able to roll back the staff member's money
-- acknowledgement, so delivery is the drain's problem, not this trigger's.
create or replace function public.record_booking_deposit_acknowledged()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_party record;
  v_actor record;
begin
  select * into v_party from booking_event_party(new);
  select * into v_actor from resolve_event_actor(new.source);

  -- Audit. The partial unique index is the real guarantee; on conflict keeps
  -- a concurrent double-update from raising in the staff member's face.
  insert into public.booking_events (
    booking_id, event_type, customer_name, dog_name, dog_breed,
    service, booking_date, slot,
    actor_id, actor_role, actor_name, occurred_at, visit_id
  ) values (
    new.id, 'deposit_received', v_party.customer_name, v_party.dog_name,
    v_party.dog_breed, new.service, new.booking_date, new.slot,
    v_actor.actor_id, v_actor.actor_role, v_actor.actor_name,
    now(), new.visit_id
  )
  on conflict do nothing;

  -- Mirror into the dormant visit ledger through the legacy_import seam. This
  -- is a projection for continuity at activation; nothing reads it for
  -- behaviour while booking_policy_runtime() is 'inactive'.
  if new.visit_id is not null then
    insert into public.booking_visit_deposits (
      visit_id, origin, state, amount_pence, requirement_reason,
      requirement_decided_at, customer_payment_reference, due_at,
      bank_received_at, satisfaction_source, recorded_at, recorded_by
    ) values (
      new.visit_id, 'legacy_import', 'received', 1000,
      'legacy deposit requirement', now(), new.deposit_reference,
      new.deposit_due_by, new.deposit_received_at, 'legacy_import',
      new.deposit_received_at, v_actor.actor_id
    )
    on conflict (visit_id) do update set
      state = 'received',
      bank_received_at = excluded.bank_received_at,
      satisfaction_source = 'legacy_import',
      recorded_at = excluded.recorded_at,
      recorded_by = excluded.recorded_by,
      updated_at = now();
  end if;

  -- Intent to notify. Never a send.
  insert into public.booking_notification_outbox (booking_id, kind)
  values (new.id, 'deposit_received')
  on conflict do nothing;

  return null;
end;
$$;

comment on function public.record_booking_deposit_acknowledged() is
  'AFTER UPDATE observer: on the deposit_received_at null -> not-null transition, records the audit event, mirrors the visit ledger via legacy_import, and enqueues notification intent. Never sends.';

revoke execute on function public.record_booking_deposit_acknowledged()
  from public, anon, authenticated;

drop trigger if exists trg_booking_deposit_acknowledged on public.bookings;
create trigger trg_booking_deposit_acknowledged
  after update on public.bookings
  for each row
  when (old.deposit_received_at is null and new.deposit_received_at is not null)
  execute function public.record_booking_deposit_acknowledged();
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
git add supabase/migrations/20260731110000_deposit_lifecycle_completion.sql
git commit -m "feat(db): observe the deposit acknowledgement transition

AFTER UPDATE trigger on the deposit_received_at null -> not-null edge. Records
the audit event, mirrors booking_visit_deposits through the legacy_import seam,
and enqueues notification intent — three durable writes, no network I/O, so a
delivery failure can never roll back the money acknowledgement."
git push origin HEAD
```

Expected: `180_deposit_lifecycle.test.sql .... ok`, and `179_trigger_function_grants.test.sql .... ok` (the new function carries its revoke block).

---

### Task 3: The release path — audit without a second message

**Files:**
- Modify: `supabase/migrations/20260731110000_deposit_lifecycle_completion.sql` (append)
- Modify: `supabase/tests/180_deposit_lifecycle.test.sql` (raise plan, add cases)

**Interfaces:**
- Consumes: Task 2's helpers.
- Produces: `public.record_booking_deposit_released()` returns `trigger`; trigger `trg_booking_deposit_released` on `public.bookings`.

- [ ] **Step 1: Write the failing test for release semantics**

Change `select plan(9);` to `select plan(12);` and insert before `select * from finish();`:

```sql
-- ── Auto-release: audit the lifecycle, do NOT notify twice ──
insert into public.bookings (id, dog_id, booking_date, slot, service, status,
                             deposit_required, deposit_due_by, visit_id)
values ('18000000-0000-4000-8000-000000000050',
        '18000000-0000-4000-8000-000000000020',
        current_date + 7, '11:00', 'Full Groom', 'Booked', true,
        now() - interval '1 hour',
        (select visit_id from public.bookings
          where id = '18000000-0000-4000-8000-000000000030'));

-- Exactly what the hourly deposit-auto-release cron does.
update public.bookings
   set status = 'Cancelled',
       cancel_reason = 'Deposit not received'
 where id = '18000000-0000-4000-8000-000000000050';

select is(
  (select count(*)::int from public.booking_events
    where booking_id = '18000000-0000-4000-8000-000000000050'
      and event_type = 'deposit_not_received'),
  1,
  'auto-release records a deposit_not_received event'
);

select is(
  (select count(*)::int from public.booking_events
    where booking_id = '18000000-0000-4000-8000-000000000050'
      and event_type = 'cancelled'),
  1,
  'auto-release still records the ordinary cancelled event'
);

select is(
  (select count(*)::int from public.booking_notification_outbox
    where booking_id = '18000000-0000-4000-8000-000000000050'),
  0,
  'auto-release enqueues nothing — the cancellation message already tells them'
);
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
git add supabase/tests/180_deposit_lifecycle.test.sql
git commit -m "test(db): pin auto-release lifecycle events (failing)"
git push origin HEAD
```

Expected: FAIL — `deposit_not_received` count is `0`.

- [ ] **Step 3: Write the release observer**

Append to the migration:

```sql
-- ── 4. The release observer ─────────────────────────────────
-- The hourly deposit-auto-release sweep is a plain status UPDATE, so the same
-- observer pattern picks it up for free. It records the audit event and mirrors
-- the ledger, but deliberately enqueues NOTHING: setting status='Cancelled'
-- already fires notify_booking_cancelled_trigger, so a second outbox row would
-- send the customer two messages about one cancellation. Release is an audit
-- event here, not a notification event.
create or replace function public.record_booking_deposit_released()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_party record;
  v_actor record;
begin
  select * into v_party from booking_event_party(new);
  select * into v_actor from resolve_event_actor(new.source);

  insert into public.booking_events (
    booking_id, event_type, customer_name, dog_name, dog_breed,
    service, booking_date, slot, cancel_reason,
    actor_id, actor_role, actor_name, occurred_at, visit_id
  ) values (
    new.id, 'deposit_not_received', v_party.customer_name, v_party.dog_name,
    v_party.dog_breed, new.service, new.booking_date, new.slot,
    new.cancel_reason,
    v_actor.actor_id, v_actor.actor_role, v_actor.actor_name,
    now(), new.visit_id
  )
  on conflict do nothing;

  if new.visit_id is not null then
    insert into public.booking_visit_deposits (
      visit_id, origin, state, amount_pence, requirement_reason,
      requirement_decided_at, customer_payment_reference, due_at
    ) values (
      new.visit_id, 'legacy_import', 'not_received', 1000,
      'legacy deposit requirement', now(), new.deposit_reference,
      new.deposit_due_by
    )
    on conflict (visit_id) do update set
      state = 'not_received',
      updated_at = now();
  end if;

  return null;
end;
$$;

comment on function public.record_booking_deposit_released() is
  'AFTER UPDATE observer: on auto-release of an unpaid deposit booking, records the deposit_not_received audit event and mirrors the ledger. Enqueues nothing — the existing cancellation notification already reaches the customer.';

revoke execute on function public.record_booking_deposit_released()
  from public, anon, authenticated;

drop trigger if exists trg_booking_deposit_released on public.bookings;
create trigger trg_booking_deposit_released
  after update on public.bookings
  for each row
  when (
    old.status is distinct from 'Cancelled'
    and new.status = 'Cancelled'
    and new.deposit_required
    and new.deposit_received_at is null
    and new.cancel_reason = 'Deposit not received'
  )
  execute function public.record_booking_deposit_released();
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
git add supabase/migrations/20260731110000_deposit_lifecycle_completion.sql
git commit -m "feat(db): audit deposit auto-release without notifying twice

The hourly sweep is a plain status UPDATE, so the same observer pattern records
deposit_not_received and mirrors the ledger. It deliberately enqueues nothing:
status='Cancelled' already fires the cancellation notification, and a second
outbox row would tell the customer twice about one cancellation."
git push origin HEAD
```

Expected: `180_deposit_lifecycle.test.sql .... ok` with 12 assertions.

---

### Task 4: Extract the shared notification target map

**Files:**
- Create: `supabase/functions/_shared/notificationTargets.ts`
- Create: `supabase/functions/_shared/notificationTargets.test.ts`
- Modify: `supabase/functions/resend-booking-notification/index.ts:24-29`

**Interfaces:**
- Consumes: nothing.
- Produces: `export type NotificationTargetKey = "record" | "old_record" | "booking_id"`; `export interface NotificationTarget { fn: string; key: NotificationTargetKey; triggerType: string }`; `export const NOTIFICATION_TARGETS: Record<string, NotificationTarget>`; `export function targetFor(kind: string): NotificationTarget | null`.

- [ ] **Step 1: Write the failing test**

Create `supabase/functions/_shared/notificationTargets.test.ts`:

```ts
import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { NOTIFICATION_TARGETS, targetFor } from "./notificationTargets.ts";

Deno.test("every staff resend trigger type still resolves", () => {
  for (const t of ["confirmed", "ready", "cancelled", "reminder"]) {
    assertEquals(typeof targetFor(t)?.fn, "string");
  }
});

Deno.test("the deposit_received outbox kind routes to the existing confirmation", () => {
  const target = targetFor("deposit_received");
  assertEquals(target?.fn, "notify-booking-confirmed");
  assertEquals(target?.key, "record");
  // Settlement is proven by a notification_log row of this trigger_type.
  assertEquals(target?.triggerType, "confirmed");
});

Deno.test("an unknown kind resolves to null rather than guessing", () => {
  assertEquals(targetFor("not_a_real_kind"), null);
});

Deno.test("every target names a trigger_type for settlement", () => {
  for (const [kind, target] of Object.entries(NOTIFICATION_TARGETS)) {
    assertEquals(
      typeof target.triggerType,
      "string",
      `${kind} must name the notification_log trigger_type that settles it`,
    );
  }
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `deno test --node-modules-dir=none --allow-env supabase/functions/_shared/notificationTargets.test.ts`
Expected: FAIL — `Module not found ... notificationTargets.ts`

- [ ] **Step 3: Write the shared map**

Create `supabase/functions/_shared/notificationTargets.ts`:

```ts
// The single routing table for booking notifications.
//
// Two callers share it: resend-booking-notification (staff press "resend" in
// the booking detail card) and notification-dispatch (the automated outbox
// drain). Keeping one map means the cron job never names a notify-* function,
// so the drain does not have to change when a notification type is added.
//
// Adding a type: one entry here, one value in the
// booking_notification_outbox.kind check constraint. Nothing else.

/** How the target function expects the booking in its payload. */
export type NotificationTargetKey = "record" | "old_record" | "booking_id";

export interface NotificationTarget {
  /** Edge function slug to POST to. */
  fn: string;
  /** Payload shape that function reads the booking from. */
  key: NotificationTargetKey;
  /**
   * The notification_log.trigger_type that proves this landed. Delivery truth
   * lives in notification_log; the outbox settles against this.
   */
  triggerType: string;
}

export const NOTIFICATION_TARGETS: Record<string, NotificationTarget> = {
  // Staff resend paths (unchanged behaviour, moved here from
  // resend-booking-notification).
  confirmed: { fn: "notify-booking-confirmed", key: "record", triggerType: "confirmed" },
  ready: { fn: "notify-booking-ready", key: "record", triggerType: "ready" },
  cancelled: { fn: "notify-booking-cancelled", key: "old_record", triggerType: "cancelled" },
  reminder: { fn: "notify-booking-reminder", key: "booking_id", triggerType: "reminder" },

  // Outbox kinds. deposit_received reuses the existing confirmation rather
  // than creating a second confirmation system: once the money is verified,
  // "booked in — see you then" is exactly what is true.
  deposit_received: {
    fn: "notify-booking-confirmed",
    key: "record",
    triggerType: "confirmed",
  },
};

export function targetFor(kind: string): NotificationTarget | null {
  return NOTIFICATION_TARGETS[kind] ?? null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `deno test --node-modules-dir=none --allow-env supabase/functions/_shared/notificationTargets.test.ts`
Expected: `ok | 4 passed | 0 failed`

- [ ] **Step 5: Point resend-booking-notification at the shared map**

In `supabase/functions/resend-booking-notification/index.ts`, delete the local `TARGET` constant (lines 22–29, the block beginning `// Per trigger: which function to call`) and add to the imports at the top:

```ts
import { NOTIFICATION_TARGETS } from "../_shared/notificationTargets.ts";
```

Then replace every use of `TARGET` in the file with `NOTIFICATION_TARGETS`.

Verify no stragglers:

Run: `grep -n 'TARGET' supabase/functions/resend-booking-notification/index.ts`
Expected: only `NOTIFICATION_TARGETS` occurrences.

- [ ] **Step 6: Run the whole edge-function suite**

Run: `deno test --node-modules-dir=none --allow-env supabase/functions/`
Expected: all previously passing tests still pass, plus the 4 new ones.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/_shared/notificationTargets.ts \
        supabase/functions/_shared/notificationTargets.test.ts \
        supabase/functions/resend-booking-notification/index.ts
git commit -m "refactor(functions): share the notification routing map

resend-booking-notification already carried a trigger_type -> {fn, payload key}
map but was gated behind a staff JWT, so a cron could not reuse it. Extracted to
_shared/notificationTargets.ts and added the settling trigger_type, so the
outbox drain can route without naming any notify-* function itself."
```

---

### Task 5: The dispatcher

**Files:**
- Create: `supabase/functions/notification-dispatch/index.ts`

**Interfaces:**
- Consumes: `targetFor`, `NotificationTarget` from `_shared/notificationTargets.ts` (Task 4); `isAuthorizedWebhook` from `_shared/webhook-auth.ts`; `booking_notification_outbox` (Task 1).
- Produces: an edge function at `/functions/v1/notification-dispatch` accepting `POST` with an empty body, returning `{ claimed: number, dispatched: number, settled: number }`.

- [ ] **Step 1: Write the dispatcher**

Create `supabase/functions/notification-dispatch/index.ts`:

```ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isAuthorizedWebhook } from "../_shared/webhook-auth.ts";
import { targetFor } from "../_shared/notificationTargets.ts";

// ── Outbox drain ────────────────────────────────────────────────────────────
//
// Server-to-server only (webhook secret, no CORS): a cron calls this every few
// minutes. It claims pending outbox rows, routes each through the shared target
// map, and forwards the booking in the shape that target expects.
//
// Deliberately NOT a notification system: it never resolves recipients, never
// picks a channel, never writes notification_log. It only decides *which*
// function is owed a nudge. Recipient resolution and delivery history stay in
// the notify-* functions where they already live.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET");

/** Stop retrying after this many attempts; the row keeps last_error. */
const MAX_ATTEMPTS = 3;
/** Rows handled per invocation — keeps the function well inside its timeout. */
const BATCH = 20;

serve(async (req) => {
  if (!WEBHOOK_SECRET) {
    return new Response("Server misconfiguration: WEBHOOK_SECRET not set", { status: 500 });
  }
  if (!isAuthorizedWebhook(req.headers.get("Authorization"), WEBHOOK_SECRET)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: rows, error } = await supabase
    .from("booking_notification_outbox")
    .select("id, booking_id, kind, attempts")
    .is("delivered_at", null)
    .lt("attempts", MAX_ATTEMPTS)
    .order("enqueued_at", { ascending: true })
    .limit(BATCH);

  if (error) {
    console.error("outbox read failed:", error.message);
    return new Response(JSON.stringify({ error: "outbox read failed" }), { status: 500 });
  }

  let dispatched = 0;
  let settled = 0;

  for (const row of rows ?? []) {
    const target = targetFor(row.kind);
    if (!target) {
      await supabase
        .from("booking_notification_outbox")
        .update({ attempts: MAX_ATTEMPTS, last_error: `unknown kind: ${row.kind}` })
        .eq("id", row.id);
      continue;
    }

    // Already delivered? Settle without sending again. notification_log is the
    // delivery truth; the outbox only tracks intent.
    const { count: already } = await supabase
      .from("notification_log")
      .select("id", { count: "exact", head: true })
      .eq("booking_id", row.booking_id)
      .eq("trigger_type", target.triggerType)
      .in("status", ["pending", "sent"]);

    if ((already ?? 0) > 0) {
      await supabase
        .from("booking_notification_outbox")
        .update({ delivered_at: new Date().toISOString() })
        .eq("id", row.id);
      settled++;
      continue;
    }

    const { data: booking } = await supabase
      .from("bookings")
      .select("*")
      .eq("id", row.booking_id)
      .maybeSingle();

    if (!booking) {
      await supabase
        .from("booking_notification_outbox")
        .update({ attempts: MAX_ATTEMPTS, last_error: "booking no longer exists" })
        .eq("id", row.id);
      continue;
    }

    const body = target.key === "booking_id"
      ? { booking_id: row.booking_id }
      : { [target.key]: booking };

    let lastError: string | null = null;
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/${target.fn}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${WEBHOOK_SECRET}`,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) lastError = `${target.fn} returned ${res.status}`;
    } catch (err) {
      lastError = `${target.fn} threw: ${err instanceof Error ? err.message : String(err)}`;
    }

    await supabase
      .from("booking_notification_outbox")
      .update({
        claimed_at: new Date().toISOString(),
        attempts: row.attempts + 1,
        last_error: lastError,
        // Settle only on a clean dispatch; the next run re-checks
        // notification_log for the authoritative answer.
        delivered_at: lastError ? null : new Date().toISOString(),
      })
      .eq("id", row.id);

    if (!lastError) dispatched++;
  }

  return new Response(
    JSON.stringify({ claimed: rows?.length ?? 0, dispatched, settled }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
});
```

- [ ] **Step 2: Type-check it**

Run: `deno check supabase/functions/notification-dispatch/index.ts`
Expected: no errors.

- [ ] **Step 3: Run the full edge-function suite**

Run: `deno test --node-modules-dir=none --allow-env supabase/functions/`
Expected: all tests pass (this function has no unit tests of its own; its routing is covered by Task 4 and its behaviour by the Task 6 smoke check).

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/notification-dispatch/index.ts
git commit -m "feat(functions): add the outbox dispatcher

Server-to-server drain: claims pending outbox rows, routes each through the
shared target map, forwards the booking in the shape that target expects.
Deliberately not a notification system — it never resolves recipients, picks a
channel or writes notification_log; it settles a row against the delivery
history the notify-* function already writes."
```

---

### Task 6: Schedule the drain

**Files:**
- Modify: `supabase/migrations/20260731110000_deposit_lifecycle_completion.sql` (append)

**Interfaces:**
- Consumes: `notification-dispatch` (Task 5), `get_webhook_secret()` (existing, Vault-backed).
- Produces: cron job `booking-notification-drain`.

- [ ] **Step 1: Append the cron job**

```sql
-- ── 5. Drain ────────────────────────────────────────────────
-- Names no notify-* function: routing lives in
-- _shared/notificationTargets.ts, so adding a notification type never touches
-- this job. Auth via get_webhook_secret() (Vault) — NOT
-- current_setting('app.webhook_secret'), which is empty everywhere and 401s.
create extension if not exists pg_cron;

select cron.unschedule(jobid) from cron.job where jobname = 'booking-notification-drain';
select cron.schedule(
  'booking-notification-drain',
  '*/5 * * * *',
  $$
    select net.http_post(
      url := 'https://nlzhllhkigmsvrzduefz.supabase.co/functions/v1/notification-dispatch',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || coalesce(get_webhook_secret(), '')
      ),
      body := '{}'::jsonb
    );
  $$
);
```

- [ ] **Step 2: Validate migration ordering**

Run: `npm run check:migrations`
Expected: `Migration validation OK (200 files).`

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260731110000_deposit_lifecycle_completion.sql
git commit -m "feat(db): schedule the notification outbox drain

Every 5 minutes, via get_webhook_secret() from Vault. The job names no
notify-* function — routing lives in the shared target map, so adding a
notification type never touches this cron."
```

---

### Task 7: Surface outstanding deposits on /today

**Files:**
- Modify: `src/engine/today.ts:418-419` (extend `AttentionKind` and `ATTENTION_PRIORITY`), `src/engine/today.ts:444-480` (extend `buildImmediateAttention`)
- Modify: `src/engine/today.test.ts`

**Interfaces:**
- Consumes: `isAwaitingDeposit` from `src/engine/deposits.ts`.
- Produces: `AttentionKind` gains `"deposit"`; `AttentionItem` unchanged in shape.

- [ ] **Step 1: Write the failing test**

Append to `src/engine/today.test.ts`:

```ts
describe("buildImmediateAttention — outstanding deposits", () => {
  const base = {
    id: "b1",
    status: "Booked",
    bookingDate: "2026-08-03",
    slot: "09:00",
    depositRequired: true,
    depositReceivedAt: null,
    payment: "Due at Pick-up",
  };
  const now = new Date("2026-08-01T09:00:00Z");

  it("flags a booking still awaiting its deposit", () => {
    const items = buildImmediateAttention([base as never], now);
    expect(items.map((i) => i.primary)).toContain("deposit");
  });

  it("drops it once the deposit is acknowledged", () => {
    const paid = { ...base, payment: "Deposit Paid", depositReceivedAt: "2026-08-01T08:00:00Z" };
    const items = buildImmediateAttention([paid as never], now);
    expect(items.some((i) => i.kinds.includes("deposit"))).toBe(false);
  });

  it("drops it once auto-released", () => {
    const cancelled = { ...base, status: "Cancelled" };
    const items = buildImmediateAttention([cancelled as never], now);
    expect(items).toHaveLength(0);
  });

  it("sorts the nearest appointment first", () => {
    const soon = { ...base, id: "soon", bookingDate: "2026-08-02" };
    const later = { ...base, id: "later", bookingDate: "2026-08-05" };
    const items = buildImmediateAttention([later, soon] as never[], now);
    const deposits = items.filter((i) => i.primary === "deposit");
    expect(deposits.map((i) => i.booking.id)).toEqual(["soon", "later"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --project=logic src/engine/today.test.ts -t "outstanding deposits"`
Expected: FAIL — `expected [ 'unconfirmed' ] to contain 'deposit'`

- [ ] **Step 3: Extend the attention kinds**

In `src/engine/today.ts`, replace lines 418–419:

```ts
export type AttentionKind = "late" | "ready" | "unconfirmed" | "deposit" | "payment";
const ATTENTION_PRIORITY: readonly AttentionKind[] = ["late", "ready", "unconfirmed", "deposit", "payment"];
```

Add the import at the top of the file:

```ts
import { isAwaitingDeposit } from "./deposits";
```

Inside `buildImmediateAttention`, after the `unconfirmed` line (currently line 461):

```ts
    // A deposit still owed on a live booking. isAwaitingDeposit is the shared
    // selector the customer card and booking modal already use, so all three
    // surfaces agree on what "awaiting" means.
    if (rank === 0 && isAwaitingDeposit(b)) kinds.push("deposit");
```

In the sort comparator, add before the final fallback:

```ts
    // Nearest appointment first: a deposit due on Monday matters more than one
    // due on Friday, because the auto-release lands sooner.
    if (a.primary === "deposit") {
      const byDate = `${a.booking.bookingDate}${a.booking.slot}`
        .localeCompare(`${c.booking.bookingDate}${c.booking.slot}`);
      if (byDate !== 0) return byDate;
    }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run --project=logic src/engine/today.test.ts -t "outstanding deposits"`
Expected: `4 passed`

- [ ] **Step 5: Run the whole suite**

Run: `npm run test`
Expected: all pass, count up by 4 from the previous baseline of 2460.

- [ ] **Step 6: Commit**

```bash
git add src/engine/today.ts src/engine/today.test.ts
git commit -m "feat(today): surface outstanding deposits in the attention queue

Adds a 'deposit' attention kind between unconfirmed and payment, shown only
while action is genuinely required and sorted nearest-appointment first so the
ones about to auto-release surface soonest. Reuses the shared isAwaitingDeposit
selector so the customer card, booking modal and /today all agree."
```

---

### Task 8: Full verification and production rollout

**Files:** none (verification only)

- [ ] **Step 1: Run the complete CI bar**

```bash
npm run lint && npm run typecheck && npm run check:migrations && npm run test && npm run build
deno test --node-modules-dir=none --allow-env supabase/functions/
```
Expected: every command exits 0.

- [ ] **Step 2: Confirm the isolation guard is untouched**

Run: `git diff origin/main --stat -- src/security/bookingPolicyInactiveIsolation.test.ts`
Expected: no output — the file must not change. No v1 mutation command was wired up.

- [ ] **Step 3: Confirm the policy engine is still dormant**

Run against prod (read-only):

```sql
select public.booking_policy_runtime();
```
Expected: `inactive`

- [ ] **Step 4: Apply the migration to production BEFORE merging**

Apply `supabase/migrations/20260731110000_deposit_lifecycle_completion.sql` via the Supabase MCP `apply_migration` with name `deposit_lifecycle_completion`. Then verify:

```sql
select
  (select count(*) from supabase_migrations.schema_migrations
    where name = 'deposit_lifecycle_completion') as applied,
  (select count(*) from pg_trigger
    where tgname in ('trg_booking_deposit_acknowledged','trg_booking_deposit_released')) as triggers,
  (select count(*) from cron.job where jobname = 'booking-notification-drain') as drain_scheduled,
  (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and pg_get_function_result(p.oid)='trigger'
      and has_function_privilege('anon', p.oid, 'EXECUTE')) as anon_reachable_triggers;
```
Expected: `applied=1, triggers=2, drain_scheduled=1, anon_reachable_triggers=0`

- [ ] **Step 5: Verify no new security advisors**

Run `get_advisors(type: "security")` on `nlzhllhkigmsvrzduefz`.
Expected: 0 ERROR-level; lint-0028 count still exactly 2 (`booking_policy_runtime`, `booking_policy_runtime_status`).

- [ ] **Step 6: Merge, then smoke-test the first real acknowledgement**

After merging, on the next deposit-required booking, mark it *Deposit Paid* and confirm within ~5 minutes:

```sql
select
  (select count(*) from booking_events
    where booking_id = :id and event_type = 'deposit_received') as event,
  (select state from booking_visit_deposits bvd
     join bookings b on b.visit_id = bvd.visit_id where b.id = :id) as ledger,
  (select delivered_at is not null from booking_notification_outbox
    where booking_id = :id and kind = 'deposit_received') as delivered,
  (select count(*) from notification_log
    where booking_id = :id and trigger_type = 'confirmed') as sent;
```
Expected: `event=1, ledger='received', delivered=true, sent>=1`

---

## Self-Review

**Spec coverage:** observer trigger → Task 2. Release semantics → Task 3. Generic outbox + DB uniqueness → Task 1. Dispatcher boundary → Tasks 4–5. Drain → Task 6. Staff visibility → Task 7. Rollout → Task 8. All four required proofs are in Tasks 2–3, plus the "regardless of caller" proof (Task 2 uses a direct `UPDATE`, no RPC) and the mirror-origin proof.

**Placeholders:** none — every code step carries complete code and every command names its expected output.

**Type consistency:** `targetFor`/`NOTIFICATION_TARGETS`/`NotificationTarget.triggerType` defined in Task 4 are used with identical names in Task 5. `AttentionKind` gains `"deposit"` in Task 7 and is used consistently. Trigger and function names match between the migration (Tasks 2, 3) and the verification queries (Task 8).

**One gap found and closed:** the spec's settlement rule said "a matching `notification_log` row exists" without naming the trigger type. Task 4 now carries `triggerType` on every target, and Task 5 settles against it — otherwise the dispatcher could not tell which log row proved delivery.
