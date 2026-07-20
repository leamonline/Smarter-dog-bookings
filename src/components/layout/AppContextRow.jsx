import { useLocation } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useWhatsAppUnread } from "../../supabase/hooks/useWhatsAppUnread.js";
import { useTomorrowReminders } from "../../supabase/hooks/useTomorrowReminders.js";
import { sectionTitleFor } from "./navConfig.jsx";
import { PageHeader, PageHeaderPill } from "../ui/PageHeader.jsx";

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
  return <PageHeaderPill dot className={TONE[tone]}>{children}</PageHeaderPill>;
}

export function AppContextRow({ dateLabel, isOpen, dayTone, onNavigateDay }) {
  const location = useLocation();
  const sectionTitle = sectionTitleFor(location.pathname);
  const isBookings = sectionTitle === "Bookings";

  const { unread } = useWhatsAppUnread();
  const { sentCount, totalCount, loading: remindersLoading } = useTomorrowReminders();

  // Every view except Bookings owns its shared PageHeader, so the context row
  // stands down elsewhere. Keep this after the hooks: they must run
  // unconditionally on every render.
  if (!isBookings) return null;

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

  const localTone = !isOpen ? "closed" : dayTone === "full" ? "full" : "open";
  const localLabel = !isOpen ? "Closed today" : dayTone === "full" ? "Full today" : "Open today";

  return (
    <PageHeader title={sectionTitle}>
      <div className="grid w-full min-w-0 grid-cols-1 items-center gap-2 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:gap-4">
        <div className="order-2 flex min-w-0 items-center gap-2 overflow-x-auto md:order-1">
          <StatusPill tone={localTone}>{localLabel}</StatusPill>
          <StatusPill tone={inboxChip.tone}>{inboxChip.label}</StatusPill>
        </div>

        <div className="order-1 flex min-w-0 items-center justify-center gap-1 md:order-2">
          <button
            type="button"
            onClick={() => onNavigateDay?.(-1)}
            aria-label="Previous day"
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-brand-purple transition-colors hover:bg-brand-purple/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple focus-visible:ring-offset-1"
          >
            <ChevronLeft aria-hidden="true" size={20} strokeWidth={2.5} />
          </button>
          <strong className="min-w-0 px-1 text-center font-display text-base font-extrabold leading-tight text-brand-purple sm:text-lg">
            {dateLabel}
          </strong>
          <button
            type="button"
            onClick={() => onNavigateDay?.(1)}
            aria-label="Next day"
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-brand-purple transition-colors hover:bg-brand-purple/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple focus-visible:ring-offset-1"
          >
            <ChevronRight aria-hidden="true" size={20} strokeWidth={2.5} />
          </button>
        </div>

        <div className="order-3 hidden min-w-0 items-center justify-end gap-2 overflow-x-auto lg:flex">
          {remindersChip && (
            <StatusPill tone={remindersChip.tone}>{remindersChip.label}</StatusPill>
          )}
        </div>
      </div>
    </PageHeader>
  );
}
