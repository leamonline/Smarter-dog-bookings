// Thin action hook so customer components can cancel a booking without
// importing the Supabase client directly (Debt #12). Mirrors the repository
// contract: success is exactly one verified receipt.
import { useCallback } from "react";
import { customerSupabase } from "../customerClient";
import {
  cancelCustomerBooking,
  type CustomerCancellationError,
  type CustomerCancellationReceipt,
} from "../repositories/bookingsRepo";

export function useCustomerBookingActions() {
  const cancelBooking = useCallback(
    async (input: {
      bookingId: string;
      reason: string;
    }): Promise<{
      receipt: CustomerCancellationReceipt | null;
      error: CustomerCancellationError | null;
    }> => {
      if (!customerSupabase) {
        return {
          receipt: null,
          error: {
            code: "CLIENT_UNAVAILABLE",
            message: "Customer bookings are unavailable",
            details: null,
            hint: null,
          },
        };
      }
      return cancelCustomerBooking(customerSupabase, input);
    },
    [],
  );

  return { cancelBooking };
}
