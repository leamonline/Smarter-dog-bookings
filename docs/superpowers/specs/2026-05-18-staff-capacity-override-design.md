# Staff Capacity Override — Confirm-and-book popup

**Date:** 2026-05-18
**Approach:** Per-booking override flag, surfaced via a confirmation dialog, enforced through engine + DB trigger
**Scope:** `src/engine/capacity.ts`, `src/components/modals/NewBookingModal.jsx`, `src/components/booking/AddBookingForm.jsx`, `supabase/migrations/...`

## Background

Staff currently get a hard rejection when a slot would violate physical capacity rules:

> Booking on 2026-05-18 failed: Not enough capacity (2-2-1 rule) (Choose a different starting date)

This is the same rejection path the customer-facing booking flow uses. The recent `staffOverride` work ([22d6d3a](https://github.com/leamonline/Smarter-dog-bookings/commit/22d6d3a)) intentionally kept physical capacity in place for staff — only the *approval gate* was bypassed. That decision was correct for "Large dogs need Leam's approval" (staff are the approver), but it leaves the 2-2-1 / "Slot is full" / "Back-to-back" / "Share with large" / "Early close" rules as hard blocks even though staff *are* the people who'd consciously break them when business reality demands.

The salon already has a global escape hatch (`salon_config.enforce_server_capacity = false`) but that switches off all capacity enforcement everywhere — too blunt for a one-off override and unsafe to leave flipped.

This spec replaces the hard error with a confirmation dialog at the two staff entry points where they actively pick a slot (NewBookingModal, AddBookingForm). The customer-facing booking flow is unchanged.

## Goal

When a staff member tries to book a slot that violates a physical-capacity rule, instead of a flat rejection, show:

- **Title:** "This booking breaks the capacity rule"
- **Message:** "{reason}. Override and book anyway?" — where `{reason}` is the engine's existing reason string ("Not enough capacity (2-2-1 rule)", "Back-to-back large dogs only allowed at 12:30 + 1:00pm", etc.)
- **Confirm:** "Override and book" (primary variant — deliberate decision, not destructive)
- **Cancel:** "Pick another time"

On confirm, the booking is written. The booking row records that the override was applied, by which staff member, and when.

Data-integrity errors (invalid slot, dog already booked in this slot, closed day, past-date without confirmation) remain hard errors — those aren't capacity rules.

## Non-goals

- **Reschedule / Chain / Rebook flows.** These filter the time-slot picker to only show bookable slots; widening them requires rendering slots in a "warning" state rather than hiding them. That's a meaningful UX change and is deferred to a follow-up.
- **Customer-facing booking flow** (`src/components/customer/booking/BookingWizard.tsx`). The override is staff-only; customers continue to see the existing rejection messages.
- **A new global on/off setting.** `enforce_server_capacity` already exists; this is per-booking and gated on `is_staff()`.
- **Visual indicator on existing booking cards** showing "this was a capacity override." The DB columns persist the flag, the staff user id, and the timestamp, so a follow-up can surface it in the day view, but no UI change is in scope here.
- **Approval-gate change for any new size.** "Large dogs need Leam's approval" still kicks the customer flow through approval; this spec is only about physical-capacity rejections for staff.
- **Trigger-level audit log of who overrode.** `bookings.staff_capacity_override = true` plus the existing booking row's audit columns (created_at, etc.) are sufficient; no new audit table.

## Architecture

Three changes, in the order they execute at runtime: engine → frontend → DB.

### 1. Engine — `src/engine/capacity.ts`

Widen the `staffOverride` option from `boolean` to `boolean | { approval?: boolean; capacity?: boolean }`. Boolean back-compat preserved:

- `staffOverride: true`  →  `{ approval: true, capacity: false }` (existing behaviour — every current call site keeps working)
- `staffOverride: false` (or omitted)  →  `{ approval: false, capacity: false }`
- `staffOverride: { capacity: true }` →  bypass physical-capacity rules; approval bypass independent

Inside `canBookSlot`, derive a pair of booleans at the top:

```ts
const { staffOverride: rawOverride = false, ... } = options;
const override = typeof rawOverride === "boolean"
  ? { approval: rawOverride, capacity: false }
  : { approval: rawOverride.approval ?? false, capacity: rawOverride.capacity ?? false };
```

Apply `override.approval` where today's `staffOverride` is checked (the mid-morning block on line 252).

Apply `override.capacity` to short-circuit the following rejections — when `override.capacity === true`, skip the rejection and continue:

| Line | Reason string |
| --- | --- |
| ~266 | `"9:00am conditional: 8:30am must be empty"` |
| ~273 | `"9:00am conditional: 10:00am must have 0–1 seats"` |
| ~284 | `"12:00 large dog requires 1:00pm to be empty (early close)"` |
| ~293 | `"1:00pm is closed — large dog at 12:00 triggered early close"` |
| ~313 / ~328 | `"Back-to-back large dogs only allowed at 12:30 + 1:00pm"` |
| ~340 | `"Only a small/medium dog can share this slot with a large dog"` |
| ~349 | `"Large dog fills this slot — already has bookings"` |
| ~357 | `"Not enough capacity (2-2-1 rule)"` (full-takeover branch) |
| ~376 | `"Not enough capacity (2-2-1 rule)"` (general branch, large) |
| ~378 | `"1:00pm closed — early close from 12:00 large dog"` |
| ~381 | `"Capped at 1 (2-2-1 rule)"` |
| ~382 | `"Slot is full"` |
| ~390 | `"Large dog fills this slot"` (small/medium blocked) |

`override.capacity` does **not** affect:

- `"Invalid slot"` — data integrity
- `"This dog is already booked in this slot"` — data integrity

Return shape stays `{ allowed, reason, needsApproval? }`. No new fields — the caller already knows it asked with `capacity: true`.

**Tests** (`src/engine/capacity.test.js`): add cases for each bypassable reason. For each: confirm rejection without `capacity: true`, confirm acceptance with it, confirm the data-integrity reasons still reject even with `capacity: true`.

### 2. Frontend — `NewBookingModal.jsx`

Current flow (line 230–267):

```jsx
for (const entry of dogEntries) {
  const check = canBookSlot(simulated, selectedSlot, size, activeSlots, {
    dogId: entry.dog.id,
    staffOverride: true,
  });
  if (!check.allowed) {
    allFit = false;
    failureReason = check.reason;
    break;
  }
  simulated = [...simulated, /* temp booking */];
}

if (allFit) { /* commit */ }
else { setError(`Booking on ${targetDateStr} failed: ...`); }
```

**Replace with:** when the first dog fails for a capacity reason, open a confirmation dialog instead of setting the error. Two new pieces of state:

```jsx
const [pendingCapacityOverride, setPendingCapacityOverride] = useState(null);
// shape: { reason: string, targetDateStr: string } | null
```

The classification of "is this a capacity rejection" lives in a small pure helper that returns `false` for the data-integrity reasons listed above and `true` for everything else. Implementation: hardcode the data-integrity reason strings in a `Set<string>` next to `canBookSlot`, exported as `isCapacityRejection(reason)` — that keeps the classification in one place and lets the DB trigger have a parallel allow-list.

Save flow becomes:

1. Run today's loop with `staffOverride: true` (approval bypass only).
2. On rejection, if `isCapacityRejection(reason)`:
   - `setPendingCapacityOverride({ reason, targetDateStr })`
   - Return early — wait for the confirm dialog.
3. On rejection that isn't a capacity reason, `setError(...)` with the existing message format. No popup.
4. On confirm in the dialog: re-run the loop with `staffOverride: { approval: true, capacity: true }`, mark the resulting booking objects with `staff_capacity_override: true`, and commit.

The confirm dialog reuses `<ConfirmDialog>` from `src/components/shared/ConfirmDialog.jsx` with `variant="primary"` (need to confirm primary is supported — see Open Questions).

Recurring-booking interaction: if a recurring series hits capacity on occurrence 2+ (`i > 0`), today's code silently skips that occurrence. **Keep that behaviour.** The confirmation popup only fires on the *first* occurrence (`i === 0`); overriding the first instance does **not** propagate to weeks 2–N. A recurring series that hits capacity on week 3 silently skips week 3, exactly as today. The toast already says "Booking created" — no change needed there; the day-view will show the gap.

### 3. Frontend — `AddBookingForm.jsx`

Same idea, simpler shape. Current (line 124–134):

```jsx
const check = canBookSlot(bookings, slot, size, activeSlots, {
  slotOverrides, selectedSeatIndex, dogId, staffOverride: true,
});
if (!check.allowed) { setError(check.reason); return; }
```

Becomes: on rejection, if `isCapacityRejection(check.reason)`, open the confirm dialog; on confirm, re-run with `staffOverride: { approval: true, capacity: true }` and call `onAdd({...booking, staff_capacity_override: true})`.

### 4. DB — new migration `supabase/migrations/20260518100000_staff_capacity_override_column.sql`

Add three columns and teach the existing capacity trigger to honour them.

```sql
ALTER TABLE bookings
  ADD COLUMN staff_capacity_override    boolean NOT NULL DEFAULT false,
  ADD COLUMN staff_capacity_override_by uuid    REFERENCES auth.users(id),
  ADD COLUMN staff_capacity_override_at timestamptz;

COMMENT ON COLUMN bookings.staff_capacity_override IS
  'True if a staff member explicitly overrode a physical-capacity rejection
   for this booking. Only honoured when is_staff() at insert/update time.';
COMMENT ON COLUMN bookings.staff_capacity_override_by IS
  'auth.users.id of the staff member who confirmed the override. Populated
   by the validate_booking_capacity trigger from auth.uid() when the
   override is honoured; nullable for non-overridden rows.';
COMMENT ON COLUMN bookings.staff_capacity_override_at IS
  'Timestamp the override was applied. Populated by the trigger.';
```

The audit columns are **populated by the trigger**, not by the client. The client just sets `staff_capacity_override = true`. The trigger fills `staff_capacity_override_by = auth.uid()` and `staff_capacity_override_at = now()` when the override is honoured. This prevents a client from spoofing "who overrode" — Postgres uses the session's authenticated user.

Patch `validate_booking_capacity` (currently a `BEFORE INSERT OR UPDATE` trigger, so it can mutate `NEW` and the changes persist).

At the top of the function, after `v_enforce` is resolved, compute and stamp the override:

```sql
v_override := COALESCE(NEW.staff_capacity_override, false) AND is_staff();
IF v_override THEN
  NEW.staff_capacity_override_by := auth.uid();
  NEW.staff_capacity_override_at := now();
ELSE
  -- Defensive: don't let a client set _by/_at without a real override
  NEW.staff_capacity_override_by := NULL;
  NEW.staff_capacity_override_at := NULL;
END IF;
```

Then wrap each bypassable `RAISE EXCEPTION` in `IF NOT v_override THEN ... END IF;`. The data-integrity ones (`Invalid slot`) stay unconditional. The 09:00 conditional pair is bypassable (matching the engine):

Reasons made bypassable (when `v_override`):
- "9:00 large dog conditional: 8:30 must be empty"
- "9:00 large dog conditional: 10:00 must have 0-1 seats used"
- "12:00 large dog requires 13:00 to be empty (early close)"
- "13:00 is closed — large dog at 12:00 triggered early close"
- "Back-to-back large dogs only allowed at 12:30 + 13:00"
- "Only a small/medium dog can share this slot with a large dog"
- "Large dog fills this slot — already has bookings"
- "Not enough capacity (2-2-1 rule)"
- "13:00 closed — early close from 12:00 large dog"
- "Capped at 1 (2-2-1 rule)"
- "Slot is full"
- "Large dog fills this slot"

Reasons that remain unconditional:
- "Invalid slot: %" — data integrity

**Service role / autonomous WhatsApp path:** `is_staff()` returns false for the service role, so `v_override` collapses to false for those inserts even if `staff_capacity_override = true` somehow leaks in. The defensive `ELSE` branch nulls `_by` / `_at` to prevent a non-staff client from poisoning the audit columns.

**RLS / column-grant considerations:** the existing RLS policies on `bookings` will need to allow staff to set `staff_capacity_override` on insert/update. The audit columns (`_by`, `_at`) should never be settable by clients — only the trigger writes them. To enforce this, either (a) use column-level grants to revoke INSERT/UPDATE on those two columns for non-superuser roles, or (b) rely on the trigger's defensive null-overwrite (less strict but simpler). Implementation plan to pick — leaning towards (b) for simplicity since the trigger is the gate either way.

**Backfill:** all existing rows default to `false` / `NULL` / `NULL`. No historic bookings are retroactively flagged as overrides.

### 5. Supabase write path

Both `NewBookingModal` and `AddBookingForm` eventually route through `addBooking` in `src/supabase/hooks/useBookings.js` (line ~230). It constructs `insertPayload` explicitly and then `supabase.from("bookings").insert(insertPayload)`. The change is one line in that payload:

```js
const insertPayload = {
  booking_date: dateStr,
  slot: booking.slot,
  // ...existing fields...
  ...(booking.staff_capacity_override ? { staff_capacity_override: true } : {}),
};
```

Spread the flag conditionally so legacy callers without it produce an unchanged payload (and the DB default of `false` applies).

The offline path (`src/hooks/useOfflineState.js`, `offlineHandleAdd`) stores the booking object directly into local state via `setOfflineBookings(...)`. The flag rides along automatically as a property of the booking object; no offline-specific change needed.

Both `handleAdd` and `handleAddToDate` in `useBookingActions.ts` are thin wrappers over `sbAddBooking` / the offline equivalent — no changes there.

## Data flow

```
Staff clicks "Confirm" in NewBookingModal
        │
        ▼
canBookSlot(..., { staffOverride: true })   ← approval bypass only
        │
        ├─ allowed → commit (today's behaviour)
        │
        └─ rejected
                │
                ├─ isCapacityRejection(reason) === false
                │       └─ setError(...)   ← hard error (today's behaviour for non-capacity reasons)
                │
                └─ isCapacityRejection(reason) === true
                        │
                        ▼
                  open ConfirmDialog
                        │
                        ├─ cancel → close, no booking
                        │
                        └─ confirm
                                ▼
                        canBookSlot(..., { staffOverride: { approval: true, capacity: true } })
                                ▼
                        onAdd({ ...booking, staff_capacity_override: true })
                                ▼
                        INSERT INTO bookings (... staff_capacity_override = true)
                                ▼
                        trigger: v_override = is_staff() AND NEW.staff_capacity_override = true
                                ▼
                        all capacity RAISE EXCEPTIONs skipped
                                ▼
                        row written
```

## Error handling

- **DB trigger still rejects after override is set.** Only possible if (a) `is_staff()` returns false (the user isn't actually staff — e.g. they're hitting the customer endpoint with a stale session) or (b) the rejection is one of the unconditional ones (Invalid slot / 09:00 conditional). In both cases the existing Supabase error bubbles up to the existing toast / inline error UI. No new handling needed.
- **Race condition:** another booking is inserted between the override-confirm and the actual insert, and the new state would *still* violate a non-capacity rule (e.g. a duplicate-dog row). The trigger rejects, the user sees the existing error. Acceptable.
- **`staff_capacity_override = true` but the second `canBookSlot` returns allowed without needing the override.** Fine — the column accurately reflects "staff confirmed override," not "the override was load-bearing."

## Testing

**Engine** (`src/engine/capacity.test.js`):
- One test per bypassable reason (all 13 in the table above, including the 09:00 conditional pair): confirm rejection without `capacity: true`, confirm acceptance with `capacity: true`.
- One test for each data-integrity reason ("Invalid slot", "This dog is already booked in this slot"): confirm rejection persists even with `capacity: true`.
- `staffOverride: true` (legacy boolean) still bypasses approval only — regression test for the existing behaviour.
- `isCapacityRejection` helper: covered indirectly by the above + 1-2 direct assertions.

**Component** (jsdom):
- `NewBookingModal`: stub `canBookSlot` to return `{ allowed: false, reason: "Not enough capacity (2-2-1 rule)" }` once, then `{ allowed: true }` on the override retry. Assert the ConfirmDialog appears, clicking confirm fires `onAdd` with `staff_capacity_override: true`.
- `NewBookingModal`: stub to return `{ allowed: false, reason: "Invalid slot" }`. Assert `setError` is hit, no dialog.
- `AddBookingForm`: equivalent pair.

**E2E** (Playwright, deferred — call out in plan but only build if cheap): full happy path on a deliberately-overbooked day. Optional.

**DB** (manual verification on a Supabase branch, plus any existing capacity-trigger tests if present):
- Authenticated staff + `staff_capacity_override = true` + capacity-violating row → insert succeeds, `_by` = staff's auth.uid, `_at` ≈ now().
- Authenticated staff + `staff_capacity_override = false` → existing behaviour (insert rejected).
- Service role + `staff_capacity_override = true` → insert still rejected (is_staff() false → v_override false).
- Authenticated staff + `staff_capacity_override = true` + duplicate booking → still rejected (data integrity unconditional).
- Authenticated staff sends `staff_capacity_override_by = '<spoofed-uuid>'` directly → trigger overwrites with `auth.uid()` (or nulls it if override not granted).

## Open questions

1. **Confirm button variant.** `ConfirmDialog` only documents `variant="danger"` (default) — I'll need to verify it supports `"primary"` or add a styling escape hatch. If not, fall back to `variant="danger"` for v1 (visually red, but the button text reads "Override and book" so it's clear). Decision: try primary in the implementation; if it doesn't exist, ship with danger and file a follow-up.

2. **Audit-column protection.** Whether to use column-level grants on `staff_capacity_override_by` / `_at` or rely solely on the trigger's defensive null-overwrite. Leaning towards the simpler trigger-only approach; implementation plan to confirm.

3. **Audit visibility in the UI.** The columns will exist but nothing surfaces them. Out of scope here; flag in the implementation plan as a candidate follow-up (e.g. a small badge on the booking card: "Overridden by Alex on 18 May").

4. **DB trigger test infrastructure.** The implementation plan will check whether the existing test setup runs trigger-level assertions or just engine assertions. If trigger tests don't exist, the migration is covered by manual verification (a Supabase branch is fine for this) + the engine tests, since the trigger mirrors the engine logic line-for-line.

## Migration / rollout

Single PR, single deploy. Migration runs first (adds the column with default false — zero impact on existing data and code). Code change can be deployed at the same time or shortly after — the column being there with no readers/writers is a no-op.

Rollback: drop the column, revert the engine + UI changes. No data migration concerns (default false, nothing depends on it).
