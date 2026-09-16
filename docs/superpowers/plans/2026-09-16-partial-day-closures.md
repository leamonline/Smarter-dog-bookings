# Partial-day closures — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let staff close part of a day in half-hour steps and see it on the weekly bookings calendar as one coral card reading "Closed for [reason]" spanning every covered slot.

**Architecture:** A new `day_settings.closures` JSONB column stores `[{id, from, to, reason}]`. Saving a closure also writes `"blocked"` into both seats of every covered slot in `day_settings.overrides`, in the same column-scoped update. All booking enforcement therefore stays exactly as it is today — the database gates, the customer wizard, WhatsApp availability and the Today board already refuse a slot with both seats blocked. Closures are a staff-facing display and authoring layer on top.

**Tech Stack:** React 19 + Vite 7, Tailwind 4, TypeScript engine modules, Supabase Postgres, Vitest (logic + jsdom component projects), Playwright, pgTAP.

**Spec:** [`docs/superpowers/specs/2026-09-16-partial-day-closures-design.md`](../specs/2026-09-16-partial-day-closures-design.md)

## Global Constraints

- **UK English** everywhere in code comments, copy and docs (colour, organise, behaviour).
- **Card text is exactly `Closed for ` + the reason as typed.** "doctor's appointment" renders "Closed for doctor's appointment". Never re-case, never re-word.
- **Reason:** trimmed, non-empty, maximum 60 characters.
- **`from` is inclusive, `to` is exclusive.** A closure 09:00–10:30 covers 09:00, 09:30, 10:00.
- **No bare `console` in `src/`** — ESLint fails. Use `src/lib/logger.ts`.
- **No `.js`/`.jsx` extension on a relative import whose target is `.ts`/`.tsx`** — `npm run lint` fails via `scripts/check-import-extensions.mjs`.
- **Engine code is pure TypeScript, zero React.** UI components are `.jsx`.
- **Tests colocated:** `*.test.ts` → logic project (node), `*.component.test.jsx/tsx` → component project (jsdom).
- **Constants over literals:** statuses via `BOOKING_STATUS`, never a raw UUID on screen.
- **Migrations are idempotent** and applied to production by hand before merge. Every new function ends with a revoke block (this plan adds no functions).
- **Do not** change `validate_booking_calendar`, `validate_booking_capacity`, `get_blocked_seats`, `src/engine/capacity.ts` or `supabase/functions/_shared/capacity.ts`. Enforcement is out of scope by design.
- **Node 24.** In this shell, prefix npm with `fnm exec --using=24 --`.
- **Branch:** `feat/partial-day-closures`. Never push to `main`.
- **The bar is** `npm run lint && npm run typecheck && npm run check:migrations && npm run test && npm run build` all passing.

## File structure

| File | Responsibility |
|---|---|
| `supabase/migrations/20260916120000_day_settings_closures.sql` | Add the `closures` column + array check |
| `supabase/tests/223_day_settings_closures.test.sql` | pgTAP: column, default, check, blocks still readable |
| `src/types/index.ts` | `DayClosure` type; `closures` on `DaySettings` |
| `src/engine/closures.ts` | Pure closure logic: coverage, validation, apply/release, rows, label |
| `src/engine/closures.test.ts` | Engine unit tests |
| `src/supabase/database.types.ts` | `closures: Json` on the `day_settings` row types |
| `src/supabase/hooks/useDaySettings.ts` | Persist `closures`; `addClosure` / `removeClosure` / `updateClosureReason` |
| `src/supabase/hooks/useDaySettings.closures.component.test.jsx` | Hook writes both columns in one payload |
| `src/hooks/useOfflineState.ts` | Offline mirrors of the three mutations |
| `src/hooks/useBookingActions.ts` | Resolve online vs offline |
| `src/hooks/useStaffAppData.ts` | Expose the three mutations to the shell |
| `src/components/booking/NeedsAttentionFrame.jsx` | Flashing yellow/black frame + NEEDS ATTENTION tag |
| `src/components/booking/ClosureCard.jsx` | The coral spanning card + its actions menu |
| `src/components/modals/CloseTimesDialog.jsx` | Authoring dialog (From / To / reason) |
| `src/components/booking/SlotGrid.jsx` | Collapse covered rows into closure rows |
| `src/components/booking/SlotRowMenu.jsx` | "Close from here…" menu item |
| `src/components/dashboard/BookingMainPanel.jsx` | Thread closure props |
| `src/components/layout/WeekCalendarView.jsx` | Dialog state + handlers |
| `src/components/dashboard/DaySettingsDrawer.jsx` | "Close part of the day" button |
| `src/index.css` | `needs-attention-flash` keyframes + stripe utility |
| `e2e/partial-day-closures.spec.ts` | Offline end-to-end |
| `docs/partial-day-closures.md`, `docs/README.md`, `CLAUDE.md` | Documentation |

---

### Task 1: Database column

**Files:**
- Create: `supabase/migrations/20260916120000_day_settings_closures.sql`
- Create: `supabase/tests/223_day_settings_closures.test.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: `day_settings.closures jsonb not null default '[]'::jsonb`, constrained to a JSON array.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260916120000_day_settings_closures.sql`:

```sql
-- ============================================================
-- Partial-day closures (staff-facing)
--
-- Staff close part of a day -- a late start or early finish for a
-- doctor's appointment, say -- in half-hour steps. Each closure is
-- {id, from, to, reason}; `from` is inclusive, `to` is exclusive.
--
-- ENFORCEMENT DOES NOT LIVE HERE. Saving a closure also writes
-- {"<slot>": {"0": "blocked", "1": "blocked"}} into day_settings.overrides
-- for every covered slot, and that is what every gate already honours:
-- validate_booking_calendar (seat_blocked), validate_booking_capacity's
-- blocked-seat subtraction, get_blocked_seats, get_small_medium_availability
-- and the public availability calendar. This column carries the reason and
-- the grouping so the staff calendar can draw one card instead of a column
-- of blocked cells. Nothing customer-facing reads it: day_settings is
-- staff-only under RLS and every customer RPC projects explicit columns.
--
-- Additive and idempotent. No new functions, so no grant/revoke block.
-- Apply to prod BY HAND before merging the front end that writes it.
-- Rollback: alter table public.day_settings drop column closures;
-- ============================================================

alter table public.day_settings
  add column if not exists closures jsonb not null default '[]'::jsonb;

alter table public.day_settings
  drop constraint if exists day_settings_closures_is_array;

alter table public.day_settings
  add constraint day_settings_closures_is_array
  check (jsonb_typeof(closures) = 'array');

comment on column public.day_settings.closures is
  'Staff-facing partial-day closures: [{id, from, to, reason}], `from` inclusive and `to` exclusive. Display and authoring only -- enforcement is the both-seats-blocked entries a closure writes into overrides. Never projected to a customer-facing role.';

-- Post-conditions: fail the apply loudly rather than half-land.
do $post$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'day_settings'
       and column_name = 'closures' and is_nullable = 'NO'
  ) then
    raise exception 'day_settings.closures missing or nullable';
  end if;

  if not exists (
    select 1 from pg_constraint
     where conname = 'day_settings_closures_is_array'
       and conrelid = 'public.day_settings'::regclass
  ) then
    raise exception 'day_settings_closures_is_array constraint missing';
  end if;
end;
$post$;
```

- [ ] **Step 2: Validate the migration filename ordering**

Run: `fnm exec --using=24 -- npm run check:migrations`
Expected: PASS (no ordering or naming complaints).

- [ ] **Step 3: Write the pgTAP test**

Create `supabase/tests/223_day_settings_closures.test.sql`, following the shape of the existing suites in that directory (read `supabase/tests/220_holiday_notices.test.sql` for the local conventions on `begin`/`select plan(...)`/`select * from finish()`/`rollback`):

```sql
begin;
select plan(6);

-- 1-3. The column exists, is NOT NULL, and defaults to an empty array.
select has_column('public', 'day_settings', 'closures', 'day_settings has a closures column');
select col_not_null('public', 'day_settings', 'closures', 'closures is NOT NULL');

insert into day_settings (setting_date, is_open) values ('2031-01-06', true);
select is(
  (select closures from day_settings where setting_date = '2031-01-06'),
  '[]'::jsonb,
  'closures defaults to an empty array'
);

-- 4. A non-array is refused by the check constraint.
select throws_ok(
  $$update day_settings set closures = '{"a":1}'::jsonb where setting_date = '2031-01-06'$$,
  '23514',
  null,
  'a non-array closures value is refused'
);

-- 5. A well-formed closure list is accepted.
select lives_ok(
  $$update day_settings
       set closures = '[{"id":"11111111-1111-4111-8111-111111111111","from":"09:00","to":"10:30","reason":"doctor''s appointment"}]'::jsonb
     where setting_date = '2031-01-06'$$,
  'a well-formed closure list is accepted'
);

-- 6. The blocks a closure writes are still visible to the customer read path,
--    which is what actually stops the booking.
update day_settings
   set overrides = '{"09:00":{"0":"blocked","1":"blocked"},"09:30":{"0":"blocked","1":"blocked"},"10:00":{"0":"blocked","1":"blocked"}}'::jsonb
 where setting_date = '2031-01-06';
select is(
  (select count(*)::int from get_blocked_seats('2031-01-06', '2031-01-06')),
  6,
  'get_blocked_seats still reports the six seats a 3-slot closure blocks'
);

select * from finish();
rollback;
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260916120000_day_settings_closures.sql supabase/tests/223_day_settings_closures.test.sql
git commit -m "feat(db): add day_settings.closures for partial-day closures"
```

---

### Task 2: Types and the closures engine

**Files:**
- Modify: `src/types/index.ts` (near `DaySettings`, around line 308)
- Create: `src/engine/closures.ts`
- Create: `src/engine/closures.test.ts`

**Interfaces:**
- Consumes: `SlotOverrides` and `DaySettings` from `src/types/index.ts`; `SLOT_SHAPE` from `src/engine/slotGrid`.
- Produces, all named exports from `src/engine/closures`:
  - `MAX_REASON_LENGTH: 60`
  - `slotsCoveredBy(closure: DayClosure, activeSlots: readonly string[]): string[]`
  - `isSlotClosed(slot: string, closures: readonly DayClosure[], activeSlots: readonly string[]): boolean`
  - `closureForSlot(slot, closures, activeSlots): DayClosure | null`
  - `validateClosure(candidate: {from: string; to: string; reason: string}, existing: readonly DayClosure[], activeSlots: readonly string[], ignoreId?: string): {ok: true} | {ok: false; error: string}`
  - `applyClosure(overrides, closure, activeSlots): Record<string, SlotOverrides>`
  - `releaseClosure(overrides, closure, activeSlots): Record<string, SlotOverrides>`
  - `buildCalendarRows(activeSlots, closures): CalendarRow[]` where `CalendarRow` is `{type: "slot"; slot: string; index: number}` or `{type: "closure"; closure: DayClosure; slots: string[]; index: number}`
  - `closureLabel(closure: DayClosure): string`
  - `closureRangeLabel(closure: DayClosure): string`
  - `bookingsInClosure<T extends {slot: string}>(bookings: readonly T[], closure, activeSlots): T[]`
  - `sanitiseClosures(value: unknown, activeSlots?: readonly string[]): DayClosure[]`
  - `endTimeOptions(from: string, activeSlots: readonly string[]): string[]`

- [ ] **Step 1: Add the types**

In `src/types/index.ts`, immediately above `export interface DaySettings`, add:

```ts
/**
 * A staff-authored partial-day closure — a late start, an early finish, an
 * appointment. `from` is the first covered slot; `to` is exclusive, so
 * 09:00–10:30 covers 09:00, 09:30 and 10:00. Enforcement is not this record:
 * saving one also blocks both seats on every covered slot in `overrides`.
 */
export interface DayClosure {
  id: string;
  /** Inclusive start, "HH:MM" on the half-hour grid. */
  from: string;
  /** Exclusive end, "HH:MM" on the half-hour grid. */
  to: string;
  /** Shown verbatim after "Closed for ". Trimmed, 1–60 characters. */
  reason: string;
}
```

Then add the field to `DaySettings`:

```ts
export interface DaySettings {
  isOpen: boolean;
  overrides: Record<string, SlotOverrides>;
  extraSlots: string[];
  /** Slots staff opened for same-day ("last minute") customer booking. */
  immediateSlots: string[];
  /** Staff-authored partial-day closures for this date. */
  closures: DayClosure[];
}
```

- [ ] **Step 2: Write the failing engine test**

Create `src/engine/closures.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  slotsCoveredBy,
  isSlotClosed,
  closureForSlot,
  validateClosure,
  applyClosure,
  releaseClosure,
  buildCalendarRows,
  closureLabel,
  closureRangeLabel,
  bookingsInClosure,
  sanitiseClosures,
  endTimeOptions,
  MAX_REASON_LENGTH,
} from "./closures";
import type { DayClosure } from "../types/index";

const SLOTS = [
  "08:30", "09:00", "09:30", "10:00", "10:30",
  "11:00", "11:30", "12:00", "12:30", "13:00",
];

const closure = (over: Partial<DayClosure> = {}): DayClosure => ({
  id: "c1",
  from: "09:00",
  to: "10:30",
  reason: "doctor's appointment",
  ...over,
});

describe("slotsCoveredBy", () => {
  it("covers from inclusive to exclusive", () => {
    expect(slotsCoveredBy(closure(), SLOTS)).toEqual(["09:00", "09:30", "10:00"]);
  });

  it("covers two slots for a one-hour closure", () => {
    expect(slotsCoveredBy(closure({ from: "08:30", to: "09:30" }), SLOTS))
      .toEqual(["08:30", "09:00"]);
  });

  it("covers eight slots for a four-hour closure", () => {
    expect(slotsCoveredBy(closure({ from: "09:00", to: "13:00" }), SLOTS))
      .toHaveLength(8);
  });

  it("covers extra slots after 13:00", () => {
    const grid = [...SLOTS, "13:30", "14:00"];
    expect(slotsCoveredBy(closure({ from: "13:00", to: "14:30" }), grid))
      .toEqual(["13:00", "13:30", "14:00"]);
  });

  it("returns nothing when the range misses the grid", () => {
    expect(slotsCoveredBy(closure({ from: "05:00", to: "06:00" }), SLOTS)).toEqual([]);
  });
});

describe("isSlotClosed / closureForSlot", () => {
  it("reports a covered slot closed and an uncovered one open", () => {
    expect(isSlotClosed("09:30", [closure()], SLOTS)).toBe(true);
    expect(isSlotClosed("10:30", [closure()], SLOTS)).toBe(false);
  });

  it("returns the owning closure", () => {
    expect(closureForSlot("09:30", [closure()], SLOTS)?.id).toBe("c1");
    expect(closureForSlot("11:00", [closure()], SLOTS)).toBeNull();
  });
});

describe("validateClosure", () => {
  it("accepts a well-formed closure", () => {
    expect(validateClosure({ from: "09:00", to: "10:30", reason: "late start" }, [], SLOTS))
      .toEqual({ ok: true });
  });

  it("rejects an end at or before the start", () => {
    expect(validateClosure({ from: "10:00", to: "10:00", reason: "x" }, [], SLOTS).ok).toBe(false);
    expect(validateClosure({ from: "10:00", to: "09:30", reason: "x" }, [], SLOTS).ok).toBe(false);
  });

  it("rejects a start that is not an active slot", () => {
    expect(validateClosure({ from: "07:00", to: "09:00", reason: "x" }, [], SLOTS).ok).toBe(false);
  });

  it("rejects times off the half-hour grid", () => {
    expect(validateClosure({ from: "09:15", to: "10:00", reason: "x" }, [], SLOTS).ok).toBe(false);
    expect(validateClosure({ from: "09:00", to: "10:15", reason: "x" }, [], SLOTS).ok).toBe(false);
  });

  it("rejects an end past the last slot plus thirty minutes", () => {
    expect(validateClosure({ from: "12:30", to: "14:00", reason: "x" }, [], SLOTS).ok).toBe(false);
    expect(validateClosure({ from: "12:30", to: "13:30", reason: "x" }, [], SLOTS).ok).toBe(true);
  });

  it("rejects an empty or overlong reason", () => {
    expect(validateClosure({ from: "09:00", to: "10:00", reason: "   " }, [], SLOTS).ok).toBe(false);
    expect(validateClosure(
      { from: "09:00", to: "10:00", reason: "x".repeat(MAX_REASON_LENGTH + 1) }, [], SLOTS,
    ).ok).toBe(false);
  });

  it("rejects an overlap with an existing closure", () => {
    const existing = [closure()]; // 09:00–10:30
    expect(validateClosure({ from: "10:00", to: "11:00", reason: "x" }, existing, SLOTS).ok).toBe(false);
    expect(validateClosure({ from: "08:30", to: "09:30", reason: "x" }, existing, SLOTS).ok).toBe(false);
    expect(validateClosure({ from: "10:30", to: "11:00", reason: "x" }, existing, SLOTS).ok).toBe(true);
  });

  it("ignores the closure being edited", () => {
    const existing = [closure()];
    expect(validateClosure(
      { from: "09:00", to: "10:30", reason: "new reason" }, existing, SLOTS, "c1",
    )).toEqual({ ok: true });
  });
});

describe("applyClosure / releaseClosure", () => {
  it("blocks both seats on every covered slot", () => {
    const next = applyClosure({}, closure(), SLOTS);
    expect(next).toEqual({
      "09:00": { 0: "blocked", 1: "blocked" },
      "09:30": { 0: "blocked", 1: "blocked" },
      "10:00": { 0: "blocked", 1: "blocked" },
    });
  });

  it("leaves untouched slots alone", () => {
    const next = applyClosure({ "12:00": { 0: "blocked" } }, closure(), SLOTS);
    expect(next["12:00"]).toEqual({ 0: "blocked" });
  });

  it("round-trips back to the original overrides", () => {
    const before = { "12:00": { 0: "blocked" as const } };
    const after = releaseClosure(applyClosure(before, closure(), SLOTS), closure(), SLOTS);
    expect(after).toEqual(before);
  });

  it("does not mutate its input", () => {
    const before = {};
    applyClosure(before, closure(), SLOTS);
    expect(before).toEqual({});
  });
});

describe("buildCalendarRows", () => {
  it("collapses covered slots into one closure row", () => {
    const rows = buildCalendarRows(SLOTS, [closure()]);
    expect(rows).toHaveLength(8); // 10 slots − 3 covered + 1 closure row
    expect(rows[1]).toMatchObject({ type: "closure", slots: ["09:00", "09:30", "10:00"] });
    expect(rows[0]).toMatchObject({ type: "slot", slot: "08:30" });
    expect(rows[2]).toMatchObject({ type: "slot", slot: "10:30" });
  });

  it("keeps the original slot index on plain rows so row tinting is stable", () => {
    const rows = buildCalendarRows(SLOTS, [closure()]);
    expect(rows[2]).toMatchObject({ slot: "10:30", index: 4 });
  });

  it("returns plain rows when there are no closures", () => {
    expect(buildCalendarRows(SLOTS, [])).toHaveLength(SLOTS.length);
  });

  it("handles two closures in one day", () => {
    const rows = buildCalendarRows(SLOTS, [
      closure({ id: "a", from: "08:30", to: "09:30", reason: "late start" }),
      closure({ id: "b", from: "12:30", to: "13:30", reason: "early finish" }),
    ]);
    expect(rows.filter((r) => r.type === "closure")).toHaveLength(2);
  });
});

describe("labels", () => {
  it("prefixes the reason verbatim", () => {
    expect(closureLabel(closure())).toBe("Closed for doctor's appointment");
    expect(closureLabel(closure({ reason: "late start" }))).toBe("Closed for late start");
  });

  it("formats the range without leading zeros", () => {
    expect(closureRangeLabel(closure())).toBe("9:00 – 10:30");
  });
});

describe("bookingsInClosure", () => {
  it("returns only bookings inside the range", () => {
    const bookings = [{ slot: "09:30", id: "in" }, { slot: "11:00", id: "out" }];
    expect(bookingsInClosure(bookings, closure(), SLOTS).map((b) => b.id)).toEqual(["in"]);
  });
});

describe("sanitiseClosures", () => {
  it("drops malformed entries and keeps good ones", () => {
    const raw = [
      { id: "ok", from: "09:00", to: "10:00", reason: "late start" },
      { id: "no-times", reason: "x" },
      { from: "09:00", to: "10:00", reason: "no id" },
      { id: "bad-order", from: "10:00", to: "09:00", reason: "x" },
      "nonsense",
      null,
    ];
    expect(sanitiseClosures(raw).map((c) => c.id)).toEqual(["ok"]);
  });

  it("returns an empty list for a non-array", () => {
    expect(sanitiseClosures({ a: 1 })).toEqual([]);
    expect(sanitiseClosures(null)).toEqual([]);
  });

  it("trims and truncates the reason", () => {
    const [only] = sanitiseClosures([
      { id: "a", from: "09:00", to: "10:00", reason: `  ${"x".repeat(80)}  ` },
    ]);
    expect(only.reason).toHaveLength(MAX_REASON_LENGTH);
  });
});

describe("endTimeOptions", () => {
  it("offers every half hour after the start up to last slot plus thirty", () => {
    expect(endTimeOptions("12:00", SLOTS)).toEqual(["12:30", "13:00", "13:30"]);
  });

  it("returns nothing for a start that is not on the grid", () => {
    expect(endTimeOptions("07:00", SLOTS)).toEqual([]);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `fnm exec --using=24 -- npx vitest run src/engine/closures.test.ts`
Expected: FAIL — cannot resolve `./closures`.

- [ ] **Step 4: Implement the engine**

Create `src/engine/closures.ts`:

```ts
// ============================================================
// Partial-day closures — pure logic, zero React.
//
// A closure is a staff-authored "we're shut for part of this day" record:
// {id, from, to, reason}, `from` inclusive and `to` exclusive. It does NOT
// enforce anything. Saving one also writes {"0":"blocked","1":"blocked"} into
// day_settings.overrides for every covered slot, and those blocks are what
// every gate already honours — validate_booking_calendar (seat_blocked),
// validate_booking_capacity's blocked-seat subtraction, get_blocked_seats and
// the availability RPCs. This module owns the coverage maths, the validation
// and the calendar row shape; the hook owns persistence.
// ============================================================

import { SLOT_SHAPE } from "./slotGrid";
import type { DayClosure, SlotOverrides } from "../types/index";

/** Maximum characters in a reason. Longer is truncated on read, refused on write. */
export const MAX_REASON_LENGTH = 60;

const SLOT_MINUTES = 30;

/** "HH:MM" → minutes since midnight, or null if it isn't a well-formed time. */
function toMinutes(time: string): number | null {
  if (typeof time !== "string" || !SLOT_SHAPE.test(time)) return null;
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/** Minutes since midnight → "HH:MM". Caller guarantees 0 ≤ mins < 1440. */
function toTime(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** A time is on the grid when it is a well-formed HH:MM on the half hour. */
function onHalfHour(time: string): boolean {
  const mins = toMinutes(time);
  return mins !== null && mins % SLOT_MINUTES === 0;
}

/** Strip the leading zero for display: "09:00" → "9:00". Matches SlotRowMenu. */
function formatTime(time: string): string {
  const [h, m] = time.split(":");
  return `${parseInt(h, 10)}:${m}`;
}

/**
 * The active slots this closure covers, in grid order. `from` is inclusive,
 * `to` exclusive, so 09:00–10:30 covers 09:00, 09:30 and 10:00. Extra slots
 * after 13:00 are ordinary members of the grid and covered like any other.
 */
export function slotsCoveredBy(
  closure: DayClosure,
  activeSlots: readonly string[],
): string[] {
  const from = toMinutes(closure?.from);
  const to = toMinutes(closure?.to);
  if (from === null || to === null || to <= from) return [];
  return activeSlots.filter((slot) => {
    const mins = toMinutes(slot);
    return mins !== null && mins >= from && mins < to;
  });
}

/** The closure covering this slot, or null. First match wins; overlaps are refused on write. */
export function closureForSlot(
  slot: string,
  closures: readonly DayClosure[],
  activeSlots: readonly string[],
): DayClosure | null {
  for (const closure of closures || []) {
    if (slotsCoveredBy(closure, activeSlots).includes(slot)) return closure;
  }
  return null;
}

export function isSlotClosed(
  slot: string,
  closures: readonly DayClosure[],
  activeSlots: readonly string[],
): boolean {
  return closureForSlot(slot, closures, activeSlots) !== null;
}

/**
 * Is this candidate closure saveable? Overlaps are refused rather than merged:
 * two reasons can't share a slot, and silently swallowing one would lose it.
 * `ignoreId` exempts the closure being edited from the overlap check.
 */
export function validateClosure(
  candidate: { from: string; to: string; reason: string },
  existing: readonly DayClosure[],
  activeSlots: readonly string[],
  ignoreId?: string,
): { ok: true } | { ok: false; error: string } {
  const { from, to, reason } = candidate || ({} as typeof candidate);

  if (!onHalfHour(from) || !onHalfHour(to)) {
    return { ok: false, error: "Pick times on the half hour." };
  }

  const fromMins = toMinutes(from) as number;
  const toMins = toMinutes(to) as number;

  if (toMins <= fromMins) {
    return { ok: false, error: "The end time has to be after the start time." };
  }

  if (!activeSlots.includes(from)) {
    return { ok: false, error: "That start time isn't a slot on this day." };
  }

  const lastSlotMins = activeSlots
    .map(toMinutes)
    .reduce<number>((max, mins) => (mins !== null && mins > max ? mins : max), -1);
  if (lastSlotMins < 0 || toMins > lastSlotMins + SLOT_MINUTES) {
    return { ok: false, error: "That end time is past the end of the day." };
  }

  const trimmed = (reason ?? "").trim();
  if (!trimmed) return { ok: false, error: "Add a reason so the card says what's on." };
  if (trimmed.length > MAX_REASON_LENGTH) {
    return { ok: false, error: `Keep the reason to ${MAX_REASON_LENGTH} characters or fewer.` };
  }

  for (const other of existing || []) {
    if (ignoreId && other.id === ignoreId) continue;
    const otherFrom = toMinutes(other.from);
    const otherTo = toMinutes(other.to);
    if (otherFrom === null || otherTo === null) continue;
    if (fromMins < otherTo && otherFrom < toMins) {
      return { ok: false, error: "These times overlap a closure that's already on this day." };
    }
  }

  return { ok: true };
}

/** Both seats blocked on every covered slot. Returns a new object. */
export function applyClosure(
  overrides: Record<string, SlotOverrides>,
  closure: DayClosure,
  activeSlots: readonly string[],
): Record<string, SlotOverrides> {
  const next: Record<string, SlotOverrides> = { ...(overrides || {}) };
  for (const slot of slotsCoveredBy(closure, activeSlots)) {
    next[slot] = { ...(next[slot] || {}), 0: "blocked", 1: "blocked" };
  }
  return next;
}

/**
 * Both seats freed on every covered slot. Returns a new object.
 *
 * This also clears a single-seat block that predated the closure in that
 * range — accepted and documented: the closure blocked the whole slot, so
 * reopening it reopens the whole slot. Staff re-block a seat if they still
 * want it capped.
 */
export function releaseClosure(
  overrides: Record<string, SlotOverrides>,
  closure: DayClosure,
  activeSlots: readonly string[],
): Record<string, SlotOverrides> {
  const next: Record<string, SlotOverrides> = { ...(overrides || {}) };
  for (const slot of slotsCoveredBy(closure, activeSlots)) {
    const slotOv: SlotOverrides = { ...(next[slot] || {}) };
    delete slotOv[0];
    delete slotOv[1];
    if (Object.keys(slotOv).length === 0) delete next[slot];
    else next[slot] = slotOv;
  }
  return next;
}

export type CalendarRow =
  | { type: "slot"; slot: string; index: number }
  | { type: "closure"; closure: DayClosure; slots: string[]; index: number };

/**
 * The day's rows with covered slots collapsed into one closure row each.
 * `index` stays the slot's position in the full grid so the alternating row
 * tint and the "now" marker keep lining up with the real timeline.
 */
export function buildCalendarRows(
  activeSlots: readonly string[],
  closures: readonly DayClosure[],
): CalendarRow[] {
  const rows: CalendarRow[] = [];
  const emitted = new Set<string>();

  activeSlots.forEach((slot, index) => {
    if (emitted.has(slot)) return;
    const closure = closureForSlot(slot, closures, activeSlots);
    if (!closure) {
      rows.push({ type: "slot", slot, index });
      return;
    }
    const slots = slotsCoveredBy(closure, activeSlots);
    slots.forEach((s) => emitted.add(s));
    rows.push({ type: "closure", closure, slots, index });
  });

  return rows;
}

/** The card's heading. The reason is rendered exactly as staff typed it. */
export function closureLabel(closure: DayClosure): string {
  return `Closed for ${closure?.reason ?? ""}`;
}

/** "9:00 – 10:30". En dash, matching the rest of the staff UI. */
export function closureRangeLabel(closure: DayClosure): string {
  return `${formatTime(closure.from)} – ${formatTime(closure.to)}`;
}

/** Non-cancelled filtering is the caller's job; this only asks "is it inside?". */
export function bookingsInClosure<T extends { slot: string }>(
  bookings: readonly T[],
  closure: DayClosure,
  activeSlots: readonly string[],
): T[] {
  const covered = new Set(slotsCoveredBy(closure, activeSlots));
  return (bookings || []).filter((b) => covered.has(b?.slot));
}

/**
 * Narrow whatever the database handed back into well-formed closures.
 * A malformed entry is dropped rather than crashing the grid — the column is
 * plain JSONB and only shape-checked as an array.
 */
export function sanitiseClosures(value: unknown): DayClosure[] {
  if (!Array.isArray(value)) return [];
  const out: DayClosure[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const entry = raw as Partial<DayClosure>;
    if (typeof entry.id !== "string" || !entry.id) continue;
    if (typeof entry.from !== "string" || !onHalfHour(entry.from)) continue;
    if (typeof entry.to !== "string" || !onHalfHour(entry.to)) continue;
    if ((toMinutes(entry.to) as number) <= (toMinutes(entry.from) as number)) continue;
    const reason = typeof entry.reason === "string" ? entry.reason.trim() : "";
    if (!reason) continue;
    out.push({
      id: entry.id,
      from: entry.from,
      to: entry.to,
      reason: reason.slice(0, MAX_REASON_LENGTH),
    });
  }
  return out;
}

/**
 * Every half hour a closure starting at `from` could end on, up to the last
 * slot of the day plus thirty minutes (so the final slot can be covered).
 */
export function endTimeOptions(from: string, activeSlots: readonly string[]): string[] {
  const fromMins = toMinutes(from);
  if (fromMins === null || !activeSlots.includes(from)) return [];
  const lastSlotMins = activeSlots
    .map(toMinutes)
    .reduce<number>((max, mins) => (mins !== null && mins > max ? mins : max), -1);
  if (lastSlotMins < 0) return [];
  const options: string[] = [];
  for (let mins = fromMins + SLOT_MINUTES; mins <= lastSlotMins + SLOT_MINUTES; mins += SLOT_MINUTES) {
    options.push(toTime(mins));
  }
  return options;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `fnm exec --using=24 -- npx vitest run src/engine/closures.test.ts`
Expected: PASS, all cases green.

- [ ] **Step 6: Typecheck**

Run: `fnm exec --using=24 -- npm run typecheck`
Expected: PASS. If `DaySettings.closures` being required breaks other files, that is expected — Task 3 fixes the hook and Task 4 the offline mirror. Leave those errors for now only if they are confined to `useDaySettings.ts`, `useOfflineState.ts` and `useStaffAppData.ts`; fix anything else immediately.

- [ ] **Step 7: Commit**

```bash
git add src/types/index.ts src/engine/closures.ts src/engine/closures.test.ts
git commit -m "feat(engine): add pure partial-day closure logic"
```

---

### Task 3: Persist closures in `useDaySettings`

**Files:**
- Modify: `src/supabase/database.types.ts` (the `day_settings` Row/Insert/Update blocks, around line 2410)
- Modify: `src/supabase/hooks/useDaySettings.ts`
- Create: `src/supabase/hooks/useDaySettings.closures.component.test.jsx`

**Interfaces:**
- Consumes: `applyClosure`, `releaseClosure`, `validateClosure`, `sanitiseClosures` from `src/engine/closures`; `buildSlotGrid` from `src/engine/slotGrid`.
- Produces, on the `useDaySettings` return object:
  - `addClosure(dateStr: string, input: {from: string; to: string; reason: string}): Promise<DaySettingResult>`
  - `removeClosure(dateStr: string, id: string): Promise<DaySettingResult>`
  - `updateClosureReason(dateStr: string, id: string, reason: string): Promise<DaySettingResult>`

  All three return the existing `DaySettingResult` union: `{ok: true, value: DaySettings}` or `{ok: false, error: string}`.

- [ ] **Step 1: Add the column to the generated database types**

In `src/supabase/database.types.ts`, add `closures: Json` to the `day_settings` `Row`, and `closures?: Json` to its `Insert` and `Update`, keeping the existing alphabetical order (so `closures` sits before `extra_slots`).

- [ ] **Step 2: Write the failing hook test**

Create `src/supabase/hooks/useDaySettings.closures.component.test.jsx`. Model the Supabase stub on the existing `src/supabase/hooks/useDaySettings.component.test.jsx` — read that file first and reuse its `makeStub` shape rather than inventing a new one.

```jsx
// Closure mutations write BOTH columns in ONE payload: the closure record and
// the blocked seats it implies. Two writes would race the way two seat blocks
// used to (see setOverride's comment).
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

function setSupabase(value) {
  globalThis.__supabaseMockDaySettingsClosures = value;
}

vi.mock("../client", () => ({
  get supabase() {
    return globalThis.__supabaseMockDaySettingsClosures;
  },
}));

vi.mock("../bootPrefetch.js", () => ({
  primeBootPrefetch: vi.fn(),
  takeBootPrefetch: vi.fn(() => null),
  _resetBootPrefetchForTests: vi.fn(),
}));

const { useDaySettings } = await import("./useDaySettings");

const weekStart = new Date(2026, 4, 18); // Mon 18 May 2026
const DATE = "2026-05-18";

// Captures every .update() payload so a test can assert what was sent.
function makeStub(rows = []) {
  const updates = [];
  const channel = { on: vi.fn(() => channel), subscribe: vi.fn(() => channel) };
  const builder = {};
  let writing = false;
  for (const m of ["gte", "lte"]) builder[m] = vi.fn(() => builder);
  builder.select = vi.fn(() =>
    writing
      ? Promise.resolve({ data: [{ setting_date: DATE }], error: null })
      : builder,
  );
  builder.update = vi.fn((payload) => {
    writing = true;
    updates.push(payload);
    return builder;
  });
  builder.eq = vi.fn(() => builder);
  builder.upsert = vi.fn(() => Promise.resolve({ error: null }));
  builder.abortSignal = vi.fn(() => Promise.resolve({ data: rows, error: null }));
  builder.then = undefined;
  return {
    updates,
    client: {
      from: vi.fn(() => builder),
      channel: vi.fn(() => channel),
      removeChannel: vi.fn(),
    },
  };
}

beforeEach(() => {
  setSupabase(null);
});

describe("useDaySettings closures", () => {
  it("addClosure writes the closure and the blocked seats in one payload", async () => {
    const stub = makeStub([
      { setting_date: DATE, is_open: true, overrides: {}, extra_slots: [], immediate_slots: [], closures: [] },
    ]);
    setSupabase(stub.client);

    const { result } = renderHook(() => useDaySettings(weekStart));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let outcome;
    await act(async () => {
      outcome = await result.current.addClosure(DATE, {
        from: "09:00",
        to: "10:30",
        reason: "doctor's appointment",
      });
    });

    expect(outcome.ok).toBe(true);
    expect(stub.updates).toHaveLength(1);
    const payload = stub.updates[0];
    expect(payload.closures).toHaveLength(1);
    expect(payload.closures[0]).toMatchObject({
      from: "09:00",
      to: "10:30",
      reason: "doctor's appointment",
    });
    expect(Object.keys(payload.overrides).sort()).toEqual(["09:00", "09:30", "10:00"]);
    expect(payload.overrides["09:30"]).toEqual({ 0: "blocked", 1: "blocked" });
  });

  it("addClosure refuses an invalid range without writing", async () => {
    const stub = makeStub([
      { setting_date: DATE, is_open: true, overrides: {}, extra_slots: [], immediate_slots: [], closures: [] },
    ]);
    setSupabase(stub.client);

    const { result } = renderHook(() => useDaySettings(weekStart));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let outcome;
    await act(async () => {
      outcome = await result.current.addClosure(DATE, { from: "10:00", to: "09:00", reason: "x" });
    });

    expect(outcome.ok).toBe(false);
    expect(stub.updates).toHaveLength(0);
  });

  it("removeClosure clears the closure and frees its seats", async () => {
    const existing = {
      id: "c1",
      from: "09:00",
      to: "10:00",
      reason: "late start",
    };
    const stub = makeStub([
      {
        setting_date: DATE,
        is_open: true,
        overrides: {
          "09:00": { 0: "blocked", 1: "blocked" },
          "09:30": { 0: "blocked", 1: "blocked" },
        },
        extra_slots: [],
        immediate_slots: [],
        closures: [existing],
      },
    ]);
    setSupabase(stub.client);

    const { result } = renderHook(() => useDaySettings(weekStart));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.removeClosure(DATE, "c1");
    });

    const payload = stub.updates[0];
    expect(payload.closures).toEqual([]);
    expect(payload.overrides).toEqual({});
  });

  it("updateClosureReason changes only the reason", async () => {
    const stub = makeStub([
      {
        setting_date: DATE,
        is_open: true,
        overrides: { "09:00": { 0: "blocked", 1: "blocked" } },
        extra_slots: [],
        immediate_slots: [],
        closures: [{ id: "c1", from: "09:00", to: "09:30", reason: "late start" }],
      },
    ]);
    setSupabase(stub.client);

    const { result } = renderHook(() => useDaySettings(weekStart));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.updateClosureReason(DATE, "c1", "early finish");
    });

    const payload = stub.updates[0];
    expect(payload.closures[0].reason).toBe("early finish");
    expect(payload.overrides).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `fnm exec --using=24 -- npx vitest run src/supabase/hooks/useDaySettings.closures.component.test.jsx`
Expected: FAIL — `result.current.addClosure is not a function`.

- [ ] **Step 4: Carry the column through the hook**

In `src/supabase/hooks/useDaySettings.ts`:

Add the imports:

```ts
import { buildSlotGrid } from "../../engine/slotGrid";
import {
  applyClosure,
  releaseClosure,
  validateClosure,
  sanitiseClosures,
  MAX_REASON_LENGTH,
} from "../../engine/closures";
import type { DaySettings, DayClosure, SlotOverrides } from "../../types/index";
```

Extend `fromRow` (its `Pick` list gains `"closures"`):

```ts
function fromRow(
  row: Pick<DaySettingsRow, "is_open" | "overrides" | "extra_slots" | "immediate_slots" | "closures">,
): WeekDaySetting {
  return {
    isOpen: row.is_open,
    overrides: (row.overrides as Record<string, SlotOverrides> | null) || {},
    extraSlots: (row.extra_slots as string[] | null) || [],
    immediateSlots: row.immediate_slots || [],
    closures: sanitiseClosures(row.closures),
  };
}
```

Extend `buildWeekDefaults`'s per-day object with `closures: []`.

Extend `mergeSetting`:

```ts
    closures: updates.closures ?? current.closures ?? [],
```

Extend `changedColumns`:

```ts
  if (updates.closures !== undefined) columns.closures = next.closures;
```

Extend the `upsert` fallback inside `persistDaySetting` with `closures: next.closures`.

Extend the `prevSetting` fallback literal inside `upsertSetting` with `closures: []`.

- [ ] **Step 5: Add the three mutations**

In `src/supabase/hooks/useDaySettings.ts`, immediately after `toggleImmediateSlot`, add:

```ts
  // ── Partial-day closures ────────────────────────────────────────
  // A closure and the seats it blocks travel as ONE update. Sending them
  // separately would put two writes on the same row in flight at once, and
  // the loser would silently undo the winner — the exact race setOverride's
  // comment describes. Enforcement is the blocks, not the closure record, so
  // they must never disagree.

  const addClosure = useCallback(
    (
      dateStr: string,
      input: { from: string; to: string; reason: string },
    ): Promise<DaySettingResult> => {
      const current = daySettingsRef.current[dateStr];
      const activeSlots = buildSlotGrid(current?.extraSlots || []);
      const check = validateClosure(input, current?.closures || [], activeSlots);
      if (!check.ok) return Promise.resolve({ ok: false, error: check.error });

      const closure: DayClosure = {
        id:
          typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : `closure-${input.from}-${input.to}`,
        from: input.from,
        to: input.to,
        reason: input.reason.trim().slice(0, MAX_REASON_LENGTH),
      };

      return upsertSetting(dateStr, (setting) => {
        const slots = buildSlotGrid(setting.extraSlots || []);
        return {
          closures: [...(setting.closures || []), closure],
          overrides: applyClosure(setting.overrides || {}, closure, slots),
        };
      });
    },
    [upsertSetting],
  );

  const removeClosure = useCallback(
    (dateStr: string, id: string): Promise<DaySettingResult> =>
      upsertSetting(dateStr, (setting) => {
        const closure = (setting.closures || []).find((c) => c.id === id);
        if (!closure) return {};
        const slots = buildSlotGrid(setting.extraSlots || []);
        return {
          closures: (setting.closures || []).filter((c) => c.id !== id),
          overrides: releaseClosure(setting.overrides || {}, closure, slots),
        };
      }),
    [upsertSetting],
  );

  const updateClosureReason = useCallback(
    (dateStr: string, id: string, reason: string): Promise<DaySettingResult> => {
      const trimmed = (reason || "").trim();
      if (!trimmed) {
        return Promise.resolve({
          ok: false,
          error: "Add a reason so the card says what's on.",
        });
      }
      return upsertSetting(dateStr, (setting) => ({
        closures: (setting.closures || []).map((c) =>
          c.id === id ? { ...c, reason: trimmed.slice(0, MAX_REASON_LENGTH) } : c,
        ),
      }));
    },
    [upsertSetting],
  );
```

Add `addClosure`, `removeClosure` and `updateClosureReason` to the hook's returned object, alongside `setOverride` and `toggleImmediateSlot`.

- [ ] **Step 6: Run the test to verify it passes**

Run: `fnm exec --using=24 -- npx vitest run src/supabase/hooks/useDaySettings.closures.component.test.jsx src/supabase/hooks/useDaySettings.component.test.jsx`
Expected: PASS for both files — the pre-existing suite must stay green.

- [ ] **Step 7: Commit**

```bash
git add src/supabase/database.types.ts src/supabase/hooks/useDaySettings.ts src/supabase/hooks/useDaySettings.closures.component.test.jsx
git commit -m "feat(hooks): persist partial-day closures with their blocked seats"
```

---

### Task 4: Offline mirror and action wiring

**Files:**
- Modify: `src/hooks/useOfflineState.ts`
- Modify: `src/hooks/useBookingActions.ts`
- Modify: `src/hooks/useStaffAppData.ts`

**Interfaces:**
- Consumes: the Task 3 mutation signatures.
- Produces: `addClosure(dateStr, input)`, `removeClosure(dateStr, id)`, `updateClosureReason(dateStr, id, reason)` on the object `useStaffAppData` returns, resolved online vs offline exactly like `handleOverride`.

- [ ] **Step 1: Mirror the mutations offline**

In `src/hooks/useOfflineState.ts`, add `closures: []` to `emptyDay`'s return, then add these beside `offlineHandleOverride` (the offline mirrors are synchronous and infallible, like the ones already there):

```ts
  // Offline mirrors of useDaySettings' closure family — the offline preview
  // and the E2E suite drive the same UI, so the shapes have to match.
  const offlineAddClosure = useCallback(
    (
      dateStr: string,
      input: { from: string; to: string; reason: string },
    ): { ok: true } | { ok: false; error: string } => {
      const current = offlineDaySettingsRef.current[dateStr] || emptyDay(currentDateObj);
      const activeSlots = buildSlotGrid(current.extraSlots || []);
      const check = validateClosure(input, current.closures || [], activeSlots);
      if (!check.ok) return { ok: false, error: check.error };

      const closure: DayClosure = {
        id:
          typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : `closure-${input.from}-${input.to}`,
        from: input.from,
        to: input.to,
        reason: input.reason.trim().slice(0, MAX_REASON_LENGTH),
      };

      setOfflineDaySettings((prev) => {
        const setting = prev[dateStr] || emptyDay(currentDateObj);
        const slots = buildSlotGrid(setting.extraSlots || []);
        return {
          ...prev,
          [dateStr]: {
            ...setting,
            closures: [...(setting.closures || []), closure],
            overrides: applyClosure(setting.overrides || {}, closure, slots),
          },
        };
      });
      return { ok: true };
    },
    [currentDateObj],
  );

  const offlineRemoveClosure = useCallback(
    (dateStr: string, id: string): { ok: true } => {
      setOfflineDaySettings((prev) => {
        const setting = prev[dateStr] || emptyDay(currentDateObj);
        const closure = (setting.closures || []).find((c) => c.id === id);
        if (!closure) return prev;
        const slots = buildSlotGrid(setting.extraSlots || []);
        return {
          ...prev,
          [dateStr]: {
            ...setting,
            closures: (setting.closures || []).filter((c) => c.id !== id),
            overrides: releaseClosure(setting.overrides || {}, closure, slots),
          },
        };
      });
      return { ok: true };
    },
    [currentDateObj],
  );

  const offlineUpdateClosureReason = useCallback(
    (dateStr: string, id: string, reason: string): { ok: true } | { ok: false; error: string } => {
      const trimmed = (reason || "").trim();
      if (!trimmed) return { ok: false, error: "Add a reason so the card says what's on." };
      setOfflineDaySettings((prev) => {
        const setting = prev[dateStr] || emptyDay(currentDateObj);
        return {
          ...prev,
          [dateStr]: {
            ...setting,
            closures: (setting.closures || []).map((c) =>
              c.id === id ? { ...c, reason: trimmed.slice(0, MAX_REASON_LENGTH) } : c,
            ),
          },
        };
      });
      return { ok: true };
    },
    [currentDateObj],
  );
```

Import what they need at the top of the file:

```ts
import { buildSlotGrid } from "../engine/slotGrid";
import {
  applyClosure,
  releaseClosure,
  validateClosure,
  MAX_REASON_LENGTH,
} from "../engine/closures";
import type { DayClosure } from "../types/index";
```

`offlineAddClosure` reads the current setting synchronously before the state updater runs, so add a ref beside the existing state if one is not already present:

```ts
  const offlineDaySettingsRef = useRef<Record<string, DaySettings>>({});
  useEffect(() => {
    offlineDaySettingsRef.current = offlineDaySettings;
  }, [offlineDaySettings]);
```

Return all three from the hook, next to `handleOverride`.

- [ ] **Step 2: Resolve online vs offline**

In `src/hooks/useBookingActions.ts`, add the three to the `sb` interface (same result union as `sbSetOverride`):

```ts
  sbAddClosure: (
    dateStr: string,
    input: { from: string; to: string; reason: string },
  ) => Promise<{ ok: true; value: DaySettings } | { ok: false; error: string }>;
  sbRemoveClosure: (
    dateStr: string,
    id: string,
  ) => Promise<{ ok: true; value: DaySettings } | { ok: false; error: string }>;
  sbUpdateClosureReason: (
    dateStr: string,
    id: string,
    reason: string,
  ) => Promise<{ ok: true; value: DaySettings } | { ok: false; error: string }>;
```

and add to the returned object:

```ts
    addClosure: isOnline ? sbAddClosure : offline.addClosure,
    removeClosure: isOnline ? sbRemoveClosure : offline.removeClosure,
    updateClosureReason: isOnline ? sbUpdateClosureReason : offline.updateClosureReason,
```

- [ ] **Step 3: Thread through `useStaffAppData`**

In `src/hooks/useStaffAppData.ts`, destructure the three from `daySettingsApi` alongside `setOverride`, and pass them into the `useBookingActions` call as `sbAddClosure`, `sbRemoveClosure`, `sbUpdateClosureReason`. Add `closures: []` to the `currentSettings` fallback literal so a date with no row still has the field.

- [ ] **Step 4: Typecheck and run the suite**

Run: `fnm exec --using=24 -- npm run typecheck && fnm exec --using=24 -- npm run test`
Expected: PASS. A handful of directory tests fail locally only, from localStorage isolation — that is a known pre-existing condition, not this change.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useOfflineState.ts src/hooks/useBookingActions.ts src/hooks/useStaffAppData.ts
git commit -m "feat(hooks): wire closure mutations through the offline mirror"
```

---

### Task 5: The NEEDS ATTENTION frame

**Files:**
- Create: `src/components/booking/NeedsAttentionFrame.jsx`
- Create: `src/components/booking/NeedsAttentionFrame.component.test.jsx`
- Modify: `src/index.css`

**Interfaces:**
- Consumes: nothing beyond React.
- Produces: `<NeedsAttentionFrame label?: string>{children}</NeedsAttentionFrame>` — wraps any node in a flashing yellow-and-black hazard frame with a `NEEDS ATTENTION` tag. Default `label` is `"Needs attention: booked during a closure"` and is what screen readers hear.

- [ ] **Step 1: Add the keyframes and stripe utility**

Append to the utility layer of `src/index.css` (near the other custom keyframes):

```css
/* Hazard frame for a booking left sitting inside a closure. Deliberately
   loud: staff must not scroll past it. The flash is a border/opacity pulse,
   never a layout change, so the card underneath stays readable and
   draggable. Reduced motion keeps the stripes and drops the pulse. */
@keyframes needs-attention-flash {
  0%, 100% { opacity: 1; }
  50%      { opacity: 0.45; }
}

.needs-attention-stripes {
  background-image: repeating-linear-gradient(
    45deg,
    #111827 0px,
    #111827 10px,
    var(--color-brand-yellow) 10px,
    var(--color-brand-yellow) 20px
  );
}

.needs-attention-pulse {
  animation: needs-attention-flash 1s ease-in-out infinite;
}

@media (prefers-reduced-motion: reduce) {
  .needs-attention-pulse {
    animation: none;
  }
}
```

- [ ] **Step 2: Write the failing component test**

Create `src/components/booking/NeedsAttentionFrame.component.test.jsx`:

```jsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { NeedsAttentionFrame } from "./NeedsAttentionFrame.jsx";

describe("NeedsAttentionFrame", () => {
  it("renders its child", () => {
    render(<NeedsAttentionFrame><p>Bella</p></NeedsAttentionFrame>);
    expect(screen.getByText("Bella")).toBeInTheDocument();
  });

  it("shows the NEEDS ATTENTION tag", () => {
    render(<NeedsAttentionFrame><p>Bella</p></NeedsAttentionFrame>);
    expect(screen.getByText("NEEDS ATTENTION")).toBeInTheDocument();
  });

  it("announces why to assistive tech", () => {
    render(<NeedsAttentionFrame><p>Bella</p></NeedsAttentionFrame>);
    expect(
      screen.getByRole("group", { name: "Needs attention: booked during a closure" }),
    ).toBeInTheDocument();
  });

  it("takes a custom label", () => {
    render(<NeedsAttentionFrame label="Needs attention: clash"><p>x</p></NeedsAttentionFrame>);
    expect(screen.getByRole("group", { name: "Needs attention: clash" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `fnm exec --using=24 -- npx vitest run src/components/booking/NeedsAttentionFrame.component.test.jsx`
Expected: FAIL — cannot resolve `./NeedsAttentionFrame.jsx`.

- [ ] **Step 4: Implement the frame**

Create `src/components/booking/NeedsAttentionFrame.jsx`:

```jsx
// A booking that was already in the diary when staff closed those times.
// It is NOT moved or cancelled automatically — staff decide. So it stays on
// the calendar inside the closure, wrapped in a hazard frame nobody can
// scroll past, and stays draggable so it can be moved to a free slot.
export function NeedsAttentionFrame({
  children,
  label = "Needs attention: booked during a closure",
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="relative rounded-2xl p-[5px] needs-attention-stripes needs-attention-pulse"
    >
      <span
        className="absolute -top-2 left-3 z-10 inline-flex items-center rounded-md bg-brand-yellow px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-slate-900 shadow-sm ring-1 ring-slate-900 pointer-events-none"
        aria-hidden="true"
      >
        NEEDS ATTENTION
      </span>
      <div className="rounded-xl overflow-hidden bg-white">{children}</div>
    </div>
  );
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `fnm exec --using=24 -- npx vitest run src/components/booking/NeedsAttentionFrame.component.test.jsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/index.css src/components/booking/NeedsAttentionFrame.jsx src/components/booking/NeedsAttentionFrame.component.test.jsx
git commit -m "feat(ui): add the NEEDS ATTENTION hazard frame"
```

---

### Task 6: The coral closure card

**Files:**
- Create: `src/components/booking/ClosureCard.jsx`
- Create: `src/components/booking/ClosureCard.component.test.jsx`

**Interfaces:**
- Consumes: `closureLabel`, `closureRangeLabel` from `src/engine/closures`; `NeedsAttentionFrame` from Task 5.
- Produces:

```jsx
<ClosureCard
  closure={DayClosure}
  slots={string[]}            // covered slots, for the "3 slots" count
  onReopen={() => void}       // omit to hide the action
  onEditReason={() => void}   // omit to hide the action
>
  {children}                  // already-wrapped clashing bookings, or nothing
</ClosureCard>
```

- [ ] **Step 1: Write the failing component test**

Create `src/components/booking/ClosureCard.component.test.jsx`:

```jsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ClosureCard } from "./ClosureCard.jsx";

const closure = {
  id: "c1",
  from: "09:00",
  to: "10:30",
  reason: "doctor's appointment",
};
const slots = ["09:00", "09:30", "10:00"];

describe("ClosureCard", () => {
  it("shows the reason verbatim after 'Closed for'", () => {
    render(<ClosureCard closure={closure} slots={slots} />);
    expect(screen.getByText("Closed for doctor's appointment")).toBeInTheDocument();
  });

  it("shows the range and the slot count", () => {
    render(<ClosureCard closure={closure} slots={slots} />);
    expect(screen.getByText(/9:00 – 10:30/)).toBeInTheDocument();
    expect(screen.getByText(/3 slots/)).toBeInTheDocument();
  });

  it("says '1 slot' for a single covered slot", () => {
    render(<ClosureCard closure={{ ...closure, to: "09:30" }} slots={["09:00"]} />);
    expect(screen.getByText(/1 slot(?!s)/)).toBeInTheDocument();
  });

  it("offers reopen and edit from the actions menu", async () => {
    const onReopen = vi.fn();
    const onEditReason = vi.fn();
    render(
      <ClosureCard closure={closure} slots={slots} onReopen={onReopen} onEditReason={onEditReason} />,
    );
    await userEvent.click(screen.getByRole("button", { name: /closure actions/i }));
    await userEvent.click(screen.getByRole("menuitem", { name: /reopen these times/i }));
    expect(onReopen).toHaveBeenCalledTimes(1);
  });

  it("hides the actions trigger when no handlers are given", () => {
    render(<ClosureCard closure={closure} slots={slots} />);
    expect(screen.queryByRole("button", { name: /closure actions/i })).toBeNull();
  });

  it("renders clashing bookings passed as children", () => {
    render(
      <ClosureCard closure={closure} slots={slots}>
        <p>Bella — Full Groom</p>
      </ClosureCard>,
    );
    expect(screen.getByText("Bella — Full Groom")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `fnm exec --using=24 -- npx vitest run src/components/booking/ClosureCard.component.test.jsx`
Expected: FAIL — cannot resolve `./ClosureCard.jsx`.

- [ ] **Step 3: Implement the card**

Create `src/components/booking/ClosureCard.jsx`:

```jsx
import { useState, useRef, useEffect } from "react";
import { DoorClosed, MoreHorizontal, Pencil, Undo2 } from "lucide-react";
import { closureLabel, closureRangeLabel } from "../../engine/closures";

/**
 * One coral card standing in for every slot a partial-day closure covers.
 *
 * Coral because the salon already reads coral as "not happening" (cancelled
 * bookings, the close-day control). Bold white text on a solid coral field so
 * it reads at a glance from across the salon.
 *
 * Bookings that were already in the diary when the closure was saved come in
 * as `children`, each wrapped by the caller in a NeedsAttentionFrame.
 */
export function ClosureCard({ closure, slots = [], onReopen, onEditReason, children }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const wrapRef = useRef(null);
  const hasActions = !!onReopen || !!onEditReason;
  const count = slots.length;

  useEffect(() => {
    if (!menuOpen) return;
    const onDocDown = (e) => {
      if (!wrapRef.current?.contains(e.target)) setMenuOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDocDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  return (
    <div
      ref={wrapRef}
      className="relative h-full rounded-2xl bg-brand-coral text-white shadow-[0_2px_8px_rgba(231,84,108,0.35)] px-4 py-3 flex flex-col gap-2"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 shrink-0 w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
          <DoorClosed size={16} strokeWidth={2.4} aria-hidden="true" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="text-[15px] md:text-base font-extrabold leading-tight break-words">
            {closureLabel(closure)}
          </div>
          <div className="text-[11px] font-semibold text-white/85 tabular-nums mt-0.5">
            {closureRangeLabel(closure)} · {count} {count === 1 ? "slot" : "slots"}
          </div>
        </div>

        {hasActions && (
          <button
            type="button"
            aria-label={`Closure actions for ${closureRangeLabel(closure)}`}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
            className="tap-target shrink-0 w-8 h-8 rounded-full flex items-center justify-center border-none cursor-pointer bg-white/15 text-white hover:bg-white/25 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <MoreHorizontal size={16} strokeWidth={2.4} aria-hidden="true" />
          </button>
        )}
      </div>

      {menuOpen && hasActions && (
        <div
          role="menu"
          aria-label="Closure actions"
          className="absolute right-3 top-12 z-20 w-52 rounded-xl bg-white p-1.5 shadow-[0_12px_28px_rgba(45,0,75,0.35)] flex flex-col"
        >
          {onEditReason && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                onEditReason();
              }}
              className="w-full inline-flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[12px] font-bold text-left cursor-pointer border-none bg-transparent text-brand-purple hover:bg-slate-100 font-[inherit]"
            >
              <Pencil size={13} strokeWidth={2.4} aria-hidden="true" />
              Edit reason
            </button>
          )}
          {onReopen && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                onReopen();
              }}
              className="w-full inline-flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[12px] font-bold text-left cursor-pointer border-none bg-transparent text-brand-coral hover:bg-brand-coral-light font-[inherit]"
            >
              <Undo2 size={13} strokeWidth={2.4} aria-hidden="true" />
              Reopen these times
            </button>
          )}
        </div>
      )}

      {children && <div className="flex flex-col gap-2.5 pt-1">{children}</div>}
    </div>
  );
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `fnm exec --using=24 -- npx vitest run src/components/booking/ClosureCard.component.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/booking/ClosureCard.jsx src/components/booking/ClosureCard.component.test.jsx
git commit -m "feat(ui): add the coral closure card"
```

---

### Task 7: The authoring dialog

**Files:**
- Create: `src/components/modals/CloseTimesDialog.jsx`
- Create: `src/components/modals/CloseTimesDialog.component.test.jsx`

**Interfaces:**
- Consumes: `AccessibleModal` from `src/components/shared/AccessibleModal`; `validateClosure`, `endTimeOptions`, `closureLabel`, `MAX_REASON_LENGTH` from `src/engine/closures`; `Button` from `src/components/ui/index.js`.
- Produces:

```jsx
<CloseTimesDialog
  activeSlots={string[]}
  closures={DayClosure[]}
  bookings={Array<{id, slot, dogName}>}   // non-cancelled bookings for the day
  initialFrom={string}                    // prefilled start slot
  dayLabel={string}                       // e.g. "Monday 21 September"
  onSave={({from, to, reason}) => Promise<{ok: true} | {ok: false, error: string}>}
  onClose={() => void}
/>
```

- [ ] **Step 1: Write the failing component test**

Create `src/components/modals/CloseTimesDialog.component.test.jsx`:

```jsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CloseTimesDialog } from "./CloseTimesDialog.jsx";

const SLOTS = ["08:30", "09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "12:00", "12:30", "13:00"];

function setup(props = {}) {
  const onSave = vi.fn(async () => ({ ok: true }));
  const onClose = vi.fn();
  render(
    <CloseTimesDialog
      activeSlots={SLOTS}
      closures={[]}
      bookings={[]}
      initialFrom="09:00"
      dayLabel="Monday 21 September"
      onSave={onSave}
      onClose={onClose}
      {...props}
    />,
  );
  return { onSave, onClose };
}

describe("CloseTimesDialog", () => {
  it("prefills the start time it was opened with", () => {
    setup();
    expect(screen.getByLabelText(/from/i)).toHaveValue("09:00");
  });

  it("previews the exact card text as the reason is typed", async () => {
    setup();
    await userEvent.type(screen.getByLabelText(/reason/i), "doctor's appointment");
    expect(screen.getByText("Closed for doctor's appointment")).toBeInTheDocument();
  });

  it("fills the reason from a quick chip", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "late start" }));
    expect(screen.getByLabelText(/reason/i)).toHaveValue("late start");
  });

  it("keeps save disabled until a reason is given", async () => {
    setup();
    expect(screen.getByRole("button", { name: /close these times/i })).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/reason/i), "late start");
    expect(screen.getByRole("button", { name: /close these times/i })).toBeEnabled();
  });

  it("saves the chosen range and reason", async () => {
    const { onSave } = setup();
    await userEvent.selectOptions(screen.getByLabelText(/to/i), "10:30");
    await userEvent.type(screen.getByLabelText(/reason/i), "doctor's appointment");
    await userEvent.click(screen.getByRole("button", { name: /close these times/i }));
    expect(onSave).toHaveBeenCalledWith({
      from: "09:00",
      to: "10:30",
      reason: "doctor's appointment",
    });
  });

  it("warns about bookings sitting in the range without blocking the save", async () => {
    const { onSave } = setup({
      bookings: [
        { id: "b1", slot: "09:30", dogName: "Bella" },
        { id: "b2", slot: "10:00", dogName: "Milo" },
      ],
    });
    await userEvent.selectOptions(screen.getByLabelText(/to/i), "10:30");
    await userEvent.type(screen.getByLabelText(/reason/i), "late start");
    expect(screen.getByText(/2 bookings sit in these times/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /close these times/i }));
    expect(onSave).toHaveBeenCalled();
  });

  it("shows the error an overlapping closure produces", async () => {
    setup({
      closures: [{ id: "c1", from: "09:00", to: "10:00", reason: "late start" }],
    });
    await userEvent.type(screen.getByLabelText(/reason/i), "another");
    expect(screen.getByText(/overlap/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /close these times/i })).toBeDisabled();
  });

  it("surfaces a failed save without closing", async () => {
    const onSave = vi.fn(async () => ({ ok: false, error: "Couldn't save change." }));
    const onClose = vi.fn();
    render(
      <CloseTimesDialog
        activeSlots={SLOTS}
        closures={[]}
        bookings={[]}
        initialFrom="09:00"
        dayLabel="Monday 21 September"
        onSave={onSave}
        onClose={onClose}
      />,
    );
    await userEvent.type(screen.getByLabelText(/reason/i), "late start");
    await userEvent.click(screen.getByRole("button", { name: /close these times/i }));
    expect(await screen.findByText("Couldn't save change.")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `fnm exec --using=24 -- npx vitest run src/components/modals/CloseTimesDialog.component.test.jsx`
Expected: FAIL — cannot resolve `./CloseTimesDialog.jsx`.

- [ ] **Step 3: Implement the dialog**

Create `src/components/modals/CloseTimesDialog.jsx`:

```jsx
import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { AccessibleModal } from "../shared/AccessibleModal";
import { Button } from "../ui/index.js";
import {
  validateClosure,
  endTimeOptions,
  closureLabel,
  bookingsInClosure,
  MAX_REASON_LENGTH,
} from "../../engine/closures";

const TITLE_ID = "close-times-title";

// Quick fills for the reasons this is actually used for. They drop straight
// into the reason box so the card reads "Closed for late start" — the wording
// staff asked for, not a reworded version of it.
const QUICK_REASONS = ["doctor's appointment", "late start", "early finish", "appointment"];

function formatTime(slot) {
  const [h, m] = slot.split(":");
  return `${parseInt(h, 10)}:${m}`;
}

/**
 * Close part of a day, in half-hour steps.
 *
 * Reached two ways, both landing here: "Close from here…" on a slot's clock
 * menu (start prefilled to that slot) and "Close part of the day" in the Day
 * settings drawer (start prefilled to the first slot). Whole-day closing stays
 * with the existing Close-this-day flow — this dialog never touches isOpen.
 */
export function CloseTimesDialog({
  activeSlots = [],
  closures = [],
  bookings = [],
  initialFrom,
  dayLabel,
  onSave,
  onClose,
}) {
  const firstSlot = activeSlots[0] || "";
  const [from, setFrom] = useState(
    initialFrom && activeSlots.includes(initialFrom) ? initialFrom : firstSlot,
  );
  const [to, setTo] = useState(() => {
    const options = endTimeOptions(
      initialFrom && activeSlots.includes(initialFrom) ? initialFrom : firstSlot,
      activeSlots,
    );
    return options[0] || "";
  });
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const toOptions = useMemo(() => endTimeOptions(from, activeSlots), [from, activeSlots]);

  // Keep the end time valid when the start moves past it.
  const effectiveTo = toOptions.includes(to) ? to : toOptions[0] || "";

  const candidate = { from, to: effectiveTo, reason };
  const check = useMemo(
    () => validateClosure(candidate, closures, activeSlots),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [from, effectiveTo, reason, closures, activeSlots],
  );

  const covered = useMemo(() => {
    if (!effectiveTo) return [];
    return activeSlots.filter((slot) => slot >= from && slot < effectiveTo);
  }, [activeSlots, from, effectiveTo]);

  const clashes = useMemo(() => {
    if (!effectiveTo) return [];
    return bookingsInClosure(bookings, { id: "", from, to: effectiveTo, reason: "x" }, activeSlots);
  }, [bookings, from, effectiveTo, activeSlots, reason]);

  // The reason is the only thing staff must type, so an untouched form should
  // look calm rather than shouting an error at them.
  const showValidationError = !check.ok && reason.trim().length > 0;
  const overlapError = !check.ok && check.error.includes("overlap") ? check.error : null;

  const handleSave = async () => {
    if (!check.ok || saving) return;
    setSaving(true);
    setSaveError(null);
    const result = await onSave({ from, to: effectiveTo, reason: reason.trim() });
    setSaving(false);
    if (result && result.ok === false) {
      setSaveError(result.error || "Couldn't save change.");
      return;
    }
    onClose?.();
  };

  return (
    <AccessibleModal
      onClose={onClose}
      titleId={TITLE_ID}
      className="bg-white rounded-2xl w-full max-w-md shadow-xl overflow-hidden"
    >
      <header className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-100 bg-[var(--color-brand-paper)]">
        <div>
          <div className="text-label text-ink-muted">Close part of the day</div>
          <h2 id={TITLE_ID} className="text-base font-bold text-brand-purple font-display leading-tight">
            {dayLabel}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="tap-target w-9 h-9 rounded-full flex items-center justify-center border-none cursor-pointer text-slate-500 hover:bg-slate-100 hover:text-brand-purple transition-colors"
        >
          <X size={18} strokeWidth={2.2} aria-hidden="true" />
        </button>
      </header>

      <div className="p-5 flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-label text-ink-muted">From</span>
            <select
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold text-brand-purple bg-white font-[inherit]"
            >
              {activeSlots.map((slot) => (
                <option key={slot} value={slot}>{formatTime(slot)}</option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-label text-ink-muted">To</span>
            <select
              value={effectiveTo}
              onChange={(e) => setTo(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold text-brand-purple bg-white font-[inherit]"
            >
              {toOptions.map((slot) => (
                <option key={slot} value={slot}>{formatTime(slot)}</option>
              ))}
            </select>
          </label>
        </div>

        <p className="text-[11px] text-slate-500 -mt-2">
          {covered.length} {covered.length === 1 ? "slot" : "slots"} will be closed.
        </p>

        <label className="flex flex-col gap-1.5">
          <span className="text-label text-ink-muted">Reason</span>
          <input
            type="text"
            value={reason}
            maxLength={MAX_REASON_LENGTH}
            onChange={(e) => setReason(e.target.value)}
            placeholder="doctor's appointment"
            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-brand-purple bg-white font-[inherit]"
          />
        </label>

        <div className="flex flex-wrap gap-1.5 -mt-1">
          {QUICK_REASONS.map((quick) => (
            <button
              key={quick}
              type="button"
              onClick={() => setReason(quick)}
              className="rounded-full border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-600 bg-white hover:border-brand-yellow hover:bg-brand-yellow/10 cursor-pointer font-[inherit] transition-colors"
            >
              {quick}
            </button>
          ))}
        </div>

        <div className="rounded-xl bg-brand-coral text-white px-3 py-2.5">
          <div className="text-sm font-extrabold leading-tight break-words">
            {closureLabel({ reason: reason.trim() || "…" })}
          </div>
          <div className="text-[11px] font-semibold text-white/85 tabular-nums mt-0.5">
            {formatTime(from)} – {effectiveTo ? formatTime(effectiveTo) : "…"}
          </div>
        </div>

        {clashes.length > 0 && (
          <p className="text-[12px] text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
            {clashes.length} {clashes.length === 1 ? "booking sits" : "bookings sit"} in these
            times. {clashes.length === 1 ? "It'll be flagged" : "They'll be flagged"} NEEDS
            ATTENTION on the calendar until you move or cancel {clashes.length === 1 ? "it" : "them"}.
          </p>
        )}

        {(overlapError || showValidationError) && (
          <p role="alert" className="text-[12px] text-brand-coral-text font-semibold">
            {check.ok ? null : check.error}
          </p>
        )}

        {saveError && (
          <p role="alert" className="text-[12px] text-brand-coral-text font-semibold">
            {saveError}
          </p>
        )}
      </div>

      <footer className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100 bg-slate-50">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={handleSave} disabled={!check.ok || saving}>
          {saving ? "Closing…" : "Close these times"}
        </Button>
      </footer>
    </AccessibleModal>
  );
}
```

Note on the overlap test: `validateClosure` returns the overlap error as soon as the range clashes, but the test types a reason first so `showValidationError` is true. If `Button`'s `disabled` prop is not supported in this codebase, read `src/components/ui/Button.jsx` and use whatever disabling mechanism it exposes rather than inventing one.

- [ ] **Step 4: Run it to verify it passes**

Run: `fnm exec --using=24 -- npx vitest run src/components/modals/CloseTimesDialog.component.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/modals/CloseTimesDialog.jsx src/components/modals/CloseTimesDialog.component.test.jsx
git commit -m "feat(ui): add the close-part-of-the-day dialog"
```

---

### Task 8: Render closures on the calendar

**Files:**
- Modify: `src/components/booking/SlotGrid.jsx`
- Modify: `src/components/booking/SlotRowMenu.jsx`
- Create: `src/components/booking/SlotGrid.closures.component.test.jsx`

**Interfaces:**
- Consumes: `buildCalendarRows`, `bookingsInClosure` from `src/engine/closures`; `ClosureCard`; `NeedsAttentionFrame`.
- Produces: `SlotGrid` accepts three new props — `closures: DayClosure[]`, `onReopenClosure: (closure) => void`, `onEditClosureReason: (closure) => void`, `onCloseFromSlot: (slot) => void`. All optional; omitting them renders the grid exactly as before.

- [ ] **Step 1: Write the failing component test**

Create `src/components/booking/SlotGrid.closures.component.test.jsx`. Read the existing `SlotGrid` component tests in `src/components/booking/` first and match their provider setup (`ToastContext` is required).

```jsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SlotGrid } from "./SlotGrid.jsx";
import { ToastProvider } from "../../contexts/ToastContext.jsx";

const SLOTS = ["08:30", "09:00", "09:30", "10:00", "10:30"];
const closure = { id: "c1", from: "09:00", to: "10:30", reason: "doctor's appointment" };

function renderGrid(props = {}) {
  return render(
    <ToastProvider>
      <SlotGrid
        bookings={[]}
        loading={false}
        activeSlots={SLOTS}
        onOpenNewBooking={vi.fn()}
        currentDateStr="2026-09-21"
        overrides={{}}
        immediateSlots={[]}
        closures={[closure]}
        {...props}
      />
    </ToastProvider>,
  );
}

describe("SlotGrid closures", () => {
  it("collapses the covered slots into one coral card", () => {
    renderGrid();
    expect(screen.getByText("Closed for doctor's appointment")).toBeInTheDocument();
    expect(screen.getAllByText("Closed for doctor's appointment")).toHaveLength(1);
  });

  it("still renders the uncovered slots", () => {
    renderGrid();
    expect(screen.getByText("8:30")).toBeInTheDocument();
    expect(screen.getByText("10:30")).toBeInTheDocument();
  });

  it("flags a booking sitting inside the closure", () => {
    renderGrid({
      bookings: [
        {
          id: "b1",
          slot: "09:30",
          dogName: "Bella",
          size: "small",
          status: "Confirmed",
          service: "Full Groom",
        },
      ],
    });
    expect(screen.getByText("NEEDS ATTENTION")).toBeInTheDocument();
    expect(
      screen.getByRole("group", { name: "Needs attention: booked during a closure" }),
    ).toBeInTheDocument();
  });

  it("does not flag a booking outside the closure", () => {
    renderGrid({
      bookings: [
        {
          id: "b1",
          slot: "10:30",
          dogName: "Milo",
          size: "small",
          status: "Confirmed",
          service: "Full Groom",
        },
      ],
    });
    expect(screen.queryByText("NEEDS ATTENTION")).toBeNull();
  });

  it("renders the plain grid when there are no closures", () => {
    renderGrid({ closures: [] });
    expect(screen.queryByText(/Closed for/)).toBeNull();
    expect(screen.getByText("9:00")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `fnm exec --using=24 -- npx vitest run src/components/booking/SlotGrid.closures.component.test.jsx`
Expected: FAIL — no "Closed for doctor's appointment" in the output.

- [ ] **Step 3: Render closure rows in `SlotGrid`**

In `src/components/booking/SlotGrid.jsx`:

Add the imports:

```jsx
import { ClosureCard } from "./ClosureCard.jsx";
import { NeedsAttentionFrame } from "./NeedsAttentionFrame.jsx";
import { buildCalendarRows, bookingsInClosure } from "../../engine/closures";
```

Add the new props to the signature: `closures = []`, `onReopenClosure`, `onEditClosureReason`, `onCloseFromSlot`.

Replace the `rows` memo so it delegates to the engine:

```jsx
  const rows = useMemo(() => {
    const calendarRows = buildCalendarRows(activeSlots, closures || []);
    const result = calendarRows.map((row) => {
      if (row.type === "closure") return row;
      const slotOverrides = overrides?.[row.slot] || {};
      return {
        ...row,
        seatStates: getSeatStatesForSlot(activeBookings, row.slot, activeSlots, slotOverrides),
      };
    });
    if (result.length > 0) result[result.length - 1].isLast = true;
    return result;
  }, [activeSlots, activeBookings, overrides, closures]);
```

Add a `renderClosure` callback beside `renderSlot`:

```jsx
  // A closure row stands in for every slot it covers: the clock boxes stack
  // down the time gutter so the grid still lines up, and one coral card fills
  // the seat column. Bookings already in the diary when the closure was saved
  // stay visible inside it, hazard-framed — staff decide what happens to them.
  const renderClosure = useCallback((closure, slots, isLast) => {
    const clashes = bookingsInClosure(activeBookings, closure, activeSlots);
    const rowGrid = "grid grid-cols-[64px_1fr] md:grid-cols-[80px_1fr] gap-2 md:gap-3 items-stretch";

    return (
      <div
        key={`closure-${closure.id}`}
        className={[
          "relative flex flex-col gap-1.5 md:gap-2 p-2 md:p-[10px_14px] bg-brand-coral/[0.06]",
          isLast ? "" : "border-b border-[#F1F3F5]",
        ].filter(Boolean).join(" ")}
      >
        <div className={rowGrid}>
          <div className="flex flex-col gap-1.5">
            {slots.map((slot) => (
              <div
                key={slot}
                className="flex-1 min-h-[34px] flex flex-col items-center justify-center rounded-xl border border-brand-coral/30 bg-white/70 px-1 py-1.5"
              >
                <span className="text-[12px] md:text-[13px] font-bold tabular-nums leading-none text-brand-coral-text">
                  {formatSlotLabel(slot)}
                </span>
              </div>
            ))}
          </div>

          <ClosureCard
            closure={closure}
            slots={slots}
            onReopen={onReopenClosure ? () => onReopenClosure(closure) : undefined}
            onEditReason={onEditClosureReason ? () => onEditClosureReason(closure) : undefined}
          >
            {clashes.map((b) => (
              <NeedsAttentionFrame key={b.id}>
                <BookingCardNew
                  booking={b}
                  draggable={!!onMoveBooking}
                  onDragStart={onMoveBooking ? dnd.onCardDragStart : undefined}
                  onDragEnd={onMoveBooking ? dnd.onCardDragEnd : undefined}
                  isBeingDragged={dnd.drag.booking?.id === b.id}
                />
              </NeedsAttentionFrame>
            ))}
          </ClosureCard>
        </div>
      </div>
    );
  }, [activeBookings, activeSlots, onReopenClosure, onEditClosureReason, onMoveBooking, dnd]);
```

Add the shared slot-label helper at module scope, above the component (the same formatting `SlotRowMenu` uses):

```jsx
// 24-hour, no leading zero: "9:00", "13:00". Matches SlotRowMenu's formatSlot.
function formatSlotLabel(slot) {
  const [h, m] = slot.split(":");
  return `${parseInt(h, 10)}:${m}`;
}
```

Update the render to branch on row type:

```jsx
  return (
    <div>
      {rows.map((row) =>
        row.type === "closure"
          ? renderClosure(row.closure, row.slots, row.isLast)
          : renderSlot(row.slot, row.index, row.seatStates, row.isLast),
      )}
    </div>
  );
```

Finally, pass the new menu action into `SlotRowMenu` inside `renderSlot`:

```jsx
          onCloseFromHere={
            onCloseFromSlot ? () => onCloseFromSlot(slot) : undefined
          }
```

- [ ] **Step 4: Add the menu item**

In `src/components/booking/SlotRowMenu.jsx`, accept `onCloseFromHere` in the props, import `DoorClosed` from `lucide-react`, add `const canCloseFrom = !disabled && !!onCloseFromHere;` beside the other capability flags, include it in `hasActions`, and render it after the block items, behind a separator:

```jsx
          {canCloseFrom && (canBook || canOverbook || canBlock) && (
            <div role="separator" className="my-1 h-px bg-white/10" />
          )}
          {canCloseFrom && (
            <MenuItem
              variant="destructive"
              icon={DoorClosed}
              label="Close from here…"
              onClick={() => {
                closeMenu();
                onCloseFromHere();
              }}
            />
          )}
```

Update the component's doc comment to mention the new item.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `fnm exec --using=24 -- npx vitest run src/components/booking/`
Expected: PASS, including every pre-existing SlotGrid and SlotRowMenu test.

- [ ] **Step 6: Commit**

```bash
git add src/components/booking/SlotGrid.jsx src/components/booking/SlotRowMenu.jsx src/components/booking/SlotGrid.closures.component.test.jsx
git commit -m "feat(ui): render partial-day closures on the staff calendar"
```

---

### Task 9: Wire the dashboard

**Files:**
- Modify: `src/components/dashboard/BookingMainPanel.jsx`
- Modify: `src/components/layout/WeekCalendarView.jsx`
- Modify: `src/components/dashboard/DaySettingsDrawer.jsx`

**Interfaces:**
- Consumes: `addClosure`, `removeClosure`, `updateClosureReason` from `useSalon()`/props; `CloseTimesDialog`; `excludeCancelled` from `src/engine/occupancy`.
- Produces: a working end-to-end flow from both entry points.

- [ ] **Step 1: Thread props through `BookingMainPanel`**

Add `closures = []`, `onReopenClosure`, `onEditClosureReason`, `onCloseFromSlot` to the props list and pass all four down to `<SlotGrid>`.

- [ ] **Step 2: Expose the mutations on `SalonContext`**

In `src/contexts/SalonContext.tsx`, add to `SalonContextValue`:

```ts
  addClosure: (
    dateStr: string,
    input: { from: string; to: string; reason: string },
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  removeClosure: (dateStr: string, id: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  updateClosureReason: (
    dateStr: string,
    id: string,
    reason: string,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
```

Accept them in `SalonProvider`'s props, and add them to the memoised `value` object and its dependency array. In `src/App.jsx`, pass the three through from `useStaffAppData` into `<SalonProvider>` alongside `onUpdate`.

- [ ] **Step 3: Handle the flow in `WeekCalendarView`**

Pull `addClosure`, `removeClosure`, `updateClosureReason` out of `useSalon()` beside `onUpdate`. Add the lazy import next to the other lazy modals:

```jsx
const CloseTimesDialog = lazy(() =>
  import("../modals/CloseTimesDialog.jsx").then((module) => ({
    default: module.CloseTimesDialog,
  })),
);
```

Add state and handlers inside the component:

```jsx
  // `null` = closed. `{ from }` = the close-part-of-the-day dialog, prefilled.
  const [closeTimesFrom, setCloseTimesFrom] = useState(null);
  const [editingClosure, setEditingClosure] = useState(null);

  const dayClosures = currentSettings.closures || [];

  const handleSaveClosure = async ({ from, to, reason }) => {
    const result = await addClosure(currentDateStr, { from, to, reason });
    if (result?.ok === false) return result;
    toast.show(`Closed ${from} to ${to}`, "success");
    return { ok: true };
  };

  const handleReopenClosure = async (closure) => {
    const result = await removeClosure(currentDateStr, closure.id);
    if (result?.ok === false) {
      toast.show(result.error || "Couldn't reopen those times", "error");
      return;
    }
    // Undo puts the same closure back, reason and all.
    toast.show("Times reopened", "info", () =>
      addClosure(currentDateStr, {
        from: closure.from,
        to: closure.to,
        reason: closure.reason,
      }),
    );
  };

  const handleEditClosureReason = (closure) => setEditingClosure(closure);
```

Pass the props into `<BookingMainPanel>`:

```jsx
              closures={dayClosures}
              onReopenClosure={handleReopenClosure}
              onEditClosureReason={handleEditClosureReason}
              onCloseFromSlot={(slot) => setCloseTimesFrom(slot)}
```

Render the dialog beside the other lazy modals, inside the existing `<Suspense>` boundary:

```jsx
      {closeTimesFrom !== null && (
        <Suspense fallback={null}>
          <CloseTimesDialog
            activeSlots={activeSlots}
            closures={dayClosures}
            bookings={excludeCancelled(dayBookings || [])}
            initialFrom={closeTimesFrom}
            dayLabel={currentDateObj?.toLocaleDateString("en-GB", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
            onSave={handleSaveClosure}
            onClose={() => setCloseTimesFrom(null)}
          />
        </Suspense>
      )}
```

For **Edit reason**, reuse the existing `ConfirmDialog`-style prompt pattern already imported in this file only if it supports a text input; it does not, so render a minimal inline prompt instead — add this beside the dialog above:

```jsx
      {editingClosure && (
        <Suspense fallback={null}>
          <CloseTimesDialog
            activeSlots={activeSlots}
            closures={dayClosures}
            bookings={excludeCancelled(dayBookings || [])}
            initialFrom={editingClosure.from}
            dayLabel={currentDateObj?.toLocaleDateString("en-GB", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
            onSave={async ({ reason }) => {
              const result = await updateClosureReason(
                currentDateStr,
                editingClosure.id,
                reason,
              );
              if (result?.ok === false) return result;
              toast.show("Reason updated", "success");
              return { ok: true };
            }}
            onClose={() => setEditingClosure(null)}
          />
        </Suspense>
      )}
```

Import `excludeCancelled` at the top if it is not already imported (it is — check before adding a duplicate).

- [ ] **Step 4: Add the drawer button**

In `src/components/dashboard/DaySettingsDrawer.jsx`, accept a new `onCloseTimes` prop, import `Clock` from `lucide-react`, and add a button inside the existing "Status" section, directly beneath the open/close control:

```jsx
            {isOpen && onCloseTimes && (
              <button
                type="button"
                onClick={onCloseTimes}
                className="w-full mt-2 flex items-center gap-3 p-3 rounded-xl border border-slate-200 hover:border-brand-coral/60 cursor-pointer transition-colors bg-white font-[inherit] text-left"
              >
                <span className="w-9 h-9 rounded-full bg-brand-coral-light text-brand-coral flex items-center justify-center shrink-0">
                  <Clock size={16} strokeWidth={2.2} />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-brand-purple">Close part of the day</div>
                  <div className="text-[11px] text-slate-500">
                    A late start or early finish, in half-hour steps
                  </div>
                </div>
              </button>
            )}
```

In `WeekCalendarView`, pass `onCloseTimes` to `<DaySettingsDrawer>`:

```jsx
              onCloseTimes={() => {
                setShowDaySettings(false);
                setCloseTimesFrom(activeSlots[0] || "08:30");
              }}
```

- [ ] **Step 5: Run the full suite and build**

Run: `fnm exec --using=24 -- npm run lint && fnm exec --using=24 -- npm run typecheck && fnm exec --using=24 -- npm run test && fnm exec --using=24 -- npm run build`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/dashboard/BookingMainPanel.jsx src/components/layout/WeekCalendarView.jsx src/components/dashboard/DaySettingsDrawer.jsx src/contexts/SalonContext.tsx src/App.jsx
git commit -m "feat(ui): wire partial-day closures into the dashboard"
```

---

### Task 10: End-to-end proof and documentation

**Files:**
- Create: `e2e/partial-day-closures.spec.ts`
- Create: `docs/partial-day-closures.md`
- Modify: `docs/README.md`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: the finished feature, driven through the offline sample-data build.
- Produces: an executable proof and the canonical written explanation.

- [ ] **Step 1: Write the E2E spec**

Read `e2e/smoke.spec.ts` first for the local conventions (base URL, staff entry path, offline mode). Create `e2e/partial-day-closures.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

// Drives the real staff calendar against offline sample data — no Supabase,
// no customer PII. Proves the round trip: author a closure, see one card
// spanning its slots, reopen it, see the slots come back.
test.describe("partial-day closures", () => {
  test("close an hour and a half, then reopen it", async ({ page }) => {
    await page.goto("/staff");

    // Open the 09:00 slot's actions and start a closure from there.
    await page.getByRole("button", { name: /9:00 — open slot actions/ }).click();
    await page.getByRole("menuitem", { name: "Close from here…" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("To").selectOption("10:30");
    await dialog.getByRole("button", { name: "late start" }).click();
    await dialog.getByRole("button", { name: "Close these times" }).click();

    // One card, spanning three slots.
    const card = page.getByText("Closed for late start");
    await expect(card).toHaveCount(1);
    await expect(page.getByText(/9:00 – 10:30· 3 slots|9:00 – 10:30 · 3 slots/)).toBeVisible();

    // The uncovered slots are untouched.
    await expect(page.getByText("10:30", { exact: true })).toBeVisible();

    // Reopen it.
    await page.getByRole("button", { name: /Closure actions/ }).click();
    await page.getByRole("menuitem", { name: "Reopen these times" }).click();
    await expect(page.getByText("Closed for late start")).toHaveCount(0);
  });
});
```

- [ ] **Step 2: Run the E2E spec**

Run: `fnm exec --using=24 -- npx playwright test e2e/partial-day-closures.spec.ts --project=chromium`
Expected: PASS. In a sandbox, prefix with `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium`. If a selector misses, fix the selector to match what the app actually renders — never weaken the assertion.

- [ ] **Step 3: Write the documentation**

Create `docs/partial-day-closures.md` covering: what a closure is, the inclusive/exclusive rule, that enforcement is the blocked seats and not the record, both entry points, what NEEDS ATTENTION means and that reminders still send for those bookings, the overlap rule, and that reopening clears any single-seat block in the range. Keep it under 80 lines.

Add a bullet to `docs/README.md` beside the `capacity-engine.md` and `today-command-centre.md` entries:

```markdown
- [`partial-day-closures.md`](partial-day-closures.md) — closing part of a day
  (late starts, early finishes) and how it rides on staff seat blocks.
```

Add a bullet to the "Domain rules" section of `CLAUDE.md`, after the same-day booking rule:

```markdown
- **Partial-day closures:** staff close part of a date (late start, early finish) in
  half-hour steps. `day_settings.closures` holds `[{id, from, to, reason}]` (`from`
  inclusive, `to` exclusive) and is **display + authoring only** — saving one also
  blocks both seats on every covered slot in `day_settings.overrides`, and those
  blocks are the enforcement, via the existing `seat_blocked` path. A booking already
  in the range is kept and flagged NEEDS ATTENTION, not moved. See
  [docs/partial-day-closures.md](docs/partial-day-closures.md).
```

- [ ] **Step 4: Run the whole CI bar**

Run: `fnm exec --using=24 -- npm run lint && fnm exec --using=24 -- npm run check:docs && fnm exec --using=24 -- npm run typecheck && fnm exec --using=24 -- npm run check:migrations && fnm exec --using=24 -- npm run test && fnm exec --using=24 -- npm run build`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add e2e/partial-day-closures.spec.ts docs/partial-day-closures.md docs/README.md CLAUDE.md
git commit -m "test+docs: cover partial-day closures end to end"
```

---

## Self-review notes

- **Spec coverage:** column (T1), engine (T2), hook (T3), offline (T4), hazard frame (T5), coral card (T6), dialog (T7), calendar rendering + slot menu (T8), drawer button + wiring (T9), E2E + docs (T10). Every spec section maps to a task.
- **Naming consistency:** `addClosure` / `removeClosure` / `updateClosureReason` are used identically in Tasks 3, 4, 9. `slotsCoveredBy`, `applyClosure`, `releaseClosure`, `buildCalendarRows`, `closureLabel`, `closureRangeLabel`, `bookingsInClosure`, `sanitiseClosures`, `endTimeOptions`, `validateClosure`, `MAX_REASON_LENGTH` are defined in Task 2 and consumed under those exact names everywhere after.
- **Deliberately unchanged:** `validate_booking_calendar`, `validate_booking_capacity`, both capacity engines, `get_blocked_seats` and every availability RPC. A closure's enforcement is the seat blocks it writes.
