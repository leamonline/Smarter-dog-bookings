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
