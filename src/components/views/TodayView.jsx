// Today command centre — the staff daily landing screen, in the morning-brief
// layout. One booking, one truth: a slot-grouped diary with one expandable row
// per booking/dog (built on the pure buildTodayFeed/groupFeedBySlot
// selectors), a KPI card row, the sticky Now strip, warm notes, and a separate
// "Manage availability" modal. All logic lives in the Today engine
// (src/engine/today.ts) so the component just wires data + actions.
//
// Closed days show a READ-ONLY brief of the next open day instead (see
// ClosedDayBrief below) — one-date rule: everything date-specific in that mode
// derives from the brief's date + bookings, never from today's.
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { resolveBookingDisplay, getDogByIdOrName, buildMarkPaidPatch } from "../../engine/bookingRules";
import { buildSlotGrid } from "../../engine/slotGrid";
import {
  londonDateStr,
  paymentState,
  buildDaySummary,
  buildTakingsByMethod,
  buildSlotOpportunities,
  buildAvailabilityView,
  buildTodayFeed,
  selectNowNext,
  groupFeedBySlot,
  buildFutureDayFeed,
  countDogsPerOwner,
} from "../../engine/today";
import { BOOKING_STATUS } from "../../constants/index";
import { safeGet, safeSet } from "../../lib/storage";
import { useToast } from "../../contexts/ToastContext.jsx";
import { useSalonPricing } from "../../contexts/SalonContext";
import { useOnTheWaySignals } from "../../hooks/useOnTheWaySignals.ts";
import { useNextOpenDayBrief } from "../../hooks/useNextOpenDayBrief";
import { TodayHeader } from "./today/TodayHeader.jsx";
import { TodayNowStrip } from "./today/TodayNowStrip.jsx";
import { BookingFeed } from "./today/BookingFeed.jsx";
import { AvailabilityModal } from "./today/AvailabilityModal.jsx";
import { TodaySummaryStrip } from "./today/TodaySummaryStrip.jsx";
import { TodayKpiRow } from "./today/TodayKpiRow.jsx";
import { TodayBriefNotes } from "./today/TodayBriefNotes.jsx";

function SectionSkeleton() {
  return (
    <div className="rounded-2xl border border-brand-paper-line bg-white p-4 motion-safe:animate-pulse">
      <div className="h-4 w-40 bg-slate-100 rounded mb-3" />
      <div className="h-14 bg-slate-50 rounded mb-2" />
      <div className="h-14 bg-slate-50 rounded" />
    </div>
  );
}

/** Pretty "Monday 13 July" from a YYYY-MM-DD, without touching the clock. */
function prettyDate(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
}

/**
 * The closed-day, read-only brief for the next open day. One-date rule:
 * every figure and label below derives from brief.dateStr + brief.bookings;
 * nothing here may read today's bookings or the live clock.
 */
export function ClosedDayBrief({ brief, dogs, resolve, getWelfare, paymentOf, onOpenCalendar }) {
  const feed = useMemo(() => buildFutureDayFeed(brief.bookings), [brief.bookings]);
  const groups = useMemo(() => groupFeedBySlot(feed), [feed]);
  const ownerCounts = useMemo(() => countDogsPerOwner(feed, dogs), [feed, dogs]);
  const summary = useMemo(() => buildDaySummary(brief.bookings, dogs), [brief.bookings, dogs]);

  const banner = (
    <div className="rounded-xl bg-brand-purple/[0.06] text-brand-purple px-3.5 py-2.5 text-[13px] font-semibold flex items-center justify-between gap-2 flex-wrap">
      <span>Closed today — here&apos;s your next open day{brief.dateStr ? `: ${prettyDate(brief.dateStr)}` : ""}.</span>
      {onOpenCalendar && (
        <button type="button" onClick={onOpenCalendar} className="min-h-[44px] px-1 font-bold underline underline-offset-2">
          Open the calendar
        </button>
      )}
    </div>
  );

  if (brief.loading) {
    return (
      <>
        {banner}
        <SectionSkeleton />
      </>
    );
  }

  if (!brief.available) {
    return (
      <>
        {banner}
        <div className="rounded-2xl border border-brand-paper-line bg-white px-6 py-8 text-center">
          <p className="text-[14px] font-bold text-slate-700">
            Couldn&apos;t load the diary{brief.dateStr ? ` for ${prettyDate(brief.dateStr)}` : ""}.
          </p>
          <button
            type="button"
            onClick={brief.refresh}
            className="mt-2 min-h-[44px] px-4 text-[13px] font-bold text-brand-purple underline underline-offset-2"
          >
            Try again
          </button>
        </div>
      </>
    );
  }

  if (brief.noOpenDay) {
    return (
      <>
        {banner}
        <div className="rounded-2xl border border-brand-paper-line bg-white px-6 py-8 text-center">
          <p className="text-[14px] font-bold text-slate-700">No open days in the next ten days.</p>
        </div>
      </>
    );
  }

  return (
    <>
      {banner}
      <TodayKpiRow dogsBooked={summary.dogsBooked} expectedRevenue={summary.expectedRevenue} />
      {brief.bookings.length === 0 ? (
        <div className="rounded-2xl border border-brand-paper-line bg-white px-6 py-8 text-center">
          <p className="text-[14px] font-bold text-slate-700">Nothing booked in yet for {prettyDate(brief.dateStr)}.</p>
        </div>
      ) : (
        <BookingFeed
          groups={groups}
          readOnly
          ownerCounts={ownerCounts}
          dogs={dogs}
          resolve={resolve}
          getWelfare={getWelfare}
          paymentOf={paymentOf}
        />
      )}
    </>
  );
}

export function TodayView({
  bookingsByDate,
  bookingsLoading,
  bookingsError,
  dogs,
  humans,
  daySettings,
  dayOpenState,
  isOnline,
  onUpdateBooking,
  onOpenBooking,
  onNewBooking,
  onSendCollection,
  toggleImmediateSlot,
  onRefresh,
}) {
  const navigate = useNavigate();
  const toast = useToast();
  const configPricing = useSalonPricing();

  // Re-tick every minute so "15 min overdue" / "waiting 25 min" stay live.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const [showAvailability, setShowAvailability] = useState(false);

  const todayStr = londonDateStr(now);
  const todaySettings = daySettings?.[todayStr] || {};
  const todayBookings = useMemo(() => bookingsByDate?.[todayStr] || [], [bookingsByDate, todayStr]);
  const activeSlots = useMemo(() => buildSlotGrid(todaySettings.extraSlots || []), [todaySettings.extraSlots]);
  const immediateSet = useMemo(() => new Set(todaySettings.immediateSlots || []), [todaySettings.immediateSlots]);
  const isDayOpen = dayOpenState?.[todayStr] !== false;

  // Closed days: the read-only next-open-day brief (fetches only when needed).
  const brief = useNextOpenDayBrief(todayStr, !isDayOpen);

  // ---- Engine selectors ----
  const summary = useMemo(() => buildDaySummary(todayBookings, dogs), [todayBookings, dogs]);
  const takings = useMemo(() => buildTakingsByMethod(todayBookings), [todayBookings]);
  const feed = useMemo(() => buildTodayFeed(todayBookings, now), [todayBookings, now]);
  const opportunities = useMemo(
    () => buildSlotOpportunities({
      bookings: todayBookings,
      activeSlots,
      overrides: todaySettings.overrides || {},
      immediateSlots: todaySettings.immediateSlots || [],
      now,
      todayStr,
    }),
    [todayBookings, activeSlots, todaySettings.overrides, todaySettings.immediateSlots, now, todayStr],
  );
  const availabilityView = useMemo(() => buildAvailabilityView(opportunities, immediateSet), [opportunities, immediateSet]);

  // "Owner on the way" chips — read-only WhatsApp signal for the dogs currently
  // waiting to be collected.
  const readyBookings = useMemo(() => feed.filter((e) => e.stage === "ready").map((e) => e.booking), [feed]);
  const onTheWaySignals = useOnTheWaySignals(readyBookings);

  // ---- Per-day hides (local UI only; never mutates booking data). Only a
  // not-yet-arrived, non-owing booking offers "Hide until tomorrow" — money
  // never hides.
  const dismissKey = `sd-today-dismissed-${todayStr}`;
  const [dismissed, setDismissed] = useState(() => {
    try {
      return new Set(JSON.parse(safeGet("local", dismissKey) || "[]"));
    } catch {
      return new Set();
    }
  });
  useEffect(() => {
    safeSet("local", dismissKey, JSON.stringify([...dismissed]));
  }, [dismissed, dismissKey]);
  const onHideUntilTomorrow = useCallback((id) => setDismissed((prev) => new Set(prev).add(id)), []);

  const visibleFeed = useMemo(() => feed.filter((e) => !dismissed.has(e.booking.id)), [feed, dismissed]);
  const actionCount = useMemo(() => visibleFeed.filter((e) => e.needsAction).length, [visibleFeed]);
  // The sticky strip reads the same visible feed the diary renders from, so
  // marking a dog arrived/ready/collected updates both in the same render.
  const nowNext = useMemo(() => selectNowNext(visibleFeed, now), [visibleFeed, now]);
  const groups = useMemo(() => groupFeedBySlot(visibleFeed), [visibleFeed]);
  const ownerCounts = useMemo(() => countDogsPerOwner(visibleFeed, dogs), [visibleFeed, dogs]);

  // ---- Row expansion + "jump to row" from the sticky strip ----
  const [expandedIds, setExpandedIds] = useState(() => new Set());
  const onToggleExpand = useCallback((id) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const [highlightId, setHighlightId] = useState(null);
  const highlightTimer = useRef(null);
  useEffect(() => () => clearTimeout(highlightTimer.current), []);
  const onJumpTo = useCallback((id) => {
    setExpandedIds((prev) => new Set(prev).add(id));
    // Scroll + focus after the expanded row has rendered.
    requestAnimationFrame(() => {
      const el = document.getElementById(`today-card-${id}`);
      if (!el) return;
      const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
      el.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
      document.getElementById(`today-card-${id}-toggle`)?.focus({ preventScroll: true });
    });
    setHighlightId(id);
    clearTimeout(highlightTimer.current);
    highlightTimer.current = setTimeout(() => setHighlightId(null), 1600);
  }, []);

  // Warm notes mount after first paint so their queries never delay the page.
  const [notesReady, setNotesReady] = useState(false);
  useEffect(() => setNotesReady(true), []);
  const onOpenReports = useCallback(() => navigate("/reports"), [navigate]);

  // ---- Display + welfare + payment resolvers ----
  const resolve = useCallback((b) => resolveBookingDisplay(b, dogs, humans), [dogs, humans]);
  const getWelfare = useCallback((b) => {
    const dog = getDogByIdOrName(dogs, b._dogId || b.dogName);
    return { alerts: dog?.alerts || [], pregnant: !!dog?.isPregnant, notes: b.notes || "" };
  }, [dogs]);
  const paymentOf = useCallback((b) => {
    const dog = getDogByIdOrName(dogs, b._dogId || b.dogName);
    return paymentState(b, dog?.customPrice ?? null);
  }, [dogs]);

  const unpaidTotal = useMemo(
    () => visibleFeed.filter((e) => e.owes).reduce((n, e) => n + (paymentOf(e.booking).amountDue ?? 0), 0),
    [visibleFeed, paymentOf],
  );

  // ---- Actions (reuse the exact update path the detail modal uses) ----
  const patch = useCallback(async (b, changes, message) => {
    // Everything on this page is today's booking; offline sample rows carry
    // no _bookingDate, so fall back to today rather than silently no-opping.
    const date = b._bookingDate || todayStr;
    const result = await onUpdateBooking({ ...b, ...changes }, date, date);
    if (result !== null && message) toast.show(message, "success");
    return result;
  }, [onUpdateBooking, toast, todayStr]);

  const onMarkArrived = useCallback((b) => patch(b, { status: BOOKING_STATUS.CHECKED_IN }, `${b.dogName} checked in`), [patch]);
  const onStartGroom = useCallback((b) => patch(b, { status: BOOKING_STATUS.IN_BATH }, `${b.dogName} — groom started`), [patch]);
  const onMarkReady = useCallback((b) => patch(b, { status: BOOKING_STATUS.READY_FOR_PICKUP }, `${b.dogName} is ready to go home`), [patch]);
  const onMarkCollected = useCallback((b) => patch(b, { status: BOOKING_STATUS.COMPLETED }, `${b.dogName} collected — lovely`), [patch]);
  const onMarkPaid = useCallback(
    (b, method) => {
      const dog = getDogByIdOrName(dogs, b._dogId || b.dogName);
      return patch(
        b,
        buildMarkPaidPatch(
          {
            service: b.service,
            size: b.size,
            addons: b.addons,
            priceOverride: b.priceOverride ?? null,
            customPrice: dog?.customPrice ?? null,
            configPricing,
          },
          method ?? null,
        ),
        `${b.dogName} — payment recorded`,
      );
    },
    [patch, dogs, configPricing],
  );
  const onDidntShow = useCallback((b) => patch(b, { status: BOOKING_STATUS.CANCELLED, cancelReason: "No-show" }, `${b.dogName} marked as a no-show`), [patch]);
  const onMessageOwner = useCallback((b) => {
    if (b._ownerId) navigate(`/inbox?human=${b._ownerId}`);
    else toast.show("Messaging isn't available for this booking", "info");
  }, [navigate, toast]);
  const onNewBookingSlot = useCallback((slot) => onNewBooking({ dateStr: todayStr, slot }), [onNewBooking, todayStr]);
  const onToggleImmediate = useCallback((slot) => toggleImmediateSlot(slot), [toggleImmediateSlot]);
  const onOpenCalendar = useCallback(() => navigate("/"), [navigate]);

  const dateLabel = new Date(now).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/London" });
  const isEmptyDay = todayBookings.length === 0;

  const feedHandlers = {
    resolve,
    getWelfare,
    paymentOf,
    onTheWaySignals,
    onMarkArrived,
    onStartGroom,
    onMarkReady,
    onMarkCollected,
    onSendCollection,
    onMessageOwner,
    onMarkPaid,
    onDidntShow,
    onOpenBooking,
    onHideUntilTomorrow,
  };

  return (
    <div className="min-h-full bg-brand-paper">
      <div className="mx-auto w-full max-w-3xl px-3 sm:px-4 pt-3 pb-6 flex flex-col gap-3">
        <TodayHeader
          dateLabel={dateLabel}
          dogsBooked={summary.dogsBooked}
          actionCount={actionCount}
          unpaidTotal={unpaidTotal}
          nextOnlineSlot={availabilityView.nextOnlineSlot}
          isDayOpen={isDayOpen}
          briefMode={!isDayOpen}
          onManageAvailability={() => setShowAvailability(true)}
        />

        {bookingsError && (
          <div className="rounded-xl border border-brand-coral/30 bg-brand-coral/[0.06] px-4 py-3 text-[13px] text-brand-coral-dark flex items-center justify-between gap-3">
            <span>Couldn&apos;t load today&apos;s bookings.</span>
            {onRefresh && <button type="button" onClick={onRefresh} className="min-h-[44px] font-bold underline">Retry</button>}
          </div>
        )}

        {!isDayOpen ? (
          <>
            <ClosedDayBrief
              brief={brief}
              dogs={dogs}
              resolve={resolve}
              getWelfare={getWelfare}
              paymentOf={paymentOf}
              onOpenCalendar={onOpenCalendar}
            />
            {notesReady && <TodayBriefNotes todayStr={todayStr} onOpenReports={onOpenReports} />}
          </>
        ) : bookingsLoading && todayBookings.length === 0 ? (
          <>
            <SectionSkeleton />
            <SectionSkeleton />
          </>
        ) : isEmptyDay ? (
          <>
            <div className="rounded-2xl border border-brand-paper-line bg-white px-6 py-10 text-center">
              <p className="text-[16px] font-bold text-slate-700">No dogs booked in today.</p>
              <p className="text-[13px] text-slate-600 mt-1">
                A quiet one — a good chance to catch up, or open a slot for last-minute bookings.
              </p>
            </div>
            {notesReady && <TodayBriefNotes todayStr={todayStr} onOpenReports={onOpenReports} />}
          </>
        ) : (
          <>
            <TodayKpiRow dogsBooked={summary.dogsBooked} expectedRevenue={summary.expectedRevenue} />
            <TodayNowStrip
              selection={nowNext}
              now={now}
              resolve={resolve}
              onJumpTo={onJumpTo}
              onMarkArrived={onMarkArrived}
              onStartGroom={onStartGroom}
              onMarkReady={onMarkReady}
              onMarkCollected={onMarkCollected}
              onSendCollection={onSendCollection}
              onMessageOwner={onMessageOwner}
              onMarkPaid={onMarkPaid}
            />
            <BookingFeed
              groups={groups}
              ownerCounts={ownerCounts}
              dogs={dogs}
              expandedIds={expandedIds}
              onToggleExpand={onToggleExpand}
              highlightId={highlightId}
              {...feedHandlers}
            />
            <TodaySummaryStrip summary={summary} takings={takings} />
            {notesReady && <TodayBriefNotes todayStr={todayStr} onOpenReports={onOpenReports} />}
            {!isOnline && (
              <p className="text-center text-[12px] text-slate-500">Offline preview — showing sample data.</p>
            )}
          </>
        )}

        {showAvailability && (
          <AvailabilityModal
            onClose={() => setShowAvailability(false)}
            view={availabilityView}
            dogsBooked={summary.dogsBooked}
            onToggleImmediate={onToggleImmediate}
            onNewBooking={(slot) => { setShowAvailability(false); onNewBookingSlot(slot); }}
          />
        )}
      </div>
    </div>
  );
}
