# Today View Morning-Brief Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reshape `/today` into the morning-brief look — KPI cards, slot-grouped expandable diary, warm notes, and a read-only next-open-day brief on closed days — without changing any booking behaviour.

**Architecture:** All new logic is pure selectors in `src/engine/today.ts` (grouping, future-day feed) or thin data hooks following the `useRetentionData` pattern. Components re-wire the same handlers that exist today; the closed-day path derives everything from a single `briefDate` + its bookings so today's figures can never leak into the target day's diary.

**Tech Stack:** React 19 + Vite, Tailwind 4 tokens from `src/index.css`, Supabase staff client, Vitest (logic = `*.test.ts` node project, component = `*.component.test.jsx` jsdom project).

**Spec:** `docs/superpowers/specs/2026-07-10-today-brief-design.md` — read it first; its "one-date rule" and "no time-relative state on future days" sections are hard requirements.

## Global Constraints

- Branch: `feat/today-brief-look` (already exists). Never push to `main`.
- Bar: `npm run lint && npm run typecheck && npm run test && npm run build` all pass (check:migrations is untouched — no migrations in this work).
- UK English in all copy. Warm, calm voice ("worth a tidy at cash-up", never corporate).
- No changes to booking rules, capacity engine, write paths, RLS, or DB.
- Unpaid predicate is canonical: a booking owes when `(payment || "Due at Pick-up") !== "Paid in Full"` and `status !== BOOKING_STATUS.CANCELLED`. Never invent `paid_at`.
- Same-owner detection uses the dog's stable `_humanId` (via the `dogs` map), never a name string.
- One-date rule: in closed-day mode every date-specific figure/label derives from `briefDate` + `briefBookings`; nothing on screen reads today's bookings except the "Closed today" banner itself.
- Future-day feed entries carry NO time-relative state: `isLate:false, isNext:false, isUnconfirmed:false, owes:false, needsAction:false, overdueMinutes:0, waitMinutes:null`.
- Existing brand tokens only: `bg-brand-paper` (#FAF9F6 cream), `text-brand-purple`, `bg-brand-yellow`. One new token is added in Task 5 (`--color-brand-paper-line: #ECE7E0`).
- Disclosure a11y: expand toggle is a `<button>` with `aria-expanded` + `aria-controls`; no interactive control nested in another.
- No bare `console` in `src/` (use `src/lib/logger.ts`). No `.js`/`.jsx` extension on imports that resolve to `.ts`/`.tsx`.
- Commit after every task with a conventional message ending `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: Engine selectors — `groupFeedBySlot`, `buildFutureDayFeed`, `countDogsPerOwner`

**Files:**
- Modify: `src/engine/today.ts` (append after `buildTodayFeed`, ~line 696)
- Test: `src/engine/today.test.ts` (append new describe blocks)

**Interfaces:**
- Consumes: existing `TodayFeedEntry`, `buildTodayFeed`, `isCountableBooking`, `statusRank`, `slotToMinutes`, `STAGE_BY_RANK` (private — reuse via `statusRank` mapping as shown).
- Produces:
  - `interface FeedSlotGroup { slot: string | null; label: string; slotMinutes: number; entries: TodayFeedEntry[] }`
  - `groupFeedBySlot(entries: TodayFeedEntry[]): FeedSlotGroup[]`
  - `buildFutureDayFeed(bookings: Booking[]): TodayFeedEntry[]`
  - `countDogsPerOwner(entries: TodayFeedEntry[], dogs: Record<string, Dog> | null): Record<string, number>` (key = owner human id)

- [ ] **Step 1: Write the failing tests**

Append to `src/engine/today.test.ts` (reuse the file's existing booking-fixture helper style; check the top of the file for the local `mk`-style factory and match it):

```ts
describe("groupFeedBySlot", () => {
  const b = (slot?: string, id = slot ?? "x") =>
    ({ id, slot, status: "Booked", dogName: "Rex" }) as unknown as Booking;
  const entryFor = (booking: Booking, slotMinutes: number): TodayFeedEntry => ({
    booking, slotMinutes, stage: "booked", isNext: false, isLate: false,
    isUnconfirmed: false, owes: false, needsAction: false, overdueMinutes: 0, waitMinutes: null,
  });

  it("groups chronological entries by slot, preserving order", () => {
    const groups = groupFeedBySlot([
      entryFor(b("08:30", "a"), 510), entryFor(b("08:30", "b"), 510), entryFor(b("09:00", "c"), 540),
    ]);
    expect(groups.map((g) => g.label)).toEqual(["08:30", "09:00"]);
    expect(groups[0].entries.map((e) => e.booking.id)).toEqual(["a", "b"]);
  });

  it("puts missing or unparseable slots in a final Unscheduled group", () => {
    const bad = entryFor(b(undefined, "no-slot"), Number.POSITIVE_INFINITY);
    const junk = entryFor(b("banana", "junk"), NaN);
    const groups = groupFeedBySlot([entryFor(b("08:30", "a"), 510), bad, junk]);
    expect(groups[groups.length - 1].label).toBe("Unscheduled");
    expect(groups[groups.length - 1].entries.map((e) => e.booking.id)).toEqual(["no-slot", "junk"]);
    expect(groups[groups.length - 1].slot).toBeNull();
  });

  it("returns [] for an empty feed", () => {
    expect(groupFeedBySlot([])).toEqual([]);
  });
});

describe("buildFutureDayFeed", () => {
  it("drops cancelled, sorts by slot, and carries zero time-relative state", () => {
    const feed = buildFutureDayFeed([
      { id: "later", slot: "09:00", status: "Booked", payment: "Due at Pick-up" },
      { id: "gone", slot: "08:30", status: "Cancelled" },
      { id: "first", slot: "08:30", status: "Booked", payment: "Paid in Full" },
    ] as unknown as Booking[]);
    expect(feed.map((e) => e.booking.id)).toEqual(["first", "later"]);
    for (const e of feed) {
      expect(e.isLate).toBe(false);
      expect(e.isNext).toBe(false);
      expect(e.isUnconfirmed).toBe(false);
      expect(e.owes).toBe(false);
      expect(e.needsAction).toBe(false);
      expect(e.overdueMinutes).toBe(0);
      expect(e.waitMinutes).toBeNull();
    }
  });

  it("keeps a slot-less booking (sorts last) rather than hiding it", () => {
    const feed = buildFutureDayFeed([
      { id: "b", status: "Booked" }, { id: "a", slot: "08:30", status: "Booked" },
    ] as unknown as Booking[]);
    expect(feed.map((e) => e.booking.id)).toEqual(["a", "b"]);
  });
});

describe("countDogsPerOwner", () => {
  const dogs = {
    d1: { id: "d1", _humanId: "h1" }, d2: { id: "d2", _humanId: "h1" }, d3: { id: "d3", _humanId: "h2" },
  } as unknown as Record<string, Dog>;
  const e = (dogId: string | null, status = "Booked") => ({
    booking: { id: dogId ?? "x", _dogId: dogId, status } as unknown as Booking,
    slotMinutes: 0, stage: "booked", isNext: false, isLate: false, isUnconfirmed: false,
    owes: false, needsAction: false, overdueMinutes: 0, waitMinutes: null,
  }) as TodayFeedEntry;

  it("counts by stable owner id across entries", () => {
    expect(countDogsPerOwner([e("d1"), e("d2"), e("d3")], dogs)).toEqual({ h1: 2, h2: 1 });
  });

  it("ignores dogs it cannot resolve and never falls back to names", () => {
    expect(countDogsPerOwner([e("d1"), e(null), e("missing")], dogs)).toEqual({ h1: 1 });
  });
});
```

Add `groupFeedBySlot, buildFutureDayFeed, countDogsPerOwner, type FeedSlotGroup` to the file's existing `from "./today"` import, and `type Dog` to its type imports if not present.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/engine/today.test.ts`
Expected: FAIL — `groupFeedBySlot is not a function` (or import error).

- [ ] **Step 3: Implement the selectors**

Append to `src/engine/today.ts` after `buildTodayFeed` (before the "Operational priority" section):

```ts
// ---- Slot-grouped diary (morning-brief layout) --------------------------------

/** One diary group: a slot's entries, or the trailing "Unscheduled" bucket. */
export interface FeedSlotGroup {
  /** The slot time, or null for the Unscheduled bucket. */
  slot: string | null;
  /** Display label — the slot time, or "Unscheduled". */
  label: string;
  /** Minutes-of-day for ordering (Infinity for Unscheduled). */
  slotMinutes: number;
  entries: TodayFeedEntry[];
}

/**
 * Group an already-chronological feed by slot for the brief-style diary.
 * A missing or unparseable slot must never hide a dog: those rows collect
 * in a final "Unscheduled" group instead.
 */
export function groupFeedBySlot(entries: TodayFeedEntry[]): FeedSlotGroup[] {
  const groups: FeedSlotGroup[] = [];
  const index = new Map<string, FeedSlotGroup>();
  const unscheduled: FeedSlotGroup = {
    slot: null, label: "Unscheduled", slotMinutes: Number.POSITIVE_INFINITY, entries: [],
  };
  for (const e of entries) {
    const slot = e.booking.slot;
    if (!slot || !Number.isFinite(slotToMinutes(slot))) {
      unscheduled.entries.push(e);
      continue;
    }
    let g = index.get(slot);
    if (!g) {
      g = { slot, label: slot, slotMinutes: slotToMinutes(slot), entries: [] };
      index.set(slot, g);
      groups.push(g);
    }
    g.entries.push(e);
  }
  groups.sort((a, b) => a.slotMinutes - b.slotMinutes);
  if (unscheduled.entries.length > 0) groups.push(unscheduled);
  return groups;
}

/**
 * Feed entries for a FUTURE day's read-only brief. Built without `now` on
 * purpose: a future diary has no overdue, no waiting, no "next", no owed
 * balance — none of that exists yet, so every time-relative flag is hard
 * zero. (See the spec's "no time-relative state on future days".)
 */
export function buildFutureDayFeed(bookings: Booking[]): TodayFeedEntry[] {
  const entries: TodayFeedEntry[] = [];
  for (const b of bookings) {
    if (!isCountableBooking(b)) continue;
    entries.push({
      booking: b,
      slotMinutes: b.slot && Number.isFinite(slotToMinutes(b.slot))
        ? slotToMinutes(b.slot)
        : Number.POSITIVE_INFINITY,
      stage: STAGE_BY_RANK[Math.max(0, statusRank(b.status))] ?? "booked",
      isNext: false,
      isLate: false,
      isUnconfirmed: false,
      owes: false,
      needsAction: false,
      overdueMinutes: 0,
      waitMinutes: null,
    });
  }
  entries.sort((a, c) => a.slotMinutes - c.slotMinutes);
  return entries;
}

/**
 * Dogs-per-owner across the displayed feed, keyed by the owner's stable
 * human id (via the dogs map). Unresolvable dogs are skipped — the
 * "two dogs, one owner" chip must never match on a display-name string.
 */
export function countDogsPerOwner(
  entries: TodayFeedEntry[],
  dogs: Record<string, Dog> | null,
): Record<string, number> {
  const counts: Record<string, number> = {};
  if (!dogs) return counts;
  for (const e of entries) {
    const dogId = e.booking._dogId;
    const ownerId = dogId ? dogs[dogId]?._humanId : null;
    if (!ownerId) continue;
    counts[ownerId] = (counts[ownerId] ?? 0) + 1;
  }
  return counts;
}
```

Note: `STAGE_BY_RANK` is already defined in this file (~line 619) — no import needed. Owner identity is `_humanId` ONLY: the dogs transform (`src/supabase/transforms.ts` ~line 305) sets `humanId` to the owner's *display name* when the join resolves, so it is NOT a stable identifier — never read it here. A dog with no `_humanId` simply contributes no count (and its row shows no shared-owner chip). If the `Dog` type lacks `_humanId`, extend the type — don't fall back to `humanId`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/engine/today.test.ts`
Expected: PASS (all new + all existing).

- [ ] **Step 5: Typecheck and commit**

```bash
npm run typecheck
git add src/engine/today.ts src/engine/today.test.ts
git commit -m "feat(today): pure selectors for slot-grouped diary and future-day brief"
```

---

### Task 2: `TodayKpiRow` component

**Files:**
- Create: `src/components/views/today/TodayKpiRow.jsx`
- Test: append to `src/components/views/today/parts.component.test.jsx`

**Interfaces:**
- Consumes: `formatMoney` from `./parts.jsx`, `DAY_CAPACITY` from `../../../engine/utilisation`.
- Produces: `<TodayKpiRow dogsBooked={n} expectedRevenue={n} />` — three cards; capacity derives from `dogsBooked / DAY_CAPACITY` internally so it can never disagree with the first card.

- [ ] **Step 1: Write the failing test**

Append to `src/components/views/today/parts.component.test.jsx`:

```jsx
import { TodayKpiRow } from "./TodayKpiRow.jsx";

describe("TodayKpiRow", () => {
  it("shows dogs in, expected revenue and capacity from the same count", () => {
    render(<TodayKpiRow dogsBooked={11} expectedRevenue={478.4} />);
    expect(screen.getByText("Dogs in")).toBeInTheDocument();
    expect(screen.getByText("11")).toBeInTheDocument();
    expect(screen.getByText("£478")).toBeInTheDocument();
    expect(screen.getByText("if all paid")).toBeInTheDocument();
    expect(screen.getByText(/\/ 14/)).toBeInTheDocument();
    const bar = screen.getByRole("progressbar", { name: /capacity/i });
    expect(bar).toHaveAttribute("aria-valuenow", "11");
    expect(bar).toHaveAttribute("aria-valuemax", "14");
  });

  it("caps the bar at 100% when over capacity", () => {
    render(<TodayKpiRow dogsBooked={20} expectedRevenue={0} />);
    const bar = screen.getByRole("progressbar", { name: /capacity/i });
    expect(bar.querySelector("span").style.width).toBe("100%");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/views/today/parts.component.test.jsx`
Expected: FAIL — cannot resolve `./TodayKpiRow.jsx`.

- [ ] **Step 3: Implement**

Create `src/components/views/today/TodayKpiRow.jsx`:

```jsx
// The brief-style KPI row — the day at a glance in three cards: dogs in,
// expected takings if everyone pays, and capacity against the daily dog cap.
// Capacity is derived from the same dogsBooked the first card shows, so the
// two can never disagree.
import { DAY_CAPACITY } from "../../../engine/utilisation";
import { formatMoney } from "./parts.jsx";

function KpiCard({ label, children, hint }) {
  return (
    <div className="rounded-xl border border-brand-paper-line bg-white px-3.5 py-3">
      <p className="text-[12px] text-slate-600">{label}</p>
      <p className="text-[23px] font-extrabold text-brand-purple leading-tight mt-0.5 tabular-nums">{children}</p>
      {hint && <p className="text-[11px] text-slate-500">{hint}</p>}
    </div>
  );
}

export function TodayKpiRow({ dogsBooked, expectedRevenue }) {
  const pct = Math.min(100, Math.round((dogsBooked / DAY_CAPACITY) * 100));
  return (
    <div className="grid grid-cols-3 gap-2.5">
      <KpiCard label="Dogs in">{dogsBooked}</KpiCard>
      <KpiCard label="Expected" hint="if all paid">{formatMoney(expectedRevenue)}</KpiCard>
      <div className="rounded-xl border border-brand-paper-line bg-white px-3.5 py-3">
        <p className="text-[12px] text-slate-600">Capacity</p>
        <p className="text-[23px] font-extrabold text-brand-purple leading-tight mt-0.5 tabular-nums">
          {dogsBooked} <span className="text-[14px] text-slate-500 font-bold">/ {DAY_CAPACITY}</span>
        </p>
        <div
          role="progressbar"
          aria-label="Capacity used"
          aria-valuenow={dogsBooked}
          aria-valuemin={0}
          aria-valuemax={DAY_CAPACITY}
          className="mt-2 h-1.5 rounded-full bg-slate-100 overflow-hidden"
        >
          <span className="block h-full bg-brand-yellow" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  );
}
```

(`border-brand-paper-line` doesn't exist until Task 5 adds the token; Tailwind emits nothing for an unknown token but the tests here assert structure, not colour — this is fine and Task 5 closes it.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/views/today/parts.component.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/views/today/TodayKpiRow.jsx src/components/views/today/parts.component.test.jsx
git commit -m "feat(today): brief-style KPI row (dogs in / expected / capacity bar)"
```

---

### Task 3: Slot-grouped expandable diary (`BookingFeed` rewrite)

**Files:**
- Modify: `src/components/views/today/BookingFeed.jsx` (full rewrite of layout; action logic is MOVED, not changed)
- Modify: `src/components/views/today/today.component.test.jsx` (BookingFeed describe blocks)

**Interfaces:**
- Consumes: `FeedSlotGroup` groups from Task 1; `entryOpStatus` from the engine; `Chip`, `OpStatusChip`, `WelfareChips`, `BookingStatusLine`, `OnTheWayChip`, `PrimaryButton`, `SecondaryButton`, `MarkPaidAction`, `MoreMenu`, `Chevron`, `formatMinutes` from `./parts.jsx`; `DOG_SIZE` from `../../../constants/index` (re-exported from salon constants — verify and use the same import path the file already uses for `BOOKING_STATUS`).
- Produces:
  - `<BookingFeed groups={FeedSlotGroup[]} readOnly={bool} ownerCounts={Record<string,number>} dogs={dogsMap} expandedIds={Set} onToggleExpand={(id)=>void} highlightId {...handlers} />`
  - Each row's toggle button has `id={'today-card-' + b.id + '-toggle'}` and the row container keeps `id={'today-card-' + b.id}` (jump-to relies on both).
  - Handlers prop names are IDENTICAL to today's (`resolve, getWelfare, paymentOf, onTheWaySignals, onMarkArrived, onStartGroom, onMarkReady, onMarkCollected, onSendCollection, onMessageOwner, onMarkPaid, onDidntShow, onOpenBooking, onHideUntilTomorrow`).

- [ ] **Step 1: Rewrite the BookingFeed tests**

In `today.component.test.jsx`, replace the existing `BookingFeed`/`BookingFeedCard` describe blocks. Keep the file's `entry()` helper and `baseHandlers`; add:

```jsx
const dogsMap = { d1: { id: "d1", _humanId: "h1", size: "large" } };

function group(slot, entries) {
  return { slot, label: slot ?? "Unscheduled", slotMinutes: 0, entries };
}

function renderFeed(groups, extra = {}) {
  return render(
    <BookingFeed
      groups={groups}
      dogs={dogsMap}
      ownerCounts={{}}
      expandedIds={new Set()}
      onToggleExpand={noop}
      {...baseHandlers}
      {...extra}
    />,
  );
}

describe("BookingFeed (slot-grouped diary)", () => {
  const booking = { id: "b1", dogName: "Rex", breed: "Poodle", service: "Full Groom", slot: "08:30", status: "Booked", _dogId: "d1", size: "large" };

  it("renders slot headings with the dogs beneath them", () => {
    renderFeed([group("08:30", [entry(booking)]), group("09:00", [entry({ ...booking, id: "b2", dogName: "Bella" })])]);
    expect(screen.getByText("08:30")).toBeInTheDocument();
    expect(screen.getByText("09:00")).toBeInTheDocument();
    expect(screen.getByText("Rex")).toBeInTheDocument();
    expect(screen.getByText("Bella")).toBeInTheDocument();
  });

  it("collapsed row is a disclosure button; actions appear only when expanded", () => {
    const { rerender } = renderFeed([group("08:30", [entry(booking)])]);
    const toggle = screen.getByRole("button", { name: /Rex/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveAttribute("aria-controls", "today-card-b1-detail");
    expect(screen.queryByRole("button", { name: "Mark arrived" })).not.toBeInTheDocument();
    rerender(
      <BookingFeed groups={[group("08:30", [entry(booking)])]} dogs={dogsMap} ownerCounts={{}}
        expandedIds={new Set(["b1"])} onToggleExpand={noop} {...baseHandlers} />,
    );
    expect(screen.getByRole("button", { name: /Rex/ })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "Mark arrived" })).toBeInTheDocument();
  });

  it("no interactive control is nested inside the toggle button", () => {
    renderFeed([group("08:30", [entry(booking, { isLate: true, overdueMinutes: 25 })])], { expandedIds: new Set(["b1"]) });
    const toggle = screen.getByRole("button", { name: /Rex/ });
    expect(toggle.querySelector("button, a, input, select")).toBeNull();
  });

  it("tapping the toggle calls onToggleExpand with the booking id", () => {
    const onToggleExpand = vi.fn();
    renderFeed([group("08:30", [entry(booking)])], { onToggleExpand });
    fireEvent.click(screen.getByRole("button", { name: /Rex/ }));
    expect(onToggleExpand).toHaveBeenCalledWith("b1");
  });

  it("every state-appropriate action still fires from an expanded row", () => {
    const onMarkArrived = vi.fn();
    const onSendCollection = vi.fn();
    renderFeed(
      [group("08:30", [entry(booking), entry({ ...booking, id: "b2", dogName: "Bella", status: "Ready for pick-up" }, { stage: "ready" })])],
      { expandedIds: new Set(["b1", "b2"]), onMarkArrived, onSendCollection },
    );
    fireEvent.click(screen.getByRole("button", { name: "Mark arrived" }));
    expect(onMarkArrived).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Send collection message" }));
    expect(onSendCollection).toHaveBeenCalled();
  });

  it("chips: overdue shows, overflow collapses to +N, dog name never hidden", () => {
    renderFeed([group("08:30", [entry(booking, { isLate: true, overdueMinutes: 25, owes: true, stage: "inSalon" })])], {
      ownerCounts: { h1: 2 },
    });
    // Late + payment due + large dog + two-dogs-one-owner = 4 signals → 2 chips + "+2".
    expect(screen.getByText("Rex")).toBeInTheDocument();
    expect(screen.getByText(/25 min overdue/)).toBeInTheDocument();
    expect(screen.getByText("+2")).toBeInTheDocument();
  });

  it("readOnly mode renders no buttons at all and no time-relative chips", () => {
    renderFeed([group("08:30", [entry(booking)])], { readOnly: true });
    expect(screen.queryAllByRole("button")).toEqual([]);
    expect(screen.queryByText(/overdue/)).not.toBeInTheDocument();
    expect(screen.getByText("Large dog")).toBeInTheDocument();
  });

  it("an Unscheduled group renders its dogs", () => {
    renderFeed([group(null, [entry({ ...booking, id: "b9", slot: undefined })])]);
    expect(screen.getByText("Unscheduled")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify failures**

Run: `npx vitest run src/components/views/today/today.component.test.jsx`
Expected: FAIL — BookingFeed doesn't accept `groups`.

- [ ] **Step 3: Rewrite `BookingFeed.jsx`**

Full new file. The action-assignment block (primary/secondary/moreItems by state) is copied VERBATIM from the current `BookingFeedCard` (lines 81–140 of the old file) — do not redesign it.

```jsx
// The slot-grouped diary — the morning-brief layout. One white card, one
// bordered block per slot: bold time column, compact dog rows. A collapsed
// row is a disclosure button (name + meta only — chips and actions live
// OUTSIDE it, so no control nests inside another); expanding reveals the
// status line, welfare detail and the same contextual action set the old
// cards had. readOnly mode (the closed-day brief) renders no buttons and no
// time-relative chips at all.
import { entryOpStatus } from "../../../engine/today";
import { BOOKING_STATUS, DOG_SIZE } from "../../../constants/index";
import {
  Chip,
  CHIP_TONE_CLASS,
  WelfareChips,
  BookingStatusLine,
  OnTheWayChip,
  PrimaryButton,
  SecondaryButton,
  MarkPaidAction,
  MoreMenu,
  Chevron,
  formatMinutes,
} from "./parts.jsx";
import { useState } from "react";

function lastContact(b) {
  if (!b.reminderSentAt) return "not contacted yet";
  const t = new Date(b.reminderSentAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
  return `reminder sent ${t}`;
}

const MAX_COLLAPSED_CHIPS = 2;

/**
 * Priority-ordered chip list for a collapsed row. Time-relative chips
 * (late/payment/unconfirmed) are engine-decided and NEVER produced in
 * readOnly (future-day) mode — buildFutureDayFeed zeroes the flags, and this
 * guard makes the rule local too.
 */
function collapsedChips({ entry, welfare, isLargeDog, sharedOwner, readOnly }) {
  const chips = [];
  if (!readOnly) {
    const op = entryOpStatus(entry);
    if (op.kind === "overdue") chips.push({ key: "op", label: `${formatMinutes(entry.overdueMinutes)} overdue`, cls: CHIP_TONE_CLASS.coral });
    else if (["paymentDue", "unconfirmed", "readyWaiting"].includes(op.kind)) chips.push({ key: "op", label: op.label, cls: CHIP_TONE_CLASS[op.tone] });
    if (entry.owes && op.kind !== "paymentDue" && entry.stage !== "booked") chips.push({ key: "owes", label: "Payment due", cls: "bg-brand-yellow/25 text-slate-800" });
  }
  if (readOnly && (entry.booking.payment || "") === "Paid in Full") {
    chips.push({ key: "paid", label: "Paid", cls: CHIP_TONE_CLASS.neutral });
  }
  const alerts = (welfare.pregnant ? ["Pregnant"] : []).concat(welfare.alerts || []).filter(Boolean);
  if (alerts.length) chips.push({ key: "welfare", label: alerts.slice(0, 2).join(" · "), cls: "bg-amber-50 text-amber-800" });
  if (isLargeDog) chips.push({ key: "large", label: "Large dog", cls: "bg-cyan-50 text-cyan-800" });
  if (sharedOwner) chips.push({ key: "shared", label: "Two dogs, one owner", cls: CHIP_TONE_CLASS.neutral });
  return chips;
}

function ChipRow({ chips }) {
  if (chips.length === 0) return null;
  const shown = chips.slice(0, MAX_COLLAPSED_CHIPS);
  const hidden = chips.length - shown.length;
  return (
    <div className="flex flex-wrap items-center justify-end gap-1 shrink-0 max-w-[45%] sm:max-w-none">
      {shown.map((c) => (
        <Chip key={c.key} dot className={c.cls}>{c.label}</Chip>
      ))}
      {hidden > 0 && <Chip className={CHIP_TONE_CLASS.muted}>{`+${hidden}`}</Chip>}
    </div>
  );
}

/** The expanded detail + action block — the old card's body, verbatim logic. */
function RowDetail({ entry, welfare, pay, otw, handlers }) {
  const {
    onMarkArrived, onStartGroom, onMarkReady, onMarkCollected, onSendCollection,
    onMessageOwner, onMarkPaid, onDidntShow, onOpenBooking, onHideUntilTomorrow, resolve,
  } = handlers;
  const b = entry.booking;
  const d = resolve(b);
  const [confirming, setConfirming] = useState(false);

  const isReady = entry.stage === "ready";
  const isCollected = entry.stage === "collected";
  const collectionSent = !!b.collectionSentAt;
  const owesNow = entry.owes && entry.stage !== "booked";
  const canHide = entry.stage === "booked" && !entry.owes;

  let primary = null;
  let secondary = null;
  const moreItems = [];
  const messageOwner = { label: "Message owner", onClick: () => onMessageOwner(b) };
  const openBooking = { label: "Open booking", onClick: () => onOpenBooking(b.id) };

  if (entry.isLate) {
    primary = <PrimaryButton onClick={() => onMarkArrived(b)}>Mark arrived</PrimaryButton>;
    secondary = <SecondaryButton onClick={() => onMessageOwner(b)}>Message owner</SecondaryButton>;
    moreItems.push({ label: "Didn't show", onClick: () => onDidntShow(b) }, openBooking);
  } else if (isReady) {
    if (confirming) {
      primary = <PrimaryButton onClick={() => { onMarkCollected(b); setConfirming(false); }}>Confirm collected</PrimaryButton>;
      secondary = <SecondaryButton onClick={() => setConfirming(false)}>Cancel</SecondaryButton>;
    } else if (collectionSent) {
      primary = <PrimaryButton onClick={() => setConfirming(true)}>Mark collected</PrimaryButton>;
      secondary = <SecondaryButton onClick={() => onSendCollection(b)}>Resend message</SecondaryButton>;
    } else {
      primary = <PrimaryButton onClick={() => onSendCollection(b)}>Send collection message</PrimaryButton>;
      secondary = <SecondaryButton onClick={() => setConfirming(true)}>Mark collected</SecondaryButton>;
    }
    moreItems.push(messageOwner, openBooking);
  } else if (entry.stage === "inSalon") {
    if (b.status === BOOKING_STATUS.CHECKED_IN) {
      primary = <PrimaryButton onClick={() => onStartGroom(b)}>Start groom</PrimaryButton>;
      secondary = <SecondaryButton onClick={() => onMarkReady(b)}>Mark ready</SecondaryButton>;
    } else {
      primary = <PrimaryButton onClick={() => onMarkReady(b)}>Mark ready</PrimaryButton>;
    }
    moreItems.push(messageOwner, openBooking);
  } else if (isCollected) {
    if (owesNow) {
      primary = <MarkPaidAction booking={b} onMarkPaid={onMarkPaid} variant="primary" />;
      moreItems.push(messageOwner, openBooking);
    } else {
      secondary = <SecondaryButton onClick={() => onOpenBooking(b.id)}>Open booking</SecondaryButton>;
      moreItems.push(messageOwner);
    }
  } else if (entry.isUnconfirmed) {
    primary = <PrimaryButton onClick={() => onMessageOwner(b)}>Chase confirmation</PrimaryButton>;
    secondary = <SecondaryButton onClick={() => onMarkArrived(b)}>Mark arrived</SecondaryButton>;
    moreItems.push(openBooking);
  } else {
    primary = <PrimaryButton onClick={() => onMarkArrived(b)}>Mark arrived</PrimaryButton>;
    moreItems.push(messageOwner, openBooking);
  }
  if (canHide) moreItems.push({ label: "Hide until tomorrow", onClick: () => onHideUntilTomorrow(b.id) });
  const showMarkPaidSecondary = owesNow && !isCollected;

  return (
    <div className="pt-1.5">
      <BookingStatusLine booking={b} waitMinutes={entry.waitMinutes} pay={pay}>
        {entry.isLate && <span className="font-semibold text-brand-coral-text">{formatMinutes(entry.overdueMinutes)} overdue</span>}
        {entry.isUnconfirmed && <span>· {lastContact(b)}</span>}
        {isReady && b.pickupBy && <span>Pick-up: {b.pickupBy}</span>}
        {otw && <OnTheWayChip signal={otw} />}
        {b.notes && b.notes.trim() && <span className="italic">“{b.notes.trim()}”</span>}
      </BookingStatusLine>
      <WelfareChips alerts={welfare.alerts} pregnant={welfare.pregnant} notes={welfare.notes} />
      <div className="flex items-center gap-2 flex-wrap mt-2.5">
        {primary}
        {secondary}
        {showMarkPaidSecondary && <MarkPaidAction booking={b} onMarkPaid={onMarkPaid} variant="secondary" />}
        {moreItems.length > 0 && (
          <span className="ml-auto">
            <MoreMenu items={moreItems} menuLabel={`More actions for ${d.dogName}`} />
          </span>
        )}
      </div>
    </div>
  );
}

function DiaryRow({ entry, readOnly, expanded, onToggleExpand, highlighted, ownerCounts, dogs, handlers }) {
  const b = entry.booking;
  const d = handlers.resolve(b);
  const welfare = handlers.getWelfare(b);
  const pay = handlers.paymentOf(b);
  const isReadyStage = entry.stage === "ready";
  const otw = !readOnly && isReadyStage && b.whatsappConversationId ? handlers.onTheWaySignals?.[b.whatsappConversationId] : null;
  const muted = !readOnly && entry.stage === "collected" && !entry.owes;

  const dog = b._dogId ? dogs?.[b._dogId] : null;
  const ownerId = dog?._humanId ?? null;
  const sharedOwner = !!ownerId && (ownerCounts?.[ownerId] ?? 0) > 1;
  const isLargeDog = (b.size || dog?.size || "").toLowerCase() === DOG_SIZE.LARGE.toLowerCase();
  const sizeLetter = (b.size || dog?.size || "")?.charAt(0)?.toUpperCase() || null;

  const chips = collapsedChips({ entry, welfare, isLargeDog, sharedOwner, readOnly });

  const summary = (
    <>
      <span className="flex items-center gap-1.5 min-w-0">
        <span className={`font-bold text-[14px] truncate ${muted ? "text-slate-500" : "text-brand-purple"}`}>
          {muted && <span aria-hidden>✓ </span>}
          {d.dogName}
        </span>
        {sizeLetter && (
          <span className="shrink-0 text-[10px] font-bold text-brand-purple-light border border-brand-paper-line rounded px-1">{sizeLetter}</span>
        )}
      </span>
      <span className="block text-[12.5px] text-slate-600 truncate">
        {[d.breed, b.service, d.owner].filter(Boolean).join(" · ")}
      </span>
    </>
  );

  return (
    <div
      id={`today-card-${b.id}`}
      className={`scroll-mt-32 rounded-lg ${highlighted ? "ring-2 ring-brand-teal/50" : ""} ${entry.isNext ? "bg-brand-teal/[0.04]" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        {readOnly ? (
          <div className="min-w-0 flex-1 py-1">{summary}</div>
        ) : (
          <button
            type="button"
            id={`today-card-${b.id}-toggle`}
            aria-expanded={expanded}
            aria-controls={`today-card-${b.id}-detail`}
            onClick={() => onToggleExpand(b.id)}
            className="min-w-0 flex-1 flex items-start justify-between gap-2 text-left min-h-[44px] py-1 rounded-lg hover:bg-slate-50 motion-safe:transition-colors"
          >
            <span className="min-w-0">{summary}</span>
            <Chevron open={expanded} />
          </button>
        )}
        <ChipRow chips={chips} />
      </div>
      {!readOnly && (
        <div id={`today-card-${b.id}-detail`} hidden={!expanded}>
          {expanded && <RowDetail entry={entry} welfare={welfare} pay={pay} otw={otw} handlers={handlers} />}
        </div>
      )}
    </div>
  );
}

export function BookingFeed({
  groups,
  readOnly = false,
  ownerCounts = {},
  dogs = null,
  expandedIds = new Set(),
  onToggleExpand = () => {},
  highlightId = null,
  ...handlers
}) {
  return (
    <section
      className="rounded-2xl border border-brand-paper-line bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)] overflow-hidden"
      aria-label="Diary"
    >
      <div className="px-3 sm:px-4">
        {groups.map((g) => (
          <div key={g.label} className="flex gap-3.5 py-2.5 border-t border-slate-100 first:border-t-0">
            <div className={`shrink-0 w-[52px] pt-1 text-[13px] font-bold tabular-nums ${g.slot ? "text-brand-purple" : "text-slate-500"}`}>
              {g.label}
            </div>
            <div className="min-w-0 flex-1 flex flex-col gap-1.5">
              {g.entries.map((entry) => (
                <DiaryRow
                  key={entry.booking.id}
                  entry={entry}
                  readOnly={readOnly}
                  expanded={expandedIds.has(entry.booking.id)}
                  onToggleExpand={onToggleExpand}
                  highlighted={highlightId === entry.booking.id}
                  ownerCounts={ownerCounts}
                  dogs={dogs}
                  handlers={handlers}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
```

Check `DOG_SIZE` is exported from `../../../constants/index` (it is used in the engine from `constants/salon`; the barrel `constants/index` re-exports — verify with grep, adjust import if not).

- [ ] **Step 4: Run the component tests**

Run: `npx vitest run src/components/views/today/today.component.test.jsx src/components/views/today/parts.component.test.jsx`
Expected: the new BookingFeed tests PASS. Tests for OTHER components must still pass; any old BookingFeedCard-specific tests were replaced in Step 1.

- [ ] **Step 5: Commit**

```bash
git add src/components/views/today/BookingFeed.jsx src/components/views/today/today.component.test.jsx
git commit -m "feat(today): slot-grouped diary with accessible expandable rows"
```

---

### Task 4: Data hooks — `useUnpaidFortnight` and `useNextOpenDayBrief`

**Files:**
- Create: `src/hooks/useUnpaidFortnight.ts`
- Create: `src/hooks/useUnpaidFortnight.test.ts`
- Create: `src/hooks/useNextOpenDayBrief.ts`
- Create: `src/hooks/useNextOpenDayBrief.test.ts`

**Interfaces:**
- Consumes: `supabase` from `../supabase/client.js` (staff client; may be null offline), `BOOKING_STATUS` from `../constants/salon`, `getDefaultOpenForDate` from `../engine/utils`, `logger` from `../lib/logger`.
- Produces:
  - `addDaysStr(dateStr: string, n: number): string` (exported for tests)
  - `fetchUnpaidFortnightCount(client, todayStr, signal): Promise<number>` (exported core)
  - `useUnpaidFortnight(todayStr: string): { loading: boolean; available: boolean; count: number }`
  - `resolveNextOpenDay(todayStr, openByDate: Record<string, boolean|undefined>, lookaheadDays=10): string | null` (pure, exported)
  - `interface BriefBooking { id; slot; service; size; status; payment; addons; priceOverride; dogName; breed; owner; _dogId; _ownerId; _bookingDate }`
  - `useNextOpenDayBrief(todayStr, enabled: boolean): { loading; available; dateStr: string|null; bookings: BriefBooking[]; noOpenDay: boolean; refresh(): void }`

- [ ] **Step 1: Write failing tests for the pure/core parts**

`src/hooks/useUnpaidFortnight.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { addDaysStr, fetchUnpaidFortnightCount } from "./useUnpaidFortnight";

function stubClient(rows: unknown[], error: { message: string } | null = null) {
  const builder: Record<string, unknown> = {};
  for (const m of ["select", "gte", "lt", "neq"]) builder[m] = vi.fn().mockReturnValue(builder);
  (builder as { abortSignal: unknown }).abortSignal = vi.fn().mockResolvedValue({ data: rows, error });
  return { from: vi.fn().mockReturnValue(builder), _builder: builder };
}

describe("addDaysStr", () => {
  it("adds and subtracts across month boundaries", () => {
    expect(addDaysStr("2026-07-10", -14)).toBe("2026-06-26");
    expect(addDaysStr("2026-07-31", 1)).toBe("2026-08-01");
  });
  it("is DST-immune (spring-forward window)", () => {
    expect(addDaysStr("2026-03-29", 1)).toBe("2026-03-30");
  });
});

describe("fetchUnpaidFortnightCount", () => {
  it("counts with the canonical unpaid predicate (missing payment = due)", async () => {
    const client = stubClient([
      { payment: "Paid in Full" },
      { payment: "Due at Pick-up" },
      { payment: "Deposit Paid" },
      { payment: null },
    ]);
    const n = await fetchUnpaidFortnightCount(client as never, "2026-07-10", new AbortController().signal);
    expect(n).toBe(3);
    // Window: [today-14, today), cancelled excluded at the query.
    expect(client._builder.gte).toHaveBeenCalledWith("booking_date", "2026-06-26");
    expect(client._builder.lt).toHaveBeenCalledWith("booking_date", "2026-07-10");
    expect(client._builder.neq).toHaveBeenCalledWith("status", "Cancelled");
  });

  it("throws on query error", async () => {
    const client = stubClient([], { message: "boom" });
    await expect(fetchUnpaidFortnightCount(client as never, "2026-07-10", new AbortController().signal)).rejects.toThrow("boom");
  });
});
```

`src/hooks/useNextOpenDayBrief.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { resolveNextOpenDay } from "./useNextOpenDayBrief";

// 2026-07-10 is a Friday. Defaults: Mon–Wed open (ALL_DAYS), so with no
// overrides the next open day is Monday 2026-07-13.
describe("resolveNextOpenDay", () => {
  it("falls back to the weekday default (Mon–Wed open)", () => {
    expect(resolveNextOpenDay("2026-07-10", {})).toBe("2026-07-13");
  });

  it("a day_settings closed override beats the default and skips onward", () => {
    expect(resolveNextOpenDay("2026-07-10", { "2026-07-13": false })).toBe("2026-07-14");
  });

  it("a day_settings open override beats a closed default", () => {
    // Saturday 11th default-closed, explicitly opened.
    expect(resolveNextOpenDay("2026-07-10", { "2026-07-11": true })).toBe("2026-07-11");
  });

  it("finds a day at the far lookahead boundary", () => {
    const allClosed: Record<string, boolean> = {};
    for (let i = 1; i <= 9; i++) allClosed[`2026-07-${String(10 + i).padStart(2, "0")}`] = false;
    expect(resolveNextOpenDay("2026-07-10", { ...allClosed, "2026-07-20": true })).toBe("2026-07-20");
  });

  it("returns null when nothing is open within the lookahead", () => {
    const allClosed: Record<string, boolean> = {};
    for (let i = 1; i <= 10; i++) {
      const d = new Date(Date.UTC(2026, 6, 10 + i));
      allClosed[d.toISOString().slice(0, 10)] = false;
    }
    expect(resolveNextOpenDay("2026-07-10", allClosed)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failures**

Run: `npx vitest run src/hooks/useUnpaidFortnight.test.ts src/hooks/useNextOpenDayBrief.test.ts`
Expected: FAIL — modules don't exist.

- [ ] **Step 3: Implement both hooks**

`src/hooks/useUnpaidFortnight.ts`:

```ts
// "N grooms in the last fortnight aren't marked paid" — the warm note's one
// number. The unpaid predicate mirrors isPaymentOutstanding exactly
// (payment !== "Paid in Full" on a non-cancelled row; a missing payment
// means "Due at Pick-up"), applied client-side over a two-week window so
// the query and the app can't disagree about what "unpaid" means.
import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "../supabase/client.js";
import { BOOKING_STATUS } from "../constants/salon";
import { logger } from "../lib/logger";

/** Date-string arithmetic in UTC — immune to DST and device timezone. */
export function addDaysStr(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

export async function fetchUnpaidFortnightCount(
  client: SupabaseClient,
  todayStr: string,
  signal: AbortSignal,
): Promise<number> {
  const { data, error } = await client
    .from("bookings")
    .select("payment")
    .gte("booking_date", addDaysStr(todayStr, -14))
    .lt("booking_date", todayStr)
    .neq("status", BOOKING_STATUS.CANCELLED)
    .abortSignal(signal);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<{ payment: string | null }>).filter(
    (b) => (b.payment || "Due at Pick-up") !== "Paid in Full",
  ).length;
}

interface UnpaidFortnight {
  loading: boolean;
  /** false offline or on error — the note simply doesn't render. */
  available: boolean;
  count: number;
}

export function useUnpaidFortnight(todayStr: string): UnpaidFortnight {
  const [state, setState] = useState<UnpaidFortnight>({ loading: true, available: false, count: 0 });

  useEffect(() => {
    if (!supabase) {
      setState({ loading: false, available: false, count: 0 });
      return;
    }
    const controller = new AbortController();
    fetchUnpaidFortnightCount(supabase, todayStr, controller.signal)
      .then((count) => {
        if (!controller.signal.aborted) setState({ loading: false, available: true, count });
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          logger.error("useUnpaidFortnight: failed to count unpaid grooms", err);
          setState({ loading: false, available: false, count: 0 });
        }
      });
    return () => controller.abort();
  }, [todayStr]);

  return state;
}
```

`src/hooks/useNextOpenDayBrief.ts`:

```ts
// Closed-day brief data: resolve the next open day (day_settings override
// first, weekday default second — the same precedence isDateOpen documents)
// and fetch that day's non-cancelled bookings. Self-contained because
// useBookings only loads the current week and the next open day usually
// isn't in it. Read-only: rows carry just what the brief renders.
import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "../supabase/client.js";
import { BOOKING_STATUS } from "../constants/salon";
import { getDefaultOpenForDate } from "../engine/utils";
import { logger } from "../lib/logger";
import { addDaysStr } from "./useUnpaidFortnight";

export const LOOKAHEAD_DAYS = 10;

/**
 * Pure next-open-day resolution. `openByDate` holds explicit day_settings
 * overrides (true/false); an absent key falls back to the weekday default.
 * Searches tomorrow → today+lookahead; null when nothing is open.
 */
export function resolveNextOpenDay(
  todayStr: string,
  openByDate: Record<string, boolean | undefined>,
  lookaheadDays: number = LOOKAHEAD_DAYS,
): string | null {
  for (let i = 1; i <= lookaheadDays; i++) {
    const dateStr = addDaysStr(todayStr, i);
    const [y, m, d] = dateStr.split("-").map(Number);
    const open = openByDate[dateStr] ?? getDefaultOpenForDate(new Date(y, m - 1, d));
    if (open) return dateStr;
  }
  return null;
}

/** The minimal booking shape the read-only brief renders. */
export interface BriefBooking {
  id: string;
  slot?: string;
  service?: string;
  size?: string;
  status?: string;
  payment: string;
  addons: string[] | null;
  priceOverride: number | null;
  dogName: string;
  breed: string;
  owner: string;
  _dogId: string | null;
  _ownerId: null;
  _bookingDate: string;
}

interface DbBriefRow {
  id: string;
  slot: string | null;
  service: string | null;
  size: string | null;
  status: string | null;
  payment: string | null;
  addons: string[] | null;
  price_override: number | null;
  dog_name_snapshot: string | null;
  breed_snapshot: string | null;
  owner_name_snapshot: string | null;
  dog_id: string | null;
  booking_date: string;
}

const BRIEF_COLUMNS =
  "id, slot, service, size, status, payment, addons, price_override, dog_name_snapshot, breed_snapshot, owner_name_snapshot, dog_id, booking_date";

function rowToBriefBooking(row: DbBriefRow): BriefBooking {
  return {
    id: row.id,
    slot: row.slot ?? undefined,
    service: row.service ?? undefined,
    size: row.size ?? undefined,
    status: row.status ?? undefined,
    payment: row.payment || "Due at Pick-up",
    addons: row.addons ?? null,
    priceOverride: row.price_override ?? null,
    // Snapshots are the fallback; resolveBookingDisplay prefers the live
    // dog/owner rows via _dogId, same precedence as the main transform.
    dogName: row.dog_name_snapshot || "",
    breed: row.breed_snapshot || "",
    owner: row.owner_name_snapshot || "",
    _dogId: row.dog_id,
    _ownerId: null,
    _bookingDate: row.booking_date,
  };
}

export async function fetchNextOpenDayBrief(
  client: SupabaseClient,
  todayStr: string,
  signal: AbortSignal,
): Promise<{ dateStr: string | null; bookings: BriefBooking[] }> {
  const { data: dsRows, error: dsError } = await client
    .from("day_settings")
    .select("setting_date, is_open")
    .gt("setting_date", todayStr)
    .lte("setting_date", addDaysStr(todayStr, LOOKAHEAD_DAYS))
    .abortSignal(signal);
  if (dsError) throw new Error(dsError.message);

  const openByDate: Record<string, boolean | undefined> = {};
  for (const r of (dsRows ?? []) as Array<{ setting_date: string; is_open: boolean | null }>) {
    if (r.is_open != null) openByDate[r.setting_date] = r.is_open;
  }
  const dateStr = resolveNextOpenDay(todayStr, openByDate);
  if (!dateStr) return { dateStr: null, bookings: [] };

  const { data: rows, error } = await client
    .from("bookings")
    .select(BRIEF_COLUMNS)
    .eq("booking_date", dateStr)
    .neq("status", BOOKING_STATUS.CANCELLED)
    .order("slot")
    .abortSignal(signal);
  if (error) throw new Error(error.message);
  return { dateStr, bookings: ((rows ?? []) as DbBriefRow[]).map(rowToBriefBooking) };
}

interface NextOpenDayBrief {
  loading: boolean;
  /** false offline or on fetch error — the UI shows "couldn't load", never an asserted-empty diary. */
  available: boolean;
  dateStr: string | null;
  bookings: BriefBooking[];
  /** true when the lookahead found no open day at all. */
  noOpenDay: boolean;
  refresh: () => void;
}

const EMPTY: Omit<NextOpenDayBrief, "refresh"> = {
  loading: true, available: false, dateStr: null, bookings: [], noOpenDay: false,
};

export function useNextOpenDayBrief(todayStr: string, enabled: boolean): NextOpenDayBrief {
  const [state, setState] = useState<Omit<NextOpenDayBrief, "refresh">>(EMPTY);
  const [reloadKey, setReloadKey] = useState(0);
  const refresh = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    if (!enabled) return;
    if (!supabase) {
      // Offline: we can still NAME the next default-open day, but we cannot
      // verify its diary — available:false makes the UI say so honestly.
      setState({ loading: false, available: false, dateStr: resolveNextOpenDay(todayStr, {}), bookings: [], noOpenDay: false });
      return;
    }
    const controller = new AbortController();
    setState((s) => ({ ...s, loading: true }));
    fetchNextOpenDayBrief(supabase, todayStr, controller.signal)
      .then(({ dateStr, bookings }) => {
        if (controller.signal.aborted) return;
        setState({ loading: false, available: true, dateStr, bookings, noOpenDay: dateStr === null });
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        logger.error("useNextOpenDayBrief: failed to load the next open day", err);
        setState({ loading: false, available: false, dateStr: null, bookings: [], noOpenDay: false });
      });
    return () => controller.abort();
  }, [todayStr, enabled, reloadKey]);

  return { ...state, refresh };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/hooks/useUnpaidFortnight.test.ts src/hooks/useNextOpenDayBrief.test.ts`
Expected: PASS.

- [ ] **Step 5: Hook-level offline + abort tests (spec requirement)**

Create `src/hooks/useNextOpenDayBrief.component.test.jsx` (jsdom project — `renderHook` needs it). The client module is mocked so the hook's offline branch and abort-on-unmount are exercised directly:

```jsx
import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mutable mock: null = offline; an object = a stub client.
const clientRef = { current: null };
vi.mock("../supabase/client.js", () => ({
  get supabase() {
    return clientRef.current;
  },
}));

import { useNextOpenDayBrief } from "./useNextOpenDayBrief";
import { useUnpaidFortnight } from "./useUnpaidFortnight";

beforeEach(() => {
  clientRef.current = null;
});

describe("useNextOpenDayBrief (hook)", () => {
  it("offline: reports available:false but still names the default next open day", async () => {
    const { result } = renderHook(() => useNextOpenDayBrief("2026-07-10", true));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.available).toBe(false);
    expect(result.current.dateStr).toBe("2026-07-13"); // Friday → default-open Monday
    expect(result.current.bookings).toEqual([]);
  });

  it("does nothing when not enabled (open day)", () => {
    const { result } = renderHook(() => useNextOpenDayBrief("2026-07-10", false));
    expect(result.current.loading).toBe(true); // initial state, no fetch fired
  });

  it("aborts the in-flight fetch on unmount (no state update after)", async () => {
    let capturedSignal = null;
    const builder = {};
    for (const m of ["select", "gt", "gte", "lt", "lte", "eq", "neq", "order"]) {
      builder[m] = vi.fn().mockReturnValue(builder);
    }
    builder.abortSignal = vi.fn((signal) => {
      capturedSignal = signal;
      return new Promise(() => {}); // never resolves — stays in flight
    });
    clientRef.current = { from: vi.fn().mockReturnValue(builder) };
    const { unmount } = renderHook(() => useNextOpenDayBrief("2026-07-10", true));
    await waitFor(() => expect(capturedSignal).not.toBeNull());
    expect(capturedSignal.aborted).toBe(false);
    unmount();
    expect(capturedSignal.aborted).toBe(true);
  });
});

describe("useUnpaidFortnight (hook)", () => {
  it("offline: available:false, count 0", async () => {
    const { result } = renderHook(() => useUnpaidFortnight("2026-07-10"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current).toEqual({ loading: false, available: false, count: 0 });
  });
});
```

(If the getter-style `vi.mock` fights the module's static `import { supabase }`, hoist to `vi.mock("../supabase/client.js", () => ({ supabase: null }))` for the offline tests and a separate `vi.doMock` + dynamic-import block for the abort test — the assertions stay identical.)

Run: `npx vitest run src/hooks/useNextOpenDayBrief.component.test.jsx`
Expected: PASS.

- [ ] **Step 6: Typecheck and commit**

```bash
npm run typecheck
git add src/hooks/useUnpaidFortnight.ts src/hooks/useUnpaidFortnight.test.ts src/hooks/useNextOpenDayBrief.ts src/hooks/useNextOpenDayBrief.test.ts src/hooks/useNextOpenDayBrief.component.test.jsx
git commit -m "feat(today): unpaid-fortnight and next-open-day data hooks"
```

---

### Task 5: Warm notes component + brand token

**Files:**
- Create: `src/components/views/today/TodayBriefNotes.jsx`
- Modify: `src/index.css` (one token, in the `@theme` block next to `--color-brand-paper`, ~line 115)
- Test: append to `src/components/views/today/parts.component.test.jsx`

**Interfaces:**
- Consumes: `useUnpaidFortnight(todayStr)` and `useRetentionData()` (existing hook — `{ loading, available, overdueCount }`).
- Produces: `<TodayBriefNotes todayStr={string} onOpenReports={fn} />` — renders zero, one or two note buttons; renders `null` while nothing is available.

- [ ] **Step 1: Add the border token**

In `src/index.css`, directly under `--color-brand-paper: #FAF9F6;` add:

```css
  --color-brand-paper-line: #ECE7E0; /* warm card border on the paper surface */
```

- [ ] **Step 2: Write the failing component test**

The notes component calls two data hooks, so mock the hook modules — this keeps the test a pure render test. Append to `parts.component.test.jsx`:

```jsx
import { TodayBriefNotes } from "./TodayBriefNotes.jsx";
import * as unpaidHook from "../../../hooks/useUnpaidFortnight";
import * as retentionHook from "../../../hooks/useRetentionData";

describe("TodayBriefNotes", () => {
  it("renders both warm notes when data is available and taps through to reports", () => {
    vi.spyOn(unpaidHook, "useUnpaidFortnight").mockReturnValue({ loading: false, available: true, count: 3 });
    vi.spyOn(retentionHook, "useRetentionData").mockReturnValue({
      loading: false, available: true, overdueCount: 5, candidates: [], excludedCount: 0, refresh: noop, mark: noop,
    });
    const onOpenReports = vi.fn();
    render(<TodayBriefNotes todayStr="2026-07-10" onOpenReports={onOpenReports} />);
    expect(screen.getByText(/3 grooms in the last fortnight aren't marked paid/)).toBeInTheDocument();
    expect(screen.getByText(/5 dogs due back with no booking/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /marked paid/ }));
    expect(onOpenReports).toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it("renders nothing when neither source is available (offline)", () => {
    vi.spyOn(unpaidHook, "useUnpaidFortnight").mockReturnValue({ loading: false, available: false, count: 0 });
    vi.spyOn(retentionHook, "useRetentionData").mockReturnValue({
      loading: false, available: false, overdueCount: 0, candidates: [], excludedCount: 0, refresh: noop, mark: noop,
    });
    const { container } = render(<TodayBriefNotes todayStr="2026-07-10" onOpenReports={noop} />);
    expect(container).toBeEmptyDOMElement();
    vi.restoreAllMocks();
  });

  it("hides a zero-count note rather than saying zero", () => {
    vi.spyOn(unpaidHook, "useUnpaidFortnight").mockReturnValue({ loading: false, available: true, count: 0 });
    vi.spyOn(retentionHook, "useRetentionData").mockReturnValue({
      loading: false, available: true, overdueCount: 0, candidates: [], excludedCount: 0, refresh: noop, mark: noop,
    });
    const { container } = render(<TodayBriefNotes todayStr="2026-07-10" onOpenReports={noop} />);
    expect(container).toBeEmptyDOMElement();
    vi.restoreAllMocks();
  });
});
```

(If `vi.spyOn` on the ESM module namespace fails under the project's Vitest config, switch to `vi.mock("../../../hooks/useUnpaidFortnight", ...)` + `vi.mocked` per-test return values — same assertions.)

- [ ] **Step 3: Run to verify failure, then implement**

Run: `npx vitest run src/components/views/today/parts.component.test.jsx` → FAIL (module missing).

Create `src/components/views/today/TodayBriefNotes.jsx`:

```jsx
// The brief's warm notes — the two "worth knowing" lines under the diary.
// Each note renders ONLY when its data source is genuinely available and
// non-zero (offline or errored sources say nothing rather than guessing),
// and taps through to the reports page where the full story lives.
import { useUnpaidFortnight } from "../../../hooks/useUnpaidFortnight";
import { useRetentionData } from "../../../hooks/useRetentionData";

function Note({ tone, onClick, children }) {
  const toneClass =
    tone === "amber"
      ? "bg-amber-50 text-amber-800 border-amber-400"
      : "bg-white text-slate-700 border-brand-paper-line";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left rounded-xl border-l-4 border border-brand-paper-line px-3.5 py-2.5 text-[13px] leading-relaxed min-h-[44px] hover:brightness-[0.98] motion-safe:transition ${toneClass}`}
    >
      {children}
    </button>
  );
}

export function TodayBriefNotes({ todayStr, onOpenReports }) {
  const unpaid = useUnpaidFortnight(todayStr);
  const retention = useRetentionData();

  const showUnpaid = unpaid.available && unpaid.count > 0;
  const showDueBack = retention.available && retention.overdueCount > 0;
  if (!showUnpaid && !showDueBack) return null;

  return (
    <div className="flex flex-col gap-2">
      {showUnpaid && (
        <Note tone="amber" onClick={onOpenReports}>
          {unpaid.count} {unpaid.count === 1 ? "groom" : "grooms"} in the last fortnight{" "}
          {unpaid.count === 1 ? "isn't" : "aren't"} marked paid — worth a tidy at cash-up.
        </Note>
      )}
      {showDueBack && (
        <Note tone="calm" onClick={onOpenReports}>
          {retention.overdueCount} {retention.overdueCount === 1 ? "dog is" : "dogs are"} due back with no
          booking — the retention report has the list.
        </Note>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/views/today/parts.component.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/views/today/TodayBriefNotes.jsx src/index.css src/components/views/today/parts.component.test.jsx
git commit -m "feat(today): warm brief notes (unpaid fortnight, dogs due back) + paper-line token"
```

---

### Task 6: TodayView orchestration — brief styling, expansion state, closed-day mode

**Files:**
- Modify: `src/components/views/TodayView.jsx`
- Modify: `src/components/views/today/TodayHeader.jsx` (brief-mode line)
- Modify: `src/components/views/today/TodayNowStrip.jsx` (one class: sticky wrapper `bg-slate-50` → `bg-brand-paper`)
- Modify: `src/components/views/today/TodaySummaryStrip.jsx` (remove the expected-revenue paragraph)
- Test: `src/components/views/today/today.component.test.jsx`

**Interfaces:**
- Consumes: everything produced by Tasks 1–5; `useNextOpenDayBrief(todayStr, !isDayOpen)`; `buildFutureDayFeed`, `groupFeedBySlot`, `countDogsPerOwner` from the engine; `buildDaySummary` (existing).
- Produces: the final page. TodayView owns `expandedIds` (a `Set` in state) and passes `onToggleExpand`; `onJumpTo(id)` expands + scrolls + highlights + focuses `today-card-${id}-toggle`.

- [ ] **Step 1: Write the failing closed-day component tests**

`TodayView` takes many props, so test the closed-day pieces at the component level where they live, plus one orchestration test. Append to `today.component.test.jsx`:

```jsx
import { ClosedDayBrief } from "../TodayView.jsx";

describe("ClosedDayBrief", () => {
  const dogs = { d1: { id: "d1", _humanId: "h1", size: "small" } };
  const briefBookings = [
    { id: "m1", slot: "08:30", service: "Full Groom", size: "small", status: "Booked", payment: "Due at Pick-up", addons: null, priceOverride: null, dogName: "Rex", breed: "Poodle", owner: "Sam", _dogId: "d1", _bookingDate: "2026-07-13" },
  ];
  const resolve = (b) => ({ dogName: b.dogName, breed: b.breed, owner: b.owner });
  const getWelfare = () => ({ alerts: [], pregnant: false, notes: "" });
  const paymentOf = () => ({ kind: "due", label: "Balance due", amountDue: 42, depositPaid: 0, subtotal: 42 });

  const base = {
    brief: { loading: false, available: true, dateStr: "2026-07-13", bookings: briefBookings, noOpenDay: false, refresh: noop },
    dogs, resolve, getWelfare, paymentOf,
  };

  it("shows the banner, the target-day KPIs and a read-only diary", () => {
    render(<ClosedDayBrief {...base} />);
    expect(screen.getByText(/Closed today/)).toBeInTheDocument();
    expect(screen.getByText(/Monday 13 July/)).toBeInTheDocument();
    // KPI count comes from the TARGET day's bookings (one dog), never today's.
    expect(screen.getByText("Dogs in").parentElement).toHaveTextContent("1");
    expect(screen.getByText("Rex")).toBeInTheDocument();
    // Read-only: no action buttons, no time-relative chips.
    expect(screen.queryByRole("button", { name: "Mark arrived" })).not.toBeInTheDocument();
    expect(screen.queryByText("Late")).not.toBeInTheDocument();
  });

  it("says the diary could not be loaded (with retry) instead of asserting empty", () => {
    const refresh = vi.fn();
    render(<ClosedDayBrief {...base} brief={{ ...base.brief, available: false, dateStr: null, bookings: [], refresh }} />);
    expect(screen.getByText(/Couldn't load the diary/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(refresh).toHaveBeenCalled();
  });

  it("states plainly when no open day exists in the lookahead", () => {
    render(<ClosedDayBrief {...base} brief={{ ...base.brief, dateStr: null, bookings: [], noOpenDay: true }} />);
    expect(screen.getByText(/No open days in the next ten days/)).toBeInTheDocument();
  });

  it("shows the calm empty state for a verified-empty open day", () => {
    render(<ClosedDayBrief {...base} brief={{ ...base.brief, bookings: [] }} />);
    expect(screen.getByText(/Nothing booked in yet/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/components/views/today/today.component.test.jsx`
Expected: FAIL — `ClosedDayBrief` is not exported.

- [ ] **Step 3: Implement the TodayView changes**

All edits to `src/components/views/TodayView.jsx`:

**(a) New imports:**

```jsx
import { buildFutureDayFeed, groupFeedBySlot, countDogsPerOwner } from "../../engine/today";
import { useNextOpenDayBrief } from "../../hooks/useNextOpenDayBrief";
import { TodayKpiRow } from "./today/TodayKpiRow.jsx";
import { TodayBriefNotes } from "./today/TodayBriefNotes.jsx";
```

(add the engine names to the existing `from "../../engine/today"` import.)

**(b) Exported `ClosedDayBrief` component** (in the same file, above `TodayView` — it's page-specific, not a shared part). Everything inside derives from `brief.dateStr` + `brief.bookings` ONLY — the one-date rule:

```jsx
/** Pretty "Monday 13 July" from a YYYY-MM-DD, without touching Date.now(). */
function prettyDate(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
}

/**
 * The closed-day, read-only brief for the next open day. One-date rule:
 * every figure and label below derives from brief.dateStr + brief.bookings;
 * nothing here may read today's bookings or the live clock.
 */
export function ClosedDayBrief({ brief, dogs, resolve, getWelfare, paymentOf, onOpenCalendar }) {
  const feed = useMemo(() => buildFutureDayFeed(brief.bookings), [brief.bookings]);
  const groups = useMemo(() => groupFeedBySlot(feed), [feed]);
  const ownerCounts = useMemo(() => countDogsPerOwner(feed, dogs), [feed, dogs]);
  const summary = useMemo(() => buildDaySummary(brief.bookings, dogs), [brief.bookings, dogs]);

  const banner = (
    <div className="rounded-xl bg-brand-purple/[0.06] text-brand-purple px-3.5 py-2.5 text-[13px] font-semibold flex items-center justify-between gap-2 flex-wrap">
      <span>Closed today — here's your next open day{brief.dateStr ? `: ${prettyDate(brief.dateStr)}` : ""}.</span>
      {onOpenCalendar && (
        <button type="button" onClick={onOpenCalendar} className="min-h-[44px] px-1 font-bold underline underline-offset-2">
          Open the calendar
        </button>
      )}
    </div>
  );

  if (brief.loading) return <>{banner}<SectionSkeleton /></>;

  if (!brief.available) {
    return (
      <>
        {banner}
        <div className="rounded-2xl border border-brand-paper-line bg-white px-6 py-8 text-center">
          <p className="text-[14px] font-bold text-slate-700">
            Couldn't load the diary{brief.dateStr ? ` for ${prettyDate(brief.dateStr)}` : ""}.
          </p>
          <button type="button" onClick={brief.refresh} className="mt-2 min-h-[44px] px-4 text-[13px] font-bold text-brand-purple underline underline-offset-2">
            Try again
          </button>
        </div>
      </>
    );
  }

  if (brief.noOpenDay) {
    return (
      <>
        {banner}
        <div className="rounded-2xl border border-brand-paper-line bg-white px-6 py-8 text-center">
          <p className="text-[14px] font-bold text-slate-700">No open days in the next ten days.</p>
        </div>
      </>
    );
  }

  return (
    <>
      {banner}
      <TodayKpiRow dogsBooked={summary.dogsBooked} expectedRevenue={summary.expectedRevenue} />
      {brief.bookings.length === 0 ? (
        <div className="rounded-2xl border border-brand-paper-line bg-white px-6 py-8 text-center">
          <p className="text-[14px] font-bold text-slate-700">Nothing booked in yet for {prettyDate(brief.dateStr)}.</p>
        </div>
      ) : (
        <BookingFeed
          groups={groups}
          readOnly
          ownerCounts={ownerCounts}
          dogs={dogs}
          resolve={resolve}
          getWelfare={getWelfare}
          paymentOf={paymentOf}
        />
      )}
    </>
  );
}
```

**(c) Inside `TodayView`:**

1. `const brief = useNextOpenDayBrief(todayStr, !isDayOpen);` — place after `isDayOpen` is computed (move the `const isDayOpen = ...` line up with the other date derivations, before the engine selectors).
2. Expansion state + jump-to (replace the existing `onJumpTo`):

```jsx
const [expandedIds, setExpandedIds] = useState(() => new Set());
const onToggleExpand = useCallback((id) => {
  setExpandedIds((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
}, []);

const onJumpTo = useCallback((id) => {
  setExpandedIds((prev) => new Set(prev).add(id));
  // Scroll + focus after the expanded row has rendered.
  requestAnimationFrame(() => {
    const el = document.getElementById(`today-card-${id}`);
    if (!el) return;
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    el.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
    document.getElementById(`today-card-${id}-toggle`)?.focus({ preventScroll: true });
  });
  setHighlightId(id);
  clearTimeout(highlightTimer.current);
  highlightTimer.current = setTimeout(() => setHighlightId(null), 1600);
}, []);
```

3. Diary derivations next to the existing feed memos:

```jsx
const groups = useMemo(() => groupFeedBySlot(visibleFeed), [visibleFeed]);
const ownerCounts = useMemo(() => countDogsPerOwner(visibleFeed, dogs), [visibleFeed, dogs]);
```

4. Notes lazy-mount flag:

```jsx
const [notesReady, setNotesReady] = useState(false);
useEffect(() => setNotesReady(true), []);
const onOpenReports = useCallback(() => navigate("/reports"), [navigate]);
```

5. Render: page container gains the paper background — change the root div to
   `className="min-h-full bg-brand-paper"` wrapping the existing `max-w-3xl` container (keep inner classes; the shell behind is what shows through, so apply `bg-brand-paper` on the OUTER wrapper and check against the app shell that no slate band remains).
6. Open-day render order: `TodayHeader` → error banner (unchanged) → skeleton/empty (unchanged copy) → `TodayKpiRow` (from `summary`) → `TodayNowStrip` (unchanged props) → `BookingFeed groups={groups} ownerCounts={ownerCounts} dogs={dogs} expandedIds={expandedIds} onToggleExpand={onToggleExpand} highlightId={highlightId} {...feedHandlers}` → `TodaySummaryStrip` → `{notesReady && <TodayBriefNotes todayStr={todayStr} onOpenReports={onOpenReports} />}` → offline note.
7. Closed-day render: when `!isDayOpen`, render `TodayHeader` with `briefMode` (below) and then `<ClosedDayBrief brief={brief} dogs={dogs} resolve={resolve} getWelfare={getWelfare} paymentOf={paymentOf} onOpenCalendar={() => navigate("/")} />` followed by `{notesReady && <TodayBriefNotes …/>}` — the Now strip, availability modal button behaviour (already hidden via `isDayOpen`), summary strip and per-day hides don't render. (The calendar link goes to `/` — the week view; deep-linking a specific future week isn't URL-addressable today and is out of scope.)

**(d) `TodayHeader.jsx`:** add a `briefMode` prop. When true, suppress the dogs-booked / need-action / unpaid segments (they are today-relative; the KPI row inside `ClosedDayBrief` carries the target day's figures) — render just the h1 + `dateLabel` (today's date) + the existing "salon closed" marker. Keep all existing behaviour when `briefMode` is falsy:

```jsx
{!briefMode && (<>
  <span aria-hidden>·</span>
  <span>{dogsLabel}</span>
  … (existing actionCount / unpaidTotal block)
</>)}
```

**(e) `TodaySummaryStrip.jsx`:** delete the `<p>` block that renders `expectedRevenue` (lines 32–40). Keep the collected-of-total header line and everything else.

**(f) `TodayNowStrip.jsx`:** in the sticky wrapper class string, change `bg-slate-50` → `bg-brand-paper`.

**(g) Card borders:** in `BookingFeed.jsx` (done in Task 3), `TodayKpiRow.jsx` (Task 2) and the empty/error states the border is already `border-brand-paper-line`. Also update the `SectionSkeleton`, empty-day card and error banner containers in `TodayView.jsx` from `border-slate-200` to `border-brand-paper-line`.

- [ ] **Step 4: Update stale tests, run the full component suite**

- In `today.component.test.jsx`, update `TodaySummaryStrip` tests that assert the expected-revenue line (remove those assertions) and any `TodayHeader` test additions for `briefMode` (add one: renders no "dogs booked" text when `briefMode` is set).
- Run: `npx vitest run src/components/views/today/`
Expected: PASS.

- [ ] **Step 5: Full bar + visual check + commit**

```bash
npm run lint && npm run typecheck && npm run test && npm run build
```
Expected: all pass. Then visual check on the offline preview (launch config `offline`, port 5174 — renders the real staff UI with sample data, no PII): open `/today`, confirm cream page, KPI row, slot-grouped diary, expand/collapse, and (by stubbing `isDayOpen` mentally — sample data day may be open) no layout breakage at 375px width.

```bash
git add -A
git commit -m "feat(today): morning-brief layout — KPI row, expandable diary, warm notes, closed-day brief"
```

---

### Task 7: Final review pass and PR

**Files:** none new.

- [ ] **Step 1: Spec compliance sweep**

Re-read `docs/superpowers/specs/2026-07-10-today-brief-design.md` section by section against the diff (`git diff main...HEAD`). Confirm explicitly:
- one-date rule holds (grep the closed-day path for `todayStr` / `summary` usage — `ClosedDayBrief` must receive neither),
- future-day rows carry no time state (Task 1 test),
- offline closed-day says "couldn't load" (Task 6 test),
- unpaid predicate matches `isPaymentOutstanding` (Task 4 test),
- Unscheduled group exists (Task 1 + Task 3 tests),
- disclosure a11y + jump-to focus (Task 3 tests + Task 6 impl),
- chip overflow "+N" (Task 3 test).

- [ ] **Step 2: Run the full CI bar one last time**

Run: `npm run lint && npm run typecheck && npm run check:migrations && npm run test && npm run build`
Expected: all pass.

- [ ] **Step 3: Push and open the PR**

```bash
git push -u origin feat/today-brief-look
gh pr create --title "feat(today): morning-brief redesign — KPI row, slot diary, warm notes, closed-day brief" --body "$(cat <<'EOF'
Reshapes /today into the morning-brief look while keeping every operational behaviour.

- Brief styling: cream page, purple headings, yellow capacity bar (existing tokens + one new border token)
- Three-card KPI row (dogs in / expected / capacity vs the 14-dog cap)
- Slot-grouped diary with accessible expandable rows — same engine-driven actions, one tap deeper
- Warm notes: unpaid grooms last fortnight + dogs due back (reuses the retention hook)
- Closed days now show a READ-ONLY brief of the next open day (new lookahead hook; one-date rule enforced by construction + tests)
- No engine-rule, DB, RLS or write-path changes; no migrations

Spec: docs/superpowers/specs/2026-07-10-today-brief-design.md

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR opens against `main`. Do NOT merge — Bleep reviews first (main auto-deploys to production).
