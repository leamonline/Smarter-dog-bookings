// src/components/customer/AddToCalendarButton.tsx
// "Add to Calendar" button that downloads a single-event .ics file.
// Works on all platforms: Apple Calendar, Google Calendar, Outlook.

import { useState, useCallback } from "react";
import { Calendar } from "lucide-react";
import { useCustomerCalendarFeed } from "../../supabase/hooks/useCustomerCalendarFeed";
import { logger } from "../../lib/logger";

interface AddToCalendarButtonProps {
  bookingId: string;
  /** Optional compact style for inline/icon usage */
  compact?: boolean;
  /** Render as a .portal-booking-action pill (booking-card action row) */
  pill?: boolean;
}

export function AddToCalendarButton({ bookingId, compact, pill }: AddToCalendarButtonProps) {
  const { getEventDownloadUrl } = useCustomerCalendarFeed();
  const [loading, setLoading] = useState(false);

  const handleClick = useCallback(async () => {
    if (loading) return;
    setLoading(true);

    try {
      // Token fetch + URL construction live in the hook; null means the
      // client/env is unavailable or the token failed (already logged).
      const url = await getEventDownloadUrl(bookingId);
      if (!url) return;

      // Trigger download — this opens the native "Add to Calendar" dialog on mobile
      window.open(url, "_blank");
    } catch (err) {
      logger.error("Calendar download error", err, {
        tags: { surface: "customer", op: "calendar-download" },
      });
    } finally {
      setLoading(false);
    }
  }, [bookingId, loading, getEventDownloadUrl]);

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
