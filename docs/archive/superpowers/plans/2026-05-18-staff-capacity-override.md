# Staff Capacity Override Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hard "Booking failed: Not enough capacity (2-2-1 rule)" rejection with a confirmation popup that lets authenticated staff override the capacity rule per-booking. Audit who overrode.

**Architecture:** Widen `canBookSlot`'s `staffOverride` option from `boolean` to `boolean | { approval?, capacity? }`. Add an `isCapacityRejection(reason)` helper. Surface a `ConfirmDialog` at the two staff entry points (`NewBookingModal`, `AddBookingForm`) when a capacity-class rejection comes back. Persist `staff_capacity_override` on the booking row; the DB trigger fills `staff_capacity_override_by` from `auth.uid()` and `staff_capacity_override_at` from `now()` when honouring the override.

**Tech Stack:** TypeScript (engine), React + JSX (modals), Vitest (logic + jsdom), PostgreSQL trigger (Supabase migration).

**Spec:** [`docs/superpowers/specs/2026-05-18-staff-capacity-override-design.md`](../specs/2026-05-18-staff-capacity-override-design.md)

---

## File Structure

**Modify:**
- `src/engine/capacity.ts` — widen `staffOverride` option; gate bypassable rules; export `isCapacityRejection`
- `src/engine/capacity.test.js` — bypass + back-compat tests
- `src/components/modals/NewBookingModal.jsx` — popup flow
- `src/components/booking/AddBookingForm.jsx` — popup flow
- `src/supabase/hooks/useBookings.js` — forward `staff_capacity_override` in `insertPayload`

**Create:**
- `supabase/migrations/20260518100000_staff_capacity_override_column.sql` — column add + trigger replace

No new component-test files in this PR. The engine tests (Task 1) cover the routing rules in pure form; manual verification (Task 6) covers the JSX integration. Adding `*.component.test.jsx` for these modals would require getting `DogSearchSection` + `BookingFormFields` rendering through multi-step interactions — bigger test-infra investment than this change warrants.

---

## Task 1: Engine — widen `staffOverride` and add `isCapacityRejection`

**Files:**
- Modify: `src/engine/capacity.ts:220-395`
- Test: `src/engine/capacity.test.js` (append a new `describe` block at the bottom)

- [ ] **Step 1: Append the failing-test block to `capacity.test.js`**

Append this block at the very bottom of `src/engine/capacity.test.js`:

```js
// ============================================================
// 13. STAFF CAPACITY OVERRIDE
// ============================================================
import { isCapacityRejection } from "./capacity.js";

describe("Staff capacity override — object form of staffOverride", () => {
  // Legacy boolean back-compat: staffOverride: true bypasses approval only.
  it("staffOverride: true bypasses approval gate (legacy boolean)", () => {
    // 11:00 is full (no LARGE_DOG_SLOTS entry → approval gate too).
    // Legacy boolean must let staff past the approval gate but still
    // hit the physical-capacity rejection.
    const bookings = [b("11:00"), b("11:00")];

    const noOverride = canBookSlot(bookings, "11:00", "large", SLOTS);
    expect(noOverride.allowed).toBe(false);
    expect(noOverride.reason).toMatch(/approval/i);

    const legacy = canBookSlot(bookings, "11:00", "large", SLOTS, {
      staffOverride: true,
    });
    // Approval gate bypassed but capacity isn't.
    expect(legacy.allowed).toBe(false);
    expect(legacy.reason).toMatch(/2-2-1|capacity/i);
  });

  it("staffOverride: { approval: true } also bypasses approval only (object form)", () => {
    const result = canBookSlot([], "10:00", "large", SLOTS, {
      staffOverride: { approval: true },
    });
    // 10:00 empty → 2 seats available for a 2-seat large dog. Approval
    // bypassed, no capacity rule fires.
    expect(result.allowed).toBe(true);
  });

  it("staffOverride: { approval: true, capacity: true } books a no-rule large dog into a full slot", () => {
    const bookings = [b("11:00"), b("11:00")];
    const result = canBookSlot(bookings, "11:00", "large", SLOTS, {
      staffOverride: { approval: true, capacity: true },
    });
    expect(result.allowed).toBe(true);
  });

  it("staffOverride: { capacity: true } bypasses 2-2-1 'Capped at 1'", () => {
    // 09:30 is capped at 1 by 2-2-1 (two doubles at 08:30 and 09:00).
    // Fill that cap-of-1 to force the rejection.
    const bookings = [
      b("08:30"), b("08:30"),
      b("09:00"), b("09:00"),
      b("09:30"),
    ];
    const blocked = canBookSlot(bookings, "09:30", "small", SLOTS);
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toMatch(/2-2-1/);

    const allowed = canBookSlot(bookings, "09:30", "small", SLOTS, {
      staffOverride: { capacity: true },
    });
    expect(allowed.allowed).toBe(true);
  });

  it("staffOverride: { capacity: true } bypasses 'Slot is full'", () => {
    const bookings = [b("11:00"), b("11:00")];
    const blocked = canBookSlot(bookings, "11:00", "small", SLOTS);
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toBe("Slot is full");

    const allowed = canBookSlot(bookings, "11:00", "small", SLOTS, {
      staffOverride: { capacity: true },
    });
    expect(allowed.allowed).toBe(true);
  });

  it("staffOverride: { capacity: true } bypasses 9:00 conditional (8:30 must be empty)", () => {
    const bookings = [b("08:30")];
    const blocked = canBookSlot(bookings, "09:00", "large", SLOTS);
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toMatch(/8:30am must be empty/);

    const allowed = canBookSlot(bookings, "09:00", "large", SLOTS, {
      staffOverride: { approval: true, capacity: true },
    });
    expect(allowed.allowed).toBe(true);
  });

  it("staffOverride: { capacity: true } bypasses 12:00 / 13:00 early-close pair", () => {
    // 12:00 large dog blocks 13:00.
    const bookings = [b("12:00", "large")];
    const blocked = canBookSlot(bookings, "13:00", "large", SLOTS);
    expect(blocked.allowed).toBe(false);

    const allowed = canBookSlot(bookings, "13:00", "large", SLOTS, {
      staffOverride: { capacity: true },
    });
    expect(allowed.allowed).toBe(true);
  });

  // Back-to-back rejection isn't directly testable with the current
  // LARGE_DOG_SLOTS (only 12:30 + 13:00 are canShare:false, and that
  // adjacent pair is the *allowed* pair). The bypass code path is in
  // place for completeness; if LARGE_DOG_SLOTS is ever extended, the
  // existing back-to-back tests at line ~231 cover the positive path.

  it("staffOverride: { capacity: true } bypasses 'Only a small/medium dog can share'", () => {
    const bookings = [b("12:00", "large")];
    const blocked = canBookSlot(bookings, "12:00", "large", SLOTS);
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toMatch(/share this slot/);

    const allowed = canBookSlot(bookings, "12:00", "large", SLOTS, {
      staffOverride: { capacity: true },
    });
    expect(allowed.allowed).toBe(true);
  });

  it("staffOverride: { capacity: true } bypasses 'Large dog fills this slot' for small dog", () => {
    const bookings = [b("12:30", "large")];
    const blocked = canBookSlot(bookings, "12:30", "small", SLOTS);
    expect(blocked.allowed).toBe(false);

    const allowed = canBookSlot(bookings, "12:30", "small", SLOTS, {
      staffOverride: { capacity: true },
    });
    expect(allowed.allowed).toBe(true);
  });

  // Data-integrity errors must stay hard even with capacity: true.
  it("staffOverride: { capacity: true } does NOT bypass 'Invalid slot'", () => {
    const result = canBookSlot([], "07:00", "small", SLOTS, {
      staffOverride: { capacity: true },
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("Invalid slot");
  });

  it("staffOverride: { capacity: true } does NOT bypass 'already booked in this slot'", () => {
    const dogId = "dog-1";
    const bookings = [{ ...b("09:00"), _dogId: dogId }];
    const result = canBookSlot(bookings, "09:00", "small", SLOTS, {
      dogId,
      staffOverride: { capacity: true },
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/already booked/);
  });
});

describe("isCapacityRejection", () => {
  it("returns false for data-integrity reasons", () => {
    expect(isCapacityRejection("Invalid slot")).toBe(false);
    expect(isCapacityRejection("This dog is already booked in this slot")).toBe(false);
  });

  it("returns true for capacity reasons", () => {
    expect(isCapacityRejection("Not enough capacity (2-2-1 rule)")).toBe(true);
    expect(isCapacityRejection("Slot is full")).toBe(true);
    expect(isCapacityRejection("Capped at 1 (2-2-1 rule)")).toBe(true);
    expect(isCapacityRejection("Back-to-back large dogs only allowed at 12:30 + 1:00pm")).toBe(true);
    expect(isCapacityRejection("Only a small/medium dog can share this slot with a large dog")).toBe(true);
    expect(isCapacityRejection("Large dog fills this slot")).toBe(true);
    expect(isCapacityRejection("9:00am conditional: 8:30am must be empty")).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests — they should fail**

```bash
npm run test:logic -- src/engine/capacity.test.js
```

Expected: at least one failure complaining `isCapacityRejection is not exported` and the object-form override tests failing because `staffOverride: { ... }` is treated as truthy (currently maps to `approval: true` only).

- [ ] **Step 3: Implement the engine changes in `src/engine/capacity.ts`**

Replace the `canBookSlot` signature + the early-options-destructuring block (lines 220–230) with this expanded version:

```ts
// Reasons returned by canBookSlot that are NOT capacity-related —
// these stay as hard errors even when a staff member overrides.
const DATA_INTEGRITY_REASONS = new Set<string>([
  "Invalid slot",
  "This dog is already booked in this slot",
]);

export function isCapacityRejection(reason: string | undefined): boolean {
  if (!reason) return false;
  return !DATA_INTEGRITY_REASONS.has(reason);
}

type StaffOverride =
  | boolean
  | { approval?: boolean; capacity?: boolean };

function resolveStaffOverride(raw: StaffOverride): { approval: boolean; capacity: boolean } {
  if (typeof raw === "boolean") return { approval: raw, capacity: false };
  return { approval: raw.approval ?? false, capacity: raw.capacity ?? false };
}

export function canBookSlot(
  bookings: Booking[],
  slot: string,
  size: DogSize,
  activeSlots: string[],
  options: {
    overrides?: SlotOverrides;
    selectedSeatIndex?: number | null;
    dogId?: string | null;
    staffOverride?: StaffOverride;
  } = {},
): BookingResult {
  const {
    overrides = {},
    selectedSeatIndex = null,
    dogId = null,
    staffOverride: rawOverride = false,
  } = options;
  const override = resolveStaffOverride(rawOverride);

  const capacities = computeSlotCapacities(bookings, activeSlots);
  const cap = capacities[slot];
  const largeDogSlots = LARGE_DOG_SLOTS as Record<string, LargeDogSlotRule>;

  if (!cap) return { allowed: false, reason: "Invalid slot" };

  if (dogId && bookings.some((b) => b.slot === slot && b._dogId === dogId)) {
    return {
      allowed: false,
      reason: "This dog is already booked in this slot",
    };
  }

  const seatsNeeded = getSeatsNeeded(size, slot);

  if (size === "large") {
    const rule = largeDogSlots[slot];

    // --- Mid-morning block: no LARGE_DOG_SLOTS entry ---
    if (!rule) {
      if (!override.approval) {
        return {
          allowed: false,
          reason: "Large dogs need Leam's approval for this slot",
          needsApproval: true,
        };
      }
    } else {
      // --- 09:00 conditional ---
      if (rule.conditional && slot === "09:00") {
        const seats830 = getSeatsUsed(bookings, "08:30");
        const seats1000 = getSeatsUsed(bookings, "10:00");
        if (seats830 > 0 && !override.capacity) {
          return {
            allowed: false,
            reason: "9:00am conditional: 8:30am must be empty",
          };
        }
        if (seats1000 > 1 && !override.capacity) {
          return {
            allowed: false,
            reason: "9:00am conditional: 10:00am must have 0–1 seats",
          };
        }
      }

      // --- 12:00 conditional ---
      if (slot === "12:00") {
        const seats1300 = getSeatsUsed(bookings, "13:00");
        if (seats1300 > 0 && !override.capacity) {
          return {
            allowed: false,
            reason: "12:00 large dog requires 1:00pm to be empty (early close)",
          };
        }
      }

      // --- 13:00 early close ---
      if (slot === "13:00" && isEarlyCloseActive(bookings) && !override.capacity) {
        return {
          allowed: false,
          reason: "1:00pm is closed — large dog at 12:00 triggered early close",
        };
      }

      // --- Back-to-back full-takeover ---
      if (!rule.canShare) {
        const slotIndex = activeSlots.indexOf(slot);

        if (slotIndex > 0) {
          const prevSlot = activeSlots[slotIndex - 1];
          const prevRule = largeDogSlots[prevSlot];
          if (prevRule && !prevRule.canShare && hasLargeDog(bookings, prevSlot)) {
            const pair = [prevSlot, slot].sort();
            if (!(pair[0] === "12:30" && pair[1] === "13:00") && !override.capacity) {
              return {
                allowed: false,
                reason: "Back-to-back large dogs only allowed at 12:30 + 1:00pm",
              };
            }
          }
        }

        if (slotIndex < activeSlots.length - 1) {
          const nextSlot = activeSlots[slotIndex + 1];
          const nextRule = largeDogSlots[nextSlot];
          if (nextRule && !nextRule.canShare && hasLargeDog(bookings, nextSlot)) {
            const pair = [slot, nextSlot].sort();
            if (!(pair[0] === "12:30" && pair[1] === "13:00") && !override.capacity) {
              return {
                allowed: false,
                reason: "Back-to-back large dogs only allowed at 12:30 + 1:00pm",
              };
            }
          }
        }
      }

      // --- Shareable slot: only small/medium can join a large dog ---
      if (rule.canShare && hasLargeDog(bookings, slot) && !override.capacity) {
        return {
          allowed: false,
          reason: "Only a small/medium dog can share this slot with a large dog",
        };
      }

      // --- Full-takeover slot already has bookings ---
      if (!rule.canShare && cap.used > 0 && !override.capacity) {
        return {
          allowed: false,
          reason: "Large dog fills this slot — already has bookings",
        };
      }

      // --- Full-takeover needs 2 seats but 2-2-1 caps at 1 ---
      if (!rule.canShare && seatsNeeded > cap.max && !override.capacity) {
        return {
          allowed: false,
          reason: "Not enough capacity (2-2-1 rule)",
        };
      }
    }
  }

  // --- General seat availability check (all sizes) ---
  const availableSeats = getBookableSeatCount(
    bookings,
    slot,
    activeSlots,
    overrides,
    selectedSeatIndex,
  );

  if (availableSeats < seatsNeeded && !override.capacity) {
    return {
      allowed: false,
      reason:
        size === "large"
          ? "Not enough capacity (2-2-1 rule)"
          : cap.isEarlyClosed
            ? "1:00pm closed — early close from 12:00 large dog"
            : cap.isConstrained
              ? "Capped at 1 (2-2-1 rule)"
              : "Slot is full",
    };
  }

  // --- Small/medium blocked by full-takeover large dog ---
  if (size !== "large" && cap.hasLargeDog && !override.capacity) {
    const rule = largeDogSlots[slot];
    if (rule && !rule.canShare) {
      return { allowed: false, reason: "Large dog fills this slot" };
    }
  }

  return { allowed: true };
}
```

- [ ] **Step 4: Run the tests — they should pass**

```bash
npm run test:logic -- src/engine/capacity.test.js
```

Expected: all 13 new tests pass plus the pre-existing tests stay green. If the pre-existing "Staff-opened seat overrides 2-2-1 cap" test (`describe("..."), it("...")` at line ~555) fails, double-check that `staffOverride: true` still threads to approval only — that test should still pass without any change.

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck
```

Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add src/engine/capacity.ts src/engine/capacity.test.js
git commit -m "feat(capacity): add staff override for physical-capacity rules

Widens canBookSlot()'s staffOverride option from boolean to
{ approval?, capacity? } (boolean kept for back-compat → approval-only).
When capacity: true, all physical-capacity reasons short-circuit
(2-2-1, slot-full, back-to-back, share-slot, 9:00/12:00 conditionals,
early close). Data-integrity reasons (Invalid slot, dog already booked
in slot) remain unconditional.

Exports isCapacityRejection(reason) so the UI can decide whether to
show a popup or a hard error.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: DB migration — `staff_capacity_override` columns + trigger patch

**Files:**
- Create: `supabase/migrations/20260518100000_staff_capacity_override_column.sql`

- [ ] **Step 1: Write the migration**

```sql
-- ============================================================
-- Staff capacity override
--
-- Adds three columns to bookings:
--   staff_capacity_override     — client sets true to opt in
--   staff_capacity_override_by  — trigger fills from auth.uid()
--   staff_capacity_override_at  — trigger fills from now()
--
-- Patches validate_booking_capacity() to skip physical-capacity
-- RAISE EXCEPTIONs when (is_staff() AND staff_capacity_override).
-- Data-integrity checks ("Invalid slot") stay unconditional.
-- The trigger nulls _by/_at on rows where the override is not
-- honoured, so a non-staff client can't poison the audit columns.
-- ============================================================

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS staff_capacity_override    boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS staff_capacity_override_by uuid        REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS staff_capacity_override_at timestamptz;

COMMENT ON COLUMN bookings.staff_capacity_override IS
  'True if a staff member explicitly overrode a physical-capacity rejection for this booking. Only honoured when is_staff() at insert/update time.';
COMMENT ON COLUMN bookings.staff_capacity_override_by IS
  'auth.users.id of the staff member who confirmed the override. Populated by the validate_booking_capacity trigger from auth.uid() when the override is honoured.';
COMMENT ON COLUMN bookings.staff_capacity_override_at IS
  'Timestamp the override was applied. Populated by the trigger from now().';

CREATE OR REPLACE FUNCTION validate_booking_capacity()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_enforce      boolean;
  v_override     boolean;
  v_slots        text[];
  v_exclude_id   uuid;
  v_seats_used   integer[];
  v_slot_index   integer;
  v_max_seats    integer;
  v_used         integer;
  v_seats_needed integer;
  v_early_close  boolean;
  v_has_large    boolean;
  v_can_share    boolean;
  i              integer;
  v_prev_slot    text;
  v_next_slot    text;
BEGIN
  SELECT COALESCE(sc.enforce_server_capacity, true)
    INTO v_enforce
    FROM salon_config sc
   LIMIT 1;

  IF NOT FOUND THEN
    v_enforce := true;
  END IF;

  -- Resolve & stamp the override before any capacity checks run.
  v_override := COALESCE(NEW.staff_capacity_override, false) AND is_staff();
  IF v_override THEN
    NEW.staff_capacity_override_by := auth.uid();
    NEW.staff_capacity_override_at := now();
  ELSE
    NEW.staff_capacity_override_by := NULL;
    NEW.staff_capacity_override_at := NULL;
  END IF;

  IF NOT v_enforce THEN
    RETURN NEW;
  END IF;

  v_slots := active_slots();

  IF TG_OP = 'UPDATE' THEN
    v_exclude_id := NEW.id;
  ELSE
    v_exclude_id := NULL;
  END IF;

  v_seats_used := ARRAY[]::integer[];
  FOR i IN 1..array_length(v_slots, 1) LOOP
    v_seats_used := v_seats_used || get_seats_used(NEW.booking_date, v_slots[i], v_exclude_id);
  END LOOP;

  v_slot_index := NULL;
  FOR i IN 1..array_length(v_slots, 1) LOOP
    IF v_slots[i] = NEW.slot THEN
      v_slot_index := i;
      EXIT;
    END IF;
  END LOOP;

  IF v_slot_index IS NULL THEN
    RAISE EXCEPTION 'Invalid slot: %', NEW.slot;
  END IF;

  v_seats_needed := get_seats_needed(NEW.size, NEW.slot);
  v_used := v_seats_used[v_slot_index];
  v_early_close := has_large_dog(NEW.booking_date, '12:00', v_exclude_id);
  v_has_large := has_large_dog(NEW.booking_date, NEW.slot, v_exclude_id);

  v_max_seats := get_max_seats_for_slot(v_slot_index, v_seats_used);

  IF NEW.slot = '13:00' AND v_early_close THEN
    v_max_seats := 0;
  END IF;

  -- LARGE DOG RULES
  IF NEW.size = 'large' THEN

    -- Mid-morning block — approval gate (separate from capacity override).
    IF NOT is_large_dog_slot(NEW.slot) THEN
      IF NOT is_staff() THEN
        RAISE EXCEPTION 'Large dogs need approval for this slot (%)' , NEW.slot;
      END IF;
    END IF;

    -- 09:00 conditional
    IF NEW.slot = '09:00' THEN
      IF get_seats_used(NEW.booking_date, '08:30', v_exclude_id) > 0
         AND NOT v_override THEN
        RAISE EXCEPTION '09:00 large dog conditional: 08:30 must be empty';
      END IF;
      IF get_seats_used(NEW.booking_date, '10:00', v_exclude_id) > 1
         AND NOT v_override THEN
        RAISE EXCEPTION '09:00 large dog conditional: 10:00 must have 0-1 seats used';
      END IF;
    END IF;

    -- 12:00 conditional
    IF NEW.slot = '12:00' THEN
      IF get_seats_used(NEW.booking_date, '13:00', v_exclude_id) > 0
         AND NOT v_override THEN
        RAISE EXCEPTION '12:00 large dog requires 13:00 to be empty (early close)';
      END IF;
    END IF;

    -- 13:00 early close
    IF NEW.slot = '13:00' AND v_early_close AND NOT v_override THEN
      RAISE EXCEPTION '13:00 is closed — large dog at 12:00 triggered early close';
    END IF;

    v_can_share := large_dog_can_share(NEW.slot);

    -- Back-to-back full-takeover
    IF NOT v_can_share THEN
      IF v_slot_index > 1 THEN
        v_prev_slot := v_slots[v_slot_index - 1];
        IF is_large_dog_slot(v_prev_slot)
           AND NOT large_dog_can_share(v_prev_slot)
           AND has_large_dog(NEW.booking_date, v_prev_slot, v_exclude_id) THEN
          IF NOT (
            (v_prev_slot = '12:30' AND NEW.slot = '13:00') OR
            (v_prev_slot = '13:00' AND NEW.slot = '12:30')
          ) AND NOT v_override THEN
            RAISE EXCEPTION 'Back-to-back large dogs only allowed at 12:30 + 13:00';
          END IF;
        END IF;
      END IF;

      IF v_slot_index < array_length(v_slots, 1) THEN
        v_next_slot := v_slots[v_slot_index + 1];
        IF is_large_dog_slot(v_next_slot)
           AND NOT large_dog_can_share(v_next_slot)
           AND has_large_dog(NEW.booking_date, v_next_slot, v_exclude_id) THEN
          IF NOT (
            (NEW.slot = '12:30' AND v_next_slot = '13:00') OR
            (NEW.slot = '13:00' AND v_next_slot = '12:30')
          ) AND NOT v_override THEN
            RAISE EXCEPTION 'Back-to-back large dogs only allowed at 12:30 + 13:00';
          END IF;
        END IF;
      END IF;
    END IF;

    -- Shareable slot — second large dog blocked
    IF v_can_share AND v_has_large AND NOT v_override THEN
      RAISE EXCEPTION 'Only a small/medium dog can share this slot with a large dog';
    END IF;

    -- Full-takeover slot must be empty
    IF NOT v_can_share AND is_large_dog_slot(NEW.slot) AND v_used > 0 AND NOT v_override THEN
      RAISE EXCEPTION 'Large dog fills this slot — already has bookings';
    END IF;

    -- Full-takeover needs 2 seats but 2-2-1 caps at 1
    IF NOT v_can_share AND is_large_dog_slot(NEW.slot)
       AND v_seats_needed > v_max_seats AND NOT v_override THEN
      RAISE EXCEPTION 'Not enough capacity (2-2-1 rule)';
    END IF;

  END IF;

  -- GENERAL CHECKS (all sizes)
  IF (v_used + v_seats_needed) > v_max_seats AND NOT v_override THEN
    IF NEW.size = 'large' THEN
      RAISE EXCEPTION 'Not enough capacity (2-2-1 rule)';
    ELSIF NEW.slot = '13:00' AND v_early_close THEN
      RAISE EXCEPTION '13:00 closed — early close from 12:00 large dog';
    ELSIF v_max_seats < 2 THEN
      RAISE EXCEPTION 'Capped at 1 (2-2-1 rule)';
    ELSE
      RAISE EXCEPTION 'Slot is full';
    END IF;
  END IF;

  IF NEW.size <> 'large' AND v_has_large AND NOT v_override THEN
    IF is_large_dog_slot(NEW.slot) AND NOT large_dog_can_share(NEW.slot) THEN
      RAISE EXCEPTION 'Large dog fills this slot';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
```

- [ ] **Step 2: Verify the SQL parses on a Supabase branch**

If a Supabase preview branch is available, run via the MCP `apply_migration` tool or the Supabase CLI. Otherwise inspect by eye — the diff against the existing trigger (`supabase/migrations/20260518000000_capacity_trigger_staff_override_approval.sql`) is exactly:
- `v_override boolean` added to `DECLARE`
- New `v_override := ...; IF ... NEW.staff_capacity_override_by := auth.uid() ...` block right after `v_enforce`
- Every bypassable `RAISE EXCEPTION` now has `AND NOT v_override` on its triggering `IF`

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260518100000_staff_capacity_override_column.sql
git commit -m "feat(capacity): add staff_capacity_override columns + trigger gate

Adds three columns to bookings:
- staff_capacity_override (client opt-in)
- staff_capacity_override_by (auth.users.id, trigger-filled)
- staff_capacity_override_at (timestamptz, trigger-filled)

Patches validate_booking_capacity() to skip physical-capacity
exceptions when is_staff() AND staff_capacity_override. Trigger nulls
_by/_at on rows where the override is not honoured, so the audit
columns can't be spoofed by a non-staff client. Invalid-slot and
approval-gate checks remain unconditional.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Forward `staff_capacity_override` in the booking insert payload

**Files:**
- Modify: `src/supabase/hooks/useBookings.js:230-242`

- [ ] **Step 1: Add the field to `insertPayload`**

In `src/supabase/hooks/useBookings.js`, find the block at line 230:

```js
const insertPayload = {
  booking_date: dateStr,
  slot: booking.slot,
  dog_id: dogId,
  size: booking.size,
  service: booking.service,
  status: booking.status || "Booked",
  addons: booking.addons || [],
  pickup_by_id: pickupHumanId || null,
  payment: booking.payment || "Due at Pick-up",
  confirmed: booking.confirmed ?? false,
  ...(booking.group_id ? { group_id: booking.group_id } : {}),
};
```

Add a conditional spread for the override at the end (keeping the existing pattern):

```js
const insertPayload = {
  booking_date: dateStr,
  slot: booking.slot,
  dog_id: dogId,
  size: booking.size,
  service: booking.service,
  status: booking.status || "Booked",
  addons: booking.addons || [],
  pickup_by_id: pickupHumanId || null,
  payment: booking.payment || "Due at Pick-up",
  confirmed: booking.confirmed ?? false,
  ...(booking.group_id ? { group_id: booking.group_id } : {}),
  ...(booking.staff_capacity_override ? { staff_capacity_override: true } : {}),
};
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: no new errors. (The `booking` parameter is typed `any` / loosely; the optional field is harmless.)

- [ ] **Step 3: Commit**

```bash
git add src/supabase/hooks/useBookings.js
git commit -m "feat(bookings): forward staff_capacity_override on insert

Conditionally spread the flag into insertPayload so the trigger can
honour the override. Legacy callers without the field produce an
unchanged payload (DB default false applies).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: `NewBookingModal` — surface the popup

**Files:**
- Modify: `src/components/modals/NewBookingModal.jsx:1-272`

The integration is covered by the engine tests (Task 1) for the routing rules plus the manual smoke test (Task 6). A jsdom test that drives the full modal would have to render `DogSearchSection` + `BookingFormFields` through multi-step interactions — bigger test-infra investment than this change warrants, so we're not creating component tests for the modals in this PR. Anyone extending this work later can add `*.component.test.jsx` files; the engine tests document the contract.

- [ ] **Step 1: Edit `NewBookingModal.jsx`**

Two edits to `src/components/modals/NewBookingModal.jsx`:

**(a)** Add two imports. Find:
```jsx
import { useToast } from "../../contexts/ToastContext.jsx";
```

Add directly below:
```jsx
import { ConfirmDialog } from "../shared/ConfirmDialog.jsx";
import { isCapacityRejection } from "../../engine/capacity.js";
```

**(b)** Add state next to the existing `pendingPastConfirm`:

Find:
```jsx
const [pendingPastConfirm, setPendingPastConfirm] = useState(false);
```

Add directly below:
```jsx
const [pendingCapacityOverride, setPendingCapacityOverride] = useState(null);
// shape: { reason: string, targetDateStr: string }
```

**(c)** Replace the existing `saveBooking` function (lines 201–272) with this version that pulls the per-occurrence loop out into a helper so it can be re-run on override-confirm:

```jsx
const buildBookingsForOverride = (capacity) => {
  const result = [];
  const occurrences = recurringWeeks > 0 ? Math.floor(52 / recurringWeeks) : 1;
  const baseDate = new Date(selectedDateStr + "T00:00:00");

  for (let i = 0; i < occurrences; i++) {
    const targetDate = new Date(baseDate);
    targetDate.setDate(baseDate.getDate() + (i * recurringWeeks * 7));
    const targetDateStr = toDateStr(targetDate);

    if (!isDateOpen(targetDateStr, dayOpenState)) {
      if (i === 0) {
        return { error: "The salon is closed on this day. Open the day first or pick a different date." };
      }
      continue;
    }

    const dayBookings = bookingsByDate?.[targetDateStr] || [];
    const settings = daySettings?.[targetDateStr];
    const activeSlots = [...SALON_SLOTS, ...(settings?.extraSlots || [])];
    let simulated = [...dayBookings];

    let allFit = true;
    let failureReason = "";

    for (const entry of dogEntries) {
      const size = entry.dog.size || "small";
      const check = canBookSlot(simulated, selectedSlot, size, activeSlots, {
        dogId: entry.dog.id,
        staffOverride: capacity
          ? { approval: true, capacity: true }
          : true,
      });
      if (!check.allowed) {
        allFit = false;
        failureReason = check.reason;
        break;
      }
      simulated = [
        ...simulated,
        { slot: selectedSlot, size, id: `check-${entry.dog.id}`, _dogId: entry.dog.id },
      ];
    }

    if (allFit) {
      dogEntries.forEach(entry => {
        result.push({
          id: crypto.randomUUID(),
          slot: selectedSlot,
          dogName: entry.dog.name,
          breed: entry.dog.breed,
          size: entry.dog.size || "small",
          service: entry.service,
          addons: entry.addons || [],
          owner: entry.dog.humanId,
          _dogId: entry.dog.id,
          _bookingDate: targetDateStr,
          ...(capacity ? { staff_capacity_override: true } : {}),
        });
      });
    } else if (i === 0) {
      return { error: failureReason, targetDateStr };
    }
    // i > 0: silently skip (today's behaviour)
  }

  return { bookings: result };
};

const saveBooking = () => {
  const outcome = buildBookingsForOverride(false);
  if (outcome.error) {
    if (isCapacityRejection(outcome.error)) {
      setPendingCapacityOverride({ reason: outcome.error, targetDateStr: outcome.targetDateStr });
      return;
    }
    setError(`Booking on ${outcome.targetDateStr} failed: ${outcome.error} (Choose a different starting date)`);
    return;
  }

  onAdd(outcome.bookings, selectedDateStr);
  toast.show("Booking created", "success");
};

const confirmCapacityOverride = () => {
  const outcome = buildBookingsForOverride(true);
  setPendingCapacityOverride(null);

  if (outcome.error) {
    // Override didn't help (e.g. a data-integrity reason or the recurring
    // week-1 still fails for some other reason). Fall back to hard error.
    setError(`Booking on ${outcome.targetDateStr} failed: ${outcome.error} (Choose a different starting date)`);
    return;
  }

  onAdd(outcome.bookings, selectedDateStr);
  toast.show("Booking created", "success");
};
```

**(d)** Add the `ConfirmDialog` to the JSX. The file already mounts a `<PastDateConfirm>` block at lines ~393–400 just before `</AccessibleModal>`. Add the new dialog immediately after the `<PastDateConfirm>` block, inside the same `<AccessibleModal>`:

```jsx
{pendingCapacityOverride && (
  <ConfirmDialog
    title="This booking breaks the capacity rule"
    message={`${pendingCapacityOverride.reason}. Override and book anyway?`}
    confirmLabel="Override and book"
    cancelLabel="Pick another time"
    variant="primary"
    onConfirm={confirmCapacityOverride}
    onCancel={() => setPendingCapacityOverride(null)}
  />
)}
```

- [ ] **Step 2: Typecheck + logic test pass**

```bash
npm run typecheck && npm run test:logic
```

Expected: no errors. The engine tests still pass because nothing in the engine changed in this task.

- [ ] **Step 3: Visually smoke-test in dev**

```bash
npm run dev
```

Open the staff dashboard. Try to add a booking into an overbooked slot — popup should appear with the wording "This booking breaks the capacity rule" + the engine's reason string + the buttons "Override and book" / "Pick another time". Cancel → no booking. Confirm → booking written, toast shows. (Full end-to-end verification with DB inspection happens in Task 6.)

- [ ] **Step 4: Commit**

```bash
git add src/components/modals/NewBookingModal.jsx
git commit -m "feat(booking): override popup for capacity rejections in NewBookingModal

When canBookSlot returns a capacity-class rejection, open a
ConfirmDialog ('This booking breaks the capacity rule') instead of
setError(...). On confirm, re-run with staffOverride.capacity=true
and stamp staff_capacity_override on each booking object.

Data-integrity reasons (Invalid slot, already booked) still surface
as a hard inline error.

Recurring weeks 2+ that hit capacity continue to silently skip
(unchanged behaviour).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: `AddBookingForm` — surface the popup

**Files:**
- Modify: `src/components/booking/AddBookingForm.jsx:111-165`

Same reasoning as Task 4 — engine tests cover the rule routing, manual verification in Task 6 covers the JSX integration. No component test in this PR.

- [ ] **Step 1: Edit `AddBookingForm.jsx`**

In `src/components/booking/AddBookingForm.jsx`:

**(a)** Add the imports near the existing ones at the top:

```jsx
import { ConfirmDialog } from "../shared/ConfirmDialog.jsx";
import { isCapacityRejection } from "../../engine/capacity.js";
```

**(b)** Add state near the existing `useState` calls (next to `error`):

```jsx
const [pendingOverride, setPendingOverride] = useState(null);
// shape: { reason: string, payload: object }
```

**(c)** Replace `handleSubmit` (line 111 onwards). The current logic builds a `check` and either errors or calls `onAdd`. Wrap the rejection branch with the capacity classifier:

Find:
```jsx
const check = canBookSlot(bookings, slot, size, activeSlots, {
  slotOverrides,
  selectedSeatIndex,
  dogId: selectedDog.id || null,
  staffOverride: true,
});

if (!check.allowed) {
  setError(check.reason);
  return;
}
```

Replace with:
```jsx
const buildPayload = (capacity) => ({
  id: Date.now(),
  slot,
  dogName: selectedDog.name,
  breed: selectedDog.breed,
  size,
  service,
  owner: ownerName,
  status: prefill?.status || "Booked",
  addons,
  pickupBy: prefill?.pickupBy || ownerName,
  payment: prefill?.payment || "Due at Pick-up",
  confirmed: prefill?.confirmed ?? false,
  _dogId: selectedDog.id || prefill?._dogId || null,
  _ownerId:
    selectedDog._humanId || selectedOwner?.id || prefill?._ownerId || null,
  _pickupById: prefill?._pickupById || null,
  ...(capacity ? { staff_capacity_override: true } : {}),
});

const check = canBookSlot(bookings, slot, size, activeSlots, {
  slotOverrides,
  selectedSeatIndex,
  dogId: selectedDog.id || null,
  staffOverride: true,
});

if (!check.allowed) {
  if (isCapacityRejection(check.reason)) {
    setPendingOverride({ reason: check.reason, payload: buildPayload(true) });
    return;
  }
  setError(check.reason);
  return;
}
```

Then later in the same handler, where `onAdd` is called with the inline-built object, replace the inline object with `buildPayload(false)`:

Find:
```jsx
const result = await onAdd({
  id: Date.now(),
  slot,
  // ... rest
});
```

Replace with:
```jsx
const result = await onAdd(buildPayload(false));
```

**(d)** Add a helper to commit the override (place near the other handlers, e.g. just above `handleSubmit`):

```jsx
const confirmOverride = async () => {
  const payload = pendingOverride.payload;
  setPendingOverride(null);
  setSubmitting(true);
  setError("");
  const result = await onAdd(payload);
  setSubmitting(false);
  if (result) {
    toast.show(`${payload.dogName} booked in`, "success");
  } else {
    setError("Could not save booking. Please try again.");
  }
};
```

**(e)** Mount the dialog inside the form. The component's `return` is a single `<form>` at line 167 closing at line 331. Add the dialog as the last child of the form, just before `</form>`:

```jsx
      {pendingOverride && (
        <ConfirmDialog
          title="This booking breaks the capacity rule"
          message={`${pendingOverride.reason}. Override and book anyway?`}
          confirmLabel="Override and book"
          cancelLabel="Pick another time"
          variant="primary"
          onConfirm={confirmOverride}
          onCancel={() => setPendingOverride(null)}
        />
      )}
    </form>
```

`ConfirmDialog` mounts inline (no React portal), but its buttons are `type="button"` so they don't submit the form. The fixed-position overlay covers the page regardless of DOM ancestor, so this works.

- [ ] **Step 2: Full suite + typecheck + lint**

```bash
npm run test && npm run typecheck && npm run lint
```

Expected: everything green.

- [ ] **Step 3: Visually smoke-test in dev**

```bash
npm run dev
```

Open a busy day, find a slot at capacity, use the inline "+" add-booking affordance on that slot's row. Confirm the popup appears with the same wording as the NewBookingModal popup. Cancel and confirm both paths.

- [ ] **Step 4: Commit**

```bash
git add src/components/booking/AddBookingForm.jsx
git commit -m "feat(booking): override popup for capacity rejections in AddBookingForm

Same pattern as NewBookingModal: capacity rejections open a
ConfirmDialog with 'Override and book' / 'Pick another time'.
Data-integrity rejections stay as inline errors. Override flag is
spread onto the payload sent to onAdd, which useBookings forwards
to the bookings insert.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Manual verification

**Files:** none (verification only).

- [ ] **Step 1: Apply the migration to the dev environment**

If using Supabase locally: `npx supabase db push` (or the project's standard migration command). If using a Supabase branch: apply via the MCP `apply_migration` tool or the dashboard.

- [ ] **Step 2: Smoke-test the staff flow**

1. Open the dev server: `npm run dev`.
2. Log in as a staff user (existing dev account).
3. Pick a day and overbook it: book 2 dogs at 08:30 and 2 at 09:00.
4. Try to book a third dog at 09:30 (which is now 2-2-1 capped at 1, with one seat free) — try to fit *two* dogs there so the 2-2-1 fires. Or pick a slot that's already 2-of-2.
5. Expect the popup: "This booking breaks the capacity rule — Not enough capacity (2-2-1 rule). Override and book anyway?"
6. Click **Pick another time**: popup closes, no booking written.
7. Try again, click **Override and book**: booking succeeds, toast shows.
8. In Supabase studio (or via SQL), inspect the row:
   ```sql
   SELECT id, booking_date, slot, staff_capacity_override,
          staff_capacity_override_by, staff_capacity_override_at
     FROM bookings
    WHERE staff_capacity_override = true
    ORDER BY staff_capacity_override_at DESC
    LIMIT 5;
   ```
   - `staff_capacity_override` = `true`
   - `staff_capacity_override_by` = your `auth.uid()`
   - `staff_capacity_override_at` ≈ now

- [ ] **Step 3: Smoke-test the inline AddBookingForm**

The inline "add booking" affordance lives on the day-view slot rows. Trigger it from a slot that's currently at capacity, repeat steps 5–8.

- [ ] **Step 4: Smoke-test a data-integrity rejection**

Try to add the same dog twice to the same slot. Expect the inline error ("This dog is already booked in this slot"), no popup, no booking.

- [ ] **Step 5: Push the branch**

```bash
git push -u origin fix/large-dog-approval-staff-override
```

Then open a PR with a description that references the spec and lists the verification steps above.

---

## Notes

- **Pre-existing test "Staff-opened seat overrides 2-2-1 cap":** at `src/engine/capacity.test.js:555`. This is unrelated — it tests the `overrides` slot-override mechanic, not `staffOverride`. It should keep passing.

- **The `_bookingDate` carry-through:** NewBookingModal sets `_bookingDate` on each booking object so `handleAddToDate(b, b._bookingDate || dateStr)` routes recurring occurrences to the correct date. The override field is per-booking and rides along the same object — nothing extra to do.

- **Reschedule, Chain, Rebook flows:** these filter unbookable slots out of the picker rather than letting the user submit. Override there means rendering those slots with a warning state. Deferred — see spec non-goals.

- **`is_staff()` for service role:** the DB function returns false when `auth.uid()` is null, so service-role inserts (e.g. autonomous WhatsApp booking) never benefit from the override even if the column is set. No change needed.
