// The live salon board — the pure layer behind the spatial `/today` view.
//
// The board shows one TOKEN per dog, placed in the zone that says where the
// dog physically is. Position carries the status, so a token needs almost no
// text: "where is Teddy?" is answered by looking, not by reading badges.
//
// This module owns three decisions and nothing else:
//   1. ZONE      — which of the four zones a booking sits in (a straight
//                  relabel of the existing Daily Brief lanes; no new state).
//   2. PRIORITY  — where inside its zone it sits, and how prominent it looks.
//   3. ACTIONS   — which operations are legal on it right now.
//
// It never mutates a booking, never invents a status, and never decides what
// anything looks like. Rendering reads these results; the drag layer reads
// `canMoveToZone`; the menu and the sheet read the SAME `tokenActions` list,
// so a touch, a click and a drag can never disagree about what is possible.
import { BOOKING_STATUS } from "../constants/index";
import type { Booking } from "../types/index";
import type { DailyBriefBoard, DailyBriefBoardEntry } from "./dailyBrief";
import {
  collectionWaitMinutes,
  entryOpStatus,
  formatDuration,
  minutesUntilSlot,
  timeInSalonMinutes,
} from "./today";

// ---- Zones -------------------------------------------------------------------

/**
 * The four board zones, in journey order. These are a presentation relabel of
 * the existing Daily Brief lanes (`due | withUs | ready | home`) — the same
 * keys, so every existing selector, sort and test keeps working.
 */
export type BoardZone = "due" | "withUs" | "ready" | "home";

/** Journey order. The board renders the first three; `home` is the compact strip. */
export const BOARD_ZONES: readonly BoardZone[] = ["due", "withUs", "ready", "home"];

/** The three zones that hold live tokens. `home` is collapsed by default. */
export const ACTIVE_BOARD_ZONES: readonly BoardZone[] = ["due", "withUs", "ready"];

export interface ZoneMeta {
  /** The zone's visible heading. */
  title: string;
  /** Screen-reader-only sentence explaining what being in this zone means. */
  purpose: string;
  /** What an empty zone says — calm, never an alarm. */
  empty: string;
}

export const BOARD_ZONE_META: Record<BoardZone, ZoneMeta> = {
  due: {
    title: "Arriving",
    purpose: "Dogs booked in today who have not arrived yet.",
    empty: "Nobody due",
  },
  withUs: {
    title: "With us",
    purpose: "Dogs physically in the salon right now.",
    empty: "Nobody in",
  },
  ready: {
    title: "Ready",
    purpose: "Dogs whose groom is finished, waiting to be collected.",
    empty: "Nobody waiting",
  },
  home: {
    title: "Gone home",
    purpose: "Dogs collected on this date.",
    empty: "Nobody home yet",
  },
};

/** Status → zone. Cancelled and unknown statuses map to null, exactly as the lanes do. */
const ZONE_BY_STATUS: Record<string, BoardZone> = {
  [BOOKING_STATUS.BOOKED]: "due",
  [BOOKING_STATUS.CHECKED_IN]: "withUs",
  [BOOKING_STATUS.IN_BATH]: "withUs",
  [BOOKING_STATUS.READY_FOR_PICKUP]: "ready",
  [BOOKING_STATUS.COMPLETED]: "home",
};

export function zoneForStatus(status?: string | null): BoardZone | null {
  return (status && ZONE_BY_STATUS[status]) || null;
}

// ---- Priority gravity --------------------------------------------------------

/**
 * How loudly a token asks to be looked at. Three tiers only — a fourth would
 * be a gradient nobody can read across a room.
 *
 *  urgent — someone is being kept waiting or money is walking out the door
 *  watch  — on the needs-attention list, or about to be
 *  calm   — normal work, deliberately quiet
 */
export type TokenTier = "urgent" | "watch" | "calm";

/** A dog due within this many minutes is worth glancing at. */
export const DUE_SOON_MINUTES = 15;
/** A collection wait at or past this reads as urgent (matches WAIT_AMBER_MINUTES). */
export const READY_URGENT_MINUTES = 60;
/** Longer than any normal groom — a dog on site this long is worth a look. */
export const IN_SALON_LONG_MINUTES = 180;

export interface BoardToken {
  entry: DailyBriefBoardEntry;
  booking: Booking;
  zone: BoardZone;
  tier: TokenTier;
  /**
   * Lower sorts first within the zone. Derived, stable, and only ever changes
   * when a real state change or the minute tick moves it — the board must not
   * shuffle under the user's finger.
   */
  rank: number;
  /**
   * The ONE piece of context the token shows. Once a dog is here that is its
   * elapsed time, which genuinely differs per dog. While it is still arriving
   * the time is a property of the SLOT, not of the dog — several dogs booked
   * into 09:00 would otherwise each print "09:00" — so it moves to the slot
   * heading (`slotTiming`) and the token prints only what the heading cannot
   * say: that this particular booking still needs confirming.
   */
  meta: string | null;
  /**
   * Arriving only: the countdown or lateness every dog in this slot shares,
   * stated once on the group heading. Null on a browsed date (where the slot
   * label already IS the time) and for a booking with no slot.
   */
  slotTiming: string | null;
  /** The full spoken status, for the token's accessible name. */
  statusText: string;
  /** True when this dog is on the needs-attention list. */
  needsAttention: boolean;
}

function idOf(entry: DailyBriefBoardEntry): string {
  return String(entry.booking.id ?? "");
}

function finiteSlotMinutes(entry: DailyBriefBoardEntry): number {
  return Number.isFinite(entry.slotMinutes) ? entry.slotMinutes : Number.POSITIVE_INFINITY;
}

/**
 * Rank inside a zone. Each zone gets its own rule, and every rule ends in the
 * booking id so the order is total — two identical bookings never swap places
 * between renders.
 *
 *  Arriving  late first (most overdue first), then soonest slot, then
 *            unconfirmed ahead of confirmed at the same time.
 *  With us   anything flagged first, then longest on site (a dog with no
 *            check-in stamp sorts after timed ones — it has no claim).
 *  Ready     longest wait first. A dog with NO ready_at stamp (legacy rows,
 *            pre-2026-07-02) sorts FIRST: unknown must surface, never hide.
 *  Gone home most recently collected first.
 */
function rankWithinZone(
  entry: DailyBriefBoardEntry,
  zone: BoardZone,
  now: Date,
  flagged: boolean,
): number {
  if (zone === "due") {
    if (entry.isLate) return -1_000_000 - entry.overdueMinutes;
    const until = entry.booking.slot ? minutesUntilSlot(entry.booking.slot, now) : Number.POSITIVE_INFINITY;
    return Number.isFinite(until) ? until : finiteSlotMinutes(entry);
  }
  if (zone === "withUs") {
    const onSite = timeInSalonMinutes(entry.booking, now);
    const welfareLead = flagged ? -500_000 : 0;
    if (onSite == null) return welfareLead + 1_000_000 + finiteSlotMinutes(entry);
    return welfareLead - onSite;
  }
  if (zone === "ready") {
    const wait = collectionWaitMinutes(entry.booking, now);
    if (wait == null) return -1_000_000;
    return -wait;
  }
  const collected = Date.parse(entry.booking.completedAt ?? "");
  return Number.isFinite(collected) ? -collected : Number.POSITIVE_INFINITY;
}

/**
 * Visual tier. Urgency comes from the SAME ranked mapping the old cards used
 * (`entryOpStatus`), so the board can never disagree with the header counts;
 * the zone-specific thresholds below only add "about to matter".
 */
function tierFor(
  entry: DailyBriefBoardEntry,
  zone: BoardZone,
  now: Date,
  isToday: boolean,
): TokenTier {
  const kind = entryOpStatus(entry).kind;
  // overdue (late arrival) and paymentDue (collected but still owing) are the
  // two states where someone is actually losing something.
  if (kind === "overdue" || kind === "paymentDue") return "urgent";
  // Nothing on a browsed past or future date is happening now, so nothing on
  // it may glow. Money still owed is the one exception above — that is true
  // whichever day you are looking at.
  if (!isToday) return "calm";
  if (zone === "ready") {
    const wait = collectionWaitMinutes(entry.booking, now);
    if (wait != null && wait >= READY_URGENT_MINUTES) return "urgent";
    if (entry.needsAction) return "watch";
    return "calm";
  }
  if (zone === "due") {
    if (entry.needsAction) return "watch";
    const until = entry.booking.slot ? minutesUntilSlot(entry.booking.slot, now) : Number.POSITIVE_INFINITY;
    return until <= DUE_SOON_MINUTES ? "watch" : "calm";
  }
  if (zone === "withUs") {
    const onSite = timeInSalonMinutes(entry.booking, now);
    return onSite != null && onSite >= IN_SALON_LONG_MINUTES ? "watch" : "calm";
  }
  return entry.needsAction ? "watch" : "calm";
}

/**
 * The token's single line of context. Duration only — the zone heading already
 * carries the noun, so repeating "Ready" on a token in the Ready zone is the
 * duplicate labelling this redesign exists to remove.
 */
function metaFor(entry: DailyBriefBoardEntry, zone: BoardZone, now: Date, isToday: boolean): string | null {
  if (zone === "due") {
    // The slot heading carries the time for the whole group. All that is left
    // for the token is the thing the heading cannot know: whether THIS booking
    // is still unconfirmed.
    return entry.isUnconfirmed ? "To confirm" : null;
  }
  if (!isToday) return entry.booking.slot || null;
  if (zone === "withUs") {
    const onSite = timeInSalonMinutes(entry.booking, now);
    return onSite == null ? entry.booking.slot || null : formatDuration(onSite);
  }
  if (zone === "ready") {
    const wait = collectionWaitMinutes(entry.booking, now);
    return wait == null ? entry.booking.slot || null : formatDuration(wait);
  }
  return entry.timingLabel;
}

/**
 * The relative time every dog in an Arriving slot shares. Stated once, on the
 * group heading, because it is a fact about the appointment rather than about
 * any one dog: four dogs booked into 09:00 are all "20 min late" together.
 */
function slotTimingFor(entry: DailyBriefBoardEntry, zone: BoardZone, now: Date, isToday: boolean): string | null {
  if (zone !== "due" || !isToday) return null;
  if (!entry.booking.slot || !Number.isFinite(entry.slotMinutes)) return null;
  if (entry.isLate) return `${formatDuration(entry.overdueMinutes)} late`;
  const until = minutesUntilSlot(entry.booking.slot, now);
  return until <= 0 ? "Due now" : `in ${formatDuration(until)}`;
}

/**
 * The spoken status — what a screen reader announces after the dog's name, and
 * what the action menu shows as its subtitle. This is where the words the
 * token deliberately does NOT print still live.
 */
function statusTextFor(entry: DailyBriefBoardEntry, zone: BoardZone, now: Date, isToday: boolean): string {
  const meta = BOARD_ZONE_META[zone];
  if (zone === "due") {
    if (isToday && entry.isLate) return `Late, ${formatDuration(entry.overdueMinutes)} overdue`;
    if (!entry.booking.slot) return "Arriving, time missing";
    if (!isToday) return `Arriving ${entry.booking.slot}`;
    const until = minutesUntilSlot(entry.booking.slot, now);
    return until <= 0 ? "Due now" : `Arriving in ${formatDuration(until)}`;
  }
  if (zone === "withUs") {
    const inBath = entry.booking.status === BOOKING_STATUS.IN_BATH;
    const stage = inBath ? "Being groomed" : "Checked in";
    const onSite = isToday ? timeInSalonMinutes(entry.booking, now) : null;
    return onSite == null ? stage : `${stage}, here ${formatDuration(onSite)}`;
  }
  if (zone === "ready") {
    const wait = isToday ? collectionWaitMinutes(entry.booking, now) : null;
    return wait == null ? "Ready for collection" : `Ready, waiting ${formatDuration(wait)}`;
  }
  return entry.timingLabel || meta.title;
}

export interface BoardTokensInput {
  board: DailyBriefBoard;
  now: Date;
  /** True when the browsed date IS today — a past/future date has no live timings. */
  isToday: boolean;
  /** Booking ids carrying a welfare flag, so the pure layer needs no dog lookup. */
  flaggedBookingIds?: ReadonlySet<string>;
}

export type BoardTokens = Record<BoardZone, BoardToken[]>;

/**
 * Turn a built Daily Brief board into ranked, tiered tokens per zone.
 *
 * The lane arrays arrive already sorted by `buildDailyBriefBoard`; this
 * re-sorts them by the board's own priority gravity and keeps the incoming
 * order as the final tie-break, so nothing ever compares equal.
 */
export function buildBoardTokens({
  board,
  now,
  isToday,
  flaggedBookingIds,
}: BoardTokensInput): BoardTokens {
  const tokens = {} as BoardTokens;
  for (const zone of BOARD_ZONES) {
    const entries = board[zone] || [];
    const positions = new Map(entries.map((entry, index) => [idOf(entry), index]));
    tokens[zone] = entries
      .map((entry) => ({
        entry,
        booking: entry.booking,
        zone,
        tier: tierFor(entry, zone, now, isToday),
        rank: rankWithinZone(entry, zone, now, flaggedBookingIds?.has(idOf(entry)) ?? false),
        meta: metaFor(entry, zone, now, isToday),
        slotTiming: slotTimingFor(entry, zone, now, isToday),
        statusText: statusTextFor(entry, zone, now, isToday),
        needsAttention: entry.needsAction,
      }))
      .sort((a, b) => {
        if (a.rank !== b.rank) return a.rank - b.rank;
        const aPosition = positions.get(idOf(a.entry)) ?? 0;
        const bPosition = positions.get(idOf(b.entry)) ?? 0;
        if (aPosition !== bPosition) return aPosition - bPosition;
        return idOf(a.entry).localeCompare(idOf(b.entry));
      });
  }
  return tokens;
}

// ---- Needs attention ---------------------------------------------------------

export interface AttentionSummary {
  /** Distinct dogs needing something. */
  count: number;
  /** The one-line headline: reassurance, or the ask. */
  headline: string;
  /** Booking ids to highlight when attention mode is on. */
  ids: string[];
}

/**
 * "Everything's on track" / "2 things need you". Membership is exactly the
 * existing `needsAction` union (late, unconfirmed, waiting to be collected,
 * unpaid after arrival) — this adds a sentence, not a second definition.
 */
export function buildAttentionSummary(tokens: BoardTokens, isToday: boolean): AttentionSummary {
  const ids: string[] = [];
  for (const zone of BOARD_ZONES) {
    for (const token of tokens[zone]) {
      if (token.needsAttention) ids.push(String(token.booking.id));
    }
  }
  const count = ids.length;
  if (count === 0) {
    return {
      count,
      headline: isToday ? "Everything's on track" : "Nothing outstanding",
      ids,
    };
  }
  return {
    count,
    headline: count === 1 ? "1 thing needs you" : `${count} things need you`,
    ids,
  };
}

/** "3 arriving · 6 with us · 2 ready" — the header's compact shape of the day. */
export function buildZoneCounts(tokens: BoardTokens): Array<{ zone: BoardZone; label: string; count: number }> {
  return ACTIVE_BOARD_ZONES.map((zone) => ({
    zone,
    count: tokens[zone].length,
    label: BOARD_ZONE_META[zone].title.toLowerCase(),
  }));
}

// ---- Arriving, grouped by appointment ----------------------------------------

export interface BoardSlotGroup {
  /** Stable key: the slot time, or "unscheduled". */
  key: string;
  /** The visible heading — the slot time, or "Unscheduled". */
  label: string;
  /** The countdown or lateness shared by every dog in this slot, today only. */
  timing: string | null;
  tokens: BoardToken[];
}

/**
 * Group the Arriving zone by appointment time.
 *
 * Arriving is the one zone that is inherently a schedule, and a time belongs to
 * the slot rather than to each dog standing in it. Printing it under every
 * token repeats the same fact three or four times on a busy morning — exactly
 * the duplicate labelling this board exists to remove — so it is stated once
 * per group instead, and the tokens beneath carry only their own exceptions.
 *
 * Order is taken from the already-ranked token list: a group takes the
 * position of its first dog, so the ranking is preserved exactly and grouping
 * can never reorder the board. A booking with no usable slot must never
 * disappear, so those collect in a trailing "Unscheduled" group.
 */
export function groupTokensBySlot(tokens: BoardToken[]): BoardSlotGroup[] {
  const groups: BoardSlotGroup[] = [];
  const bySlot = new Map<string, BoardSlotGroup>();
  const unscheduled: BoardSlotGroup = {
    key: "unscheduled",
    label: "Unscheduled",
    timing: null,
    tokens: [],
  };

  for (const token of tokens) {
    const slot = token.booking.slot;
    if (!slot || !Number.isFinite(token.entry.slotMinutes)) {
      unscheduled.tokens.push(token);
      continue;
    }
    let group = bySlot.get(slot);
    if (!group) {
      // Every dog in a slot shares its slot and the same `now`, so the first
      // token's timing is the whole group's timing — never recomputed here.
      group = { key: slot, label: slot, timing: token.slotTiming, tokens: [] };
      bySlot.set(slot, group);
      groups.push(group);
    }
    group.tokens.push(token);
  }

  if (unscheduled.tokens.length > 0) groups.push(unscheduled);
  return groups;
}

// ---- Actions -----------------------------------------------------------------

export type TokenActionId =
  | "checkIn"
  | "startGroom"
  | "ready"
  | "collected"
  | "payment"
  | "confirm"
  | "unconfirm"
  | "message"
  | "call"
  | "didntShow"
  | "booking"
  | "dogFile"
  | "humanFile";

export interface TokenAction {
  id: TokenActionId;
  label: string;
  /**
   * primary — the one obvious next move for this state
   * default — a normal, safe operation
   * quiet   — reference material and reversals; never competes for the eye
   */
  kind: "primary" | "default" | "quiet";
  /** A `tel:` link rather than a handler call. */
  href?: string;
}

export interface TokenActionContext {
  /** Amount still owed, or null when the payment state implies no balance. */
  amountDue?: number | null;
  /** True when the booking is settled in full. */
  paid?: boolean;
  /** Owner's phone in `tel:` form, when one exists. */
  telHref?: string | null;
  /** Owner's first name, for "Message Rik". */
  contactName?: string;
  /** The dog's display name, for "Open Teddy's file". */
  dogName?: string;
  /** The owner's full display name, for "Open Rik Patel's file". */
  ownerName?: string;
  hasOwner?: boolean;
  hasDog?: boolean;
}

function money(amount: number): string {
  return `£${Math.round(amount)}`;
}

/**
 * Every action legal on this dog right now, most important first.
 *
 * Legality is state-derived, never symmetrical: a collected dog has no "Mark
 * collected", an on-time booking has no "Confirm", a dog with no phone number
 * on file has no "Call". Both the desktop menu and the mobile sheet render
 * this one list, so they cannot drift apart.
 */
export function tokenActions(token: BoardToken, context: TokenActionContext = {}): TokenAction[] {
  const {
    amountDue = null,
    paid = false,
    telHref = null,
    contactName = "the owner",
    dogName = "this dog",
    ownerName = "the owner",
    hasOwner = true,
    hasDog = true,
  } = context;
  const owes = amountDue != null && amountDue > 0;
  const booking = token.booking;
  const actions: TokenAction[] = [];

  if (token.zone === "due") {
    actions.push({ id: "checkIn", label: "Check in", kind: "primary" });
  } else if (token.zone === "withUs") {
    actions.push(
      booking.status === BOOKING_STATUS.CHECKED_IN
        ? { id: "startGroom", label: "Start groom", kind: "primary" }
        : { id: "ready", label: "Ready for collection", kind: "primary" },
    );
  } else if (token.zone === "ready") {
    // Money first when there is money: taking it is what actually blocks the
    // handover. Mark collected stays a visible sibling, never buried — the
    // unpaid-collection safeguard re-checks the balance either way.
    if (owes) {
      actions.push({ id: "payment", label: `Take ${money(amountDue as number)} payment`, kind: "primary" });
      actions.push({ id: "collected", label: "Mark collected", kind: "default" });
    } else {
      actions.push({ id: "collected", label: "Mark collected", kind: "primary" });
    }
  }

  if (token.zone !== "ready" && owes) {
    actions.push({
      id: "payment",
      label: `Take ${money(amountDue as number)} payment`,
      kind: token.zone === "home" ? "primary" : "default",
    });
  }
  if (!owes && paid) {
    actions.push({ id: "payment", label: "View payment", kind: "quiet" });
  }

  if (token.zone === "due") {
    if (token.entry.isUnconfirmed) {
      actions.push({ id: "confirm", label: "Confirm booking", kind: "default" });
    }
    if (booking.reminderConfirmedBy === "staff") {
      actions.push({ id: "unconfirm", label: "Unconfirm booking", kind: "quiet" });
    }
  }

  if (hasOwner) actions.push({ id: "message", label: `Message ${contactName}`, kind: "default" });
  if (telHref) actions.push({ id: "call", label: `Call ${contactName}`, kind: "default", href: telHref });

  actions.push({ id: "booking", label: "Booking details", kind: "quiet" });
  if (hasDog) actions.push({ id: "dogFile", label: `${dogName}'s file`, kind: "quiet" });
  if (hasOwner) actions.push({ id: "humanFile", label: `${ownerName}'s file`, kind: "quiet" });
  if (token.zone === "due") {
    actions.push({ id: "didntShow", label: "Didn't show", kind: "quiet" });
  }

  return actions;
}

// ---- Drag legality -----------------------------------------------------------

/**
 * Which zone each forward transition lands in, and the action that performs it.
 * Dragging never invents a transition: it fires the same handler the menu item
 * does, so every existing safeguard (unpaid collection, the staff-reviewed
 * collection notice, the care-step confirm) still runs.
 */
const FORWARD_MOVE: Partial<Record<BoardZone, { to: BoardZone; action: TokenActionId }>> = {
  due: { to: "withUs", action: "checkIn" },
  withUs: { to: "ready", action: "ready" },
  ready: { to: "home", action: "collected" },
};

export interface ZoneMove {
  from: BoardZone;
  to: BoardZone;
  action: TokenActionId;
  /** Past-tense sentence for the toast and the live announcement. */
  describe: (dogName: string) => string;
}

const MOVE_COPY: Record<TokenActionId, (dogName: string) => string> = {
  checkIn: (dog) => `${dog} checked in — with us now`,
  startGroom: (dog) => `${dog} — groom started`,
  ready: (dog) => `${dog} is ready to go home`,
  collected: (dog) => `${dog} collected — home today`,
  payment: (dog) => `${dog}'s payment recorded`,
  confirm: (dog) => `${dog}'s booking confirmed`,
  unconfirm: (dog) => `${dog}'s booking is unconfirmed again`,
  message: (dog) => `Messaging ${dog}'s owner`,
  call: (dog) => `Calling ${dog}'s owner`,
  didntShow: (dog) => `${dog} marked as a no-show`,
  booking: (dog) => `${dog}'s booking`,
  dogFile: (dog) => `${dog}'s file`,
  humanFile: (dog) => `${dog}'s owner's file`,
};

/**
 * The move a drag from `from` to `to` would perform, or null when it is not a
 * legal drag. Only forward, only one zone at a time: skipping a care step is a
 * decision that deserves the confirm dialog, not a flick of the wrist, and
 * going backwards is a correction — it belongs in the menu where it can be
 * read before it is pressed.
 */
export function moveForDrag(from: BoardZone, to: BoardZone): ZoneMove | null {
  const forward = FORWARD_MOVE[from];
  if (!forward || forward.to !== to) return null;
  return { from, to, action: forward.action, describe: MOVE_COPY[forward.action] };
}

/** True when this token may be dragged at all (everything except already home). */
export function canDragToken(token: BoardToken): boolean {
  return !!FORWARD_MOVE[token.zone];
}

/** The zone a drag from this token would legally land in, or null. */
export function dropZoneFor(token: BoardToken): BoardZone | null {
  return FORWARD_MOVE[token.zone]?.to ?? null;
}

// ---- Undo --------------------------------------------------------------------

/**
 * The status a transition came FROM, so a mis-tap is one press away from
 * being repaired. Undo is offered only for these ordinary, reversible
 * workflow moves — never for "Didn't show", which cancels a booking and is
 * confirmed rather than undone.
 */
export function reverseStatusFor(action: TokenActionId, previousStatus: string | null | undefined): string | null {
  if (!previousStatus) return null;
  if (action === "checkIn") return previousStatus === BOOKING_STATUS.BOOKED ? BOOKING_STATUS.BOOKED : null;
  if (action === "startGroom") return previousStatus === BOOKING_STATUS.CHECKED_IN ? BOOKING_STATUS.CHECKED_IN : null;
  if (action === "ready") {
    return previousStatus === BOOKING_STATUS.CHECKED_IN || previousStatus === BOOKING_STATUS.IN_BATH
      ? previousStatus
      : null;
  }
  if (action === "collected") {
    return previousStatus === BOOKING_STATUS.READY_FOR_PICKUP ? BOOKING_STATUS.READY_FOR_PICKUP : null;
  }
  return null;
}
