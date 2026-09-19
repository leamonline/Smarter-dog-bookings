// The day stack: one dog per row, in strict appointment order.
//
// This module answers one question — "what does this row say about time?" —
// and nothing else. It owns no colour, no layout and no actions. Ordering and
// membership come from `buildDailyBriefFeed`, which is consumed rather than
// reimplemented, because that same feed also drives needs-attention and the
// next-open-day brief and there must be exactly one answer to "what is on
// today, in what order".
//
// Why a stack rather than the four-zone board it replaces: position in a zone
// says where a dog is, but it cannot say how long it has been there. On a
// board, a dog checked in at 08:35 and one checked in at 11:50 sit side by side
// looking identical. Strict time order plus one elapsed figure per row makes
// that difference the most visible thing on the screen, which is what the
// people running the salon actually need from it.
import { DOG_SIZE, SERVICES, isStackVisibleStatus } from "../constants/index";
import { computeBookingPricing } from "./bookingRules";
import { buildDailyBriefFeed } from "./dailyBrief";
import {
  collectionWaitMinutes,
  formatDuration,
  londonDateStr,
  minutesUntilSlot,
  timeInSalonMinutes,
} from "./today";
import type { TodayFeedEntry } from "./today";
import { NO_ARRIVAL_MINUTES, IN_SALON_LONG_MINUTES } from "./salonBoard";
import type { Booking } from "../types/index";

/**
 * A dog waiting this long to be collected gets a heavier left rule and a clock.
 *
 * Deliberately lower than the board's `READY_URGENT_MINUTES` (60). The board
 * was ranking tokens against each other, where 60 minutes kept the urgent set
 * small enough to scan. The stack is a list in time order, so the threshold is
 * answering a different question: how long is too long to leave an owner
 * standing. Three quarters of an hour is the answer the salon gave.
 */
export const READY_OVERDUE_MINUTES = 45;

export interface DayStackRow {
  entry: TodayFeedEntry;
  booking: Booking;
  /** Stable string id, for keys and DOM hooks. */
  id: string;
  /** Minutes-of-day of the appointment. Rows are already in this order. */
  sortMinutes: number;
  /** The appointment time as shown, or null for a booking with no slot. */
  time: string | null;
  /** "Cockapoo · Full Groom", with either half omitted when unknown. */
  subtitle: string;
  /**
   * The one timing line, already worded.
   *
   * Null when there is nothing truthful to say — a booking from before the
   * lifecycle stamps existed (July 2026) has no arrival time, and a browsed
   * date has no live clock. Both degrade to silence rather than to "n/a",
   * because a row that admits it does not know is worse than a row that simply
   * does not mention it.
   */
  timing: string | null;
  /**
   * The timing line should read as urgent: heavier weight, not a different
   * hue. Colour already carries the status and must not be asked to carry a
   * second meaning on top.
   */
  urgent: boolean;
  /** Ready past READY_OVERDUE_MINUTES — thicker rule plus a clock icon. */
  readyOverdue: boolean;
}

function serviceLabel(serviceId: string | null | undefined): string {
  if (!serviceId) return "";
  return SERVICES.find((s) => s.id === serviceId)?.name || "";
}

function subtitleFor(booking: Booking, breed: string): string {
  return [breed, serviceLabel(booking.service)].filter(Boolean).join(" · ");
}

interface TimingResult {
  timing: string | null;
  urgent: boolean;
  readyOverdue: boolean;
}

const QUIET: TimingResult = { timing: null, urgent: false, readyOverdue: false };

/**
 * What this row says about time, by stage.
 *
 * Only ever called for the browsed date being today. A past or future day has
 * no live elapsed time, and computing one from a stamp would produce "3 days"
 * on a row a member of staff is reading as history.
 */
function timingFor(entry: TodayFeedEntry, now: Date): TimingResult {
  const booking = entry.booking;

  if (entry.stage === "ready") {
    const wait = entry.waitMinutes ?? collectionWaitMinutes(booking, now);
    if (wait == null) return QUIET;
    return {
      timing: `waiting ${formatDuration(wait)}`,
      urgent: wait >= READY_OVERDUE_MINUTES,
      readyOverdue: wait >= READY_OVERDUE_MINUTES,
    };
  }

  if (entry.stage === "inSalon") {
    const elapsed = timeInSalonMinutes(booking, now);
    if (elapsed == null) return QUIET;
    return {
      timing: formatDuration(elapsed),
      urgent: elapsed >= IN_SALON_LONG_MINUTES,
      readyOverdue: false,
    };
  }

  if (entry.stage === "booked") {
    if (entry.isLate) {
      // Past a couple of hours, "5 hrs late" stops being true in any human
      // sense. The dog has not come. Say that instead.
      const timing = entry.overdueMinutes >= NO_ARRIVAL_MINUTES
        ? "No arrival"
        : `${formatDuration(entry.overdueMinutes)} late`;
      return { timing, urgent: true, readyOverdue: false };
    }
    if (!booking.slot) return QUIET;
    const until = minutesUntilSlot(booking.slot, now);
    if (!Number.isFinite(until) || until < 0) return QUIET;
    return { timing: `${formatDuration(until)} away`, urgent: false, readyOverdue: false };
  }

  return QUIET;
}

export interface DayStackInput {
  bookings: Booking[];
  /** The browsed date, which is not necessarily today. */
  dateStr: string;
  now: Date;
  /** Resolved breed per booking id, so this layer needs no dog lookup. */
  breedById?: Readonly<Record<string, string>>;
}

/**
 * Build the stack: the ACTIVE bookings on the date, in appointment order.
 *
 * Nothing is grouped and nothing is re-sorted by status. A dog that has been in
 * since 08:30 stays at the top of the list all morning, which is the entire
 * point of the screen; bucketing it under "In the salon" would hide exactly the
 * fact the stack exists to show.
 */
export function buildDayStack({
  bookings,
  dateStr,
  now,
  breedById = {},
}: DayStackInput): DayStackRow[] {
  const isToday = dateStr === londonDateStr(now);
  // No-shows are no longer pulled into the feed for the stack. The stack is
  // work still in front of you, and a dog that did not turn up is not work —
  // it is a thing to deal with elsewhere. Completed dogs drop out below into
  // the collected summary.
  const feed = buildDailyBriefFeed(bookings, dateStr, now);

  return feed
    // An ALLOW-LIST, not a list of exclusions.
    //
    // The stack shows exactly the four active statuses: Booked, Reconfirmed,
    // Arrived and Ready for collection. Completed dogs leave for the summary
    // at the bottom (they stay in the feed, because the takings line is built
    // from them); Cancelled and No-show leave the day altogether rather than
    // cluttering a list of things to do with things nobody can act on.
    //
    // Written as an allow-list on purpose: a status added later is invisible
    // until somebody decides it belongs here, which is the safe direction to
    // fail. Excluding by name would have silently admitted it.
    .filter((entry) => isStackVisibleStatus(entry.booking.status))
    .map((entry) => {
      const timing = isToday ? timingFor(entry, now) : QUIET;
      const id = String(entry.booking.id ?? "");
      return {
        entry,
        booking: entry.booking,
        id,
        sortMinutes: entry.slotMinutes,
        time: entry.booking.slot || null,
        subtitle: subtitleFor(entry.booking, breedById[id] || ""),
        ...timing,
      };
    });
}

/** The bookings that have left the stack, most recently collected first. */
export function selectCollected(bookings: Booking[], dateStr: string, now: Date): Booking[] {
  return buildDailyBriefFeed(bookings, dateStr, now)
    .filter((entry) => entry.stage === "collected")
    .map((entry) => entry.booking)
    .sort((a, b) => {
      const aTime = Date.parse(a.completedAt ?? "");
      const bTime = Date.parse(b.completedAt ?? "");
      if (!Number.isFinite(aTime) && !Number.isFinite(bTime)) return 0;
      if (!Number.isFinite(aTime)) return 1;
      if (!Number.isFinite(bTime)) return -1;
      return bTime - aTime;
    });
}

// ---- Check out ---------------------------------------------------------------
//
// Handing a dog back is three presses when there is money to take and two when
// there is not:
//
//     Check out  →  Cash £32 | Card £32  →  Collected · £32 cash
//     Check out  →  Collected
//
// Each step replaces the last in the same place on the card, so the button
// under the thumb never moves and the sequence reads as one gesture rather than
// three separate decisions. Only the final press writes anything.
//
// The shape is deliberate. Taking the money and handing the dog back are one
// action to the person doing them, but two facts to record, and the old board
// split them across a menu item and a modal. Collapsing them into one chain —
// and one database write — means a dog cannot end up collected but unpaid
// because somebody was interrupted between two taps.

/** Where a card's check-out chain has got to. `null` means not started. */
export type CheckoutStep = null | "method" | "confirm";

export interface CheckoutButton {
  id: "start" | "cash" | "card" | "collect" | "back";
  label: string;
  kind: "primary" | "default" | "quiet";
  /** The payment method this press selects, when it selects one. */
  method?: "cash" | "card";
}

export interface CheckoutChainInput {
  step: CheckoutStep;
  /** Balance still owed (£). Zero or null means there is nothing to take. */
  amountDue: number | null;
  /** The method chosen at the previous step, once one has been. */
  method: "cash" | "card" | null;
}

/**
 * The one way a figure on `/today` is written.
 *
 * Whole pounds read faster across a counter, and the salon's prices are whole
 * pounds; a genuine 50p balance still prints in full rather than rounding away,
 * because a figure a customer can dispute must match the card machine.
 *
 * Exported because the card used to round separately, so a £32.50 balance read
 * "£33 due" in the header and "Cash £32.50" on the button beneath it, for the
 * same booking at the same moment (#878). Two renderings of one figure is a
 * disagreement with a customer waiting for it to be resolved.
 */
export function money(amount: number): string {
  return Number.isInteger(amount) ? `£${amount}` : `£${amount.toFixed(2)}`;
}

/**
 * The buttons for the current step of the chain.
 *
 * Pure, so the sequence can be tested without a card: given where we are and
 * what is owed, what does the staff member see next.
 */
export function checkoutChain({ step, amountDue, method }: CheckoutChainInput): CheckoutButton[] {
  const owed = amountDue != null && amountDue > 0;

  if (step === null) {
    return [{ id: "start", label: "Check out", kind: "primary" }];
  }

  if (step === "method" && owed) {
    const due = money(amountDue as number);
    return [
      { id: "cash", label: `Cash ${due}`, kind: "primary", method: "cash" },
      { id: "card", label: `Card ${due}`, kind: "primary", method: "card" },
      { id: "back", label: "Back", kind: "quiet" },
    ];
  }

  // The confirm step, reached either after choosing a method or straight from
  // the start when there is nothing to take.
  const label = owed && method
    ? `Collected · ${money(amountDue as number)} ${method === "cash" ? "cash" : "card"}`
    : "Collected";
  return [
    { id: "collect", label, kind: "primary" },
    { id: "back", label: "Back", kind: "quiet" },
  ];
}

/** The step a press moves to, or "done" when it is the one that writes. */
export function nextCheckoutStep(
  buttonId: CheckoutButton["id"],
  { step, amountDue }: Pick<CheckoutChainInput, "step" | "amountDue">,
): CheckoutStep | "done" {
  const owed = amountDue != null && amountDue > 0;
  if (buttonId === "start") return owed ? "method" : "confirm";
  if (buttonId === "cash" || buttonId === "card") return "confirm";
  if (buttonId === "collect") return "done";
  // Back steps one place, never all the way out of a chain mid-way: from the
  // confirm step of a paying visit it returns to the method choice.
  if (step === "confirm" && owed) return "method";
  return null;
}

/**
 * One row per dog that has gone home, settled or not.
 *
 * `buildTakingsByMethod` answers "what is in the till", which by definition is
 * only the bookings that paid. That is the right answer to that question and
 * the wrong answer to "who has left", and using it for both is how a dog handed
 * back without paying came to appear nowhere on `/today` at all (#878): it had
 * left the stack and it was not in the takings. The board this replaced showed
 * every collected dog, and `tokenActions` still carries a "collected but owing"
 * branch precisely because the state matters.
 *
 * A settled row takes its figure and its label straight from the takings rather
 * than recomputing them, so the list and the total underneath it cannot
 * disagree. An unsettled row carries what is still OWED — the number staff need
 * in order to chase it — and says so, so the two can never be read as the same
 * kind of money.
 */
export interface CollectedRow {
  booking: Booking;
  /** Taken, on a settled row. Still owed, on an unsettled one. */
  amount: number;
  /** "Cash", "Card", "Not recorded" — or "owed" when nothing was taken. */
  label: string;
  settled: boolean;
}

export function buildCollectedRows(
  collected: Booking[],
  takings: { bookings: { booking: { id?: unknown }; amount: number; label: string }[] },
): CollectedRow[] {
  const settledById = new Map(
    (takings?.bookings ?? []).map((row) => [String(row.booking?.id), row]),
  );

  return collected.map((booking) => {
    const settled = settledById.get(String(booking.id));
    if (settled) {
      return { booking, amount: settled.amount, label: settled.label, settled: true };
    }
    return {
      booking,
      amount: outstandingOn(booking),
      label: "owed",
      settled: false,
    };
  });
}

/**
 * What a collected-but-unpaid booking still owes.
 *
 * Reached by the same route `buildTakingsByMethod` uses for a row with no
 * recorded amount, so the figure staff chase is the figure the invoice would
 * have shown. A deposit already taken is netted off by `computeBookingPricing`
 * via the booking's `payment`, so this is the balance rather than the gross.
 */
function outstandingOn(booking: Booking): number {
  return computeBookingPricing({
    service: booking.service ?? "",
    size: booking.size ?? DOG_SIZE.SMALL,
    addons: booking.addons ?? null,
    payment: booking.payment ?? null,
    priceOverride: booking.priceOverride ?? null,
  }).amountDue;
}
