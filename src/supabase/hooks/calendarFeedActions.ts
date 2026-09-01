// Shared core for the calendar-feed hooks (Debt #12): token fetch,
// Edge-Function URL construction and revocation, parameterised by client and
// feed type so the customer portal and the staff settings tab share one
// implementation without sharing a Supabase client (the two clients stay
// separate so their auth sessions can't clobber each other). The token is a
// capability URL — it goes straight into the Edge Function link, never into
// state beyond the URL the caller renders.
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getOrCreateCalendarFeedToken,
  revokeCalendarFeedToken,
  type CalendarFeedType,
} from "../rpc";
import { logger } from "../../lib/logger";

// The webcal:// scheme is the standard protocol prefix for calendar
// subscriptions; the single-event URL stays https so the browser downloads
// the .ics (which opens the native "Add to Calendar" dialog on mobile).
function functionsBaseUrl(): string | null {
  const baseUrl = import.meta.env.VITE_SUPABASE_URL;
  return baseUrl ? `${baseUrl}/functions/v1` : null;
}

export interface CalendarFeedActions {
  getEventDownloadUrl: (bookingId: string) => Promise<string | null>;
  getFeedSubscribeUrl: (signal?: AbortSignal) => Promise<string | null>;
  revokeToken: () => Promise<void>;
}

export function createCalendarFeedActions(
  client: SupabaseClient | null,
  feedType: CalendarFeedType,
): CalendarFeedActions {
  // https URL that downloads a single booking's .ics, or null when the
  // client/env is unavailable or the token RPC fails (already logged).
  const getEventDownloadUrl = async (
    bookingId: string,
  ): Promise<string | null> => {
    if (!client) return null;
    const { data: token, error } = await getOrCreateCalendarFeedToken(
      client,
      feedType,
    );
    if (error || !token) {
      logger.error("Failed to get calendar token", error, {
        tags: { surface: feedType, op: "calendar-download-token" },
      });
      return null;
    }
    const base = functionsBaseUrl();
    if (!base) return null;
    return `${base}/calendar-ics?booking_id=${encodeURIComponent(bookingId)}&token=${encodeURIComponent(token)}`;
  };

  // webcal:// URL for the live all-appointments feed. Accepts an
  // AbortSignal so callers can cancel a stale fetch; an aborted call
  // resolves silently to null.
  const getFeedSubscribeUrl = async (
    signal?: AbortSignal,
  ): Promise<string | null> => {
    if (!client) return null;
    let query = getOrCreateCalendarFeedToken(client, feedType);
    if (signal) query = query.abortSignal(signal);
    const { data: token, error } = await query;
    // A cancelled fetch is not a failure — stay silent, the caller has
    // already moved on.
    if (signal?.aborted) return null;
    if (error || !token) {
      logger.error("Failed to get calendar token", error, {
        tags: { surface: feedType, op: "calendar-subscribe-token" },
      });
      return null;
    }
    const base = functionsBaseUrl();
    if (!base) return null;
    const httpsUrl = `${base}/calendar-feed?token=${encodeURIComponent(token)}`;
    return httpsUrl.replace(/^https?:\/\//, "webcal://");
  };

  // Invalidates the current token; the next get* call mints a fresh one.
  const revokeToken = async (): Promise<void> => {
    if (!client) return;
    await revokeCalendarFeedToken(client, feedType);
  };

  return { getEventDownloadUrl, getFeedSubscribeUrl, revokeToken };
}
