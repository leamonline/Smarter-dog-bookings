# Phase 1: Stabilise Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the critical issues that make the app unsafe for multi-staff production use: server-side capacity validation, real-time sync, security headers, BookingDetailModal decomposition, and TypeScript foundation.

**Architecture:** Five independent workstreams with no cross-dependencies. Each can be worked in isolation. Tasks 1-3 are infrastructure/backend, Task 4 is a large refactor, Task 5 is tooling setup + type definitions.

**Tech Stack:** Supabase (Postgres triggers, Realtime channels), React 19, Vite 8, TypeScript

**Spec:** `docs/superpowers/specs/2026-03-29-production-roadmap-design.md` — Phase 1

---

## Task 1: Security Headers + Auth Error Normalisation

**Files:**
- Modify: `netlify.toml`
- Modify: `src/components/auth/LoginPage.jsx`
- Modify: `src/components/auth/CustomerLoginPage.jsx`

This is the quickest win — 30 minutes of work, immediate production hardening.

- [ ] **Step 1: Add security headers to netlify.toml**

The current `netlify.toml` has only build config and SPA redirect. Add a `[[headers]]` block:

```toml
[[headers]]
  for = "/*"
  [headers.values]
    X-Frame-Options = "SAMEORIGIN"
    X-Content-Type-Options = "nosniff"
    Referrer-Policy = "strict-origin-when-cross-origin"
    Permissions-Policy = "camera=(), microphone=(), geolocation=()"
    Strict-Transport-Security = "max-age=31536000; includeSubDomains"
    Content-Security-Policy = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' https://*.supabase.co wss://*.supabase.co; frame-ancestors 'none'"
```

Add this after the existing `[[redirects]]` block. The CSP allows inline styles (needed because the app uses inline style objects) and Supabase connections (both HTTPS and WSS for realtime).

- [ ] **Step 2: Normalise auth errors in LoginPage.jsx**

In `src/components/auth/LoginPage.jsx`, find the `signIn` call's error handling. The current code passes through Supabase's specific error messages (like "Invalid login credentials" or "Email not confirmed"). Replace with a generic message.

Find this pattern in the sign-in handler:

```jsx
setError(err.message || "Sign-in failed");
```

Replace with:

```jsx
setError("Invalid email or password");
```

Do the same for any other `setError` call in the auth flow that passes `err.message` directly. The goal: never reveal whether an email exists in the system.

- [ ] **Step 3: Normalise auth errors in CustomerLoginPage.jsx**

In `src/components/auth/CustomerLoginPage.jsx`, find the OTP request and verify error handlers. Replace specific Supabase error messages:

For the OTP request step, replace error handling with:
```jsx
setError("Could not send verification code. Please check your number and try again.");
```

For the OTP verify step, replace error handling with:
```jsx
setError("Invalid code. Please try again.");
```

- [ ] **Step 4: Test locally**

Run: `npm run dev`

1. Try logging in with a wrong password — should see "Invalid email or password", not Supabase's specific message
2. Try customer login with an invalid phone — should see the generic message
3. Verify the app still works normally with correct credentials

- [ ] **Step 5: Commit**

```bash
git add netlify.toml src/components/auth/LoginPage.jsx src/components/auth/CustomerLoginPage.jsx
git commit -m "security: add production headers and normalise auth error messages"
```

---

## Task 2: Real-time Subscriptions

**Files:**
- Modify: `src/supabase/hooks/useBookings.js`
- Modify: `src/supabase/hooks/useDogs.js`
- Modify: `src/supabase/hooks/useHumans.js`

**Context:** These three hooks currently fetch data on mount and when dependencies change, but have no realtime subscriptions. When Staff A adds a booking, Staff B won't see it until they navigate away and back. We need to subscribe to Postgres changes via Supabase Realtime.

### Step group: useBookings realtime

- [ ] **Step 1: Add realtime subscription to useBookings.js**

In `src/supabase/hooks/useBookings.js`, inside the `useEffect` that calls `fetchBookings()`, add a Supabase channel subscription after the fetch completes. Add this code after the `fetchBookings()` call, but before the cleanup return:

```javascript
const channel = supabase
  .channel("bookings-realtime")
  .on(
    "postgres_changes",
    {
      event: "*",
      schema: "public",
      table: "bookings",
    },
    (payload) => {
      const { eventType, new: newRow, old: oldRow } = payload;
      const dateKey = newRow?.booking_date || oldRow?.booking_date;

      // Only process events for the current week
      if (dateKey < startStr || dateKey > endStr) return;

      if (eventType === "INSERT" && newRow) {
        const [inserted] = dbBookingsToArray([newRow], dogsById, humansById);
        if (!inserted) return;
        setBookingsByDate((prev) => ({
          ...prev,
          [dateKey]: [...(prev[dateKey] || []).filter((b) => b.id !== inserted.id), inserted],
        }));
      }

      if (eventType === "UPDATE" && newRow) {
        const [updated] = dbBookingsToArray([newRow], dogsById, humansById);
        if (!updated) return;
        const oldDateKey = oldRow?.booking_date;
        setBookingsByDate((prev) => {
          const next = { ...prev };
          // Remove from old date if it changed
          if (oldDateKey && oldDateKey !== dateKey) {
            next[oldDateKey] = (next[oldDateKey] || []).filter((b) => b.id !== updated.id);
          }
          // Upsert on new date
          next[dateKey] = [
            ...(next[dateKey] || []).filter((b) => b.id !== updated.id),
            updated,
          ];
          return next;
        });
      }

      if (eventType === "DELETE" && oldRow) {
        const oldDateKey = oldRow.booking_date;
        setBookingsByDate((prev) => ({
          ...prev,
          [oldDateKey]: (prev[oldDateKey] || []).filter((b) => b.id !== oldRow.id),
        }));
      }
    },
  )
  .subscribe();
```

Update the cleanup function to unsubscribe:

```javascript
return () => {
  cancelled = true;
  supabase.removeChannel(channel);
};
```

The `filter((b) => b.id !== inserted.id)` before spread prevents duplicates when the current client's own insert arrives back via realtime.

- [ ] **Step 2: Test bookings realtime**

Run: `npm run dev`

Open two browser tabs logged in as staff. In Tab A, create a new booking. Verify it appears in Tab B without refreshing. Edit the booking in Tab A — verify the change appears in Tab B. Delete it — verify it disappears from Tab B.

- [ ] **Step 3: Commit**

```bash
git add src/supabase/hooks/useBookings.js
git commit -m "feat: add real-time subscriptions for bookings"
```

### Step group: useDogs realtime

- [ ] **Step 4: Add realtime subscription to useDogs.js**

In `src/supabase/hooks/useDogs.js`, add a realtime subscription inside the `useEffect` that fetches dogs. After the fetch, subscribe to the `dogs` table:

```javascript
const channel = supabase
  .channel("dogs-realtime")
  .on(
    "postgres_changes",
    {
      event: "*",
      schema: "public",
      table: "dogs",
    },
    (payload) => {
      const { eventType, new: newRow, old: oldRow } = payload;

      if (eventType === "DELETE" && oldRow) {
        setDogs((prev) => {
          const next = { ...prev };
          // Find and remove the dog by ID
          for (const key of Object.keys(next)) {
            if (next[key]?.id === oldRow.id) {
              delete next[key];
              break;
            }
          }
          return next;
        });
        setDogsById((prev) => {
          const next = { ...prev };
          delete next[oldRow.id];
          return next;
        });
        return;
      }

      // For INSERT and UPDATE, refetch all dogs to rebuild maps correctly.
      // Dog transforms depend on human lookups, so a targeted upsert
      // would duplicate the transform logic. A full refetch is simpler
      // and dogs change infrequently (not on every booking).
      fetchDogs();
    },
  )
  .subscribe();
```

The variable `fetchDogs` is the existing async function inside the useEffect. Make sure to name the existing fetch function so it can be called by the realtime handler. If the current code uses an anonymous async IIFE, refactor it to a named function:

```javascript
async function fetchDogs() {
  // ... existing fetch logic ...
}
fetchDogs();
```

Update the cleanup:

```javascript
return () => {
  cancelled = true;
  supabase.removeChannel(channel);
};
```

- [ ] **Step 5: Commit**

```bash
git add src/supabase/hooks/useDogs.js
git commit -m "feat: add real-time subscriptions for dogs"
```

### Step group: useHumans realtime

- [ ] **Step 6: Add realtime subscription to useHumans.js**

Same pattern as useDogs. In `src/supabase/hooks/useHumans.js`, add a channel subscription inside the fetch useEffect:

```javascript
const channel = supabase
  .channel("humans-realtime")
  .on(
    "postgres_changes",
    {
      event: "*",
      schema: "public",
      table: "humans",
    },
    (payload) => {
      const { eventType, old: oldRow } = payload;

      if (eventType === "DELETE" && oldRow) {
        setHumans((prev) => {
          const next = { ...prev };
          for (const key of Object.keys(next)) {
            if (next[key]?.id === oldRow.id) {
              delete next[key];
              break;
            }
          }
          return next;
        });
        setHumansById((prev) => {
          const next = { ...prev };
          delete next[oldRow.id];
          return next;
        });
        return;
      }

      // Refetch for INSERT/UPDATE — humans have trusted contacts
      // that require join queries for correct map building.
      fetchHumans();
    },
  )
  .subscribe();
```

Same refactoring needed: name the fetch function, update cleanup to call `supabase.removeChannel(channel)`.

- [ ] **Step 7: Test dogs and humans realtime**

Open two tabs. In Tab A, edit a dog's alerts. Verify Tab B updates. In Tab A, add a new human. Verify Tab B shows them in the Humans view.

- [ ] **Step 8: Commit**

```bash
git add src/supabase/hooks/useHumans.js
git commit -m "feat: add real-time subscriptions for humans"
```

---

## Task 3: Server-side Capacity Validation

**Files:**
- Create: `supabase/migrations/006_capacity_trigger.sql`
- Modify: `supabase/migrations/001_initial_schema.sql` (reference only — do not modify, just understand the bookings table schema)

**Context:** The `canBookSlot()` function in `src/engine/capacity.js` enforces the 2-2-1 rule, large dog slot restrictions, early close, and back-to-back limits. Currently this only runs in the browser. We need a Postgres trigger that replicates the core validation logic server-side.

The bookings table has columns: `id`, `booking_date`, `slot`, `dog_id`, `size`, `service`, `status`, `addons`, `pickup_by_id`, `payment`, `confirmed`.

The LARGE_DOG_SLOTS config from `src/constants/salon.js`:
```
"08:30": { seats: 1, canShare: true }
"09:00": { seats: 1, canShare: true, conditional: true }
"12:00": { seats: 1, canShare: true }
"12:30": { seats: 2, canShare: false }
"13:00": { seats: 2, canShare: false }
```

All other slots (09:30, 10:00, 10:30, 11:00, 11:30): no large dog entry = large dogs need approval (blocked by default).

- [ ] **Step 1: Add enforce_server_capacity flag to salon_config**

Create migration `supabase/migrations/006_capacity_trigger.sql`. Start with the safety flag:

```sql
-- Phase 1.1: Server-side capacity validation
-- Safety flag: set enforce_server_capacity = false to disable the trigger
-- without a code deploy if it has a bug.

ALTER TABLE salon_config
ADD COLUMN IF NOT EXISTS enforce_server_capacity BOOLEAN DEFAULT true;
```

- [ ] **Step 2: Write the seat counting function**

Continue in the same migration file. This function counts seats used by existing bookings in a given slot on a given date, excluding a specific booking ID (for updates):

```sql
CREATE OR REPLACE FUNCTION get_seats_used(
  p_date DATE,
  p_slot TEXT,
  p_exclude_id UUID DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(SUM(
    CASE
      WHEN b.size = 'large' THEN
        CASE b.slot
          WHEN '08:30' THEN 1
          WHEN '09:00' THEN 1
          WHEN '12:00' THEN 1
          WHEN '12:30' THEN 2
          WHEN '13:00' THEN 2
          ELSE 2
        END
      ELSE 1
    END
  ), 0)::INTEGER
  FROM bookings b
  WHERE b.booking_date = p_date
    AND b.slot = p_slot
    AND (p_exclude_id IS NULL OR b.id != p_exclude_id);
$$;
```

- [ ] **Step 3: Write the 2-2-1 max seats function**

This replicates `getMaxSeatsForSlot()` from capacity.js. It checks whether adjacent slots have 2+ seats and caps accordingly:

```sql
CREATE OR REPLACE FUNCTION get_max_seats_for_slot(
  p_date DATE,
  p_slot TEXT,
  p_exclude_id UUID DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  slots TEXT[] := ARRAY['08:30','09:00','09:30','10:00','10:30','11:00','11:30','12:00','12:30','13:00'];
  slot_idx INTEGER;
  prev_double BOOLEAN := false;
  prev_prev_double BOOLEAN := false;
  next_double BOOLEAN := false;
  next_next_double BOOLEAN := false;
  has_large_12 BOOLEAN;
BEGIN
  -- Find slot index (1-based in PG arrays)
  slot_idx := array_position(slots, p_slot);
  IF slot_idx IS NULL THEN
    RETURN 0; -- unknown slot
  END IF;

  -- Early close: large dog at 12:00 kills 13:00
  IF p_slot = '13:00' THEN
    SELECT EXISTS(
      SELECT 1 FROM bookings
      WHERE booking_date = p_date AND slot = '12:00' AND size = 'large'
        AND (p_exclude_id IS NULL OR id != p_exclude_id)
    ) INTO has_large_12;
    IF has_large_12 THEN
      RETURN 0;
    END IF;
  END IF;

  -- Check adjacent slots for double occupancy
  IF slot_idx >= 3 THEN
    prev_prev_double := get_seats_used(p_date, slots[slot_idx - 2], p_exclude_id) >= 2;
  END IF;
  IF slot_idx >= 2 THEN
    prev_double := get_seats_used(p_date, slots[slot_idx - 1], p_exclude_id) >= 2;
  END IF;
  IF slot_idx <= 9 THEN
    next_double := get_seats_used(p_date, slots[slot_idx + 1], p_exclude_id) >= 2;
  END IF;
  IF slot_idx <= 8 THEN
    next_next_double := get_seats_used(p_date, slots[slot_idx + 2], p_exclude_id) >= 2;
  END IF;

  -- 2-2-1 rule: if any pair of adjacent slots around this one are both double, cap at 1
  IF (prev_prev_double AND prev_double)
     OR (prev_double AND next_double)
     OR (next_double AND next_next_double) THEN
    RETURN 1;
  END IF;

  RETURN 2;
END;
$$;
```

- [ ] **Step 4: Write the main validation trigger function**

This is the core logic, replicating `canBookSlot()`:

```sql
CREATE OR REPLACE FUNCTION validate_booking_capacity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  enforce BOOLEAN;
  seats_needed INTEGER;
  seats_used INTEGER;
  max_seats INTEGER;
  has_large BOOLEAN;
  exclude_id UUID;
  seats_830 INTEGER;
  seats_1000 INTEGER;
  seats_1300 INTEGER;
  has_large_prev BOOLEAN;
  has_large_next BOOLEAN;
  slots TEXT[] := ARRAY['08:30','09:00','09:30','10:00','10:30','11:00','11:30','12:00','12:30','13:00'];
  slot_idx INTEGER;
  prev_slot TEXT;
  next_slot TEXT;
BEGIN
  -- Check if enforcement is enabled
  SELECT COALESCE(s.enforce_server_capacity, true)
  INTO enforce
  FROM salon_config s
  LIMIT 1;

  IF NOT enforce THEN
    RETURN NEW;
  END IF;

  -- For updates, exclude the current booking from seat counts
  IF TG_OP = 'UPDATE' THEN
    exclude_id := NEW.id;
  ELSE
    exclude_id := NULL;
  END IF;

  -- Calculate seats needed for this booking
  IF NEW.size = 'large' THEN
    CASE NEW.slot
      WHEN '08:30' THEN seats_needed := 1;
      WHEN '09:00' THEN seats_needed := 1;
      WHEN '12:00' THEN seats_needed := 1;
      WHEN '12:30' THEN seats_needed := 2;
      WHEN '13:00' THEN seats_needed := 2;
      ELSE seats_needed := 2;
    END CASE;
  ELSE
    seats_needed := 1;
  END IF;

  -- === LARGE DOG RULES ===
  IF NEW.size = 'large' THEN

    -- Mid-morning block: 09:30-11:30 have no LARGE_DOG_SLOTS entry
    IF NEW.slot IN ('09:30', '10:00', '10:30', '11:00', '11:30') THEN
      RAISE EXCEPTION 'Large dogs need approval for this slot (mid-morning block)';
    END IF;

    -- 09:00 conditional: 08:30 must be empty AND 10:00 must have ≤1 seats
    IF NEW.slot = '09:00' THEN
      seats_830 := get_seats_used(NEW.booking_date, '08:30', exclude_id);
      seats_1000 := get_seats_used(NEW.booking_date, '10:00', exclude_id);
      IF seats_830 > 0 THEN
        RAISE EXCEPTION '09:00 large dog: 08:30 must be empty';
      END IF;
      IF seats_1000 > 1 THEN
        RAISE EXCEPTION '09:00 large dog: 10:00 must have 0-1 seats';
      END IF;
    END IF;

    -- 12:00 conditional: 13:00 must be empty (early close trigger)
    IF NEW.slot = '12:00' THEN
      seats_1300 := get_seats_used(NEW.booking_date, '13:00', exclude_id);
      IF seats_1300 > 0 THEN
        RAISE EXCEPTION '12:00 large dog requires 13:00 to be empty (early close)';
      END IF;
    END IF;

    -- 13:00 early close: blocked if 12:00 has a large dog
    IF NEW.slot = '13:00' THEN
      SELECT EXISTS(
        SELECT 1 FROM bookings
        WHERE booking_date = NEW.booking_date AND slot = '12:00' AND size = 'large'
          AND (exclude_id IS NULL OR id != exclude_id)
      ) INTO has_large;
      IF has_large THEN
        RAISE EXCEPTION '13:00 is closed — large dog at 12:00 triggered early close';
      END IF;
    END IF;

    -- Shareable slot: second large dog blocked at canShare slots
    IF NEW.slot IN ('08:30', '09:00', '12:00') THEN
      SELECT EXISTS(
        SELECT 1 FROM bookings
        WHERE booking_date = NEW.booking_date AND slot = NEW.slot AND size = 'large'
          AND (exclude_id IS NULL OR id != exclude_id)
      ) INTO has_large;
      IF has_large THEN
        RAISE EXCEPTION 'Only a small/medium dog can share this slot with a large dog';
      END IF;
    END IF;

    -- Full-takeover slot (12:30, 13:00): must be empty
    IF NEW.slot IN ('12:30', '13:00') THEN
      seats_used := get_seats_used(NEW.booking_date, NEW.slot, exclude_id);
      IF seats_used > 0 THEN
        RAISE EXCEPTION 'Large dog fills this slot — already has bookings';
      END IF;
    END IF;

    -- Back-to-back full-takeover check
    IF NEW.slot IN ('12:30', '13:00') THEN
      slot_idx := array_position(slots, NEW.slot);

      -- Check previous slot
      IF slot_idx >= 2 THEN
        prev_slot := slots[slot_idx - 1];
        IF prev_slot IN ('12:30', '13:00') THEN
          SELECT EXISTS(
            SELECT 1 FROM bookings
            WHERE booking_date = NEW.booking_date AND slot = prev_slot AND size = 'large'
              AND (exclude_id IS NULL OR id != exclude_id)
          ) INTO has_large_prev;
          IF has_large_prev THEN
            -- Only 12:30 + 13:00 pair is allowed
            IF NOT (
              (prev_slot = '12:30' AND NEW.slot = '13:00') OR
              (prev_slot = '13:00' AND NEW.slot = '12:30')
            ) THEN
              RAISE EXCEPTION 'Back-to-back large dogs only allowed at 12:30 + 13:00';
            END IF;
          END IF;
        END IF;
      END IF;

      -- Check next slot
      IF slot_idx <= 9 THEN
        next_slot := slots[slot_idx + 1];
        IF next_slot IN ('12:30', '13:00') THEN
          SELECT EXISTS(
            SELECT 1 FROM bookings
            WHERE booking_date = NEW.booking_date AND slot = next_slot AND size = 'large'
              AND (exclude_id IS NULL OR id != exclude_id)
          ) INTO has_large_next;
          IF has_large_next THEN
            IF NOT (
              (NEW.slot = '12:30' AND next_slot = '13:00') OR
              (NEW.slot = '13:00' AND next_slot = '12:30')
            ) THEN
              RAISE EXCEPTION 'Back-to-back large dogs only allowed at 12:30 + 13:00';
            END IF;
          END IF;
        END IF;
      END IF;
    END IF;

    -- Full-takeover: 2-2-1 check for large dogs needing 2 seats
    IF NEW.slot IN ('12:30', '13:00') THEN
      max_seats := get_max_seats_for_slot(NEW.booking_date, NEW.slot, exclude_id);
      IF seats_needed > max_seats THEN
        RAISE EXCEPTION 'Not enough capacity (2-2-1 rule)';
      END IF;
    END IF;

  END IF;

  -- === GENERAL SEAT CHECK (all sizes) ===
  seats_used := get_seats_used(NEW.booking_date, NEW.slot, exclude_id);
  max_seats := get_max_seats_for_slot(NEW.booking_date, NEW.slot, exclude_id);

  IF (seats_used + seats_needed) > max_seats THEN
    -- Small/medium blocked by full-takeover large dog
    IF NEW.size != 'large' THEN
      SELECT EXISTS(
        SELECT 1 FROM bookings
        WHERE booking_date = NEW.booking_date AND slot = NEW.slot AND size = 'large'
          AND (exclude_id IS NULL OR id != exclude_id)
      ) INTO has_large;
      IF has_large AND NEW.slot IN ('12:30', '13:00') THEN
        RAISE EXCEPTION 'Large dog fills this slot';
      END IF;
    END IF;

    RAISE EXCEPTION 'Slot is full (% used + % needed > % max)',
      seats_used, seats_needed, max_seats;
  END IF;

  RETURN NEW;
END;
$$;
```

- [ ] **Step 5: Create the trigger**

Continue in the same migration file:

```sql
DROP TRIGGER IF EXISTS check_booking_capacity ON bookings;

CREATE TRIGGER check_booking_capacity
  BEFORE INSERT OR UPDATE ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION validate_booking_capacity();
```

- [ ] **Step 6: Apply the migration**

Run via Supabase CLI or dashboard:

```bash
supabase db push
```

Or apply manually in the Supabase SQL Editor by running the contents of `supabase/migrations/006_capacity_trigger.sql`.

- [ ] **Step 7: Test the trigger against known scenarios**

Run these SQL statements in the Supabase SQL Editor to verify the trigger matches the client-side test cases. Use a test date far in the future to avoid conflicts:

```sql
-- Setup: clear test data
DELETE FROM bookings WHERE booking_date = '2099-01-01';

-- Test 1: Basic booking should succeed
INSERT INTO bookings (booking_date, slot, dog_id, size, service, status)
VALUES ('2099-01-01', '10:00', (SELECT id FROM dogs LIMIT 1), 'small', 'full-groom', 'Not Arrived');
-- Expected: success

-- Test 2: Second booking at same slot should succeed (max 2)
INSERT INTO bookings (booking_date, slot, dog_id, size, service, status)
VALUES ('2099-01-01', '10:00', (SELECT id FROM dogs LIMIT 1 OFFSET 1), 'small', 'full-groom', 'Not Arrived');
-- Expected: success

-- Test 3: Large dog at mid-morning should fail
INSERT INTO bookings (booking_date, slot, dog_id, size, service, status)
VALUES ('2099-01-01', '10:00', (SELECT id FROM dogs LIMIT 1), 'large', 'full-groom', 'Not Arrived');
-- Expected: ERROR "Large dogs need approval for this slot"

-- Test 4: Large dog at 08:30 should succeed
INSERT INTO bookings (booking_date, slot, dog_id, size, service, status)
VALUES ('2099-01-01', '08:30', (SELECT id FROM dogs LIMIT 1), 'large', 'full-groom', 'Not Arrived');
-- Expected: success

-- Cleanup
DELETE FROM bookings WHERE booking_date = '2099-01-01';
```

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/006_capacity_trigger.sql
git commit -m "feat: add server-side capacity validation trigger with 2-2-1 rules"
```

---

## Task 4: Break Up BookingDetailModal

**Files:**
- Create: `src/components/modals/booking-detail/BookingHeader.jsx`
- Create: `src/components/modals/booking-detail/BookingStatusBar.jsx`
- Create: `src/components/modals/booking-detail/BookingAlerts.jsx`
- Create: `src/components/modals/booking-detail/BookingLogistics.jsx`
- Create: `src/components/modals/booking-detail/BookingFinance.jsx`
- Create: `src/components/modals/booking-detail/BookingActions.jsx`
- Create: `src/components/modals/booking-detail/ExitConfirmDialog.jsx`
- Create: `src/components/modals/booking-detail/shared.jsx`
- Modify: `src/components/modals/BookingDetailModal.jsx`

**Context:** `BookingDetailModal.jsx` is 1,588 lines. It has 12 state variables, 15+ memoised values, and renders 15 distinct UI sections. The decomposition splits it into focused sub-components. The modal becomes an orchestrator (~250 lines) that manages state and delegates rendering.

**Strategy:** Extract one sub-component at a time. After each extraction, verify the modal still works before moving to the next. Work from the outside in: header first (simplest, fewest dependencies), then status, then alerts, then logistics+finance, then actions.

### Step group: Shared utilities

- [ ] **Step 1: Create shared.jsx with reusable pieces**

The modal defines `detailRow()`, `LogisticsLabel`, `FinanceLabel`, and a local `inputStyle` that are used across sections. Extract them:

```jsx
// src/components/modals/booking-detail/shared.jsx
import { BRAND } from "../../../constants/index.js";

export const modalInputStyle = {
  padding: "8px 12px",
  borderRadius: 8,
  border: `1px solid ${BRAND.greyLight}`,
  fontSize: 13,
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
  fontFamily: "inherit",
  color: BRAND.text,
};

export function LogisticsLabel({ text }) {
  return (
    <span
      style={{
        color: BRAND.blueDark,
        textTransform: "uppercase",
        fontWeight: 800,
        fontSize: 12,
        letterSpacing: 0.5,
      }}
    >
      {text}
    </span>
  );
}

export function FinanceLabel({ text }) {
  return (
    <span
      style={{
        color: BRAND.openGreen,
        textTransform: "uppercase",
        fontWeight: 800,
        fontSize: 12,
        letterSpacing: 0.5,
      }}
    >
      {text}
    </span>
  );
}

export function DetailRow({ label, value, editNode, verticalEdit, isEditing }) {
  return (
    <div
      style={{
        padding: "10px 0",
        borderBottom: `1px solid ${BRAND.greyLight}`,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems:
            isEditing && editNode && !verticalEdit ? "center" : "flex-start",
        }}
      >
        <span
          style={{
            fontSize: 13,
            color: BRAND.textLight,
            flexShrink: 0,
            paddingRight: 12,
            paddingTop: isEditing && editNode && !verticalEdit ? 0 : 2,
          }}
        >
          {label}
        </span>
        {isEditing && editNode && !verticalEdit ? (
          <div
            style={{
              flex: 1,
              display: "flex",
              justifyContent: "flex-end",
              maxWidth: "65%",
            }}
          >
            {editNode}
          </div>
        ) : (
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: BRAND.text,
              textAlign: "right",
              wordBreak: "break-word",
            }}
          >
            {value}
          </span>
        )}
      </div>
      {isEditing && editNode && verticalEdit && (
        <div style={{ marginTop: 8 }}>{editNode}</div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit shared utilities**

```bash
git add src/components/modals/booking-detail/shared.jsx
git commit -m "refactor: extract shared utilities from BookingDetailModal"
```

### Step group: BookingHeader

- [ ] **Step 3: Create BookingHeader.jsx**

Extract lines ~494-623 of BookingDetailModal — the gradient header with dog name, breed, age, service selector, and close button:

```jsx
// src/components/modals/booking-detail/BookingHeader.jsx
import { BRAND, SERVICES } from "../../../constants/index.js";
import {
  getNumericPrice,
  getServicePriceLabel,
} from "../../../engine/bookingRules.js";
import { SizeTag } from "../../ui/SizeTag.jsx";

export function BookingHeader({
  booking,
  dogData,
  isEditing,
  editData,
  setEditData,
  setSaveError,
  allowedServices,
  onClose,
}) {
  const currentService = isEditing ? editData.service : booking.service;
  const serviceObj = SERVICES.find((s) => s.id === currentService);
  const ageYo = dogData?.age ? dogData.age.replace(" yrs", "yo") : "";

  return (
    <div
      style={{
        background: `linear-gradient(135deg, ${BRAND.blue}, ${BRAND.blueDark})`,
        padding: "20px 24px",
        borderRadius: "16px 16px 0 0",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          flex: 1,
          minWidth: 0,
        }}
      >
        <SizeTag size={booking.size} headerMode />
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 20,
              fontWeight: 800,
              color: BRAND.white,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {booking.dogName}
            {ageYo && (
              <span
                style={{
                  fontWeight: 500,
                  fontSize: 14,
                  opacity: 0.8,
                  marginLeft: 6,
                }}
              >
                {ageYo}
              </span>
            )}
          </div>
          <div
            style={{
              fontSize: 13,
              color: "rgba(255,255,255,0.8)",
              marginTop: 2,
            }}
          >
            {booking.breed}
          </div>
          {isEditing ? (
            <select
              value={editData.service}
              onChange={(e) => {
                setEditData((prev) => ({
                  ...prev,
                  service: e.target.value,
                  customPrice:
                    dogData?.customPrice !== undefined
                      ? dogData.customPrice
                      : getNumericPrice(
                          getServicePriceLabel(e.target.value, booking.size),
                        ),
                }));
                setSaveError("");
              }}
              style={{
                background: "rgba(255,255,255,0.2)",
                color: BRAND.white,
                border: "1px solid rgba(255,255,255,0.3)",
                borderRadius: 6,
                padding: "6px 10px",
                fontSize: 13,
                fontWeight: 600,
                outline: "none",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {allowedServices.map((service) => (
                <option
                  key={service.id}
                  value={service.id}
                  style={{ color: BRAND.text }}
                >
                  {service.icon} {service.name}
                </option>
              ))}
            </select>
          ) : (
            <div
              style={{
                fontSize: 13,
                color: "rgba(255,255,255,0.8)",
                marginTop: 2,
              }}
            >
              {serviceObj?.icon} {serviceObj?.name}
            </div>
          )}
        </div>
      </div>
      <button
        onClick={onClose}
        style={{
          background: "rgba(255,255,255,0.2)",
          border: "none",
          borderRadius: 8,
          width: 28,
          height: 28,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          fontSize: 14,
          color: BRAND.white,
          fontWeight: 700,
          flexShrink: 0,
        }}
      >
        {"×"}
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Wire BookingHeader into BookingDetailModal**

In `BookingDetailModal.jsx`:
1. Add import: `import { BookingHeader } from "./booking-detail/BookingHeader.jsx";`
2. Replace the header JSX (the `<div style={{ background: linear-gradient... }}>` block through its closing `</div>`) with:

```jsx
<BookingHeader
  booking={booking}
  dogData={dogData}
  isEditing={isEditing}
  editData={editData}
  setEditData={setEditData}
  setSaveError={setSaveError}
  allowedServices={allowedServices}
  onClose={handleCloseAttempt}
/>
```

3. Remove the `serviceObj` variable and `ageYo` variable from BookingDetailModal (they're now in BookingHeader).

- [ ] **Step 5: Test the header extraction**

Run `npm run dev`. Open a booking detail modal. Verify:
- Dog name, breed, age display correctly
- Service dropdown works in edit mode
- Close button works
- Size tag displays correctly

- [ ] **Step 6: Commit**

```bash
git add src/components/modals/booking-detail/BookingHeader.jsx src/components/modals/BookingDetailModal.jsx
git commit -m "refactor: extract BookingHeader from BookingDetailModal"
```

### Step group: BookingStatusBar

- [ ] **Step 7: Create BookingStatusBar.jsx**

Extract the status buttons section (lines ~626-692) and the client confirmed toggle (lines ~694-733):

```jsx
// src/components/modals/booking-detail/BookingStatusBar.jsx
import { BRAND, BOOKING_STATUSES } from "../../../constants/index.js";

export function BookingStatusBar({
  booking,
  currentDateStr,
  onUpdate,
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div
        style={{
          fontSize: 12,
          fontWeight: 700,
          color: BRAND.textLight,
          textTransform: "uppercase",
          letterSpacing: 0.5,
          marginBottom: 10,
        }}
      >
        Status
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {BOOKING_STATUSES.map((status) => {
          const currentStatus = booking.status || "Not Arrived";
          const isActive = currentStatus === status.id;
          const currentIdx = BOOKING_STATUSES.findIndex(
            (st) => st.id === currentStatus,
          );
          const thisIdx = BOOKING_STATUSES.findIndex(
            (st) => st.id === status.id,
          );
          const isPast = thisIdx < currentIdx;

          return (
            <button
              key={status.id}
              onClick={async () => {
                if (!isActive) {
                  await onUpdate(
                    { ...booking, status: status.id },
                    currentDateStr,
                    currentDateStr,
                  );
                }
              }}
              style={{
                padding: "6px 12px",
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 700,
                cursor: isActive ? "default" : "pointer",
                background: isActive
                  ? status.bg
                  : isPast
                    ? "#F9FAFB"
                    : BRAND.white,
                color: isActive
                  ? status.color
                  : isPast
                    ? BRAND.textLight
                    : BRAND.grey,
                border: isActive
                  ? `2px solid ${status.color}`
                  : `1px solid ${BRAND.greyLight}`,
                transition: "all 0.15s",
                opacity: isPast ? 0.6 : 1,
              }}
            >
              {isActive ? "● " : ""}
              {status.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function ClientConfirmedToggle({ booking, currentDateStr, onUpdate }) {
  return (
    <div
      style={{
        padding: "10px 0",
        borderBottom: `1px solid ${BRAND.greyLight}`,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}
    >
      <span style={{ fontSize: 13, color: BRAND.textLight }}>
        Client Confirmed
      </span>
      <button
        onClick={async () => {
          await onUpdate(
            { ...booking, confirmed: !booking.confirmed },
            currentDateStr,
            currentDateStr,
          );
        }}
        style={{
          background: booking.confirmed
            ? BRAND.openGreenBg
            : BRAND.closedRedBg,
          color: booking.confirmed ? BRAND.openGreen : BRAND.closedRed,
          border: `1.5px solid ${
            booking.confirmed ? BRAND.openGreen : BRAND.closedRed
          }`,
          borderRadius: 8,
          padding: "4px 12px",
          fontSize: 12,
          fontWeight: 700,
          cursor: "pointer",
          fontFamily: "inherit",
          transition: "all 0.15s",
        }}
      >
        {booking.confirmed ? "✓ Confirmed" : "Not confirmed"}
      </button>
    </div>
  );
}
```

- [ ] **Step 8: Wire BookingStatusBar into BookingDetailModal**

In `BookingDetailModal.jsx`:
1. Add import: `import { BookingStatusBar, ClientConfirmedToggle } from "./booking-detail/BookingStatusBar.jsx";`
2. Replace the status section JSX with:

```jsx
<BookingStatusBar
  booking={booking}
  currentDateStr={currentDateStr}
  onUpdate={onUpdate}
/>

<ClientConfirmedToggle
  booking={booking}
  currentDateStr={currentDateStr}
  onUpdate={onUpdate}
/>
```

- [ ] **Step 9: Test status extraction**

Run `npm run dev`. Open a booking. Verify:
- Status buttons display correctly with active/past styling
- Clicking a status updates it
- Client confirmed toggle works

- [ ] **Step 10: Commit**

```bash
git add src/components/modals/booking-detail/BookingStatusBar.jsx src/components/modals/BookingDetailModal.jsx
git commit -m "refactor: extract BookingStatusBar from BookingDetailModal"
```

### Step group: BookingAlerts

- [ ] **Step 11: Create BookingAlerts.jsx**

Extract the alerts section (lines ~765-931) — the edit-mode alert buttons with allergy toggle, and view-mode alert badges:

```jsx
// src/components/modals/booking-detail/BookingAlerts.jsx
import { BRAND, ALERT_OPTIONS } from "../../../constants/index.js";
import { modalInputStyle } from "./shared.jsx";

export function BookingAlerts({
  isEditing,
  editData,
  setEditData,
  dogData,
  hasAllergy,
  setHasAllergy,
  allergyInput,
  setAllergyInput,
}) {
  if (isEditing) {
    return (
      <div style={{ marginTop: 20, marginBottom: 16 }}>
        <div
          style={{
            fontWeight: 800,
            fontSize: 12,
            color: BRAND.coral,
            textTransform: "uppercase",
            letterSpacing: 0.5,
            marginBottom: 12,
            textAlign: "center",
          }}
        >
          Alerts
        </div>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 10,
            justifyContent: "center",
          }}
        >
          {ALERT_OPTIONS.map((opt) => {
            const active = editData.alerts.includes(opt.label);
            return (
              <button
                key={opt.label}
                type="button"
                onClick={() => {
                  if (active) {
                    setEditData((prev) => ({
                      ...prev,
                      alerts: prev.alerts.filter((a) => a !== opt.label),
                    }));
                  } else {
                    setEditData((prev) => ({
                      ...prev,
                      alerts: [...prev.alerts, opt.label],
                    }));
                  }
                }}
                style={{
                  background: active ? opt.color : BRAND.white,
                  color: active ? BRAND.white : opt.color,
                  border: `2px solid ${opt.color}`,
                  padding: "8px 14px",
                  borderRadius: 20,
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
              >
                {opt.label}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setHasAllergy(!hasAllergy)}
            style={{
              background: hasAllergy ? BRAND.coral : BRAND.white,
              color: hasAllergy ? BRAND.white : BRAND.coral,
              border: `2px solid ${BRAND.coral}`,
              padding: "10px 18px",
              borderRadius: 24,
              fontSize: 14,
              fontWeight: 800,
              cursor: "pointer",
              transition: "all 0.15s",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
            }}
          >
            {"⚠️"} Allergy {"⚠️"}
          </button>
        </div>

        {hasAllergy && (
          <div
            style={{
              marginTop: 12,
              width: "100%",
              display: "flex",
              justifyContent: "center",
            }}
          >
            <input
              type="text"
              placeholder="What is the dog allergic to?"
              value={allergyInput}
              onChange={(e) => setAllergyInput(e.target.value)}
              style={{
                ...modalInputStyle,
                textAlign: "center",
                borderColor: BRAND.coral,
                borderWidth: 2,
                padding: "10px",
                width: "100%",
              }}
            />
          </div>
        )}
      </div>
    );
  }

  // View mode: show alert badges (if any)
  const hasAlerts =
    (dogData.alerts && dogData.alerts.length > 0) ||
    (hasAllergy && allergyInput);

  if (!hasAlerts) return null;

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: 10,
        marginBottom: 16,
        marginTop: 28,
        justifyContent: "center",
        width: "100%",
      }}
    >
      {(dogData.alerts || [])
        .filter((a) => !a.startsWith("Allergic to "))
        .map((alertLabel) => (
          <div
            key={alertLabel}
            style={{
              background: BRAND.coral,
              color: BRAND.white,
              padding: "10px 18px",
              borderRadius: 24,
              fontSize: 14,
              fontWeight: 800,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              boxShadow: "0 4px 12px rgba(232,86,127,0.25)",
              textAlign: "center",
            }}
          >
            {"⚠️"} {alertLabel} {"⚠️"}
          </div>
        ))}
      {hasAllergy && allergyInput && (
        <div
          style={{
            background: BRAND.coral,
            color: BRAND.white,
            padding: "10px 18px",
            borderRadius: 24,
            fontSize: 14,
            fontWeight: 800,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            boxShadow: "0 4px 12px rgba(232,86,127,0.25)",
            textAlign: "center",
          }}
        >
          {"⚠️"} Allergic to {allergyInput} {"⚠️"}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 12: Wire BookingAlerts and commit**

In `BookingDetailModal.jsx`:
1. Add import: `import { BookingAlerts } from "./booking-detail/BookingAlerts.jsx";`
2. Replace the entire alerts section (the `{isEditing ? (<div style={{ marginTop: 20...`) with:

```jsx
<BookingAlerts
  isEditing={isEditing}
  editData={editData}
  setEditData={setEditData}
  dogData={dogData}
  hasAllergy={hasAllergy}
  setHasAllergy={setHasAllergy}
  allergyInput={allergyInput}
  setAllergyInput={setAllergyInput}
/>
```

Test: open a booking, toggle edit mode, verify alerts section works in both view and edit modes.

```bash
git add src/components/modals/booking-detail/BookingAlerts.jsx src/components/modals/BookingDetailModal.jsx
git commit -m "refactor: extract BookingAlerts from BookingDetailModal"
```

### Step group: BookingActions + ExitConfirmDialog

- [ ] **Step 13: Create ExitConfirmDialog.jsx**

Extract the exit confirmation dialog (lines ~1500-1585):

```jsx
// src/components/modals/booking-detail/ExitConfirmDialog.jsx
import { BRAND } from "../../../constants/index.js";

export function ExitConfirmDialog({ onDiscard, onKeepEditing }) {
  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1100,
      }}
    >
      <div
        style={{
          background: BRAND.white,
          borderRadius: 16,
          padding: 24,
          width: 300,
          boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
        }}
      >
        <div
          style={{
            fontSize: 16,
            fontWeight: 700,
            marginBottom: 8,
            color: BRAND.text,
          }}
        >
          Discard changes?
        </div>
        <div
          style={{
            fontSize: 13,
            color: BRAND.textLight,
            marginBottom: 20,
          }}
        >
          You have unsaved changes. Are you sure you want to close?
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={onDiscard}
            style={{
              flex: 1,
              padding: "10px 0",
              borderRadius: 10,
              border: "none",
              background: BRAND.coral,
              color: BRAND.white,
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Discard
          </button>
          <button
            onClick={onKeepEditing}
            style={{
              flex: 1,
              padding: "10px 0",
              borderRadius: 10,
              border: `1.5px solid ${BRAND.greyLight}`,
              background: BRAND.white,
              color: BRAND.text,
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Keep editing
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 14: Create BookingActions.jsx**

Extract the footer buttons (lines ~1275-1481):

```jsx
// src/components/modals/booking-detail/BookingActions.jsx
import { BRAND } from "../../../constants/index.js";
import { IconTick, IconEdit, IconMessage, IconBlock } from "../../icons/index.jsx";

export function BookingActions({
  isEditing,
  editData,
  saving,
  booking,
  onSave,
  onCancelEdit,
  onEnterEdit,
  onShowContact,
  onRemove,
  onClose,
  onRebook,
}) {
  if (isEditing) {
    return (
      <div
        style={{
          padding: "16px 24px 20px",
          display: "flex",
          gap: 10,
          background: BRAND.offWhite,
          borderTop: `1px solid ${BRAND.greyLight}`,
        }}
      >
        <button
          onClick={onSave}
          disabled={!editData.slot || saving}
          style={{
            flex: 1,
            padding: "12px 0",
            borderRadius: 10,
            border: "none",
            fontSize: 13,
            fontWeight: 700,
            cursor: !editData.slot || saving ? "not-allowed" : "pointer",
            fontFamily: "inherit",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            background:
              !editData.slot || saving ? BRAND.greyLight : BRAND.blue,
            color: !editData.slot || saving ? BRAND.textLight : BRAND.white,
            transition: "background 0.15s",
          }}
        >
          <IconTick size={16} colour={BRAND.white} />{" "}
          {saving ? "Saving..." : "Save Changes"}
        </button>
        <button
          onClick={onCancelEdit}
          style={{
            flex: 1,
            padding: "12px 0",
            borderRadius: 10,
            border: `1.5px solid ${BRAND.greyLight}`,
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
            fontFamily: "inherit",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            background: BRAND.white,
            color: BRAND.textLight,
            transition: "background 0.15s",
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.background = BRAND.offWhite)
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.background = BRAND.white)
          }
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        padding: "16px 24px 20px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        background: BRAND.offWhite,
        borderTop: `1px solid ${BRAND.greyLight}`,
      }}
    >
      <div style={{ display: "flex", gap: 10 }}>
        <button
          onClick={onEnterEdit}
          style={{
            flex: 1,
            padding: "12px 0",
            borderRadius: 10,
            border: "none",
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
            fontFamily: "inherit",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            background: BRAND.blue,
            color: BRAND.white,
            transition: "background 0.15s",
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.background = BRAND.blueDark)
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.background = BRAND.blue)
          }
        >
          <IconEdit size={16} colour={BRAND.white} /> Edit
        </button>
        <button
          onClick={onShowContact}
          style={{
            flex: 1,
            padding: "12px 0",
            borderRadius: 10,
            border: "none",
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
            fontFamily: "inherit",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            background: BRAND.teal,
            color: BRAND.white,
            transition: "background 0.15s",
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.background = "#236b5d")
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.background = BRAND.teal)
          }
        >
          <IconMessage size={16} colour={BRAND.white} /> Message
        </button>
        <button
          onClick={async () => {
            const removed = await onRemove(booking.id);
            if (removed !== false) onClose();
          }}
          style={{
            flex: 1,
            padding: "12px 0",
            borderRadius: 10,
            border: "none",
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
            fontFamily: "inherit",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            background: BRAND.coralLight,
            color: BRAND.coral,
            transition: "background 0.15s",
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.background = "#fbd4df")
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.background = BRAND.coralLight)
          }
        >
          <IconBlock size={16} colour={BRAND.coral} /> Cancel
        </button>
      </div>
      {booking.status === "Completed" && onRebook && (
        <button
          onClick={() => {
            onRebook(booking);
            onClose();
          }}
          style={{
            width: "100%",
            padding: "12px 0",
            borderRadius: 10,
            border: `2px solid ${BRAND.blue}`,
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
            fontFamily: "inherit",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            background: BRAND.blueLight,
            color: BRAND.blueDark,
            transition: "all 0.15s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = BRAND.blue;
            e.currentTarget.style.color = BRAND.white;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = BRAND.blueLight;
            e.currentTarget.style.color = BRAND.blueDark;
          }}
        >
          {"🔁"} Rebook this dog
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 15: Wire BookingActions + ExitConfirmDialog and commit**

In `BookingDetailModal.jsx`:
1. Add imports:
```jsx
import { BookingActions } from "./booking-detail/BookingActions.jsx";
import { ExitConfirmDialog } from "./booking-detail/ExitConfirmDialog.jsx";
```

2. Replace the footer buttons section with:
```jsx
<BookingActions
  isEditing={isEditing}
  editData={editData}
  saving={saving}
  booking={booking}
  onSave={handleSave}
  onCancelEdit={() => { resetEditState(); setIsEditing(false); }}
  onEnterEdit={() => { resetEditState(); setIsEditing(true); }}
  onShowContact={() => setShowContact(true)}
  onRemove={onRemove}
  onClose={onClose}
  onRebook={onRebook}
/>
```

3. Replace the exit confirm dialog with:
```jsx
{showExitConfirm && (
  <ExitConfirmDialog
    onDiscard={() => { setShowExitConfirm(false); onClose(); }}
    onKeepEditing={() => setShowExitConfirm(false)}
  />
)}
```

4. Remove the `IconTick`, `IconEdit`, `IconMessage`, `IconBlock` imports from BookingDetailModal if they're no longer used directly.

Test: verify edit/save/cancel/message/remove/rebook buttons all work. Verify the exit confirmation dialog appears when closing with unsaved changes.

```bash
git add src/components/modals/booking-detail/BookingActions.jsx src/components/modals/booking-detail/ExitConfirmDialog.jsx src/components/modals/BookingDetailModal.jsx
git commit -m "refactor: extract BookingActions and ExitConfirmDialog from BookingDetailModal"
```

### Step group: Replace detailRow with DetailRow component

- [ ] **Step 16: Update BookingDetailModal to use DetailRow from shared.jsx**

In `BookingDetailModal.jsx`:
1. Add import: `import { DetailRow, LogisticsLabel, FinanceLabel, modalInputStyle } from "./booking-detail/shared.jsx";`
2. Remove the local `detailRow` function, `LogisticsLabel` component, `FinanceLabel` component, and `inputStyle` object.
3. Replace all `detailRow(label, value, editNode, verticalEdit)` calls with `<DetailRow label={label} value={value} editNode={editNode} verticalEdit={verticalEdit} isEditing={isEditing} />`.
4. Replace all `inputStyle` references with `modalInputStyle`.

There are approximately 8 `detailRow()` calls to convert: grooming notes, date, slot, service, add-ons, pickup human, base price, payment status, amount due.

Example conversion:

```jsx
// Before:
{detailRow(
  <LogisticsLabel text="Grooming Notes" />,
  <span style={{ whiteSpace: "pre-wrap" }}>
    {editData.groomNotes || "Standard groom (no specific notes)"}
  </span>,
  <textarea ... />,
)}

// After:
<DetailRow
  label={<LogisticsLabel text="Grooming Notes" />}
  value={
    <span style={{ whiteSpace: "pre-wrap" }}>
      {editData.groomNotes || "Standard groom (no specific notes)"}
    </span>
  }
  editNode={<textarea ... />}
  isEditing={isEditing}
/>
```

- [ ] **Step 17: Test and commit**

Run `npm run dev`. Open a booking detail modal. Verify every row displays correctly in both view and edit mode. Check: grooming notes, date picker, slot selector, service dropdown, add-ons, pickup human, base price, payment, amount due.

```bash
git add src/components/modals/BookingDetailModal.jsx
git commit -m "refactor: replace detailRow function with DetailRow component from shared utilities"
```

### Step group: Final verification

- [ ] **Step 18: Verify final line count and test all flows**

Run: `wc -l src/components/modals/BookingDetailModal.jsx`

The file should now be under 400 lines. If it's still larger, the remaining logistics/finance sections (grooming notes, date, slot, service, addons, pickup, price, payment, amount due) can be extracted into a `BookingLogistics.jsx` and `BookingFinance.jsx` in a follow-up. The critical goal — no single file over 300 lines — may require one more extraction pass.

Full manual test:
1. Open a booking → view mode displays correctly
2. Click Edit → all fields become editable
3. Change service → price updates
4. Change date → slot grid updates, invalid slots greyed out
5. Toggle alerts on/off
6. Add/remove addons
7. Save → booking updates
8. Cancel edit → reverts to original
9. Close with unsaved changes → exit dialog appears
10. Rebook button appears on Completed bookings

- [ ] **Step 19: Commit final state**

```bash
git add -A
git commit -m "refactor: complete BookingDetailModal decomposition into sub-components"
```

---

## Task 5: TypeScript Foundation

**Files:**
- Create: `tsconfig.json`
- Create: `src/types/index.ts`
- Rename + convert: `src/engine/capacity.js` → `src/engine/capacity.ts`
- Rename + convert: `src/engine/bookingRules.js` → `src/engine/bookingRules.ts`
- Rename + convert: `src/engine/utils.js` → `src/engine/utils.ts`
- Rename + convert: `src/supabase/transforms.js` → `src/supabase/transforms.ts`
- Update: `src/engine/capacity.test.js` (update import paths)
- Update: All files that import from converted modules (update `.js` → `.ts` extensions)

**Context:** The codebase is ~12,000 lines of JS/JSX with no types. We're starting with the engine and transform files because they define the core data shapes and business logic — the highest-value targets for type safety. Components convert later when touched.

### Step group: TypeScript setup

- [ ] **Step 1: Install TypeScript**

```bash
npm install --save-dev typescript
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "allowJs": true,
    "checkJs": false,
    "resolveJsonModule": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["src/**/*.ts", "src/**/*.tsx", "src/**/*.js", "src/**/*.jsx"],
  "exclude": ["node_modules", "dist"]
}
```

Key decisions:
- `allowJs: true` — lets TS and JS coexist during incremental migration
- `checkJs: false` — don't type-check existing JS files (too many errors at once)
- `strict: true` — all new TS files get full strictness
- `noEmit: true` — Vite handles compilation, TS is only for type checking

- [ ] **Step 3: Commit TypeScript setup**

```bash
git add tsconfig.json package.json package-lock.json
git commit -m "chore: add TypeScript configuration for incremental migration"
```

### Step group: Core type definitions

- [ ] **Step 4: Create src/types/index.ts**

Define all core types based on the database schema (from migrations) and the transform output shapes (from `transforms.js`):

```typescript
// src/types/index.ts

// === Dog sizes and services ===

export type DogSize = "small" | "medium" | "large";

export type ServiceId =
  | "full-groom"
  | "bath-and-brush"
  | "bath-and-deshed"
  | "puppy-groom";

export interface Service {
  id: ServiceId;
  name: string;
  icon: string;
}

// === Booking statuses ===

export type BookingStatusId =
  | "Not Arrived"
  | "Checked In"
  | "In the Bath"
  | "Ready for Pick-up"
  | "Completed";

export interface BookingStatus {
  id: BookingStatusId;
  label: string;
  color: string;
  bg: string;
}

// === Humans (app shape, after transform) ===

export interface Human {
  id: string;
  fullName: string;
  name: string;
  surname: string;
  phone: string;
  sms: boolean;
  whatsapp: boolean;
  email: string;
  social: string;
  address: string;
  notes: string;
  historyFlag: string;
  trustedIds: string[];
  customerUserId: string | null;
}

// === Dogs (app shape, after transform) ===

export interface Dog {
  id: string;
  name: string;
  breed: string;
  age: string;
  size: DogSize;
  owner: string;
  alerts: string[];
  groomNotes: string;
  customPrice: number | undefined;
  _humanId: string;
}

// === Bookings (app shape, after transform) ===

export interface Booking {
  id: string;
  dogName: string;
  breed: string;
  size: DogSize;
  service: ServiceId;
  owner: string;
  status: BookingStatusId;
  slot: string;
  addons: string[];
  pickupBy: string;
  payment: string;
  confirmed: boolean;
  _dogId: string;
  _ownerId: string;
  _pickupById: string | null;
  _bookingDate: string;
}

export type BookingsByDate = Record<string, Booking[]>;

// === Capacity engine types ===

export interface SlotCapacity {
  used: number;
  max: number;
  baseMax: number;
  available: number;
  bookings: Booking[];
  isConstrained: boolean;
  isLargeDogApproved: boolean;
  hasLargeDog: boolean;
  isEarlyClosed: boolean;
}

export type SlotCapacities = Record<string, SlotCapacity>;

export type SeatType = "booking" | "reserved" | "available" | "blocked";

export interface SeatState {
  type: SeatType;
  seatIndex: number;
  booking?: Booking;
  staffBlocked?: boolean;
  staffOpened?: boolean;
  isEarlyClosed?: boolean;
}

export interface BookingResult {
  allowed: boolean;
  reason?: string;
  needsApproval?: boolean;
}

export type SlotOverrides = Record<number, "blocked" | "open">;

// === Salon config ===

export interface SalonConfig {
  defaultPickupOffset: number;
  pricing: Record<ServiceId, Record<DogSize, string>>;
  enforceCapacity: boolean;
  largeDogSlots: Record<
    string,
    {
      seats: number;
      canShare: boolean;
      needsApproval?: boolean;
      conditional?: boolean;
    }
  >;
}

// === Day settings ===

export interface DaySettings {
  isOpen: boolean;
  overrides: Record<string, SlotOverrides>;
  extraSlots: string[];
}

// === Large dog slot rule ===

export interface LargeDogSlotRule {
  seats: number;
  canShare: boolean;
  needsApproval?: boolean;
  conditional?: boolean;
}
```

- [ ] **Step 5: Commit type definitions**

```bash
git add src/types/index.ts
git commit -m "feat: add core TypeScript type definitions"
```

### Step group: Convert engine files

- [ ] **Step 6: Convert capacity.js to capacity.ts**

Rename the file and add types:

```bash
mv src/engine/capacity.js src/engine/capacity.ts
```

At the top of `src/engine/capacity.ts`, add the import:

```typescript
import type {
  Booking,
  DogSize,
  SlotCapacity,
  SlotCapacities,
  SeatState,
  BookingResult,
  SlotOverrides,
  LargeDogSlotRule,
} from "../types/index.js";
```

Then add type annotations to each function signature. The function bodies stay the same — just add parameter and return types:

- `getSeatsNeeded(size: DogSize, slot: string): number`
- `getSeatsUsed(bookings: Booking[], slot: string): number`
- `getSeatsUsedMap(bookings: Booking[], activeSlots: string[]): Record<string, number>`
- `hasLargeDog(bookings: Booking[], slot: string): boolean`
- `getMaxSeatsForSlot(slotIndex: number, seatsMap: Record<string, number>, activeSlots: string[]): number`
- `isEarlyCloseActive(bookings: Booking[]): boolean`
- `computeSlotCapacities(bookings: Booking[], activeSlots: string[]): SlotCapacities`
- `getSeatStatesForSlot(bookings: Booking[], slot: string, activeSlots: string[], overrides?: SlotOverrides, selectedSeatIndex?: number | null): SeatState[]`
- `getBookableSeatCount(bookings: Booking[], slot: string, activeSlots: string[], overrides?: SlotOverrides, selectedSeatIndex?: number | null): number`
- `canBookSlot(bookings: Booking[], slot: string, size: DogSize, activeSlots: string[], options?: { overrides?: SlotOverrides; selectedSeatIndex?: number | null }): BookingResult`

The LARGE_DOG_SLOTS import stays the same — it's from a `.js` file which TypeScript can read due to `allowJs: true`.

- [ ] **Step 7: Update imports across the codebase**

Every file that imports from `./capacity.js` needs updating to `./capacity.ts` (or just `./capacity` — Vite resolves both). Files to update:

```bash
grep -rl "capacity.js" src/ --include="*.jsx" --include="*.js"
```

Update the import path in each result. Typically:
- `src/App.jsx`
- `src/components/modals/BookingDetailModal.jsx`
- `src/components/modals/NewBookingModal.jsx`
- `src/components/booking/SlotRow.jsx`
- `src/engine/capacity.test.js`

Change `from "./capacity.js"` to `from "./capacity.js"` — actually, since Vite resolves `.ts` files with `.js` extensions by default with `moduleResolution: "bundler"`, no import changes may be needed. Test by running:

```bash
npm run dev
```

If Vite can't resolve, update imports to drop the extension: `from "./capacity"`.

- [ ] **Step 8: Run the capacity tests**

```bash
node src/engine/capacity.test.js
```

This will fail because Node can't run `.ts` directly. Update the test import:

If using Vite, run via Vite's test runner or update the test to use the compiled output. For now, since the tests use plain `node`, keep `capacity.test.js` importing from `"./capacity.js"` and add a Vite alias or use `tsx` to run:

```bash
npx tsx src/engine/capacity.test.js
```

Install tsx as a dev dependency:

```bash
npm install --save-dev tsx
```

Update `package.json` test script:

```json
"test": "tsx src/engine/capacity.test.js"
```

Run: `npm test`
Expected: All tests pass (same output as before).

- [ ] **Step 9: Commit capacity.ts conversion**

```bash
git add src/engine/capacity.ts package.json package-lock.json src/engine/capacity.test.js
git commit -m "feat: convert capacity engine to TypeScript"
```

- [ ] **Step 10: Convert bookingRules.js to bookingRules.ts**

```bash
mv src/engine/bookingRules.js src/engine/bookingRules.ts
```

Add type imports and annotations:

```typescript
import type { DogSize, ServiceId, Service, Dog, Human } from "../types/index.js";
```

Type the functions:
- `isServiceSupportedForSize(serviceId: ServiceId, size: DogSize): boolean`
- `getAllowedServicesForSize(size: DogSize): Service[]`
- `normalizeServiceForSize(serviceId: ServiceId, size: DogSize): ServiceId`
- `getServicePriceLabel(serviceId: ServiceId, size: DogSize): string`
- `getNumericPrice(label: string): number`
- `toLocalDateStr(d: Date): string`
- `getHumanByIdOrName(humans: Record<string, Human>, idOrName: string): Human | undefined`
- `getDogByIdOrName(dogs: Record<string, Dog>, idOrName: string): Dog | undefined`

Update imports across the codebase the same way as capacity.

- [ ] **Step 11: Convert utils.js to utils.ts**

```bash
mv src/engine/utils.js src/engine/utils.ts
```

Add type annotations:
- `formatFullDate(d: Date): string`
- `getDefaultOpenForDate(d: Date): boolean`
- `getDefaultPickupTime(slotTime: string, offsetMinutes?: number): string`
- `generateTimeOptions(startSlot: string): string[]`

- [ ] **Step 12: Convert transforms.js to transforms.ts**

```bash
mv src/supabase/transforms.js src/supabase/transforms.ts
```

This is the most complex conversion — it defines the DB-to-app shape transforms. Add types for the database row shapes (input) and the app shapes (output, using the types from `src/types/index.ts`).

Add types for the raw DB rows:

```typescript
interface DbHuman {
  id: string;
  name: string;
  surname: string;
  phone: string;
  sms: boolean;
  whatsapp: boolean;
  email: string;
  social: string;
  address: string;
  notes: string;
  history_flag: string;
  customer_user_id: string | null;
}

interface DbDog {
  id: string;
  name: string;
  breed: string;
  age: string;
  size: string;
  human_id: string;
  alerts: string[];
  groom_notes: string;
  custom_price: number | null;
}

interface DbBooking {
  id: string;
  booking_date: string;
  slot: string;
  dog_id: string;
  size: string;
  service: string;
  status: string;
  addons: string[];
  pickup_by_id: string | null;
  payment: string;
  confirmed: boolean;
}
```

Then type each transform function with these DB types as input and the app types as output.

- [ ] **Step 13: Verify everything compiles**

Run the TypeScript compiler in check mode:

```bash
npx tsc --noEmit
```

Fix any type errors. Common ones will be:
- Missing type assertions on LARGE_DOG_SLOTS lookups (the `.js` constant doesn't have types yet)
- Possibly undefined values that need null checks

Then verify the app runs:

```bash
npm run dev
```

And tests pass:

```bash
npm test
```

- [ ] **Step 14: Commit all TypeScript conversions**

```bash
git add -A
git commit -m "feat: convert engine and transforms to TypeScript with core type definitions"
```

---

## Summary

| Task | Files changed | Estimated commits |
|------|--------------|-------------------|
| Task 1: Security headers | 3 | 1 |
| Task 2: Realtime subscriptions | 3 | 3 |
| Task 3: Server-side capacity | 1 (migration) | 1 |
| Task 4: BookingDetailModal decomposition | 9 | 7 |
| Task 5: TypeScript foundation | 8+ | 4 |
| **Total** | **~24** | **~16** |

All 5 tasks are independent — they can be worked in any order or in parallel across worktrees.
