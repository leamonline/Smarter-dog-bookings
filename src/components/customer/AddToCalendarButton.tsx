// src/components/customer/AddToCalendarButton.tsx
// "Add to Calendar" button that downloads a single-event .ics file.
// Works on all platforms: Apple Calendar, Google Calendar, Outlook.

import { useState, useCallback } from "react";
import { customerSupabase as supabase } from "../../supabase/customerClient.js";

interface AddToCalendarButtonProps {
  bookingId: string;
  /** Optional compact style for inline/icon usage */
  compact?: boolean;
}

export function AddToCalendarButton({ bookingId, compact }: AddToCalendarButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleClick = useCallback(async () => {
    if (!supabase || loading) return;
    setLoading(true);

    try {
      // Get or create a feed token for the current customer
      const { data: token, error } = await supabase.rpc(
        "get_or_create_calendar_feed_token",
        { p_feed_type: "customer" },
      );

      if (error || !token) {
        console.error("Failed to get calendar token:", error);
        return;
      }

      // Build the Edge Function URL for single-event download
      const baseUrl = import.meta.env.VITE_SUPABASE_URL;
      if (!baseUrl) return;

      const url = `${baseUrl}/functions/v1/calendar-ics?booking_id=${encodeURIComponent(bookingId)}&token=${encodeURIComponent(token)}`;

      // Trigger download — this opens the native "Add to Calendar" dialog on mobile
      window.open(url, "_blank");
    } catch (err) {
      console.error("Calendar download error:", err);
    } finally {
      setLoading(false);
    }
  }, [bookingId, loading]);

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
      className="py-2 px-5 rounded-lg border border-brand-teal/30 bg-brand-teal/5 text-brand-teal font-semibold text-[13px] cursor-pointer font-[inherit] hover:bg-brand-teal/10 transition-colors disabled:opacity-50"
    >
      {loading ? "Loading..." : "\uD83D\uDCC5 Add to Calendar"}
    </button>
  );
}
