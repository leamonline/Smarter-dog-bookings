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

/** The latest active slot in minutes, or -1 when the day has no slots at all. */
function lastSlotMinutes(activeSlots: readonly string[]): number {
  return (activeSlots || [])
    .map(toMinutes)
    .reduce<number>((max, mins) => (mins !== null && mins > max ? mins : max), -1);
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

  const lastSlotMins = lastSlotMinutes(activeSlots);
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
 *
 * Pass `activeSlots` to also drop a closure that covers nothing on that day's
 * grid (an old closure over an extra slot staff have since removed); leave it
 * out to sanitise the shape alone, which is what the read path does.
 */
export function sanitiseClosures(
  value: unknown,
  activeSlots?: readonly string[],
): DayClosure[] {
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
    const closure: DayClosure = {
      id: entry.id,
      from: entry.from,
      to: entry.to,
      reason: reason.slice(0, MAX_REASON_LENGTH),
    };
    if (activeSlots && slotsCoveredBy(closure, activeSlots).length === 0) continue;
    out.push(closure);
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
  const lastSlotMins = lastSlotMinutes(activeSlots);
  if (lastSlotMins < 0) return [];
  const options: string[] = [];
  for (let mins = fromMins + SLOT_MINUTES; mins <= lastSlotMins + SLOT_MINUTES; mins += SLOT_MINUTES) {
    options.push(toTime(mins));
  }
  return options;
}
