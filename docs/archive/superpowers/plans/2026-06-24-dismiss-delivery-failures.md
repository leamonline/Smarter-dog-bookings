# Dismiss delivery-failure items — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let staff dismiss a failed-delivery booking from the dashboard "Delivery issues" card, persisted in the DB (shared across staff), re-surfacing if the booking fails again.

**Architecture:** A new `notification_dismissals` table (one row per booking) written via a `SECURITY DEFINER` RPC using the DB clock; the existing `useDeliveryFailures` singleton fetches dismissals, filters them out of the dashboard list (a pure `applyDismissals` helper) and exposes `dismiss(bookingId)`; the card gains a per-row ✕. Dashboard-card scope only — the per-booking pill badge / in-booking Fix-and-Resend are untouched.

**Tech Stack:** React 19 (hooks, `useSyncExternalStore`), Supabase (Postgres + RLS + Realtime + RPC), Vitest, Tailwind, lucide-react.

**Spec:** [docs/superpowers/specs/2026-06-24-delivery-failure-dismiss-design.md](../specs/2026-06-24-delivery-failure-dismiss-design.md)

## Global Constraints

- **Node 20**; package manager **npm** (`.npmrc` legacy-peer-deps). CI bar = `lint → typecheck → check:migrations → test → build` — all must pass.
- **Branch:** `feat/dismiss-delivery-failures` (already created off `main`).
- **No bare `console` in `src/`** — use `logger` from `src/lib/logger.ts` (already imported in the hook).
- **Import extensions:** never put a `.js/.jsx` extension on a relative import whose target is `.ts/.tsx`. The hook (`useDeliveryFailures.js`) and card (`.jsx`) import siblings with `.js/.jsx` as the files already do — keep that.
- **Migrations are idempotent and applied to prod BY HAND before merging the frontend.** Filename = 14-digit timestamp prefix, strictly after the latest committed migration (`20260623130000_dog_pregnancy_gate.sql`). Use `20260624120000_notification_dismissals.sql`.
- **Supabase auto-grants EXECUTE to `anon`** on new public functions — `revoke ... from anon` explicitly.
- **Realtime needs RLS:** the table's staff-only SELECT policy is what gates realtime delivery.
- Tests colocated: `*.test.js` (logic, node project) / `*.component.test.jsx` (jsdom project).

## File Structure

- **Create** `supabase/migrations/20260624120000_notification_dismissals.sql` — table + RLS + dismiss RPC + realtime publication.
- **Modify** `src/supabase/hooks/useDeliveryFailures.js` — add `applyDismissals` (exported pure helper), fetch dismissals in `refresh()` and filter `failures` only, subscribe to the new table, expose `dismiss(bookingId)`.
- **Create** `src/supabase/hooks/useDeliveryFailures.test.js` — unit tests for `applyDismissals`.
- **Modify** `src/components/dashboard/DeliveryFailuresCard.jsx` — per-row ✕ dismiss button (sibling to the jump button), reading `dismiss` from `data`.
- **Modify** `src/components/dashboard/DeliveryFailuresCard.component.test.jsx` — tests for the ✕.

No changes needed in `RightWorkflowSidebar.jsx`, `WorkflowStatusStrip.jsx`, or `WeekCalendarView.jsx`: each already passes the full `useDeliveryFailures()` return as the card's `data` prop, so `data.dismiss` reaches the card for free.

---

### Task 1: Migration — `notification_dismissals` table, RLS, dismiss RPC, realtime

**Files:**
- Create: `supabase/migrations/20260624120000_notification_dismissals.sql`

**Interfaces:**
- Produces: table `public.notification_dismissals(booking_id uuid pk, dismissed_at timestamptz, dismissed_by uuid)`; RPC `public.dismiss_delivery_failure(p_booking_id uuid) returns void`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260624120000_notification_dismissals.sql`:

```sql
-- ============================================================
-- notification_dismissals — staff "dismiss" for the dashboard
-- "Delivery issues" card.
--
-- One row per booking. A booking's failure is hidden from the dashboard
-- aggregate card when dismissed_at >= the booking's most recent failed
-- notification (notification_log.created_at). A later failure has a newer
-- created_at than the dismissal, so it re-surfaces automatically.
--
-- Dashboard-card scope only: the per-booking pill badge and the in-booking
-- DeliveryFailureCard (driven by useBookingDeliveryFailure) are NOT affected
-- — that filtering lives in the client, not here.
--
-- Writes go through dismiss_delivery_failure() (SECURITY DEFINER) so
-- dismissed_at uses the DB clock (skew-free vs notification_log.created_at)
-- and is_staff() is enforced. No client INSERT/UPDATE policy exists.
--
-- Idempotent: create-if-not-exists / drop-if-exists / create-or-replace /
-- guarded publication add — safe to re-run.
-- ============================================================

create table if not exists public.notification_dismissals (
  booking_id    uuid primary key references public.bookings(id) on delete cascade,
  dismissed_at  timestamptz not null default now(),
  dismissed_by  uuid default auth.uid()
);

alter table public.notification_dismissals enable row level security;

drop policy if exists "Staff can select notification dismissals" on public.notification_dismissals;
create policy "Staff can select notification dismissals"
  on public.notification_dismissals
  for select
  to authenticated
  using (is_staff());

create or replace function public.dismiss_delivery_failure(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not is_staff() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;
  insert into public.notification_dismissals (booking_id, dismissed_at, dismissed_by)
    values (p_booking_id, now(), auth.uid())
  on conflict (booking_id)
    do update set dismissed_at = now(), dismissed_by = auth.uid();
end;
$$;

-- Supabase auto-grants EXECUTE to anon on new public functions; lock down.
revoke all on function public.dismiss_delivery_failure(uuid) from public;
revoke all on function public.dismiss_delivery_failure(uuid) from anon;
grant execute on function public.dismiss_delivery_failure(uuid) to authenticated;

-- Realtime: clear the card on other staff devices when one dismisses.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notification_dismissals'
  ) then
    alter publication supabase_realtime add table public.notification_dismissals;
  end if;
end $$;
```

- [ ] **Step 2: Validate filename/order**

Run: `npm run check:migrations`
Expected: `Migration validation OK (N files).` (N = 142)

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260624120000_notification_dismissals.sql
git commit -m "feat(db): notification_dismissals table + dismiss_delivery_failure RPC + realtime"
```

> NOTE for rollout (not a code step): this migration must be **applied to prod by hand before** the frontend tasks merge. The client degrades gracefully if it's ever ahead of the schema (Task 3 Step 6).

---

### Task 2: `applyDismissals` pure helper (TDD)

**Files:**
- Modify: `src/supabase/hooks/useDeliveryFailures.js` (add + export `applyDismissals`)
- Test: `src/supabase/hooks/useDeliveryFailures.test.js` (create)

**Interfaces:**
- Produces: `applyDismissals(failures: Failure[], dismissals: Map<string,string>): Failure[]` where `Failure = { bookingId, latestAt, ... }` and the map is `bookingId → dismissed_at ISO`. Returns the failures to **show on the dashboard** (drops a booking when its dismissal is `>=` its `latestAt`).

- [ ] **Step 1: Write the failing test**

Create `src/supabase/hooks/useDeliveryFailures.test.js`:

```js
import { describe, it, expect } from "vitest";
import { applyDismissals } from "./useDeliveryFailures.js";

const f = (bookingId, latestAt) => ({ bookingId, latestAt, customerName: "X" });

describe("applyDismissals", () => {
  it("keeps a failure with no dismissal", () => {
    const out = applyDismissals([f("b1", "2026-06-24T10:00:00Z")], new Map());
    expect(out.map((x) => x.bookingId)).toEqual(["b1"]);
  });

  it("hides a failure dismissed at or after its latest failure", () => {
    const dismissals = new Map([["b1", "2026-06-24T10:00:00Z"]]);
    const out = applyDismissals([f("b1", "2026-06-24T10:00:00Z")], dismissals);
    expect(out).toEqual([]);
  });

  it("re-surfaces a booking that failed again after it was dismissed", () => {
    const dismissals = new Map([["b1", "2026-06-24T10:00:00Z"]]);
    // newer failure than the dismissal → show again
    const out = applyDismissals([f("b1", "2026-06-24T11:30:00Z")], dismissals);
    expect(out.map((x) => x.bookingId)).toEqual(["b1"]);
  });

  it("keeps a failure with a missing latestAt (safety)", () => {
    const dismissals = new Map([["b1", "2026-06-24T10:00:00Z"]]);
    const out = applyDismissals([f("b1", null)], dismissals);
    expect(out.map((x) => x.bookingId)).toEqual(["b1"]);
  });

  it("filters per booking independently", () => {
    const dismissals = new Map([["b1", "2026-06-24T10:00:00Z"]]);
    const out = applyDismissals(
      [f("b1", "2026-06-24T09:00:00Z"), f("b2", "2026-06-24T09:00:00Z")],
      dismissals,
    );
    expect(out.map((x) => x.bookingId)).toEqual(["b2"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run --project=logic src/supabase/hooks/useDeliveryFailures.test.js`
Expected: FAIL — `applyDismissals` is not exported / not a function.

- [ ] **Step 3: Implement `applyDismissals`**

In `src/supabase/hooks/useDeliveryFailures.js`, add after the `triggerLabel` export (around line 38):

```js
// Dashboard-only dismissal filter. A booking is hidden when it has a
// dismissal whose timestamp is >= the booking's most recent failure
// (latestAt). A newer failure (latestAt > dismissed_at) re-surfaces it.
// ISO timestamps (both UTC) compare correctly as strings.
export function applyDismissals(failures, dismissals) {
  if (!dismissals || dismissals.size === 0) return failures;
  return failures.filter((f) => {
    const dismissedAt = dismissals.get(f.bookingId);
    if (!dismissedAt) return true;   // not dismissed
    if (!f.latestAt) return true;    // can't compare → keep
    return f.latestAt > dismissedAt; // keep only if it failed again after the dismissal
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run --project=logic src/supabase/hooks/useDeliveryFailures.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/supabase/hooks/useDeliveryFailures.js src/supabase/hooks/useDeliveryFailures.test.js
git commit -m "feat(delivery): applyDismissals pure helper for the dashboard card"
```

---

### Task 3: Wire dismissals into the hook (`refresh` filter + realtime + `dismiss()`)

**Files:**
- Modify: `src/supabase/hooks/useDeliveryFailures.js`

**Interfaces:**
- Consumes: `applyDismissals` (Task 2).
- Produces: `useDeliveryFailures()` now also returns `dismiss(bookingId): Promise<void>`. `byBooking` is left UNFILTERED (pill/booking-card unaffected).

- [ ] **Step 1: Fetch dismissals and filter the dashboard list in `refresh()`**

In `refresh()`, replace the final `setState` (currently `setState({ byBooking, failures, loading: false });`, ~line 153) with a dismissals fetch + filter. `liveBookingIds` and `failures` already exist above it:

```js
    // Dashboard-only: hide failures the staff have dismissed (unless they
    // failed again since). Missing table/RLS (e.g. migration not yet applied)
    // degrades to "no dismissals" so the card still renders.
    let dismissals = new Map();
    if (liveBookingIds.length > 0) {
      const { data: dRows, error: dErr } = await supabase
        .from("notification_dismissals")
        .select("booking_id, dismissed_at")
        .in("booking_id", liveBookingIds);
      if (!dErr) {
        dismissals = new Map((dRows ?? []).map((d) => [d.booking_id, d.dismissed_at]));
      }
    }

    setState({
      byBooking,
      failures: applyDismissals(failures, dismissals),
      loading: false,
    });
```

- [ ] **Step 2: Subscribe to `notification_dismissals` in `startChannel()`**

In `startChannel()` (~lines 164-171), add a second `.on(...)` before `.subscribe()`:

```js
  channel = supabase
    .channel("dashboard-delivery-failures")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "notification_log" },
      () => refresh(),
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "notification_dismissals" },
      () => refresh(),
    )
    .subscribe();
```

- [ ] **Step 3: Add the `dismiss()` function**

Add above `function startChannel()` (~line 162):

```js
// Dismiss a booking's failure from the dashboard card. Optimistically drops
// it from the local list, then persists via the SECURITY DEFINER RPC (DB
// clock + is_staff()). On error, refresh() restores the true state. Inert in
// tests / offline, matching the rest of this module.
async function dismiss(bookingId) {
  if (!bookingId || !supabase || IS_TEST) return;
  setState({ failures: state.failures.filter((f) => f.bookingId !== bookingId) });
  const { error } = await supabase.rpc("dismiss_delivery_failure", {
    p_booking_id: bookingId,
  });
  if (error) {
    logger.error("useDeliveryFailures dismiss failed", error, {
      tags: { hook: "useDeliveryFailures", op: "dismiss" },
    });
    refresh();
  }
}
```

- [ ] **Step 4: Expose `dismiss` from the hook**

In `useDeliveryFailures()` (~lines 201-211), add a stable callback and include it in the return:

```js
export function useDeliveryFailures() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const refresh_ = useCallback(() => refresh(), []);
  const dismiss_ = useCallback((bookingId) => dismiss(bookingId), []);
  return {
    failures: snapshot.failures,
    count: snapshot.failures.length,
    loading: snapshot.loading,
    error: snapshot.error,
    refresh: refresh_,
    dismiss: dismiss_,
  };
}
```

- [ ] **Step 5: Verify nothing regressed**

Run: `npx vitest run --project=logic src/supabase/hooks/useDeliveryFailures.test.js` → PASS (applyDismissals unaffected).
Run: `npm run typecheck` → no errors.
Run: `npm run lint` → 0 errors.

(The singleton's Supabase/realtime integration isn't unit-tested — this hook has no integration test today and the module-level singleton + realtime socket make one brittle. Coverage is: `applyDismissals` unit tests, the card test in Task 4, typecheck/lint/build, and the manual offline check in Task 5.)

- [ ] **Step 6: Commit**

```bash
git add src/supabase/hooks/useDeliveryFailures.js
git commit -m "feat(delivery): fetch+filter dismissals, realtime, and dismiss() in useDeliveryFailures"
```

---

### Task 4: Per-row ✕ dismiss button on the card (TDD)

**Files:**
- Modify: `src/components/dashboard/DeliveryFailuresCard.jsx`
- Test: `src/components/dashboard/DeliveryFailuresCard.component.test.jsx`

**Interfaces:**
- Consumes: `data.dismiss` (Task 3) — when present, render a ✕ per row that calls `dismiss(f.bookingId)`.

- [ ] **Step 1: Write the failing tests**

Append to `src/components/dashboard/DeliveryFailuresCard.component.test.jsx` inside the `describe("DeliveryFailuresCard", ...)` block:

```js
  it("renders a dismiss button per row and calls dismiss with the booking id", () => {
    const dismiss = vi.fn();
    render(
      <DeliveryFailuresCard data={{ ...data, dismiss }} onSelectFailure={vi.fn()} />,
    );
    const btn = screen.getByRole("button", { name: "Dismiss Ada · Rex" });
    btn.click();
    expect(dismiss).toHaveBeenCalledTimes(1);
    expect(dismiss).toHaveBeenCalledWith("b1");
  });

  it("renders no dismiss button when dismiss is unavailable", () => {
    render(<DeliveryFailuresCard data={data} onSelectFailure={vi.fn()} />);
    expect(
      screen.queryByRole("button", { name: /^Dismiss / }),
    ).not.toBeInTheDocument();
  });

  it("keeps the jump-to-booking button working alongside dismiss", () => {
    const onSelectFailure = vi.fn();
    render(
      <DeliveryFailuresCard
        data={{ ...data, dismiss: vi.fn() }}
        onSelectFailure={onSelectFailure}
      />,
    );
    screen.getByRole("button", { name: /Open Ada's booking/i }).click();
    expect(onSelectFailure).toHaveBeenCalledWith(data.failures[0]);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run --project=component src/components/dashboard/DeliveryFailuresCard.component.test.jsx`
Expected: the two new "Dismiss"/jump-alongside tests FAIL (no Dismiss button rendered); the "renders no dismiss button" test passes already.

- [ ] **Step 3: Implement the ✕ button**

In `src/components/dashboard/DeliveryFailuresCard.jsx`:

(a) add `X` to the lucide import (line 11):

```jsx
import { AlertTriangle, X } from "lucide-react";
```

(b) destructure `dismiss` (line 33):

```jsx
  const { failures, count, loading, dismiss } = data ?? fallback;
```

(c) replace the `<li>` body (lines 52-69) so the jump control and the ✕ are siblings in a flex row:

```jsx
        return (
          <li key={f.bookingId} className="flex items-stretch gap-1">
            {onSelectFailure ? (
              // Each row jumps the calendar to that booking's day so staff can
              // open it and resend (the fix lives on the booking itself).
              <button
                type="button"
                onClick={() => onSelectFailure(f)}
                aria-label={`Open ${f.customerName}'s booking${f.bookingDate ? ` on ${fmtDate(f.bookingDate)}` : ""} to resend`}
                className={`${rowClass} flex-1 min-w-0 text-left cursor-pointer hover:bg-white hover:border-red-200 transition-colors`}
              >
                {body}
              </button>
            ) : (
              <div className={`${rowClass} flex-1 min-w-0`}>{body}</div>
            )}
            {dismiss && (
              <button
                type="button"
                onClick={() => dismiss(f.bookingId)}
                aria-label={`Dismiss ${f.customerName}${f.dogName ? ` · ${f.dogName}` : ""}`}
                title="Dismiss"
                className="shrink-0 w-7 max-sm:w-11 rounded-lg border border-red-100 bg-white/70 text-red-400 flex items-center justify-center cursor-pointer hover:bg-white hover:text-red-700 hover:border-red-200 transition-colors"
              >
                <X size={14} strokeWidth={2.4} aria-hidden="true" />
              </button>
            )}
          </li>
        );
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run --project=component src/components/dashboard/DeliveryFailuresCard.component.test.jsx`
Expected: PASS (all 5 — 2 original + 3 new).

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/DeliveryFailuresCard.jsx src/components/dashboard/DeliveryFailuresCard.component.test.jsx
git commit -m "feat(delivery): per-row dismiss button on the Delivery issues card"
```

---

### Task 5: Full verification + rollout note

**Files:** none (verification only)

- [ ] **Step 1: Run the full CI bar**

```bash
npm run lint && npm run typecheck && npm run check:migrations && npm run test && npm run build
```
Expected: lint 0 errors; typecheck clean; `Migration validation OK`; tests green **except** the 6 known localStorage-isolation files (`useDraftPersistence`, `DogsView`, `HumansView`, `useDogs`, `useHumans`, `useHumansData`) which fail locally only; build ✓.

- [ ] **Step 2: Optional offline visual check (sample data, no PII)**

The offline preview has no failed-notification sample rows, so the card shows "All messages delivered" and the ✕ won't appear there — visual review of the dismissed/active states is best done by the maintainer against real data after deploy. (Do NOT screenshot the live `:5173` server — it serves real PII.)

- [ ] **Step 3: Rollout (manual, by the maintainer)**

1. Apply `supabase/migrations/20260624120000_notification_dismissals.sql` to **prod** (it's idempotent; safe to run once).
2. Merge the PR → Vercel deploys the frontend.
   - If merged before the migration is applied, the card degrades to today's behaviour (no dismiss) and `dismiss()` logs an error + refreshes — no breakage.

---

## Self-Review

**Spec coverage:**
- Per-booking, DB-backed, shared, re-surface → Task 1 (table/RPC) + Task 2/3 (filter). ✓
- Dashboard-only scope (byBooking untouched) → Task 3 Step 1 (filters `failures` only). ✓
- RLS staff-only + revoke anon + realtime → Task 1. ✓
- UI ✕ sibling (not nested), aria-label, ≥44px mobile, no ✕ when unavailable → Task 4. ✓
- Tests (hook filter logic + card) → Task 2 + Task 4. ✓
- Idempotent migration + prod-first rollout → Task 1 + Task 5. ✓

**Placeholder scan:** none — every step has concrete code/commands.

**Type/name consistency:** `applyDismissals(failures, dismissals)` defined in Task 2, used in Task 3. `dismiss(bookingId)` defined in Task 3, consumed in Task 4 via `data.dismiss`. RPC name `dismiss_delivery_failure` / param `p_booking_id` consistent across Task 1 (def) and Task 3 (call). `notification_dismissals` columns `booking_id`/`dismissed_at` consistent across Task 1 and Task 3's select.
