// ============================================================
// supabase/functions/_shared/slackMessage.ts
//
// WHAT a #salon-today alert says, and how it is deduplicated. Pure logic,
// no IO — every string Slack ever sees is built here and nowhere else.
//
// ── The privacy rule, enforced by the type system ──────────────────────
//
// Slack messages must never carry a customer's name, phone number, address
// or notes. Rather than rely on reviewers spotting a leak, the builder is
// typed to make one impossible: it accepts a BookingSubject, which has
// exactly five fields (id, slot, dog name, size, breed) and no room for
// anything else. It is never handed a bookings row or a humans row, so
// there is no field a name could arrive in, even by accident.
//
// A test asserts the rendered output directly as well, on the principle
// that a rule worth stating is a rule worth failing the build over.
//
// Dog name, size and breed ARE included, by the salon owner's explicit
// decision. Worth being clear-eyed about what that means: for a salon this
// size, a dog's name and breed alongside an appointment time identifies the
// household to anyone who already knows the client list. Owner names and
// phone numbers stay out unconditionally.
// ============================================================

import { STAFF_APP_URL, type DogSize } from "./salonConstants.ts";
import { QUIET_DAY_RATIO } from "./slackAlertThresholds.ts";

export type AlertType =
  | "cancellation"
  | "moved_off"
  | "new_booking"
  | "moved_in"
  | "no_show"
  | "ready_overdue"
  | "unanswered"
  | "summary";

/** act = a human must do something now; notice = worth knowing; good = FYI. */
export type Severity = "act" | "notice" | "good";

export const SEVERITY_EMOJI: Record<Severity, string> = {
  act: "\u{1F534}", // red circle
  notice: "\u{1F7E1}", // yellow circle
  good: "\u{1F7E2}", // green circle
};

/**
 * Severity per alert type.
 *
 * Note "unanswered": the brief's event table gave it a yellow circle but
 * labelled its severity "Act" — the only row where those two disagree. The
 * rendered message shape wins here, because the emoji is what staff actually
 * read in the channel. Flip this one line to "act" if the red is wanted.
 */
export const ALERT_SEVERITY: Record<AlertType, Severity> = {
  cancellation: "act",
  moved_off: "act",
  new_booking: "notice",
  moved_in: "notice",
  no_show: "act",
  ready_overdue: "notice",
  unanswered: "notice",
  summary: "good",
};

/**
 * The ONLY booking facts a Slack message may carry.
 *
 * Deliberately not a bookings row. There is no field here that could hold an
 * owner name, a phone number, an address or a note — so none can leak, however
 * carelessly a future call site is written.
 */
export interface BookingSubject {
  id: string;
  /** "HH:MM" London wall clock. */
  slot: string;
  dogName: string | null;
  size: DogSize | null;
  breed: string | null;
}

export type AlertInput =
  | { type: "cancellation"; booking: BookingSubject; bookingDate: string }
  | {
    type: "moved_off";
    booking: BookingSubject;
    previousDate: string;
    previousSlot: string;
  }
  | { type: "new_booking"; booking: BookingSubject; bookingDate: string }
  | {
    type: "moved_in";
    booking: BookingSubject;
    bookingDate: string;
    /** True when the booking was already on this date and only its time
     *  changed — the message then reads "Time changed", not "Moved into
     *  today", which would be untrue. */
    sameDayMove: boolean;
  }
  | { type: "no_show"; booking: BookingSubject; bookingDate: string }
  | {
    type: "ready_overdue";
    booking: BookingSubject;
    bookingDate: string;
    minutesWaiting: number;
  }
  | {
    type: "unanswered";
    conversationId: string;
    minutesWaiting: number;
    /** ISO timestamp of the inbound message being chased. Part of the dedupe
     *  key so a NEW message re-alerts while the same one stays quiet. */
    lastInboundAt: string;
  }
  | {
    type: "summary";
    date: string;
    isOpen: boolean;
    bookings: number;
    /** The day's dog cap (0 when closed). */
    cap: number;
    firstSlot: string | null;
    lastSlot: string | null;
  };

// ── Deep links ─────────────────────────────────────────────────────────

/** Slack's link syntax is <url|label>, not markdown. */
function slackLink(url: string, label: string): string {
  return `<${url}|${label}>`;
}

export function bookingLink(bookingId: string): string {
  return slackLink(`${STAFF_APP_URL}/today?booking=${bookingId}`, "Open booking");
}

export function conversationLink(conversationId: string): string {
  return slackLink(
    `${STAFF_APP_URL}/inbox?conversation=${conversationId}`,
    "Open conversation",
  );
}

// ── Dog descriptor ─────────────────────────────────────────────────────

/**
 * "Alfie (small, Yorkshire Terrier)", degrading gracefully as facts go
 * missing: "Alfie (small)", "Alfie", "Dog (small)".
 */
export function describeDog(booking: BookingSubject): string {
  const name = booking.dogName?.trim() || "Dog";
  const detail = [booking.size, booking.breed?.trim()].filter(Boolean).join(", ");
  return detail ? `${name} (${detail})` : name;
}

// ── Summary maths ──────────────────────────────────────────────────────

export interface SummaryShape {
  dogsFree: number;
  /** Booked as a percentage of the cap, 0 when closed. */
  percent: number;
  tone: "quiet" | "full" | "normal";
}

/**
 * How full the day is, against the salon's 14-dog daily cap.
 *
 * The cap is the denominator the staff calendar already uses, so Slack and
 * the dashboard cannot disagree. "Quiet" is strictly under 40% — with a cap
 * of 14 that is 5 dogs or fewer, since 6 is 42.9%.
 */
export function summaryShape(bookings: number, cap: number): SummaryShape {
  const dogsFree = Math.max(0, cap - bookings);
  const percent = cap > 0 ? Math.round((bookings / cap) * 100) : 0;
  let tone: SummaryShape["tone"] = "normal";
  if (cap > 0 && bookings >= cap) tone = "full";
  else if (cap > 0 && bookings / cap < QUIET_DAY_RATIO) tone = "quiet";
  return { dogsFree, percent, tone };
}

// ── Message builder ────────────────────────────────────────────────────

/** The body of the alert, without the severity emoji. */
export function buildAlertBody(input: AlertInput): string {
  switch (input.type) {
    case "cancellation":
      return `Cancellation — ${input.booking.slot} slot now free · ${
        bookingLink(input.booking.id)
      }`;

    case "moved_off":
      return `Moved off today — was ${input.previousSlot}, slot now free · ${
        bookingLink(input.booking.id)
      }`;

    case "new_booking":
      return `New booking — ${input.booking.slot} · ${
        describeDog(input.booking)
      } · ${bookingLink(input.booking.id)}`;

    case "moved_in": {
      const lead = input.sameDayMove
        ? `Time changed — now ${input.booking.slot}`
        : `Moved into today — ${input.booking.slot}`;
      return `${lead} · ${describeDog(input.booking)} · ${
        bookingLink(input.booking.id)
      }`;
    }

    case "no_show":
      return `No-show? — ${input.booking.slot} booking not checked in · ${
        bookingLink(input.booking.id)
      }`;

    case "ready_overdue": {
      const name = input.booking.dogName?.trim() || "Dog";
      return `Dog in Ready for ${input.minutesWaiting} min — ${name} · ${
        bookingLink(input.booking.id)
      }`;
    }

    case "unanswered":
      return `Unanswered message — ${input.minutesWaiting} min · ${
        conversationLink(input.conversationId)
      }`;

    case "summary": {
      if (!input.isOpen) {
        const n = input.bookings;
        return `Today: salon closed · ${n} booking${n === 1 ? "" : "s"}`;
      }
      const { dogsFree, percent, tone } = summaryShape(input.bookings, input.cap);
      const n = input.bookings;
      const parts = [`Today: ${n} booking${n === 1 ? "" : "s"}`];
      if (input.firstSlot) parts.push(`first ${input.firstSlot}`);
      if (input.lastSlot) parts.push(`last ${input.lastSlot}`);
      parts.push(`${dogsFree} dog${dogsFree === 1 ? "" : "s"} free`);
      let text = parts.join(" · ");
      if (tone === "full") text += " · Full — no space left";
      else if (tone === "quiet") {
        text += ` · Quiet day — ${percent}% of capacity`;
      }
      return text;
    }
  }
}

/** The complete Slack message: severity emoji plus body. */
export function buildAlertText(input: AlertInput): string {
  const severity = ALERT_SEVERITY[input.type];
  return `${SEVERITY_EMOJI[severity]} ${buildAlertBody(input)}`;
}

// ── Dedupe keys ────────────────────────────────────────────────────────

/**
 * The key that guarantees an alert posts once.
 *
 * Claimed by INSERT before posting, so a unique violation means somebody
 * already handled it. The cron-driven alerts (no-show, ready, unanswered) are
 * the ones that would otherwise repost every five minutes.
 *
 * Two keys carry more than the booking id on purpose:
 *   - moved/new includes the SLOT, so a second time change on the same day
 *     is a fresh alert rather than a suppressed one.
 *   - unanswered includes last_inbound_at, so a NEW customer message
 *     re-alerts while the same unanswered one stays quiet.
 */
export function buildDedupeKey(input: AlertInput): string {
  switch (input.type) {
    case "cancellation":
      return `cancel:${input.booking.id}`;
    case "moved_off":
      return `movedoff:${input.booking.id}:${input.previousDate}`;
    case "new_booking":
    case "moved_in":
      return `newbooking:${input.booking.id}:${input.bookingDate}:${input.booking.slot}`;
    case "no_show":
      return `noshow:${input.booking.id}:${input.bookingDate}`;
    case "ready_overdue":
      return `ready:${input.booking.id}:${input.bookingDate}`;
    case "unanswered":
      return `unanswered:${input.conversationId}:${input.lastInboundAt}`;
    case "summary":
      return `summary:${input.date}`;
  }
}

/** The booking this alert is about, if any — used for the queue's staleness
 *  check and for the stored alert record. */
export function alertBookingId(input: AlertInput): string | null {
  switch (input.type) {
    case "cancellation":
    case "moved_off":
    case "new_booking":
    case "moved_in":
    case "no_show":
    case "ready_overdue":
      return input.booking.id;
    default:
      return null;
  }
}

/** The conversation this alert is about, if any. */
export function alertConversationId(input: AlertInput): string | null {
  return input.type === "unanswered" ? input.conversationId : null;
}

/** The booking date this alert concerns, if any. */
export function alertBookingDate(input: AlertInput): string | null {
  switch (input.type) {
    case "cancellation":
    case "new_booking":
    case "no_show":
    case "ready_overdue":
      return input.bookingDate;
    case "moved_in":
      return input.bookingDate;
    case "moved_off":
      return input.previousDate;
    case "summary":
      return input.date;
    default:
      return null;
  }
}
