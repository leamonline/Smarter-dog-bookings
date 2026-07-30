// "N grooms in the last fortnight aren't marked paid" — the warm note's one
// number. The unpaid predicate mirrors isPaymentOutstanding exactly
// (payment !== "Paid in Full" on a non-cancelled row; a missing payment
// means "Due at Pick-up"), applied client-side over a two-week window so
// the query and the app can't disagree about what "unpaid" means.
import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "../supabase/client";
import { BOOKING_STATUS } from "../constants/salon";
import { logger } from "../lib/logger";

/** Date-string arithmetic in UTC — immune to DST and device timezone. */
export function addDaysStr(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

export async function fetchUnpaidFortnightCount(
  client: SupabaseClient,
  todayStr: string,
  signal: AbortSignal,
): Promise<number> {
  const { data, error } = await client
    .from("bookings")
    .select("payment")
    .gte("booking_date", addDaysStr(todayStr, -14))
    .lt("booking_date", todayStr)
    .neq("status", BOOKING_STATUS.CANCELLED)
    .abortSignal(signal);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<{ payment: string | null }>).filter(
    (b) => (b.payment || "Due at Pick-up") !== "Paid in Full",
  ).length;
}

interface UnpaidFortnight {
  loading: boolean;
  /** false offline or on error — the note simply doesn't render. */
  available: boolean;
  count: number;
}

export function useUnpaidFortnight(todayStr: string): UnpaidFortnight {
  const [state, setState] = useState<UnpaidFortnight>({ loading: true, available: false, count: 0 });

  useEffect(() => {
    if (!supabase) {
      setState({ loading: false, available: false, count: 0 });
      return;
    }
    const controller = new AbortController();
    fetchUnpaidFortnightCount(supabase, todayStr, controller.signal)
      .then((count) => {
        if (!controller.signal.aborted) setState({ loading: false, available: true, count });
      })
      .catch((err) => {
        if (!controller.signal.aborted) {
          logger.error("useUnpaidFortnight: failed to count unpaid grooms", err);
          setState({ loading: false, available: false, count: 0 });
        }
      });
    return () => controller.abort();
  }, [todayStr]);

  return state;
}
