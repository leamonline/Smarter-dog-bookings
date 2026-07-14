// Deposit-required flow + per-human slot rules: pure selectors, zero React.
// The DB is the authority (stamping trigger + hourly sweep, migration
// 20260714120000); everything here mirrors those rules for display and
// defence-in-depth filtering. The reference itself is SQL-generated ONLY
// (deposit_reference_for) — this module validates, never derives.
import { BOOKING_STATUS } from "../constants/salon";
import { londonWallClockToUtcMs } from "./today";

export const DEFAULT_DEPOSIT_RELEASE_HOURS = 12;

/** SDG- + 4 chars of the unambiguous alphabet (no 0/O/1/I). */
export const DEPOSIT_REFERENCE_PATTERN = /^SDG-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/;

export function isDepositReference(value: string): boolean {
  return DEPOSIT_REFERENCE_PATTERN.test(value);
}

/** Payment states that satisfy a required deposit. Exact DB literals. */
export const SETTLED_PAYMENT_STATES = ["Deposit Paid", "Paid in Full"] as const;

/** least(created + window, appointment start) — Europe/London aware. */
export function depositDueByMs(
  createdAtMs: number,
  bookingDate: string,
  slot: string,
  releaseHours: number = DEFAULT_DEPOSIT_RELEASE_HOURS,
): number {
  const windowEnd = createdAtMs + releaseHours * 3_600_000;
  const appointmentStart = londonWallClockToUtcMs(bookingDate, slot);
  return Math.min(windowEnd, appointmentStart);
}

export interface DepositStateFields {
  depositRequired?: boolean | null;
  depositReceivedAt?: string | null;
  payment?: string | null;
  status?: string | null;
}

/** Mirrors the auto-release sweep predicate (migration 20260714120000). */
export function isAwaitingDeposit(b: DepositStateFields): boolean {
  if (!b.depositRequired) return false;
  if (b.depositReceivedAt) return false;
  if (b.status === BOOKING_STATUS.CANCELLED) return false;
  const payment = b.payment || "Due at Pick-up";
  return !(SETTLED_PAYMENT_STATES as readonly string[]).includes(payment);
}

export interface HumanSlotRules {
  blockedSlots?: string[] | null;
  preferredSlots?: string[] | null;
}

/**
 * Portal slot list: blocked slots vanish (defence in depth in front of the
 * trigger), preferred slots float to the top ("Your usual time").
 */
export function partitionSlotsForHuman<T extends { dropOffTime: string }>(
  allocations: T[],
  rules: HumanSlotRules,
): { preferred: T[]; rest: T[] } {
  const blocked = new Set(rules.blockedSlots ?? []);
  const preferredSet = new Set(rules.preferredSlots ?? []);
  const visible = allocations.filter((a) => !blocked.has(a.dropOffTime));
  return {
    preferred: visible.filter((a) => preferredSet.has(a.dropOffTime)),
    rest: visible.filter((a) => !preferredSet.has(a.dropOffTime)),
  };
}

export interface AwaitingDepositFields extends DepositStateFields {
  depositDueBy?: string | null;
}

export interface AwaitingDeposit<T extends AwaitingDepositFields = AwaitingDepositFields> {
  booking: T;
  dueByMs: number | null;
  minutesLeft: number | null;
  overdue: boolean;
}

/**
 * Today view "awaiting deposit" section: every unpaid deposit booking with
 * time left, overdue rows first (the cron sweep takes them at :20 past),
 * then soonest-due.
 */
export function buildAwaitingDeposits<T extends AwaitingDepositFields>(
  bookings: T[],
  now: Date,
): AwaitingDeposit<T>[] {
  const nowMs = now.getTime();
  const items: AwaitingDeposit<T>[] = [];
  for (const b of bookings) {
    if (!isAwaitingDeposit(b)) continue;
    const dueByMs = b.depositDueBy ? new Date(b.depositDueBy).getTime() : null;
    const minutesLeft = dueByMs == null ? null : Math.round((dueByMs - nowMs) / 60_000);
    items.push({
      booking: b,
      dueByMs,
      minutesLeft,
      overdue: minutesLeft != null && minutesLeft < 0,
    });
  }
  return items.sort((a, c) => {
    if (a.overdue !== c.overdue) return a.overdue ? -1 : 1;
    return (a.dueByMs ?? Infinity) - (c.dueByMs ?? Infinity);
  });
}
