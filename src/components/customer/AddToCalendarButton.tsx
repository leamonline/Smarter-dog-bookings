// src/components/customer/AddToCalendarButton.tsx
// "Add to Calendar" button that downloads a single-event .ics file.
// Works on all platforms: Apple Calendar, Google Calendar, Outlook.

import { useState, useCallback } from "react";
import { Calendar } from "lucide-react";
import { customerSupabase as supabase } from "../../supabase/customerClient";
import { getOrCreateCalendarFeedToken } from "../../supabase/rpc";
import { logger } from "../../lib/logger";

interface AddToCalendarButtonProps {
  bookingId: string;
  /** Optional compact style for inline/icon usage */
  compact?: boolean;
  /** Render as a .portal-booking-action pill (booking-card action row) */
  pill?: boolean;
}

export function AddToCalendarButton({ bookingId, compact, pill }: AddToCalendarButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleClick = useCallback(async () => {
    if (!supabase || loading) return;
    setLoading(true);

    try {
      // Get or create a feed token for the current customer
      const { data: token, error } = await getOrCreateCalendarFeedToken(
        supabase,
        "customer",
      );

      if (error || !token) {
        logger.error("Failed to get calendar token", error, {
          tags: { surface: "customer", op: "calendar-download-token" },
        });
        return;
      }

      // Build the Edge Function URL for single-event download
      const baseUrl = import.meta.env.VITE_SUPABASE_URL;
      if (!baseUrl) return;

      const url = `${baseUrl}/functions/v1/calendar-ics?booking_id=${encodeURIComponent(bookingId)}&token=${encodeURIComponent(token)}`;

      // Trigger download — this opens the native "Add to Calendar" dialog on mobile
      window.open(url, "_blank");
    } catch (err) {
      logger.error("Calendar download error", err, {
        tags: { surface: "customer", op: "calendar-download" },
      });
    } finally {
      setLoading(false);
    }
  }, [bookingId, loading]);

  if (pill) {
    return (
      <button
        onClick={handleClick}
        disabled={loading}
        className="portal-booking-action"
        aria-label="Add to calendar"
      >
        <Calendar size={14} aria-hidden="true" />
        {loading ? "…" : "Calendar"}
      </button>
    );
  }

  if (compact) {
    return (
      <button
        onClick={handleClick}
        disabled={loading}
        title="Add to calendar"
        className="bg-transparent border-none cursor-pointer text-base p-0 leading-none opacity-70 hover:opacity-100 transition-opacity disabled:opacity-40"
        aria-label="Add to calendar"
      >
        {"\uD83D\uDCC5"}
      </button>
    );
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="py-2 px-5 rounded-lg border border-[rgba(0,122,171,0.30)] bg-[var(--sd-sky-tint)] text-[var(--sd-cyan-dark)] font-semibold text-[13px] cursor-pointer font-[inherit] hover:bg-[rgba(0,122,171,0.10)] transition-colors disabled:opacity-50"
    >
      {loading ? "Loading..." : "\uD83D\uDCC5 Add to Calendar"}
    </button>
  );
}
