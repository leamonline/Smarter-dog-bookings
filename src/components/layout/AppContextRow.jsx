import { useLocation } from "react-router-dom";
import { useWhatsAppUnread } from "../../supabase/hooks/useWhatsAppUnread.js";
import { useTomorrowReminders } from "../../supabase/hooks/useTomorrowReminders.js";
import { sectionTitleFor } from "./navConfig.jsx";

// ── Context row ───────────────────────────────────────────────────
// Sits directly under the header and gives the screen its identity:
// which section you're in, and (on Bookings) the day you're looking at
// plus a calm, glanceable status. Keeps the operational status out of
// the nav so the header stays calm. Mirrors — does not replace — the
// day navigator and the workflow sidebar.

const TONE = {
  closed: "bg-brand-coral-light text-brand-coral",
  open: "bg-emerald-50 text-emerald-700",
  full: "bg-sky-50 text-sky-700",
  info: "bg-cyan-50 text-cyan-800",
  amber: "bg-amber-50 text-amber-800",
};

function StatusPill({ tone, children }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-xs font-bold whitespace-nowrap ${TONE[tone]}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current" aria-hidden="true" />
      {children}
    </span>
  );
}

export function AppContextRow({ dateLabel, isOpen, dayTone = "open" }) {
  const location = useLocation();
  const sectionTitle = sectionTitleFor(location.pathname);
  const isBookings = sectionTitle === "Bookings";

  const { unread } = useWhatsAppUnread();
  const { sentCount, totalCount, loading: remindersLoading } = useTomorrowReminders();

  // The Today command centre owns its heading (with live counts), so the
  // context row stands down there — one "Today" on screen, not three.
  // (After the hooks: they must run unconditionally on every render.)
  if (sectionTitle === "Today") return null;

  // Live status chips for the Bookings day. Same semantics as the
  // workflow sidebar's calm chips, just phrased warmly.
  const inboxChip =
    unread === 0
      ? { tone: "info", label: "All caught up" }
      : { tone: "amber", label: `${unread > 99 ? "99+" : unread} to reply` };

  const remindersChip = remindersLoading
    ? null
    : totalCount === 0
      ? { tone: "info", label: "Nothing in for tomorrow" }
      : sentCount >= totalCount
        ? { tone: "amber", label: "All reminders are out" }
        : { tone: "amber", label: `${sentCount}/${totalCount} reminders sent` };

  return (
    <>
      {/* Desktop (lg+) — a calm strip attached under the header. */}
      <div className="hidden lg:grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 -mx-4 sm:-mx-6 mb-4 px-4 sm:px-6 py-3 bg-white/90 border border-slate-200 border-t-0 rounded-b-2xl shadow-card-resting">
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-display text-xl font-extrabold text-brand-purple whitespace-nowrap">
            {sectionTitle}
          </span>
          {isBookings && (
            <>
              <span className="text-sm font-semibold text-brand-purple-light truncate">
                {dateLabel}
              </span>
              <StatusPill tone={isOpen ? "open" : "closed"}>
                {isOpen ? "Open today" : "Closed today"}
              </StatusPill>
            </>
          )}
        </div>
        {isBookings && (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <StatusPill tone={inboxChip.tone}>{inboxChip.label}</StatusPill>
            {remindersChip && (
              <StatusPill tone={remindersChip.tone}>{remindersChip.label}</StatusPill>
            )}
          </div>
        )}
      </div>

      {/* Mobile/tablet (below lg) — a white identity block between the
          top bar and the nav strip. The day's date sits in a pill whose
          colour carries the day status (open / full / closed). */}
      <div className="lg:hidden -mx-4 sm:-mx-6 px-4 sm:px-6 pt-3 pb-3 bg-white border-b border-slate-200">
        <div className="flex items-center gap-2.5 flex-wrap">
          <h2 className="font-display text-xl font-extrabold text-brand-purple leading-tight">
            {sectionTitle}
          </h2>
          {isBookings && (
            <span
              className={`inline-flex items-center h-7 px-3 rounded-full text-xs font-bold whitespace-nowrap ${TONE[dayTone] || TONE.open}`}
            >
              {dateLabel}
            </span>
          )}
        </div>
      </div>
    </>
  );
}
