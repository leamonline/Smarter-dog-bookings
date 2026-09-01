// Calendar-feed actions for the customer portal (Debt #12): token fetch,
// URL construction and revocation live here so the calendar button and the
// subscribe modal never import the Supabase client directly. The token is a
// capability URL — it goes straight into the Edge Function link, never into
// state beyond the URL the caller renders.
import { useCallback } from "react";
import { customerSupabase } from "../customerClient";
import {
  getOrCreateCalendarFeedToken,
  revokeCalendarFeedToken,
} from "../rpc";
import { logger } from "../../lib/logger";

// The webcal:// scheme is the standard protocol prefix for calendar
// subscriptions; the single-event URL stays https so the browser downloads
// the .ics (which opens the native "Add to Calendar" dialog on mobile).
function functionsBaseUrl(): string | null {
  const baseUrl = import.meta.env.VITE_SUPABASE_URL;
  return baseUrl ? `${baseUrl}/functions/v1` : null;
}

export function useCustomerCalendarFeed() {
  // https URL that downloads a single booking's .ics, or null when the
  // client/env is unavailable or the token RPC fails (already logged).
  const getEventDownloadUrl = useCallback(
    async (bookingId: string): Promise<string | null> => {
      if (!customerSupabase) return null;
      const { data: token, error } = await getOrCreateCalendarFeedToken(
        customerSupabase,
        "customer",
      );
      if (error || !token) {
        logger.error("Failed to get calendar token", error, {
          tags: { surface: "customer", op: "calendar-download-token" },
        });
        return null;
      }
      const base = functionsBaseUrl();
      if (!base) return null;
      return `${base}/calendar-ics?booking_id=${encodeURIComponent(bookingId)}&token=${encodeURIComponent(token)}`;
    },
    [],
  );

  // webcal:// URL for the live all-appointments feed. Accepts an
  // AbortSignal so the modal can cancel a stale fetch; an aborted call
  // rejects like any aborted PostgREST request.
  const getFeedSubscribeUrl = useCallback(
    async (signal?: AbortSignal): Promise<string | null> => {
      if (!customerSupabase) return null;
      let query = getOrCreateCalendarFeedToken(customerSupabase, "customer");
      if (signal) query = query.abortSignal(signal);
      const { data: token, error } = await query;
      // A cancelled fetch is not a failure — stay silent, the caller has
      // already moved on.
      if (signal?.aborted) return null;
      if (error || !token) {
        logger.error("Failed to get calendar token", error, {
          tags: { surface: "customer", op: "calendar-subscribe-token" },
        });
        return null;
      }
      const base = functionsBaseUrl();
      if (!base) return null;
      const httpsUrl = `${base}/calendar-feed?token=${encodeURIComponent(token)}`;
      return httpsUrl.replace(/^https?:\/\//, "webcal://");
    },
    [],
  );

  // Invalidates the current token; the next get* call mints a fresh one.
  const revokeToken = useCallback(async (): Promise<void> => {
    if (!customerSupabase) return;
    await revokeCalendarFeedToken(customerSupabase, "customer");
  }, []);

  return { getEventDownloadUrl, getFeedSubscribeUrl, revokeToken };
}
