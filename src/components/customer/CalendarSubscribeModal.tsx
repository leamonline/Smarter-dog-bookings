// src/components/customer/CalendarSubscribeModal.tsx
// Modal for subscribing to a live calendar feed of all appointments.
// Displays the webcal:// URL with copy-to-clipboard and platform instructions.

import { useState, useCallback, useEffect, useRef } from "react";
import { AccessibleModal } from "../shared/AccessibleModal.js";
import { customerSupabase as supabase } from "../../supabase/customerClient.js";
import {
  getOrCreateCalendarFeedToken,
  revokeCalendarFeedToken,
} from "../../supabase/rpc.js";
import { logger } from "../../lib/logger.js";

interface CalendarSubscribeModalProps {
  onClose: () => void;
}

export function CalendarSubscribeModal({ onClose }: CalendarSubscribeModalProps) {
  const [feedUrl, setFeedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  const tokenFetchControllerRef = useRef<AbortController | null>(null);

  const fetchToken = useCallback(async () => {
    if (!supabase) return;
    tokenFetchControllerRef.current?.abort();
    const controller = new AbortController();
    tokenFetchControllerRef.current = controller;

    setLoading(true);

    try {
      const { data: token, error } = await getOrCreateCalendarFeedToken(
        supabase,
        "customer",
      ).abortSignal(controller.signal);

      if (controller.signal.aborted) return;
      if (error || !token) {
        logger.error("Failed to get calendar token", error, {
          tags: { surface: "customer", op: "calendar-subscribe-token" },
        });
        setLoading(false);
        return;
      }

      const baseUrl = import.meta.env.VITE_SUPABASE_URL;
      if (!baseUrl) return;

      // webcal:// is the standard protocol prefix for calendar subscriptions
      const httpsUrl = `${baseUrl}/functions/v1/calendar-feed?token=${encodeURIComponent(token)}`;
      const webcalUrl = httpsUrl.replace(/^https?:\/\//, "webcal://");
      setFeedUrl(webcalUrl);
    } catch (err) {
      if (controller.signal.aborted) return;
      logger.error("Calendar subscribe error", err, {
        tags: { surface: "customer", op: "calendar-subscribe" },
      });
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchToken();
    return () => tokenFetchControllerRef.current?.abort();
  }, [fetchToken]);

  const handleCopy = useCallback(async () => {
    if (!feedUrl) return;
    try {
      await navigator.clipboard.writeText(feedUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
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
      // Revoke old token
      await revokeCalendarFeedToken(supabase, "customer");
      // Generate new one
      await fetchToken();
    } catch (err) {
      logger.error("Calendar token regenerate error", err, {
        tags: { surface: "customer", op: "calendar-regenerate" },
      });
    } finally {
      setRegenerating(false);
    }
  }, [regenerating, fetchToken]);

  return (
    <AccessibleModal
      onClose={onClose}
      titleId="calendar-subscribe-title"
      className="bg-white rounded-2xl shadow-xl max-w-md w-[90vw] p-6"
    >
      <div className="flex items-center justify-between mb-4">
        <h2 id="calendar-subscribe-title" className="font-['Quicksand','Montserrat',sans-serif] text-lg font-bold text-[var(--sd-navy)] m-0">
          Sync to Calendar
        </h2>
        <button
          onClick={onClose}
          className="bg-transparent border-none text-[var(--sd-ink-light)] text-xl cursor-pointer p-1 hover:text-[var(--sd-navy)]"
          aria-label="Close"
        >
          {"\u2715"}
        </button>
      </div>

      <p className="portal-text-help mb-4">
        Subscribe to a live calendar feed so all your appointments stay up to date automatically.
        Works with Apple Calendar, Google Calendar, and Outlook.
      </p>

      {loading ? (
        <div className="text-center py-6 portal-text-help">Loading\u2026</div>
      ) : feedUrl ? (
        <>
          {/* URL display + copy */}
          <div className="flex items-center gap-2 bg-[rgba(45,0,75,0.04)] rounded-lg p-3 mb-4">
            <input
              type="text"
              readOnly
              value={feedUrl}
              className="flex-1 bg-transparent border-none text-[11px] text-[var(--sd-navy-soft)] font-mono outline-none min-w-0"
              onClick={(e) => (e.target as HTMLInputElement).select()}
            />
            <button
              onClick={handleCopy}
              className="shrink-0 py-1.5 px-3 rounded-md bg-[var(--sd-navy)] text-white text-xs font-semibold border-none cursor-pointer hover:bg-[var(--sd-navy-soft)]"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>

          {/* Platform instructions */}
          <div className="space-y-3 mb-4">
            <div className="text-[12px] text-[var(--sd-navy-soft)]">
              <span className="font-bold">Apple Calendar (iPhone/Mac):</span>{" "}
              Tap the link below to subscribe automatically.
            </div>
            <a
              href={feedUrl}
              className="block text-center py-2 px-4 rounded-lg bg-[var(--sd-sky-tint)] text-[var(--sd-cyan-dark)] text-[13px] font-semibold no-underline hover:bg-[rgba(0,122,171,0.10)] transition-colors"
            >
              Open in Calendar App
            </a>
            <div className="text-[12px] text-[var(--sd-navy-soft)]">
              <span className="font-bold">Google Calendar:</span>{" "}
              Copy the URL above, go to Google Calendar Settings {"\u2192"} Add calendar {"\u2192"} From URL, and paste it.
            </div>
            <div className="text-[12px] text-[var(--sd-navy-soft)]">
              <span className="font-bold">Outlook:</span>{" "}
              Copy the URL, go to Outlook Calendar {"\u2192"} Add calendar {"\u2192"} Subscribe from web, and paste it.
            </div>
          </div>

          {/* Regenerate */}
          <div className="border-t border-[rgba(45,0,75,0.07)] pt-3">
            <button
              onClick={handleRegenerate}
              disabled={regenerating}
              className="bg-transparent border-none text-[12px] text-[var(--sd-ink-light)] cursor-pointer hover:text-[var(--sd-navy)] transition-colors disabled:opacity-50"
            >
              {regenerating ? "Regenerating\u2026" : "Regenerate URL (invalidates old link)"}
            </button>
          </div>
        </>
      ) : (
        <div className="portal-alert portal-alert--error text-center justify-center">
          Unable to generate calendar link. Please try again later.
        </div>
      )}
    </AccessibleModal>
  );
}
