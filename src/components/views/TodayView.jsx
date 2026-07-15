// Daily Brief command centre. Every date-specific selector and mutation is
// anchored to the selected date, including closed, past and future dates.
import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { resolveBookingDisplay, getDogByIdOrName } from "../../engine/bookingRules";
import { buildSlotGrid } from "../../engine/slotGrid";
import {
  londonDateStr,
  paymentState,
  buildDaySummary,
  buildTakingsByMethod,
  buildSlotOpportunities,
  buildAvailabilityView,
  selectNowNext,
  groupFeedBySlot,
  countDogsPerOwner,
} from "../../engine/today";
import {
  buildDailyBriefFeed,
  requiresCareSkipConfirmation,
} from "../../engine/dailyBrief";
import { BOOKING_STATUS } from "../../constants/index";
import { safeGet, safeSet } from "../../lib/storage";
import { useToast } from "../../contexts/ToastContext.jsx";
import { useOnTheWaySignals } from "../../hooks/useOnTheWaySignals.ts";
import { NEEDS_ACTION_DEFINITION, TodayHeader } from "./today/TodayHeader.jsx";
import { TodayNowStrip } from "./today/TodayNowStrip.jsx";
import { BookingFeed } from "./today/BookingFeed.jsx";
import { MiniInvoiceModal } from "./today/MiniInvoiceModal.jsx";
import { AwaitingDepositsCard } from "./today/AwaitingDepositsCard.jsx";
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

export function TodayView({
  selectedDateObj,
  selectedDateStr,
  onOpenDatePicker,
  onOpenDog,
  onOpenHuman,
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
  configPricing,
}) {
  const navigate = useNavigate();
  const toast = useToast();

  // Re-tick every minute so "15 min overdue" / "waiting 25 min" stay live.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const [showAvailability, setShowAvailability] = useState(false);
  const [invoiceBooking, setInvoiceBooking] = useState(null);
  const [showNeedsActionOnly, setShowNeedsActionOnly] = useState(false);

  const realTodayStr = londonDateStr(now);
  const dateStr = selectedDateStr || realTodayStr;
  const dateObj = selectedDateObj || now;
  const isToday = dateStr === realTodayStr;
  const selectedSettings = daySettings?.[dateStr] || {};
  const selectedBookings = useMemo(
    () => bookingsByDate?.[dateStr] || [],
    [bookingsByDate, dateStr],
  );
  const activeSlots = useMemo(
    () => buildSlotGrid(selectedSettings.extraSlots || []),
    [selectedSettings.extraSlots],
  );
  const immediateSet = useMemo(
    () => new Set(selectedSettings.immediateSlots || []),
    [selectedSettings.immediateSlots],
  );
  const isDayOpen = dayOpenState?.[dateStr] !== false;

  // Non-today availability must not inherit the real clock's elapsed slots.
  // Anchor it to the selected date's start while retaining live cut-offs today.
  const availabilityNow = useMemo(
    () => dateStr === realTodayStr ? now : new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate()),
    [dateObj, dateStr, now, realTodayStr],
  );

  // ---- Engine selectors ----
  const summary = useMemo(
    () => buildDaySummary(selectedBookings, dogs, configPricing),
    [selectedBookings, dogs, configPricing],
  );
  const takings = useMemo(() => buildTakingsByMethod(selectedBookings), [selectedBookings]);
  const feed = useMemo(
    () => buildDailyBriefFeed(selectedBookings, dateStr, now),
    [selectedBookings, dateStr, now],
  );
  const opportunities = useMemo(
    () => buildSlotOpportunities({
      bookings: selectedBookings,
      activeSlots,
      overrides: selectedSettings.overrides || {},
      immediateSlots: selectedSettings.immediateSlots || [],
      now: availabilityNow,
      todayStr: dateStr,
    }),
    [selectedBookings, activeSlots, selectedSettings.overrides, selectedSettings.immediateSlots, availabilityNow, dateStr],
  );
  const availabilityView = useMemo(() => buildAvailabilityView(opportunities, immediateSet), [opportunities, immediateSet]);

  // "Owner on the way" chips — read-only WhatsApp signal for the dogs currently
  // waiting to be collected.
  const readyBookings = useMemo(() => feed.filter((e) => e.stage === "ready").map((e) => e.booking), [feed]);
  const onTheWaySignals = useOnTheWaySignals(readyBookings);

  // ---- Per-day hides (local UI only; never mutates booking data). Only a
  // not-yet-arrived, non-owing booking offers "Hide until tomorrow" — money
  // never hides.
  const dismissKey = `sd-today-dismissed-${dateStr}`;
  const readDismissed = useCallback((key) => {
    try {
      return new Set(JSON.parse(safeGet("local", key) || "[]"));
    } catch {
      return new Set();
    }
  }, []);
  const [dismissed, setDismissed] = useState(() => readDismissed(dismissKey));
  useEffect(() => setDismissed(readDismissed(dismissKey)), [dismissKey, readDismissed]);
  const onHideUntilTomorrow = useCallback((id) => {
    setDismissed((previous) => {
      const next = new Set(previous).add(id);
      safeSet("local", dismissKey, JSON.stringify([...next]));
      return next;
    });
  }, [dismissKey]);

  const visibleFeed = useMemo(() => feed.filter((e) => !dismissed.has(e.booking.id)), [feed, dismissed]);
  const actionCount = useMemo(() => visibleFeed.filter((e) => e.needsAction).length, [visibleFeed]);
  const displayedFeed = useMemo(
    () => showNeedsActionOnly ? visibleFeed.filter((e) => e.needsAction) : visibleFeed,
    [showNeedsActionOnly, visibleFeed],
  );
  useEffect(() => setShowNeedsActionOnly(false), [dateStr]);
  useEffect(() => {
    if (actionCount === 0) setShowNeedsActionOnly(false);
  }, [actionCount]);
  // The sticky strip reads the same visible feed the diary renders from, so
  // marking a dog arrived/ready/collected updates both in the same render.
  const nowNext = useMemo(() => selectNowNext(displayedFeed, now), [displayedFeed, now]);
  const groups = useMemo(() => groupFeedBySlot(displayedFeed), [displayedFeed]);
  const ownerCounts = useMemo(() => countDogsPerOwner(displayedFeed, dogs), [displayedFeed, dogs]);

  // ---- "Jump to row" from the sticky strip ----
  const onJumpTo = useCallback((id) => {
    requestAnimationFrame(() => {
      const el = document.getElementById(`today-card-${id}`);
      if (!el) return;
      const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
      el.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
      document.getElementById(`today-card-${id}-time`)?.focus({ preventScroll: true });
    });
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
    return paymentState(b, dog?.customPrice ?? null, configPricing);
  }, [dogs, configPricing]);

  const unpaidTotal = useMemo(
    () => visibleFeed.filter((e) => e.owes).reduce((n, e) => n + (paymentOf(e.booking).amountDue ?? 0), 0),
    [visibleFeed, paymentOf],
  );

  // ---- Actions (reuse the exact update path the detail modal uses) ----
  const patch = useCallback(async (
    b,
    changes,
    successMessage,
    failureMessage = "Booking update could not be saved.",
    { showFailureToast = true } = {},
  ) => {
    const date = b._bookingDate || dateStr;
    let result;
    try {
      result = await onUpdateBooking({ ...b, ...changes }, date, date);
    } catch {
      result = null;
    }
    if (result !== null && result !== false) {
      if (successMessage) toast.show(successMessage, "success");
      return result;
    }
    if (showFailureToast) {
      toast.show(failureMessage, "error", {
        label: "Retry",
        onClick: () => patch(
          b,
          changes,
          successMessage,
          failureMessage,
          { showFailureToast },
        ),
      });
    }
    return null;
  }, [onUpdateBooking, toast, dateStr]);

  const updateStatus = useCallback(async (
    booking,
    status,
    successMessage,
    failureMessage,
    options = {},
  ) => {
    const skipped = requiresCareSkipConfirmation(booking.status, status);
    if (
      skipped &&
      !options.skipConfirmation &&
      !window.confirm(`${booking.dogName} has not ${skipped}. Continue anyway?`)
    ) {
      return null;
    }
    return patch(
      booking,
      {
        status,
        ...(options.skipCollectionPrompt ? { _skipCollectionPrompt: true } : {}),
      },
      successMessage,
      failureMessage,
    );
  }, [patch]);

  const onJourneyAction = useCallback((booking, action) => {
    if (action.completed && action.id !== "paid") return null;
    if (action.id === "checkIn") {
      return updateStatus(
        booking,
        BOOKING_STATUS.CHECKED_IN,
        `${booking.dogName} checked in`,
        "Check-in could not be saved.",
      );
    }
    if (action.id === "startGroom") {
      return updateStatus(
        booking,
        BOOKING_STATUS.IN_BATH,
        `${booking.dogName} — groom started`,
        "Starting the groom could not be saved.",
      );
    }
    if (action.id === "ready") {
      return updateStatus(
        booking,
        BOOKING_STATUS.READY_FOR_PICKUP,
        `${booking.dogName} is waiting to be collected`,
        "Ready for collection could not be saved.",
        { skipCollectionPrompt: true, skipConfirmation: true },
      );
    }
    if (action.id === "messageCollection") return onSendCollection(booking);
    if (action.id === "collected") {
      return updateStatus(
        booking,
        BOOKING_STATUS.COMPLETED,
        `${booking.dogName} collected`,
        "Collection could not be saved.",
      );
    }
    if (action.id === "paid") setInvoiceBooking(booking);
    return null;
  }, [onSendCollection, updateStatus]);

  const onOpenDepositBooking = useCallback(
    (booking) => onOpenBooking?.(booking.id),
    [onOpenBooking],
  );
  const onOpenInvoice = useCallback((booking) => setInvoiceBooking(booking), []);
  const onSaveInvoice = useCallback(
    (booking, invoicePatch) => patch(
      booking,
      invoicePatch,
      "Payment recorded",
      "Payment could not be saved.",
      { showFailureToast: false },
    ),
    [patch],
  );
  const onDidntShow = useCallback(
    (b) => patch(
      b,
      { status: BOOKING_STATUS.CANCELLED, cancelReason: "No-show" },
      `${b.dogName} marked as a no-show`,
      "Marking this booking as a no-show could not be saved.",
    ),
    [patch],
  );
  const onMessageOwner = useCallback((b) => {
    if (b._ownerId) navigate(`/inbox?human=${b._ownerId}`);
    else toast.show("Messaging isn't available for this booking", "info");
  }, [navigate, toast]);
  const onNewBookingSlot = useCallback((slot) => onNewBooking({ dateStr, slot }), [onNewBooking, dateStr]);
  const onToggleImmediate = useCallback((slot) => toggleImmediateSlot(slot), [toggleImmediateSlot]);

  const dateLabel = dateObj.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const isEmptyDay = feed.length === 0;

  const feedHandlers = {
    onOpenDog,
    onOpenHuman,
    onOpenBooking,
    onOpenInvoice,
    onMessageOwner,
    onJourneyAction,
    onDidntShow,
    onHideUntilTomorrow,
    onTheWaySignals,
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
          isToday={isToday}
          onOpenDatePicker={onOpenDatePicker}
          onManageAvailability={() => setShowAvailability(true)}
          actionFilterActive={showNeedsActionOnly}
          onToggleActionFilter={() => setShowNeedsActionOnly((active) => !active)}
        />

        {showNeedsActionOnly && (
          <p
            role="status"
            className="rounded-xl border border-brand-purple/15 bg-brand-purple/5 px-3 py-2 text-[12px] font-medium text-brand-purple"
          >
            Showing {actionCount} {actionCount === 1 ? "booking" : "bookings"} needing action: {NEEDS_ACTION_DEFINITION.replace("Need action means ", "").replace(/\.$/, "").toLowerCase()}.
          </p>
        )}

        {bookingsError && (
          <div className="rounded-xl border border-brand-coral/30 bg-brand-coral/[0.06] px-4 py-3 text-[13px] text-brand-coral-dark flex items-center justify-between gap-3">
            <span>Couldn&apos;t load bookings for this date.</span>
            {onRefresh && <button type="button" onClick={onRefresh} className="min-h-[44px] font-bold underline">Retry</button>}
          </div>
        )}

        {bookingsLoading && selectedBookings.length === 0 ? (
          <>
            <SectionSkeleton />
            <SectionSkeleton />
          </>
        ) : bookingsError && selectedBookings.length === 0 ? null : isEmptyDay ? (
          <>
            <div className="rounded-2xl border border-brand-paper-line bg-white px-6 py-10 text-center">
              <p className="text-[16px] font-bold text-slate-700">No bookings on this date</p>
              <p className="text-[13px] text-slate-600 mt-1">
                Use the calendar to choose another day, or manage availability here.
              </p>
            </div>
            {notesReady && <TodayBriefNotes todayStr={dateStr} onOpenReports={onOpenReports} />}
          </>
        ) : (
          <>
            <TodayKpiRow
              dogsBooked={summary.dogsBooked}
              onSite={isToday ? summary.onSite : undefined}
              expectedRevenue={summary.expectedRevenue}
            />
            {isToday && (
              <>
                <TodayNowStrip
                  selection={nowNext}
                  now={now}
                  resolve={resolve}
                  onJumpTo={onJumpTo}
                />
                {!showNeedsActionOnly && (
                  <AwaitingDepositsCard
                    bookings={selectedBookings}
                    now={now}
                    onOpenBooking={onOpenDepositBooking}
                  />
                )}
              </>
            )}
            <BookingFeed
              groups={groups}
              ownerCounts={ownerCounts}
              dogs={dogs}
              resolve={resolve}
              getWelfare={getWelfare}
              paymentOf={paymentOf}
              priceOf={(booking) => paymentOf(booking).subtotal}
              {...feedHandlers}
            />
            <TodaySummaryStrip summary={summary} takings={takings} isToday={isToday} />
            {notesReady && <TodayBriefNotes todayStr={dateStr} onOpenReports={onOpenReports} />}
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
        {invoiceBooking && (
          <MiniInvoiceModal
            booking={invoiceBooking}
            dog={getDogByIdOrName(dogs, invoiceBooking._dogId || invoiceBooking.dogName)}
            configPricing={configPricing}
            onSave={(invoicePatch) => onSaveInvoice(invoiceBooking, invoicePatch)}
            onClose={() => setInvoiceBooking(null)}
          />
        )}
      </div>
    </div>
  );
}
