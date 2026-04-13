// src/components/views/settings/CalendarSettings.jsx
// Staff settings tab for calendar sync — subscribe to a feed of all bookings.

import { useState, useCallback, useEffect } from "react";
import { supabase } from "../../../supabase/client.js";

export function CalendarSettings() {
  const [feedUrl, setFeedUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  const fetchToken = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);

    try {
      const { data: token, error } = await supabase.rpc(
        "get_or_create_calendar_feed_token",
        { p_feed_type: "staff" },
      );

      if (error || !token) {
        console.error("Failed to get calendar token:", error);
        setLoading(false);
        return;
      }

      const baseUrl = import.meta.env.VITE_SUPABASE_URL;
      if (!baseUrl) return;

      const httpsUrl = `${baseUrl}/functions/v1/calendar-feed?token=${encodeURIComponent(token)}`;
      const webcalUrl = httpsUrl.replace(/^https?:\/\//, "webcal://");
      setFeedUrl(webcalUrl);
    } catch (err) {
      console.error("Calendar settings error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchToken();
  }, [fetchToken]);

  const handleCopy = useCallback(async () => {
    if (!feedUrl) return;
    try {
      await navigator.clipboard.writeText(feedUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const input = document.createElement("input");
      input.value = feedUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [feedUrl]);

  const handleRegenerate = useCallback(async () => {
    if (!supabase || regenerating) return;
    setRegenerating(true);

    try {
      await supabase.rpc("revoke_calendar_feed_token", { p_feed_type: "staff" });
      await fetchToken();
    } catch (err) {
      console.error("Regenerate error:", err);
    } finally {
      setRegenerating(false);
    }
  }, [regenerating, fetchToken]);

  return (
    <div className="space-y-6 animate-[fadeIn_0.2s_ease-in]">
      {/* Staff Calendar Feed */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <h3 className="text-[15px] font-bold text-slate-800 mb-1">Staff Calendar Feed</h3>
        <p className="text-[13px] text-slate-500 mb-4 leading-relaxed">
          Subscribe to this URL in your calendar app to see all salon bookings.
          The feed auto-updates so new bookings, changes, and cancellations will appear automatically.
        </p>

        {loading ? (
          <div className="text-slate-400 text-sm py-4">Loading feed URL...</div>
        ) : feedUrl ? (
          <>
            {/* URL + copy */}
            <div className="flex items-center gap-2 bg-slate-50 rounded-lg p-3 mb-3">
              <input
                type="text"
                readOnly
                value={feedUrl}
                className="flex-1 bg-transparent border-none text-[11px] text-slate-600 font-mono outline-none min-w-0"
                onClick={(e) => e.target.select()}
              />
              <button
                onClick={handleCopy}
                className="shrink-0 py-1.5 px-3 rounded-md bg-brand-teal text-white text-xs font-semibold border-none cursor-pointer hover:bg-brand-teal/90"
              >
                {copied ? "Copied!" : "Copy URL"}
              </button>
            </div>

            {/* Open directly */}
            <a
              href={feedUrl}
              className="inline-block py-2 px-4 rounded-lg bg-brand-teal/5 border border-brand-teal/20 text-brand-teal text-[13px] font-semibold no-underline hover:bg-brand-teal/10 transition-colors mb-3"
            >
              Open in Calendar App
            </a>

            {/* Regenerate */}
            <div className="border-t border-slate-100 pt-3 mt-3">
              <button
                onClick={handleRegenerate}
                disabled={regenerating}
                className="bg-transparent border-none text-[12px] text-slate-400 cursor-pointer hover:text-slate-600 transition-colors disabled:opacity-50"
              >
                {regenerating ? "Regenerating..." : "Regenerate URL (invalidates old link)"}
              </button>
            </div>
          </>
        ) : (
          <div className="text-red-400 text-sm py-4">
            Unable to generate feed URL. Ensure Supabase is connected.
          </div>
        )}
      </div>

      {/* Platform instructions */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
        <h3 className="text-[15px] font-bold text-slate-800 mb-3">How to Subscribe</h3>
        <div className="space-y-3 text-[13px] text-slate-600 leading-relaxed">
          <div>
            <span className="font-bold">Apple Calendar (iPhone/Mac):</span>{" "}
            Tap "Open in Calendar App" above, or go to Settings {"\u2192"} Calendar {"\u2192"} Accounts {"\u2192"} Add Account {"\u2192"} Other {"\u2192"} Add Subscribed Calendar, and paste the URL.
          </div>
          <div>
            <span className="font-bold">Google Calendar:</span>{" "}
            Copy the URL, go to Google Calendar {"\u2192"} Settings {"\u2192"} Add calendar {"\u2192"} From URL, and paste it.
            Note: Google Calendar refreshes external feeds approximately every 12 hours.
          </div>
          <div>
            <span className="font-bold">Outlook:</span>{" "}
            Copy the URL, go to Outlook Calendar {"\u2192"} Add calendar {"\u2192"} Subscribe from web, and paste it.
          </div>
        </div>
      </div>

      {/* Customer info */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-5">
        <h3 className="text-[15px] font-bold text-slate-800 mb-1">Customer Calendar Sync</h3>
        <p className="text-[13px] text-slate-500 leading-relaxed">
          Customers can add appointments to their personal calendar from the booking confirmation screen
          and their dashboard. Each customer gets their own feed URL that only shows their appointments.
        </p>
      </div>
    </div>
  );
}
