// Today command centre — the staff daily landing screen. One booking, one
// truth: a single time-ordered feed with one card per booking/dog (built on the
// pure buildTodayFeed selector), a compact stats header, and a separate
// "Manage availability" modal for the day's unbooked slots. All logic lives in
// the Today engine (src/engine/today.ts) so the component just wires data +
// actions to the feed and modal.
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
} from "../../engine/today";
import { BOOKING_STATUS } from "../../constants/index";
import { safeGet, safeSet } from "../../lib/storage";
import { useToast } from "../../contexts/ToastContext.jsx";
import { useSalonPricing } from "../../contexts/SalonContext";
import { useOnTheWaySignals } from "../../hooks/useOnTheWaySignals.ts";
import { TodayHeader } from "./today/TodayHeader.jsx";
import { TodayNowStrip } from "./today/TodayNowStrip.jsx";
import { BookingFeed } from "./today/BookingFeed.jsx";
import { AvailabilityModal } from "./today/AvailabilityModal.jsx";
import { TodaySummaryStrip } from "./today/TodaySummaryStrip.jsx";

function SectionSkeleton() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 motion-safe:animate-pulse">
      <div className="h-4 w-40 bg-slate-100 rounded mb-3" />
      <div className="h-14 bg-slate-50 rounded mb-2" />
      <div className="h-14 bg-slate-50 rounded" />
    </div>
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
  // The sticky strip reads the same visible feed the cards render from, so
  // marking a dog arrived/ready/collected updates both in the same render.
  const nowNext = useMemo(() => selectNowNext(visibleFeed, now), [visibleFeed, now]);

  // ---- "Jump to card" from the sticky strip: scroll + a brief highlight ----
  const [highlightId, setHighlightId] = useState(null);
  const highlightTimer = useRef(null);
  useEffect(() => () => clearTimeout(highlightTimer.current), []);
  const onJumpTo = useCallback((id) => {
    const el = document.getElementById(`today-card-${id}`);
    if (!el) return;
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    el.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
    setHighlightId(id);
    clearTimeout(highlightTimer.current);
    highlightTimer.current = setTimeout(() => setHighlightId(null), 1600);
  }, []);

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

  const dateLabel = new Date(now).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/London" });
  const isDayOpen = dayOpenState?.[todayStr] !== false;
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
    <div className="mx-auto w-full max-w-3xl px-3 sm:px-4 pt-3 pb-6 flex flex-col gap-3">
      <TodayHeader
        dateLabel={dateLabel}
        dogsBooked={summary.dogsBooked}
        actionCount={actionCount}
        unpaidTotal={unpaidTotal}
        nextOnlineSlot={availabilityView.nextOnlineSlot}
        isDayOpen={isDayOpen}
        onManageAvailability={() => setShowAvailability(true)}
      />

      {bookingsError && (
        <div className="rounded-xl border border-brand-coral/30 bg-brand-coral/[0.06] px-4 py-3 text-[13px] text-brand-coral-dark flex items-center justify-between gap-3">
          <span>Couldn&apos;t load today&apos;s bookings.</span>
          {onRefresh && <button type="button" onClick={onRefresh} className="min-h-[44px] font-bold underline">Retry</button>}
        </div>
      )}

      {bookingsLoading && todayBookings.length === 0 ? (
        <>
          <SectionSkeleton />
          <SectionSkeleton />
        </>
      ) : isEmptyDay ? (
        <div className="rounded-2xl border border-slate-200 bg-white px-6 py-10 text-center">
          <p className="text-[16px] font-bold text-slate-700">No dogs booked in today.</p>
          <p className="text-[13px] text-slate-600 mt-1">
            {isDayOpen
              ? "A quiet one — a good chance to catch up, or open a slot for last-minute bookings."
              : "The salon is closed today."}
          </p>
        </div>
      ) : (
        <>
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
          <BookingFeed entries={visibleFeed} highlightId={highlightId} {...feedHandlers} />
          <TodaySummaryStrip summary={summary} takings={takings} />
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
  );
}
