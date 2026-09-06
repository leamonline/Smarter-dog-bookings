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
  /** true/false when the server said so; null when unknown. */
  allowCancellations: boolean | null;
}

export const UNKNOWN_PORTAL_POLICY: CustomerPortalPolicy = {
  horizonDays: LEGACY_BOOKING_HORIZON_DAYS,
  changeDeadlineDescription: null,
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
  if (changeDeadline && typeof changeDeadline === "object") {
    const { description } = changeDeadline as { description?: unknown };
    if (typeof description === "string" && description.trim() !== "") {
      changeDeadlineDescription = description.trim();
    }
  }

  let allowCancellations: boolean | null = null;
  if (customerPortal && typeof customerPortal === "object") {
    const { allowCancellations: allowed } = customerPortal as { allowCancellations?: unknown };
    if (typeof allowed === "boolean") allowCancellations = allowed;
  }

  return { horizonDays, changeDeadlineDescription, allowCancellations };
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
 * they could change or cancel it online.
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

  const { deadline, passed, allowCancellations, minCancellationHours } = payload as {
    deadline?: unknown;
    passed?: unknown;
    allowCancellations?: unknown;
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

  return { deadline, passed, allowCancellations, minCancellationHours: hours };
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
