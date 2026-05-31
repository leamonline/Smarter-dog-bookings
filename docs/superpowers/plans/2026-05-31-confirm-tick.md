# Confirm-Tick on Bookings — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a small green tick on every booking where the customer has tapped the **Confirm** Quick Reply button on their WhatsApp reminder.

**Architecture:** Store the confirmation as `reminder_confirmed_at timestamptz` on `bookings`. The `whatsapp-agent` Supabase function detects the inbound template-button reply (`msg.button.text === "Confirm"`) and calls a `mark_reminder_confirmed(human_id)` Postgres RPC that atomically stamps every one of that customer's matching bookings. The UI reads `reminderConfirmedAt` through the existing `dbBookingsToArray` transform and renders a tick on the day-view card, the Tomorrow's Reminders card, and a plain-text line in the booking detail modal. The existing realtime subscription on `bookings` propagates updates without any extra plumbing.

**Tech Stack:** Postgres (Supabase), Deno (Supabase Edge Functions), React + Tailwind, Vitest (logic + component projects).

**Spec:** [docs/superpowers/specs/2026-05-31-confirm-tick-design.md](../specs/2026-05-31-confirm-tick-design.md)

---

## File Structure

**Create:**
- `supabase/migrations/20260531120000_booking_reminder_confirmed.sql` — column, partial index, and `mark_reminder_confirmed` RPC.
- `src/components/booking/BookingCardNew.component.test.jsx` — component test for the tick.

**Modify:**
- `src/types/index.ts` — add `reminderConfirmedAt: string | null` to `Booking`.
- `src/supabase/transforms.ts` — extend `DbBookingRow` and map the field in `dbBookingsToArray`.
- `src/supabase/transforms.test.ts` — assert the new field plumbs through.
- `src/components/booking/BookingCardNew.jsx` — render the green tick.
- `src/components/modals/BookingDetailModal.jsx` — add a "Customer confirmed via WhatsApp at …" line.
- `src/supabase/hooks/useTomorrowReminders.js` — extend the `bookings` select to include `reminder_confirmed_at`.
- `src/supabase/hooks/groupRemindersByCustomer.js` — derive a `confirmed` flag per row.
- `src/supabase/hooks/groupRemindersByCustomer.test.js` — cover the new derivation.
- `src/components/dashboard/TomorrowRemindersCard.jsx` — render the tick on confirmed rows.
- `supabase/functions/whatsapp-agent/index.ts` — add the `button.text === "Confirm"` branch.

---

### Task 1: Database migration

**Files:**
- Create: `supabase/migrations/20260531120000_booking_reminder_confirmed.sql`

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260531120000_booking_reminder_confirmed.sql` with:

```sql
-- ============================================================
-- Confirm-tick on bookings.
--
-- Adds reminder_confirmed_at to bookings: a single timestamptz that is
-- null until the customer taps the "Confirm" Quick Reply on their
-- WhatsApp reminder. Stamped by mark_reminder_confirmed() (below),
-- which the whatsapp-agent edge function calls when it sees an inbound
-- template-button reply with text="Confirm".
--
-- See docs/superpowers/specs/2026-05-31-confirm-tick-design.md.
-- ============================================================

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS reminder_confirmed_at timestamptz;

COMMENT ON COLUMN bookings.reminder_confirmed_at IS
  'Timestamp the customer tapped the Confirm Quick Reply on this booking''s WhatsApp reminder. Null until then. Never cleared (idempotent).';

CREATE INDEX IF NOT EXISTS idx_bookings_reminder_confirmed_at
  ON bookings (reminder_confirmed_at)
  WHERE reminder_confirmed_at IS NOT NULL;

-- mark_reminder_confirmed(p_human_id)
--   For the given customer (humans.id), stamp reminder_confirmed_at on
--   every active booking whose dog belongs to that customer AND has a
--   recent ('sent', within 36h) WhatsApp reminder log row. Idempotent:
--   bookings already stamped are skipped via the null guard. Returns
--   the affected booking ids so the caller can log how many fired.
--
--   SECURITY DEFINER so service-role callers (the edge function) hit
--   exactly the same code path the RLS-aware tests do. The function
--   does its own filtering on human_id; we are not exposing it to
--   anon/authenticated roles.
CREATE OR REPLACE FUNCTION mark_reminder_confirmed(p_human_id uuid)
RETURNS SETOF uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE bookings b
     SET reminder_confirmed_at = now()
    FROM dogs d
   WHERE b.dog_id = d.id
     AND d.human_id = p_human_id
     AND b.reminder_confirmed_at IS NULL
     AND b.status NOT IN ('Cancelled', 'Completed')
     AND EXISTS (
       SELECT 1
         FROM notification_log n
        WHERE n.booking_id    = b.id
          AND n.trigger_type  = 'reminder'
          AND n.channel       = 'whatsapp'
          AND n.status        = 'sent'
          AND n.sent_at       >= now() - INTERVAL '36 hours'
     )
  RETURNING b.id;
END;
$$;

REVOKE ALL ON FUNCTION mark_reminder_confirmed(uuid) FROM public;
GRANT EXECUTE ON FUNCTION mark_reminder_confirmed(uuid) TO service_role;
```

- [ ] **Step 2: Sanity-check the migration locally**

Run: `node scripts/check-migrations.mjs`
Expected: passes (no syntax errors flagged).

If you have a local Supabase dev DB:

Run: `supabase db reset` (if you don't mind wiping local data) or `supabase migration up`
Expected: migration applies cleanly.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260531120000_booking_reminder_confirmed.sql
git commit -m "$(cat <<'EOF'
Add reminder_confirmed_at column + mark_reminder_confirmed RPC

Column on bookings (null until customer taps Confirm Quick Reply on
their WhatsApp reminder). Partial index keeps it tiny since most
rows are null. RPC atomically stamps every matching booking for a
given human_id, filtered to recent (<= 36h) WhatsApp-channel
reminders only.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Apply to remote**

The deploy pipeline / `supabase db push` workflow used by this project applies migrations. Apply the migration to the remote project before deploying any code that depends on the column. Don't deploy Task 7's agent change until this is live.

---

### Task 2: Plumb the field through DB → client transform

**Files:**
- Modify: `src/supabase/transforms.ts:45-67` (DbBookingRow interface)
- Modify: `src/supabase/transforms.ts:308-335` (Booking object construction)
- Modify: `src/types/index.ts:63-94` (Booking interface)
- Test: `src/supabase/transforms.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/supabase/transforms.test.ts` (inside the existing `describe("dbBookingsToArray", ...)` block, or in a fresh one at the bottom of the file):

```ts
describe("dbBookingsToArray — reminder_confirmed_at", () => {
  it("maps reminder_confirmed_at to reminderConfirmedAt", () => {
    const dogsById = buildDogsById([{ id: "d-1", name: "Bella", human_id: "h-1" } as any]);
    const humansById = dbHumansToMap([{ id: "h-1", name: "Jane", surname: "S" } as any]);
    const out = dbBookingsToArray(
      [
        {
          id: "b-1",
          slot: "09:00",
          size: "small",
          service: "Full Groom",
          status: "Booked",
          addons: null,
          payment: null,
          confirmed: null,
          dog_id: "d-1",
          pickup_by_id: null,
          booking_date: "2026-06-01",
          group_id: null,
          reminder_confirmed_at: "2026-05-31T15:53:00Z",
        } as any,
      ],
      dogsById,
      humansById,
    );
    expect(out[0].reminderConfirmedAt).toBe("2026-05-31T15:53:00Z");
  });

  it("defaults reminderConfirmedAt to null when absent", () => {
    const dogsById = buildDogsById([{ id: "d-1", name: "Bella", human_id: "h-1" } as any]);
    const humansById = dbHumansToMap([{ id: "h-1", name: "Jane", surname: "S" } as any]);
    const out = dbBookingsToArray(
      [
        {
          id: "b-1",
          slot: "09:00",
          size: "small",
          service: "Full Groom",
          status: "Booked",
          addons: null,
          payment: null,
          confirmed: null,
          dog_id: "d-1",
          pickup_by_id: null,
          booking_date: "2026-06-01",
          group_id: null,
        } as any,
      ],
      dogsById,
      humansById,
    );
    expect(out[0].reminderConfirmedAt).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/supabase/transforms.test.ts`
Expected: FAIL — `reminderConfirmedAt` is undefined / property does not exist on `Booking`.

- [ ] **Step 3: Extend `DbBookingRow`**

Edit `src/supabase/transforms.ts` — add the field to the interface (around line 67):

```ts
interface DbBookingRow {
  // ...existing fields...
  staff_capacity_override?: boolean | null;
  staff_capacity_override_by?: string | null;
  staff_capacity_override_at?: string | null;
  reminder_confirmed_at?: string | null;
}
```

- [ ] **Step 4: Extend `Booking` type**

Edit `src/types/index.ts` — add the field to the `Booking` interface (around line 88, just before the `_dogId` block):

```ts
export interface Booking {
  // ...existing fields...
  staffCapacityOverride: boolean;
  staffCapacityOverrideBy: string | null;
  staffCapacityOverrideAt: string | null;
  reminderConfirmedAt: string | null;
  _dogId: string;
  // ...rest...
}
```

- [ ] **Step 5: Map the field in `dbBookingsToArray`**

Edit `src/supabase/transforms.ts` — in the object returned from `dbBookingsToArray` (around line 308-335), add the new field next to the other override columns:

```ts
    return {
      // ...existing fields...
      staffCapacityOverride: row.staff_capacity_override === true,
      staffCapacityOverrideBy: row.staff_capacity_override_by ?? null,
      staffCapacityOverrideAt: row.staff_capacity_override_at ?? null,
      reminderConfirmedAt: row.reminder_confirmed_at ?? null,
      _dogId: row.dog_id,
      // ...rest...
    };
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run src/supabase/transforms.test.ts`
Expected: PASS, including the two new cases.

- [ ] **Step 7: Verify the full type-check**

Run: `npx tsc --noEmit`
Expected: clean (no errors introduced by the new field).

- [ ] **Step 8: Commit**

```bash
git add src/types/index.ts src/supabase/transforms.ts src/supabase/transforms.test.ts
git commit -m "$(cat <<'EOF'
Plumb reminder_confirmed_at through DB-to-client transform

Adds reminderConfirmedAt to the Booking type and dbBookingsToArray.
No UI surface uses it yet; this just makes the field available to
the card and modal so they can render conditionally.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Render the green tick on `BookingCardNew`

**Files:**
- Modify: `src/components/booking/BookingCardNew.jsx` (row 1 of the card body — around line 271–355)
- Create: `src/components/booking/BookingCardNew.component.test.jsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/booking/BookingCardNew.component.test.jsx`:

```jsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import BookingCardNew from "./BookingCardNew.jsx";

function bookingFixture(overrides = {}) {
  return {
    id: "b-1",
    slot: "09:00",
    dogName: "Bella",
    breed: "Labrador",
    size: "small",
    service: "Full Groom",
    owner: "Jane Smith",
    status: "Booked",
    addons: [],
    pickupBy: "",
    payment: "Due at Pick-up",
    depositAmount: null,
    confirmed: false,
    dogNameSnapshot: "Bella",
    breedSnapshot: "Labrador",
    ownerNameSnapshot: "Jane",
    whatsappConversationId: null,
    whatsappMessageId: null,
    staffCapacityOverride: false,
    staffCapacityOverrideBy: null,
    staffCapacityOverrideAt: null,
    reminderConfirmedAt: null,
    _dogId: "d-1",
    _ownerId: "h-1",
    _pickupById: null,
    _bookingDate: "2026-06-01",
    _groupId: null,
    ...overrides,
  };
}

function renderCard(booking) {
  return render(
    <BookingCardNew
      booking={booking}
      currentDateStr="2026-06-01"
      onUpdate={vi.fn()}
      onOpen={vi.fn()}
    />,
  );
}

describe("BookingCardNew — confirm tick", () => {
  it("renders the green tick when reminderConfirmedAt is set", () => {
    renderCard(bookingFixture({ reminderConfirmedAt: "2026-05-31T15:53:00Z" }));
    const tick = screen.getByRole("img", { name: /customer confirmed/i });
    expect(tick).toBeInTheDocument();
  });

  it("includes the timestamp in the tooltip", () => {
    renderCard(bookingFixture({ reminderConfirmedAt: "2026-05-31T15:53:00Z" }));
    const tick = screen.getByRole("img", { name: /customer confirmed/i });
    expect(tick.getAttribute("title")).toMatch(/confirmed via whatsapp/i);
  });

  it("does not render the tick when reminderConfirmedAt is null", () => {
    renderCard(bookingFixture({ reminderConfirmedAt: null }));
    expect(screen.queryByRole("img", { name: /customer confirmed/i })).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/booking/BookingCardNew.component.test.jsx`
Expected: FAIL — no element with `role="img"` and matching aria-label.

If the BookingCardNew render needs additional context (e.g. it pulls dogs/humans from a store), inspect the existing component for required props and adjust the fixture / mock the relevant store. Don't introduce new context — just match what the card actually consumes today.

- [ ] **Step 3: Add a small formatter helper at the top of `BookingCardNew.jsx`**

Find the existing `formatOverrideAt` helper (around line 61 of `src/components/booking/BookingCardNew.jsx`) and add a sibling helper just below it:

```jsx
function formatConfirmedAt(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const date = d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const time = d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${date} at ${time}`;
}
```

- [ ] **Step 4: Render the tick in row 1**

In `src/components/booking/BookingCardNew.jsx`, locate the `staffCapacityOverride` badge (around line 317–334). Add the tick **immediately after** that badge and **before** the `pricing.isPaidInFull` / price block (around line 335):

```jsx
{booking.reminderConfirmedAt && (
  <span
    role="img"
    aria-label={`Customer confirmed at ${formatConfirmedAt(booking.reminderConfirmedAt)}`}
    title={`Confirmed via WhatsApp at ${formatConfirmedAt(booking.reminderConfirmedAt)}`}
    className="self-center inline-flex items-center justify-center w-5 h-5 rounded-full text-emerald-700 bg-emerald-50 border border-emerald-200 shrink-0"
  >
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  </span>
)}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/components/booking/BookingCardNew.component.test.jsx`
Expected: all three new cases PASS.

- [ ] **Step 6: Run the full vitest suite**

Run: `npm run test`
Expected: all tests PASS. No regressions in BookingCardNew's existing component coverage (if any).

- [ ] **Step 7: Commit**

```bash
git add src/components/booking/BookingCardNew.jsx src/components/booking/BookingCardNew.component.test.jsx
git commit -m "$(cat <<'EOF'
Render green confirm-tick on BookingCardNew

Small emerald check badge on row 1 of the card, only rendered when
booking.reminderConfirmedAt is set. Tooltip + aria-label expose the
human-readable timestamp. Colours mirror the existing Paid badge so
the tick reads as part of the same visual family.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Booking detail modal — confirmation line

**Files:**
- Modify: `src/components/modals/BookingDetailModal.jsx:655-667` (and the helper section near line 780)

- [ ] **Step 1: Add the confirmation footer component**

In `src/components/modals/BookingDetailModal.jsx`, locate the `OverrideAuditFooter` helper function at the bottom (around line 785). Immediately below it, add a sibling helper:

```jsx
function ConfirmedByCustomerFooter({ at }) {
  if (!at) return null;
  const when = (() => {
    const d = new Date(at);
    if (Number.isNaN(d.getTime())) return at;
    const date = d.toLocaleDateString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
    const time = d.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    return `${date} at ${time}`;
  })();

  return (
    <div className="px-3 py-2.5 mb-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-[12px] font-semibold leading-snug shadow-sm">
      <span className="uppercase text-[10px] font-extrabold tracking-wider mr-1">Confirmed</span>
      Customer confirmed via WhatsApp on {when}.
    </div>
  );
}
```

- [ ] **Step 2: Render it in the modal body**

Still in `src/components/modals/BookingDetailModal.jsx`, find the `OverrideAuditFooter` usage (around line 661):

```jsx
          {booking.staffCapacityOverride && (
            <OverrideAuditFooter
              by={booking.staffCapacityOverrideBy}
              at={booking.staffCapacityOverrideAt}
            />
          )}
```

Insert the new footer **immediately above** that block (so a confirmed booking that also has an override shows the confirm line first):

```jsx
          {booking.reminderConfirmedAt && (
            <ConfirmedByCustomerFooter at={booking.reminderConfirmedAt} />
          )}

          {booking.staffCapacityOverride && (
            <OverrideAuditFooter
              by={booking.staffCapacityOverrideBy}
              at={booking.staffCapacityOverrideAt}
            />
          )}
```

- [ ] **Step 3: Smoke-test in vitest**

Run: `npx vitest run src/components/modals/BookingDetailModal.component.test.jsx`
Expected: existing tests still PASS. No new test added — the modal's render path is straightforward and the footer is purely presentational. Coverage of the formatter is implicit through the card's component test (same date/time format).

- [ ] **Step 4: Run the full test suite**

Run: `npm run test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/modals/BookingDetailModal.jsx
git commit -m "$(cat <<'EOF'
Show 'Customer confirmed via WhatsApp' footer in BookingDetailModal

Plain-text emerald footer rendered above the existing capacity-override
footer when booking.reminderConfirmedAt is set. The tick on the card
is the at-a-glance signal; this is where staff get the context.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Tomorrow's Reminders — derive the `confirmed` row flag

**Files:**
- Modify: `src/supabase/hooks/useTomorrowReminders.js:43-50` (the `.select(...)` string)
- Modify: `src/supabase/hooks/groupRemindersByCustomer.js` (derivation logic)
- Test: `src/supabase/hooks/groupRemindersByCustomer.test.js`

- [ ] **Step 1: Write the failing test**

Open `src/supabase/hooks/groupRemindersByCustomer.test.js` and add the following `describe` block at the end of the file:

```js
describe("groupRemindersByCustomer — confirmed flag", () => {
  it("sets confirmed=true when any of the customer's bookings has reminder_confirmed_at", () => {
    const bookings = [
      {
        id: "b-1",
        slot: "09:00",
        dog_id: "d-1",
        dog_name_snapshot: "Bella",
        owner_name_snapshot: "Jane",
        dogs: { human_id: "h-1", name: "Bella" },
        reminder_confirmed_at: "2026-05-31T15:53:00Z",
      },
      {
        id: "b-2",
        slot: "11:00",
        dog_id: "d-2",
        dog_name_snapshot: "Rex",
        owner_name_snapshot: "Jane",
        dogs: { human_id: "h-1", name: "Rex" },
        reminder_confirmed_at: null,
      },
    ];
    const [row] = groupRemindersByCustomer(bookings, new Map());
    expect(row.confirmed).toBe(true);
  });

  it("sets confirmed=false when no booking has been confirmed", () => {
    const bookings = [
      {
        id: "b-1",
        slot: "09:00",
        dog_id: "d-1",
        dog_name_snapshot: "Bella",
        owner_name_snapshot: "Jane",
        dogs: { human_id: "h-1", name: "Bella" },
        reminder_confirmed_at: null,
      },
    ];
    const [row] = groupRemindersByCustomer(bookings, new Map());
    expect(row.confirmed).toBe(false);
  });

  it("exposes the latest reminderConfirmedAt across the customer's bookings", () => {
    const bookings = [
      {
        id: "b-1",
        slot: "09:00",
        dog_id: "d-1",
        dog_name_snapshot: "Bella",
        owner_name_snapshot: "Jane",
        dogs: { human_id: "h-1", name: "Bella" },
        reminder_confirmed_at: "2026-05-31T15:53:00Z",
      },
      {
        id: "b-2",
        slot: "11:00",
        dog_id: "d-2",
        dog_name_snapshot: "Rex",
        owner_name_snapshot: "Jane",
        dogs: { human_id: "h-1", name: "Rex" },
        reminder_confirmed_at: "2026-05-31T15:55:30Z",
      },
    ];
    const [row] = groupRemindersByCustomer(bookings, new Map());
    expect(row.reminderConfirmedAt).toBe("2026-05-31T15:55:30Z");
  });
});
```

The existing tests import `groupRemindersByCustomer` already — reuse the import at the top of the file. If the file does not yet wrap its tests in `describe(...)` blocks, follow the existing style (each `it` at the top level is fine; just keep the new cases together at the end).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/supabase/hooks/groupRemindersByCustomer.test.js`
Expected: FAIL — `row.confirmed` is `undefined`.

- [ ] **Step 3: Extend the grouping logic**

Edit `src/supabase/hooks/groupRemindersByCustomer.js`. In the final `.map(g => ({ ... }))` block (around line 55–99), add two new derived values:

```js
    // Confirmed = any of the customer's bookings has reminder_confirmed_at set.
    // We expose the latest stamp so the UI can show a tooltip.
    let confirmed = false;
    let latestConfirmedAt = null;
    for (const b of bookings ?? []) {
      const groupKey = (b.dogs?.human_id ?? null) ?? `orphan:${b.id}`;
      if (groupKey !== g.customerKey) continue;
      if (b.reminder_confirmed_at) {
        confirmed = true;
        if (!latestConfirmedAt || b.reminder_confirmed_at > latestConfirmedAt) {
          latestConfirmedAt = b.reminder_confirmed_at;
        }
      }
    }
```

(That inner loop is necessary because the existing code already collapsed the bookings into a single group object that does not retain the per-booking confirmation field. Put this block immediately after the existing `reminderStatus` derivation, then add the two new properties to the returned object below.)

Extend the returned object:

```js
    return {
      customerKey: g.customerKey,
      customerName: g.customerName,
      dogNames,
      dogNamesDisplay: joinNamesAmp(dogNames),
      bookingIds: g.bookingIds,
      anchorBookingId: g.bookingIds[0],
      slots,
      slot: slots[0] ?? null,
      multiSlot: slots.length > 1,
      reminderStatus,
      reminderSentAt: latestSentAt,
      reminderChannel: sentChannel ?? pendingChannel ?? null,
      confirmed,
      reminderConfirmedAt: latestConfirmedAt,
    };
```

Note: the inner loop re-scans `bookings` for each group, which is O(N²) for the small N we ever see here. If a future profiler ever flags this, the cleaner refactor is to track `reminder_confirmed_at` on each group as it's built in the first loop — but that's premature now.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/supabase/hooks/groupRemindersByCustomer.test.js`
Expected: all new cases PASS, existing cases still PASS.

- [ ] **Step 5: Extend the `useTomorrowReminders` select**

Edit `src/supabase/hooks/useTomorrowReminders.js`. The current select is:

```js
        .select(
          "id, slot, service, status, booking_date, dog_id, dog_name_snapshot, owner_name_snapshot, dogs(human_id, name)",
        )
```

Add `reminder_confirmed_at` to the list:

```js
        .select(
          "id, slot, service, status, booking_date, dog_id, dog_name_snapshot, owner_name_snapshot, reminder_confirmed_at, dogs(human_id, name)",
        )
```

- [ ] **Step 6: Run the full test suite**

Run: `npm run test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/supabase/hooks/useTomorrowReminders.js src/supabase/hooks/groupRemindersByCustomer.js src/supabase/hooks/groupRemindersByCustomer.test.js
git commit -m "$(cat <<'EOF'
Surface customer-confirmed flag on Tomorrow's Reminders rows

useTomorrowReminders now also fetches reminder_confirmed_at, and
groupRemindersByCustomer derives a confirmed boolean plus the latest
confirmation timestamp across each customer's bookings.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Tomorrow's Reminders card — render the tick

**Files:**
- Modify: `src/components/dashboard/TomorrowRemindersCard.jsx` (around line 39–70, where `reminderStatus === "sent"` is rendered)

- [ ] **Step 1: Find the per-row render**

Open `src/components/dashboard/TomorrowRemindersCard.jsx`. Look at the row that already renders the sent/unsent indicator (around line 60–70). Today it conditionally renders either `<CheckCircle2 ... className="text-emerald-600" />` for `sent`, or `<Circle ... className="text-amber-400" />` for unsent.

- [ ] **Step 2: Add a second tick when the row is confirmed**

Immediately after the existing `<CheckCircle2 ... />` (the "sent" indicator), add a second emerald check icon that renders only when `row.confirmed` is true. Use the same lucide-react `CheckCircle2` already imported. Example wiring (adjust to match the file's existing JSX structure):

```jsx
{sent ? (
  <>
    <CheckCircle2 size={16} className="text-emerald-600" aria-label="Reminder sent" />
    {row.confirmed && (
      <CheckCircle2
        size={16}
        className="text-emerald-700 fill-emerald-100"
        aria-label={`Customer confirmed${row.reminderConfirmedAt ? ` at ${new Date(row.reminderConfirmedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false })}` : ""}`}
      />
    )}
  </>
) : (
  <Circle size={16} className="text-amber-400" aria-label="No reminder sent yet" />
)}
```

The second tick is intentionally distinct (filled, slightly darker) so it doesn't read as a duplicate. If the existing JSX already has a `<>...</>` fragment in that slot, splice the new icon inside it; otherwise wrap the two icons together.

- [ ] **Step 3: Update the row tooltip text**

Find the existing `aria-label` / `title` string on the clickable row (around line 47–55). Append a confirmation suffix when `row.confirmed`:

```jsx
const tooltipExtra = row.confirmed && row.reminderConfirmedAt
  ? ` — customer confirmed at ${new Date(row.reminderConfirmedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false })}`
  : "";

// then in the title/aria-label string:
//   `Reminder sent at ${formatSentTime(row.reminderSentAt)}${...via...}${tooltipExtra} — click to view`
```

Splice `${tooltipExtra}` into the existing template literal — don't refactor the surrounding string.

- [ ] **Step 4: Smoke-test**

Run: `npm run test`
Expected: PASS. No new test added — the card's render is presentational and the underlying derivation is already covered by Task 5.

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/TomorrowRemindersCard.jsx
git commit -m "$(cat <<'EOF'
Show confirmation tick on Tomorrow's Reminders card rows

When a customer's reminder for tomorrow has been confirmed (any of
their bookings has reminder_confirmed_at set), render a second
emerald check icon next to the existing 'sent' indicator. Tooltip
exposes the confirmation time.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: `whatsapp-agent` — detect the Confirm Quick Reply tap

**Files:**
- Modify: `supabase/functions/whatsapp-agent/index.ts` (around line 2007–2049, after the existing `interactive.button_reply` router)

- [ ] **Step 1: Locate the existing button-reply router**

Open `supabase/functions/whatsapp-agent/index.ts`. Find the existing block that begins around line 2007 with the comment `// Button-reply routing: if this inbound is a Yes/No tap on a confirm_buttons message...`. That block ends with `continue; // skip Claude draft for this turn` around line 2047.

Our new branch goes **immediately after** that block (still inside the inbound-message loop, before the Phase G "AI on demand" check at line 2058).

- [ ] **Step 2: Add the Confirm-tap branch**

Insert the following block immediately after the existing button-reply router:

```ts
          // Reminder confirm: customer tapped the "Confirm" Quick Reply on
          // their appointment_reminder template. This arrives as a
          // *template button reply* (msg.button.text), NOT an interactive
          // button_reply. It is its own path because the matching is
          // looser — we stamp every recent, sent WhatsApp reminder for
          // this customer's active bookings in one atomic RPC.
          if (msg.button?.text === "Confirm" && conversation.human_id) {
            try {
              const { data: stampedIds, error: stampErr } = await supabase
                .rpc("mark_reminder_confirmed", { p_human_id: conversation.human_id });
              if (stampErr) {
                console.warn("mark_reminder_confirmed rpc failed:", stampErr.message);
              } else {
                const count = Array.isArray(stampedIds) ? stampedIds.length : 0;
                console.log(`mark_reminder_confirmed: stamped ${count} booking(s) for human ${conversation.human_id}`);
              }
            } catch (err) {
              console.warn("mark_reminder_confirmed dispatch failed:", err);
            }
            continue; // quiet acknowledgement — no AI draft for a bare Confirm tap
          }
```

Notes:
- We skip the lookup entirely for `conversation.human_id == null` (unknown sender) — a cold customer cannot have an outstanding reminder. The branch matches only when both conditions hold, so unknown senders fall through to the Claude path as before.
- On RPC failure we log a warning but still `continue` (we don't want a downstream failure to also generate an awkward AI reply for what was clearly a Confirm tap).

- [ ] **Step 3: Deploy the function**

The user's existing deploy workflow:

Run: `supabase functions deploy whatsapp-agent --no-verify-jwt`
Expected: deploy succeeds. Function URL unchanged.

(Make absolutely sure Task 1's migration is live on the remote project before deploying this. Without the RPC the agent will log an `rpc failed` warning on every Confirm tap.)

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/whatsapp-agent/index.ts
git commit -m "$(cat <<'EOF'
whatsapp-agent: stamp bookings when customer taps Confirm

Detect inbound template button reply (msg.button.text === 'Confirm')
on a known conversation and call mark_reminder_confirmed RPC to
atomically stamp every matching booking. Quiet acknowledgement —
skips the Claude draft path for this turn.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: End-to-end verification

This task has no code; it's the manual check that proves the feature works in the real WhatsApp pipeline.

- [ ] **Step 1: Pick a test booking**

Open the dashboard. Pick (or create) a booking for tomorrow on your own customer record (the one wired to your personal WhatsApp number). Confirm `reminder_confirmed_at` is null on it via the Supabase SQL editor:

```sql
select id, status, reminder_confirmed_at
  from bookings
 where booking_date = (current_date + interval '1 day')::date
   and dog_id in (
     select id from dogs where human_id = '<your-human-id>'
   );
```

Expected: at least one row, `reminder_confirmed_at` is null.

- [ ] **Step 2: Send the reminder**

From the dashboard, hit "Send Reminder" on that row (or wait for the nightly cron — manual is faster). Confirm the `notification_log` row exists:

```sql
select trigger_type, channel, status, sent_at
  from notification_log
 where booking_id = '<booking-id>'
   and trigger_type = 'reminder';
```

Expected: one row, `channel='whatsapp'`, `status='sent'`, `sent_at` recent.

- [ ] **Step 3: Tap Confirm in WhatsApp**

On your phone, open the WhatsApp thread with the salon, tap the **Confirm** Quick Reply button on the reminder message.

- [ ] **Step 4: Watch the function log**

Run: `supabase functions logs whatsapp-agent --tail` (or use the Supabase dashboard log viewer).
Expected: a `mark_reminder_confirmed: stamped 1 booking(s) for human <uuid>` log line.

- [ ] **Step 5: Verify the column was stamped**

Re-run the SQL from Step 1.
Expected: `reminder_confirmed_at` is now a timestamp within the last minute.

- [ ] **Step 6: Verify the dashboard updates live**

The dashboard tab should still be open from Step 1. Without refreshing, expect:
- The day-view booking card now shows the green tick on row 1.
- The Tomorrow's Reminders card shows the row's confirmation tick.
- Opening the booking detail modal shows "Customer confirmed via WhatsApp on …".

(If the dashboard does not auto-update within ~5 seconds, the realtime subscription on `bookings` is misbehaving — that's a deeper issue unrelated to this feature.)

- [ ] **Step 7: Idempotency check**

Tap **Confirm** a second time on the same reminder in WhatsApp. Re-check the function log:
Expected: `mark_reminder_confirmed: stamped 0 booking(s) for human <uuid>` (the null guard skipped the already-stamped row).

- [ ] **Step 8: Done**

No commit. Close out the feature.

---

## Self-Review

**Spec coverage:**
- Section "Trigger" → Task 7 (detection branch).
- Section "Data model" → Task 1 (migration with column + index + RPC).
- Section "Detection (webhook)" → Task 7 (matches `msg.button.text === "Confirm"`, calls RPC, `continue`s).
- Section "UI #1 BookingCardNew" → Task 3.
- Section "UI #2 Booking client shape" → Task 2.
- Section "UI #3 TomorrowRemindersCard" → Tasks 5 + 6.
- Section "UI #4 Booking detail modal" → Task 4.
- Section "Edge cases" — multi-dog handled by Task 1 RPC; double-tap idempotency verified in Task 8 step 7; cancelled/completed exclusion lives in the RPC; 36h window in the RPC; SMS/email channel filter in the RPC; unknown sender guarded in Task 7 branch.
- Section "Testing" — `transforms.test.ts` (Task 2), `BookingCardNew.component.test.jsx` (Task 3), `groupRemindersByCustomer.test.js` (Task 5). Deno unit tests for the agent are not added (no existing Deno test infra in the repo); the agent branch is verified by Task 8's end-to-end check instead.

**Type consistency:**
- DB column: `reminder_confirmed_at` (snake_case, Postgres convention).
- Client field: `reminderConfirmedAt` (camelCase, matches `staffCapacityOverrideAt` precedent).
- RPC: `mark_reminder_confirmed(uuid)` referenced identically in migration and agent code.
- `mark_reminder_confirmed` returns `SETOF uuid`; the JS caller treats the result as an array.
- TomorrowRemindersCard reads `row.confirmed` and `row.reminderConfirmedAt`; groupRemindersByCustomer returns both keys with those names.

**Placeholder scan:** none. Every step has either complete code, an exact command, or a specific verification.

**Scope:** one focused feature, one spec, ~8 tasks. Each task leaves the system in a working state — UI tasks 2–6 land with the field always null (no visual change for anyone) until Task 7 wires the agent and Task 8 verifies end-to-end.
