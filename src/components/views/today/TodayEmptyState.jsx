// What the day stack shows when the selected date has no bookings.
//
// An empty day used to say "No bookings on this date" and point at a button
// by a name the phone header did not use. It now does a job:
//
//   • a closed day names the next open day and what is booked on it, with a
//     way to go straight there — the question staff ask on a Saturday evening
//     is "what's Monday looking like?", not "is today empty?";
//   • an open today offers the one thing that can fill it, Manage availability,
//     as a real button with the same name as the dialog it opens;
//   • every empty day surfaces what needs a person anyway — unread messages and
//     customers awaiting approval — and opens the "Later" notes, because with
//     no dogs on screen they are the only work left.
//
// Read-only. The next-open-day lookup is useNextOpenDayBrief: it reads
// day_settings and bookings itself because useBookings only holds the current
// week, and on a Saturday the next open day is always in the next one.
import { ChevronRight, Clock3, MessageCircle, UserCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { useNextOpenDayBrief } from "../../../hooks/useNextOpenDayBrief";
import { useWhatsAppUnread } from "../../../supabase/hooks/useWhatsAppUnread";
import { usePendingSignupsCount } from "../../../supabase/hooks/usePendingSignupsCount";
import { Button } from "../../ui/Button.jsx";
import { TodayBriefNotes } from "./TodayBriefNotes.jsx";

// Text above its action on phones (a long date and a button do not share
// 360px gracefully); side by side from 640px up.
const CARD_ROW =
  "flex flex-col items-start gap-3 rounded-card border border-brand-paper-line bg-white px-4 py-4 " +
  "sm:flex-row sm:items-center sm:gap-4";

function dateFromStr(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** "6 dogs booked · first at 09:00", or "Nothing booked yet". */
export function describeDay(bookings) {
  if (bookings.length === 0) return "Nothing booked yet";
  const first = bookings
    .map((booking) => booking.slot)
    .filter(Boolean)
    .sort()[0];
  const dogs = `${bookings.length} ${bookings.length === 1 ? "dog" : "dogs"} booked`;
  return first ? `${dogs} · first at ${first}` : dogs;
}

function NextOpenDay({ fromDateStr, isOnline, onGoToDate }) {
  const next = useNextOpenDayBrief(fromDateStr, true);
  // The header's "Salon closed" chip already says the day is closed; this card
  // only needs to say what comes next.
  const eyebrow = "Next open day";

  if (next.loading) {
    return (
      <div className="rounded-card border border-brand-paper-line bg-white px-4 py-4" aria-busy="true">
        <p className="text-label text-ink-muted">{eyebrow}</p>
        <div className="mt-2 h-5 w-44 rounded bg-slate-200/80 motion-safe:animate-pulse" aria-hidden="true" />
        <span className="sr-only">Finding the next open day</span>
      </div>
    );
  }

  if (!next.dateStr) {
    // Either the lookahead found nothing open, or the lookup failed before it
    // could name a day. Neither is a claim about the diary.
    return (
      <div className="rounded-card border border-brand-paper-line bg-white px-4 py-4">
        <p className="text-label text-ink-muted">{eyebrow}</p>
        <p className="mt-1 text-body font-semibold text-brand-ink">
          {next.noOpenDay
            ? "No open days in the next 10 days."
            : "Couldn't find the next open day. Pick a date from the top to look ahead."}
        </p>
      </div>
    );
  }

  const nextDate = dateFromStr(next.dateStr);
  const longLabel = nextDate.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  const weekday = nextDate.toLocaleDateString("en-GB", { weekday: "long" });

  let detail = null;
  if (next.available) {
    detail = describeDay(next.bookings);
  } else if (isOnline) {
    // A failed read is not an empty diary: say so rather than "Nothing booked".
    detail = "Couldn't check its bookings — go to the day to see them.";
  }

  return (
    <section
      aria-label="Next open day"
      className={CARD_ROW}
    >
      <div className="w-full min-w-0 sm:flex-1">
        <p className="text-label text-ink-muted">{eyebrow}</p>
        <p className="mt-1 font-display text-lg font-bold leading-tight text-brand-ink">{longLabel}</p>
        {detail ? <p className="mt-0.5 text-body text-ink-muted">{detail}</p> : null}
      </div>
      {onGoToDate ? (
        <Button
          variant="strong"
          onClick={() => onGoToDate(next.dateStr)}
          aria-label={`Go to ${longLabel}`}
          iconRight={<ChevronRight size={16} aria-hidden="true" />}
          className="shrink-0"
        >
          Go to {weekday}
        </Button>
      ) : null}
    </section>
  );
}

function NeedsYouRow({ to, icon, children }) {
  return (
    <li>
      <Link
        to={to}
        className="flex min-h-11 items-center gap-3 rounded-tile px-3 py-2.5 text-body font-semibold text-brand-ink no-underline outline-none hover:bg-brand-ink/[0.04] focus-visible:ring-2 focus-visible:ring-brand-ink focus-visible:ring-offset-2"
      >
        <span className="shrink-0 text-ink-muted" aria-hidden="true">{icon}</span>
        <span className="min-w-0 flex-1">{children}</span>
        <ChevronRight size={16} aria-hidden="true" className="shrink-0 text-ink-muted" />
      </Link>
    </li>
  );
}

/** Unread messages and customers awaiting approval: work that waits for nobody's diary. */
function NeedsYou() {
  const { unread } = useWhatsAppUnread();
  const { count: pendingSignups } = usePendingSignupsCount();
  if (unread === 0 && pendingSignups === 0) return null;

  return (
    <section aria-labelledby="today-needs-you" className="rounded-card border border-brand-paper-line bg-white px-1 py-1">
      <h2 id="today-needs-you" className="px-3 pt-2 text-label text-ink-muted">Needs you</h2>
      <ul className="flex flex-col">
        {unread > 0 ? (
          <NeedsYouRow to="/inbox" icon={<MessageCircle size={18} />}>
            {unread} unread {unread === 1 ? "message" : "messages"}
          </NeedsYouRow>
        ) : null}
        {pendingSignups > 0 ? (
          <NeedsYouRow to="/humans" icon={<UserCheck size={18} />}>
            {pendingSignups} new {pendingSignups === 1 ? "customer" : "customers"} awaiting approval
          </NeedsYouRow>
        ) : null}
      </ul>
    </section>
  );
}

export function TodayEmptyState({
  dateStr,
  isToday,
  isDayOpen,
  /** Today still has unbooked slots that have not passed. */
  hasFreeSlots = false,
  isOnline,
  notesReady,
  onGoToDate,
  onManageAvailability,
  onOpenReports,
}) {
  // Manage availability sets same-day online slots, so it is only worth
  // offering on today, and only while a slot is still free and ahead.
  const offerAvailability = isToday && hasFreeSlots && Boolean(onManageAvailability);
  return (
    <div className="flex flex-col gap-3">
      {isDayOpen ? (
        <section
          aria-label="No bookings"
          className={CARD_ROW}
        >
          <div className="w-full min-w-0 sm:flex-1">
            <p className="font-display text-lg font-bold leading-tight text-brand-ink">
              {isToday ? "No bookings today" : "No bookings on this date"}
            </p>
            {offerAvailability ? (
              <p className="mt-0.5 text-body text-ink-muted">
                Put free slots online and customers can book themselves today.
              </p>
            ) : null}
          </div>
          {offerAvailability ? (
            <Button
              variant="ghost"
              onClick={onManageAvailability}
              iconLeft={<Clock3 size={15} aria-hidden="true" />}
              className="shrink-0"
            >
              Manage availability
            </Button>
          ) : null}
        </section>
      ) : (
        <NextOpenDay fromDateStr={dateStr} isOnline={isOnline} onGoToDate={onGoToDate} />
      )}
      <NeedsYou />
      {notesReady ? <TodayBriefNotes todayStr={dateStr} onOpenReports={onOpenReports} defaultOpen heading="Catch up" /> : null}
    </div>
  );
}
