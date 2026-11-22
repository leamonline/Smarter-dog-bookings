import type { SupabaseClient } from "@supabase/supabase-js";
import { getCustomerBookingRules, getCustomerChangeDeadlinePreview } from "./rpc";

export const LEGACY_BOOKING_HORIZON_DAYS = 28;

export function parseCustomerBookingHorizonDays(payload: unknown): number {
  if (!payload || typeof payload !== "object") {
    return LEGACY_BOOKING_HORIZON_DAYS;
  }

  const { bookingHorizonDays } = payload as { bookingHorizonDays?: unknown };
  return typeof bookingHorizonDays === "number" &&
    Number.isInteger(bookingHorizonDays) &&
    bookingHorizonDays >= 1 &&
    bookingHorizonDays <= 730
    ? bookingHorizonDays
    : LEGACY_BOOKING_HORIZON_DAYS;
}

export async function resolveCustomerBookingHorizonDays(
  client: SupabaseClient,
  onRpcError?: (error: unknown) => void,
): Promise<number> {
  const { data, error } = await getCustomerBookingRules(client);
  if (error) {
    onRpcError?.(error);
    return LEGACY_BOOKING_HORIZON_DAYS;
  }
  return parseCustomerBookingHorizonDays(data);
}

/**
 * The customer-visible slice of the salon's booking policy.
 *
 * `current_customer_booking_rules()` already returns a ready-made, staff-configured
 * sentence for the change deadline (`changeDeadline.description`) plus whether online
 * cancellation is switched on. The wizard used to fetch this payload and keep only
 * the horizon, while the confirmation step hard-coded its own cancellation sentence —
 * which drifted from the server rule it was describing.
 *
 * `null` means "not established". Callers must render nothing rather than guess:
 * a promise about cancelling that we cannot substantiate is worse than silence.
 */
export interface CustomerPortalPolicy {
  horizonDays: number;
  /** Staff-authored sentence describing the change deadline, or null if unreadable. */
  changeDeadlineDescription: string | null;
  /** The server's name for the deadline rule (`rolling_24h`, `previous_day_1500`), or null. */
  changeDeadlineRule: string | null;
  /** true/false when the server said so; null when unknown. */
  allowCancellations: boolean | null;
}

export const UNKNOWN_PORTAL_POLICY: CustomerPortalPolicy = {
  horizonDays: LEGACY_BOOKING_HORIZON_DAYS,
  changeDeadlineDescription: null,
  changeDeadlineRule: null,
  allowCancellations: null,
};

export function parseCustomerPortalPolicy(payload: unknown): CustomerPortalPolicy {
  const horizonDays = parseCustomerBookingHorizonDays(payload);
  if (!payload || typeof payload !== "object") {
    return { ...UNKNOWN_PORTAL_POLICY, horizonDays };
  }

  const { changeDeadline, customerPortal } = payload as {
    changeDeadline?: unknown;
    customerPortal?: unknown;
  };

  let changeDeadlineDescription: string | null = null;
  let changeDeadlineRule: string | null = null;
  if (changeDeadline && typeof changeDeadline === "object") {
    const { description, rule } = changeDeadline as { description?: unknown; rule?: unknown };
    if (typeof description === "string" && description.trim() !== "") {
      changeDeadlineDescription = description.trim();
    }
    if (typeof rule === "string" && rule.trim() !== "") changeDeadlineRule = rule.trim();
  }

  let allowCancellations: boolean | null = null;
  if (customerPortal && typeof customerPortal === "object") {
    const { allowCancellations: allowed } = customerPortal as { allowCancellations?: unknown };
    if (typeof allowed === "boolean") allowCancellations = allowed;
  }

  return { horizonDays, changeDeadlineDescription, changeDeadlineRule, allowCancellations };
}

/**
 * The server's name for the rule where the notice period is a staff-configured
 * number of hours (`cancellation_notice_hours()`, 24 by default). Its sentence
 * says rescheduling closes N hours before and cancelling stays open until the
 * appointment starts.
 */
export const ROLLING_CHANGE_RULE = "rolling_24h";

function hoursPhrase(hours: number, possessive: boolean): string {
  const n = Number.isInteger(hours) ? String(hours) : String(Number(hours.toFixed(2)));
  if (hours === 1) return possessive ? "1 hour\u2019s" : "1 hour";
  return possessive ? `${n} hours\u2019` : `${n} hours`;
}

/**
 * The owner's wording for "Need to change your appointment?" on the confirm step
 * (signed off 22 November 2026), with the notice period read from the server.
 *
 * It only speaks for the rolling rule, and only on facts the server has stated:
 * the rule from `current_customer_booking_rules()`, and the hours and both
 * switches from `customer_change_deadline_preview` for this slot. Anything else
 * (another rule such as 3:00 pm the day before, a missing preview, cancellation
 * switched off) returns null, and the caller shows the server's own sentence
 * or nothing. Rescheduling is promised only when the server said it is on.
 *
 * The consequence of a late cancellation matches the salon's Terms ("may require
 * a non-refundable deposit before future bookings"): it is a deposit, not a fee.
 */
export function changeAppointmentCopy({
  rule,
  minCancellationHours,
  allowCancellations,
  allowRescheduling,
}: {
  rule: string | null | undefined;
  minCancellationHours: number | null | undefined;
  allowCancellations: boolean | null | undefined;
  allowRescheduling: boolean | null | undefined;
}): string | null {
  if (rule !== ROLLING_CHANGE_RULE) return null;
  if (allowCancellations !== true) return null;
  if (typeof minCancellationHours !== "number" || !Number.isFinite(minCancellationHours) || minCancellationHours <= 0) {
    return null;
  }
  const cancel =
    `cancel anytime before it starts, although late cancellations (less than ${hoursPhrase(minCancellationHours, true)} notice) ` +
    "may mean we ask for a deposit on future bookings.";
  if (allowRescheduling !== true) return `You can ${cancel}`;
  return `You can reschedule up to ${hoursPhrase(minCancellationHours, false)} before your appointment. You can also ${cancel}`;
}

export async function resolveCustomerPortalPolicy(
  client: SupabaseClient,
  onRpcError?: (error: unknown) => void,
): Promise<CustomerPortalPolicy> {
  const { data, error } = await getCustomerBookingRules(client);
  if (error) {
    onRpcError?.(error);
    return UNKNOWN_PORTAL_POLICY;
  }
  return parseCustomerPortalPolicy(data);
}

/**
 * Whether a slot the customer is about to take is already past the point where
 * they could reschedule it online.
 *
 * Every field comes from `customer_change_deadline_preview`, which answers from
 * the settings `cancel_customer_booking` actually enforces. Nothing here is
 * recalculated: `src/engine/bookingPolicy.ts` records why the client must not
 * re-derive a deadline, and the September 2026 case that prompted this — a
 * customer booked 22h58m ahead and was refused a change 2h47m later — is
 * exactly the kind of near-boundary answer a second implementation gets wrong.
 */
export interface ChangeDeadlinePreview {
  /** London wall clock, "YYYY-MM-DDTHH:MM:SS" — the moment online changes close. */
  deadline: string;
  /** True when that moment is already behind us. */
  passed: boolean;
  /** False when online cancellation is switched off, or the config is ambiguous. */
  allowCancellations: boolean;
  /**
   * False when online rescheduling is switched off. Its own switch since
   * migration 20261110140000; `null` when the server predates it and sends no
   * answer, in which case a caller must not promise that moving is possible.
   */
  allowRescheduling: boolean | null;
  minCancellationHours: number;
}

/**
 * `null` means "not established" — an unreadable payload, an unusable slot, or
 * an RPC that failed. Callers must render nothing rather than guess: telling a
 * customer their booking is changeable when it is not is the failure this
 * whole path exists to prevent.
 */
export function parseChangeDeadlinePreview(payload: unknown): ChangeDeadlinePreview | null {
  if (!payload || typeof payload !== "object") return null;

  const { deadline, passed, allowCancellations, allowRescheduling, minCancellationHours } = payload as {
    deadline?: unknown;
    passed?: unknown;
    allowCancellations?: unknown;
    allowRescheduling?: unknown;
    minCancellationHours?: unknown;
  };

  if (typeof deadline !== "string" || deadline.trim() === "") return null;
  if (typeof passed !== "boolean") return null;
  if (typeof allowCancellations !== "boolean") return null;
  // jsonb numerics arrive as numbers through PostgREST, but a numeric column
  // can surface as a string; accept either rather than discarding a good answer.
  const hours =
    typeof minCancellationHours === "number"
      ? minCancellationHours
      : typeof minCancellationHours === "string" && minCancellationHours.trim() !== ""
        ? Number(minCancellationHours)
        : NaN;
  if (!Number.isFinite(hours) || hours < 0) return null;

  return {
    deadline,
    passed,
    allowCancellations,
    allowRescheduling: typeof allowRescheduling === "boolean" ? allowRescheduling : null,
    minCancellationHours: hours,
  };
}

export async function resolveChangeDeadlinePreview(
  client: SupabaseClient,
  params: { bookingDate: string; slot: string },
  onRpcError?: (error: unknown) => void,
): Promise<ChangeDeadlinePreview | null> {
  const { data, error } = await getCustomerChangeDeadlinePreview(client, params);
  if (error) {
    onRpcError?.(error);
    return null;
  }
  return parseChangeDeadlinePreview(data);
}
