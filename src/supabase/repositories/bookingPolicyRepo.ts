/**
 * bookingPolicyRepo — the three booking-policy projection reads.
 *
 * Each read calls its RPC, normalises the PostgREST error shape, and runs
 * the returned projection through the guards in
 * bookingPolicyProjectionGuards.ts before handing it to the UI; an
 * unexpected shape is an invalid projection, never a partial render.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CustomerBookingVisitProjection,
  StaffBookingPolicyAttention,
  StaffBookingVisitProjection,
} from "../../types/bookingPolicy";
import {
  isCustomerBookingVisit,
  isNonEmptyString,
  isRecord,
  isStaffBookingPolicyAttention,
  isStaffBookingVisit,
  isUuid,
} from "./bookingPolicyProjectionGuards";

export interface BookingPolicyProjectionError {
  code?: string;
  message: string;
  details?: string | null;
  hint?: string | null;
}

function invalidProjection(): BookingPolicyProjectionError {
  return {
    code: "INVALID_BOOKING_POLICY_PROJECTION",
    message: "The booking policy response could not be verified.",
    details: null,
    hint: null,
  };
}

function networkError(cause: unknown): BookingPolicyProjectionError {
  return {
    code: "NETWORK_ERROR",
    message:
      cause instanceof Error
        ? cause.message
        : "The booking policy request failed.",
    details: null,
    hint: null,
  };
}

function normaliseRpcError(error: unknown): BookingPolicyProjectionError {
  if (!isRecord(error) || !isNonEmptyString(error.message)) {
    return {
      code: "RPC_ERROR",
      message: "The booking policy request failed.",
      details: null,
      hint: null,
    };
  }
  return {
    ...(isNonEmptyString(error.code) ? { code: error.code } : {}),
    message: error.message,
    details:
      error.details === null || typeof error.details === "string"
        ? error.details
        : null,
    hint:
      error.hint === null || typeof error.hint === "string"
        ? error.hint
        : null,
  };
}

export async function listCustomerBookingVisits(
  client: SupabaseClient,
  includeHistory: boolean | null = null,
): Promise<{
  visits: CustomerBookingVisitProjection[];
  error: BookingPolicyProjectionError | null;
}> {
  try {
    const { data, error } = await client.rpc("list_customer_booking_visits", {
      p_include_history: includeHistory,
    });
    if (error) {
      return {
        visits: [],
        error: normaliseRpcError(error),
      };
    }
    if (!Array.isArray(data) || !data.every(isCustomerBookingVisit)) {
      return { visits: [], error: invalidProjection() };
    }
    return { visits: data, error: null };
  } catch (cause) {
    return { visits: [], error: networkError(cause) };
  }
}

export async function listStaffBookingPolicyAttention(
  client: SupabaseClient,
): Promise<{
  attention: StaffBookingPolicyAttention | null;
  error: BookingPolicyProjectionError | null;
}> {
  try {
    const { data, error } = await client.rpc(
      "list_staff_booking_policy_attention",
    );
    if (error) {
      return {
        attention: null,
        error: normaliseRpcError(error),
      };
    }
    if (!isStaffBookingPolicyAttention(data)) {
      return { attention: null, error: invalidProjection() };
    }
    return { attention: data, error: null };
  } catch (cause) {
    return { attention: null, error: networkError(cause) };
  }
}

export async function getStaffBookingVisit(
  client: SupabaseClient,
  visitId: string,
): Promise<{
  visit: StaffBookingVisitProjection | null;
  error: BookingPolicyProjectionError | null;
}> {
  if (!isUuid(visitId)) {
    return { visit: null, error: invalidProjection() };
  }
  try {
    const { data, error } = await client.rpc("list_staff_booking_visit", {
      p_visit_id: visitId,
    });
    if (error) {
      return {
        visit: null,
        error: normaliseRpcError(error),
      };
    }
    if (data === null) return { visit: null, error: null };
    if (!isStaffBookingVisit(data)) {
      return { visit: null, error: invalidProjection() };
    }
    return { visit: data, error: null };
  } catch (cause) {
    return { visit: null, error: networkError(cause) };
  }
}
