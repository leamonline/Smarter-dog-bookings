import type { SupabaseClient } from "@supabase/supabase-js";
import { getCustomerBookingRules } from "./rpc";

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
