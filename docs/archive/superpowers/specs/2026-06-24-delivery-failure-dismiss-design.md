# Dismiss delivery-failure items — design

**Date:** 2026-06-24
**Status:** Approved (design)
**Branch:** `feat/dismiss-delivery-failures` (off `main`)

## Problem

The dashboard "Delivery issues" card ([`DeliveryFailuresCard`](../../../src/components/dashboard/DeliveryFailuresCard.jsx)) surfaces customer notifications that failed to deliver (confirmation / reminder / ready / cancellation), one row per booking. It is **awareness-only** and has **no way to clear an item** — a row only disappears when that message is successfully re-sent (a newer `sent` row in `notification_log` supersedes the `failed` one) or it ages out after `LOOKBACK_DAYS = 120`.

Staff sometimes have failures they've already actioned or knowingly won't resend (e.g. a customer with no working number), and want to clear them from the card without leaving them nagging indefinitely.

## Goal

Let staff **dismiss a failed-delivery booking** from the card. Dismissals are:

- **Per booking** — the card shows one row per booking (a customer + dog, even when both their confirmation and reminder failed); Dismiss clears that whole row. *Not* per-trigger.
- **Shared across all staff/devices** — persisted in the database, reflected live.
- **Re-surfacing on a fresh failure** — a dismissal only silences the failures seen up to the dismiss moment; if that booking's notification fails *again* later, it reappears so staff aren't blind to a new problem.

## Non-goals (YAGNI)

- No per-trigger dismissal (booking-level only).
- No "dismiss all" button (per-row only; the card already collapses to "All messages delivered" once every row is gone).
- No undo UI (re-dismissing after a re-surface is the only "redo"; a mistaken dismiss self-corrects on the next failure, and the underlying message can still be resent from the booking).
- No change to how messages are sent or retried — this is purely about hiding *acknowledged* failures.

## Behaviour

A booking's failure is **hidden from the dashboard "Delivery issues" card** when a dismissal exists for it whose `dismissed_at` is **≥ that booking's most recent failed send** (`latestAt`, already computed by the hook). Because any later failure has a newer `created_at` than the dismissal, it re-surfaces automatically. Re-dismissing bumps `dismissed_at` to "now" again.

**Scope: the dashboard aggregate card only.** Dismiss declutters the "X messages failed" summary; it deliberately does **not** hide the per-booking red badge on the calendar pill or the in-booking `DeliveryFailureCard`. That keeps the booking actionable — staff can still open it and Fix-the-number / Resend after dismissing the dashboard nag. (Semantics: the dashboard card = "unacknowledged failures needing attention"; the pill = the per-booking fact. They can legitimately differ, and a still-red pill is the lighter-weight, per-booking signal.)

## Data model

New table `notification_dismissals`:

| column | type | notes |
|---|---|---|
| `booking_id` | `uuid` | **primary key** (one dismissal row per booking; FK → `bookings(id) on delete cascade`) |
| `dismissed_at` | `timestamptz not null default now()` | server time — drives the re-surface comparison |
| `dismissed_by` | `uuid` | `auth.uid()` of the staff who dismissed (audit) |

- One row per booking; **dismiss = upsert** (`on conflict (booking_id) do update set dismissed_at = now(), dismissed_by = auth.uid()`).
- **Writes go through a `SECURITY DEFINER` RPC** `dismiss_delivery_failure(p_booking_id uuid)` that performs the upsert with the **DB's `now()`** (skew-free vs the DB-timestamped `notification_log.created_at`) and guards on `is_staff()`. No direct client INSERT/UPDATE policy is needed, which also stops a client forging `dismissed_at`.
- **RLS:** enable RLS; a single `SELECT` policy for staff (`is_staff()`) so the hook can read dismissals. (No client insert/update/delete policies — the RPC owns writes.)
- **Grants:** `execute` on the RPC to `authenticated`; explicitly `revoke ... from anon` (new public functions auto-grant to `anon`).
- **Realtime:** add `notification_dismissals` to the `supabase_realtime` publication so a dismiss on one device clears the card on others, mirroring `20260601031624_realtime_publication_dashboard_tables.sql`.

### Migration

One **idempotent** migration `supabase/migrations/<ts>_notification_dismissals.sql`:
`create table if not exists` + `alter table ... enable row level security` + `drop policy if exists` then `create policy` + RPC `create or replace function` + grants + `alter publication supabase_realtime add table` guarded so a re-run doesn't error. Follows the existing RLS/realtime migration idioms.

**Rollout order (project rule — migrations are hand-applied to prod):** apply this migration to prod **first**, then merge the frontend. Until the migration is applied, the table/RPC don't exist; see Degradation below.

## Hook changes — [`useDeliveryFailures.js`](../../../src/supabase/hooks/useDeliveryFailures.js)

The module-singleton `refresh()` already computes `byBooking` (Map) and `failures` (per-booking list with `latestAt`).

1. After computing failures, **fetch dismissals** for the live booking ids: `select booking_id, dismissed_at from notification_dismissals in (liveBookingIds)`.
2. **Filter the dashboard list only**: drop any booking from `failures` whose dismissal `dismissed_at >= latestAt`. Leave `byBooking` **unfiltered** so the per-booking pill badge + in-booking `DeliveryFailureCard` (driven by `useBookingDeliveryFailure`) are unaffected — that's the dashboard-only scope.
3. **Realtime**: the existing `dashboard-delivery-failures` channel also subscribes to `postgres_changes` on `notification_dismissals` → `refresh()`.
4. Expose **`dismiss(bookingId)`** from `useDeliveryFailures()`:
   - Optimistically remove the booking from the local `failures` list (instant disappearance from the card); leave `byBooking` as-is.
   - `await supabase.rpc("dismiss_delivery_failure", { p_booking_id: bookingId })`.
   - On error: `logger.error(...)` + `refresh()` to restore the true state.
5. **Degradation**: if the RPC/table don't exist yet (migration not applied) or RLS denies, the dismiss call errors → it's logged and `refresh()` restores the row; the SELECT of dismissals is wrapped so a missing table doesn't break the whole card (failures still render). The card simply behaves as it does today.

`IS_TEST` guard stays — tests mock the hook / inject state as now.

## UI changes — [`DeliveryFailuresCard.jsx`](../../../src/components/dashboard/DeliveryFailuresCard.jsx)

Each row currently is a single button (`onSelectFailure` → jump the calendar to that booking). A button can't contain another button, so restructure each `<li>` into a flex row with **two sibling controls**:

- the existing jump-to-booking button (now `flex-1`), and
- a small **dismiss ✕** button (`type="button"`, `aria-label={\`Dismiss \${f.customerName}\${f.dogName ? \` · \${f.dogName}\` : ""}\`}`, ≥44px tap target on mobile), calling `onDismiss(f.bookingId)`.

Thread a new optional `onDismiss` prop from the card's consumer ([`RightWorkflowSidebar`](../../../src/components/dashboard/RightWorkflowSidebar.jsx) / wherever `data`+`onSelectFailure` are supplied) down to the card, wired to the hook's `dismiss`. When `onDismiss` is absent the ✕ isn't rendered (keeps the bare/test usages unaffected). Count + "All messages delivered" empty state already derive from the list, so they update for free.

## Testing

- **Hook logic** (`useDeliveryFailures` — node/jsdom): given failures + a dismissal with `dismissed_at >= latestAt` → booking dropped from `failures` (dashboard) but **still present in `byBooking`** (pill/booking-card unaffected); with a *newer* failure (`created_at > dismissed_at`) → re-surfaces in `failures`. Supabase client stubbed (the file's existing test pattern).
- **Card** (`DeliveryFailuresCard.component.test.jsx`): renders a ✕ per row with the right `aria-label`; clicking calls `onDismiss(bookingId)`; no ✕ when `onDismiss` is absent; the jump button still works (nested-button regression).
- **Migration**: `npm run check:migrations` passes (filename/order); manual idempotency check (safe to re-run).

## Rollout / sequencing

1. Implement on `feat/dismiss-delivery-failures`.
2. Full CI bar green (`lint · typecheck · check:migrations · test · build`).
3. **Apply the migration to prod by hand**, then merge — the frontend degrades gracefully if it's ever ahead of the schema, but the intended order is migration-first.
4. Separate PR from the modal-standardisation (#418) and number-fix (#419) work.

## Open questions

None — design approved 2026-06-24.
