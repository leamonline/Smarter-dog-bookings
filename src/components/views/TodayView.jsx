// Daily Brief command centre. Every date-specific selector and mutation is
// anchored to the selected date, including closed, past and future dates.
//
// The board is RANKED, not scrolled-to: the header's "Next:" link names the
// most urgent dog and jumps on request, but the viewport never moves by
// itself — the date (the guard against wrong-day writes) stays put, and
// keyboard entry starts at the top of the page like everywhere else.
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { resolveBookingDisplay, getDogByIdOrName } from "../../engine/bookingRules";
import { buildSlotGrid } from "../../engine/slotGrid";
import {
  londonDateStr,
  londonWallClockToUtcMs,
  paymentState,
  buildDaySummary,
  buildNowCounts,
  buildTakingsByMethod,
  buildSlotOpportunities,
  buildAvailabilityView,
  liveFocusContext,
  minutesUntilSlot,
  selectLiveFocus,
  selectDogsMissingSize,
} from "../../engine/today";
import { DAY_CAPACITY } from "../../engine/utilisation";
import {
  buildDailyBriefBoard,
  buildDailyBriefFeed,
  requiresCareSkipConfirmation,
} from "../../engine/dailyBrief";
import { applyChatConfirmations } from "../../engine/replyConfirmation";
import { BOOKING_STATUS, NO_SHOW_REASON } from "../../constants/index";
import { useToast } from "../../contexts/ToastContext.jsx";
import { useOnTheWaySignals } from "../../hooks/useOnTheWaySignals.ts";
import { useReplyConfirmations } from "../../hooks/useReplyConfirmations.ts";
import { ConfirmDialog } from "../modals/ConfirmDialog.jsx";
import { TodayHeader } from "./today/TodayHeader.jsx";
import { StatusBoard } from "./today/StatusBoard.jsx";
import { UnpaidCollectionModal } from "./today/UnpaidCollectionModal.jsx";
import { MiniInvoiceModal } from "./today/MiniInvoiceModal.jsx";
import { AwaitingDepositsCard } from "./today/AwaitingDepositsCard.jsx";
import { AvailabilityModal } from "./today/AvailabilityModal.jsx";
import { TodayBriefNotes } from "./today/TodayBriefNotes.jsx";
import { MissingSizeNotice } from "./today/MissingSizeNotice.jsx";

// Mirrors the real board: three shell-less lanes of card ghosts.
function BoardSkeleton() {
  return (
    <div
      aria-label="Loading booking status board"
      className="grid grid-cols-1 items-start gap-6 motion-safe:animate-pulse md:grid-cols-2 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]"
    >
      {[0, 1, 2].map((lane) => (
        <div key={lane} className="min-w-0">
          <div className="mb-2.5 h-3 w-24 rounded bg-slate-200/80" />
          <div className="space-y-2.5">
            <div className="h-28 rounded-xl border border-brand-paper-line bg-white" />
            {lane === 0 ? <div className="h-28 rounded-xl border border-brand-paper-line bg-white" /> : null}
          </div>
        </div>
      ))}
    </div>
  );
}

const BOARD_LANE_BY_STATUS = {
  [BOOKING_STATUS.BOOKED]: "due",
  [BOOKING_STATUS.CHECKED_IN]: "withUs",
  [BOOKING_STATUS.IN_BATH]: "withUs",
  [BOOKING_STATUS.READY_FOR_PICKUP]: "ready",
  [BOOKING_STATUS.COMPLETED]: "home",
};

// A booked, on-time focus earns the gold primary only once its arrival is
// this close — before that the board is calm and nothing is yellow.
const GOLD_DUE_SOON_MINUTES = 15;

const BOARD_LANE_LABEL = {
  due: "Arriving",
  withUs: "With us",
  ready: "Ready to go",
  home: "Home today",
  history: "history",
};

function bookingLane(status) {
  return BOARD_LANE_BY_STATUS[status] || null;
}

function boardLaneEntries(board) {
  return ["due", "withUs", "ready", "home"].flatMap((lane) =>
    board[lane].map((entry) => [entry.booking.id, {
      lane,
      dogName: entry.booking.dogName || "Booking",
    }]),
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
  const [collectionDueBooking, setCollectionDueBooking] = useState(null);
  const [pendingCareSkip, setPendingCareSkip] = useState(null);
  const [showNeedsActionOnly, setShowNeedsActionOnly] = useState(false);
  const [boardAnnouncement, setBoardAnnouncement] = useState("");
  // In-flight and just-moved cards: the pressed control dims (aria-busy) while
  // its write is out, and the card flashes once where it lands so a lane move
  // has visible continuity instead of a silent disappearance.
  const [busyIds, setBusyIds] = useState(() => new Set());
  const [flashId, setFlashId] = useState(null);
  const flashTimerRef = useRef(null);
  const localLaneMutationIdsRef = useRef(new Set());
  const previousBoardLanesRef = useRef(null);
  const focusedBookingIdRef = useRef(null);

  useEffect(() => () => clearTimeout(flashTimerRef.current), []);

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
    () => dateStr === realTodayStr
      ? now
      : new Date(londonWallClockToUtcMs(dateStr, "00:00")),
    [dateStr, now, realTodayStr],
  );

  // ---- Engine selectors ----
  const summary = useMemo(
    () => buildDaySummary(selectedBookings, dogs, configPricing),
    [selectedBookings, dogs, configPricing],
  );
  const takings = useMemo(() => buildTakingsByMethod(selectedBookings), [selectedBookings]);
  // "Confirmed in chat" — owners who answered the reminder by typing a reply
  // instead of tapping the Confirm button never stamp reminder_confirmed_at, so
  // the engine still calls them unconfirmed. Folding the signal into the built
  // feed (and board) clears the "Needs confirmation" flag everywhere at once:
  // cards, lane warnings, the "N to confirm" heading and the act-now counts.
  const replyConfirmations = useReplyConfirmations(selectedBookings);
  const feed = useMemo(
    () => applyChatConfirmations(
      buildDailyBriefFeed(selectedBookings, dateStr, now),
      replyConfirmations,
    ),
    [selectedBookings, dateStr, now, replyConfirmations],
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

  const visibleFeed = feed;
  const nowCounts = useMemo(() => buildNowCounts(visibleFeed), [visibleFeed]);
  const actionCount = useMemo(() => visibleFeed.filter((e) => e.needsAction).length, [visibleFeed]);
  const displayedFeed = useMemo(
    () => showNeedsActionOnly ? visibleFeed.filter((e) => e.needsAction) : visibleFeed,
    [showNeedsActionOnly, visibleFeed],
  );
  const fullBoard = useMemo(() => {
    const board = buildDailyBriefBoard(selectedBookings, dateStr, now);
    return {
      ...board,
      due: applyChatConfirmations(board.due, replyConfirmations),
      withUs: applyChatConfirmations(board.withUs, replyConfirmations),
      ready: applyChatConfirmations(board.ready, replyConfirmations),
      home: applyChatConfirmations(board.home, replyConfirmations),
    };
  }, [dateStr, now, selectedBookings, replyConfirmations]);
  const board = useMemo(() => {
    if (!showNeedsActionOnly) return fullBoard;
    const keepActionable = (entry) => entry.needsAction;
    return {
      due: fullBoard.due.filter(keepActionable),
      withUs: fullBoard.withUs.filter(keepActionable),
      ready: fullBoard.ready.filter(keepActionable),
      home: fullBoard.home.filter(keepActionable),
      excludedCount: fullBoard.excludedCount,
      excludedBookings: fullBoard.excludedBookings,
    };
  }, [fullBoard, showNeedsActionOnly]);
  useEffect(() => setShowNeedsActionOnly(false), [dateStr]);
  useEffect(() => {
    if (actionCount === 0) setShowNeedsActionOnly(false);
  }, [actionCount]);
  useEffect(() => {
    if (fullBoard.excludedCount === 0 || !import.meta.env?.DEV) return;
    // eslint-disable-next-line no-console -- development-only data recovery signal
    console.warn(
      `Daily Brief excluded ${fullBoard.excludedCount} booking(s) with an unknown or missing status.`,
    );
  }, [fullBoard.excludedCount]);
  const liveFocus = useMemo(
    () => (isToday ? selectLiveFocus(displayedFeed) : null),
    [displayedFeed, isToday],
  );
  const liveContext = useMemo(
    () => (liveFocus ? liveFocusContext(liveFocus, now) : null),
    [liveFocus, now],
  );
  const liveFocusId = liveFocus?.booking.id ?? null;
  // The gold rule: yellow means "do this NOW". A focus that is merely the
  // next expected arrival stays outlined until its slot is imminent — a calm
  // 6:30am board shows no yellow at all, deliberately.
  const goldId = useMemo(() => {
    if (!liveFocus) return null;
    if (liveFocus.stage !== "booked" || liveFocus.isLate) return liveFocus.booking.id;
    const minutes = minutesUntilSlot(liveFocus.booking.slot || "00:00", now);
    return minutes <= GOLD_DUE_SOON_MINUTES ? liveFocus.booking.id : null;
  }, [liveFocus, now]);
  const nextUp = useMemo(
    () => (liveFocus && liveContext
      ? { dogName: liveFocus.booking.dogName || "Booking", text: liveContext.text, tone: liveContext.tone }
      : null),
    [liveFocus, liveContext],
  );

  // The viewport moves only on this explicit request — never on load.
  const jumpToNext = useCallback(() => {
    if (!liveFocusId) return;
    const el = document.getElementById(`today-card-${liveFocusId}`);
    if (!el) return;
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    el.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    el.focus({ preventScroll: true });
    clearTimeout(flashTimerRef.current);
    setFlashId(liveFocusId);
    flashTimerRef.current = setTimeout(() => setFlashId(null), 1400);
  }, [liveFocusId]);

  useEffect(() => {
    const onFocusIn = (event) => {
      focusedBookingIdRef.current = event.target
        ?.closest?.("[data-booking-id]")
        ?.getAttribute("data-booking-id") || null;
    };
    document.addEventListener("focusin", onFocusIn);
    return () => document.removeEventListener("focusin", onFocusIn);
  }, []);

  useEffect(() => {
    const current = new Map(boardLaneEntries(fullBoard));
    const previousState = previousBoardLanesRef.current;
    previousBoardLanesRef.current = { dateStr, lanes: current };
    if (!previousState || previousState.dateStr !== dateStr) {
      localLaneMutationIdsRef.current.clear();
      return;
    }

    const selectedById = new Map(selectedBookings.map((booking) => [booking.id, booking]));
    const changes = [];
    for (const [id, next] of current) {
      const previous = previousState.lanes.get(id);
      if (previous && previous.lane !== next.lane) {
        changes.push({ id, dogName: next.dogName, from: previous.lane, to: next.lane });
      }
    }
    for (const [id, previous] of previousState.lanes) {
      if (current.has(id)) continue;
      const booking = selectedById.get(id);
      if (booking?.status === BOOKING_STATUS.CANCELLED) {
        changes.push({ id, dogName: previous.dogName, from: previous.lane, to: "history" });
      }
    }
    if (changes.length === 0) return;

    const remote = changes.filter((change) => {
      if (!localLaneMutationIdsRef.current.has(change.id)) return true;
      localLaneMutationIdsRef.current.delete(change.id);
      return false;
    });
    if (remote.length === 0) return;

    const message = remote.length === 1
      ? `${remote[0].dogName} moved from ${BOARD_LANE_LABEL[remote[0].from]} to ${BOARD_LANE_LABEL[remote[0].to]}.`
      : `${remote.length} bookings moved to their latest status.`;
    setBoardAnnouncement("");
    requestAnimationFrame(() => setBoardAnnouncement(message));
    toast.show(message, "info");

    const focusedMove = remote.find((change) => change.id === focusedBookingIdRef.current);
    if (focusedMove) {
      requestAnimationFrame(() => {
        const target = document.querySelector(`[data-booking-id="${focusedMove.id}"]`)
          || document.querySelector("[data-status-board-root]");
        target?.focus?.({ preventScroll: true });
      });
    }
  }, [dateStr, fullBoard, selectedBookings, toast]);

  // Warm notes mount after first paint so their queries never delay the page.
  const [notesReady, setNotesReady] = useState(false);
  useEffect(() => setNotesReady(true), []);
  const onOpenReports = useCallback(() => navigate("/reports"), [navigate]);

  // Dogs in this week's diary whose RECORD has no size. Anchored to the REAL
  // today, not the browsed date, so navigating the calendar doesn't change what
  // is outstanding. Scope is whatever the week loader holds — hence "this week".
  const dogsMissingSize = useMemo(
    () => selectDogsMissingSize(bookingsByDate, dogs, realTodayStr),
    [bookingsByDate, dogs, realTodayStr],
  );

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
    const movesLane = changes.status
      && bookingLane(changes.status) !== bookingLane(b.status);
    if (movesLane) localLaneMutationIdsRef.current.add(b.id);
    setBusyIds((prev) => new Set(prev).add(b.id));
    let result;
    try {
      result = await onUpdateBooking({ ...b, ...changes }, date, date);
    } catch {
      result = null;
    } finally {
      setBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(b.id);
        return next;
      });
    }
    if (result !== null && result !== false) {
      if (successMessage) toast.show(successMessage, "success");
      if (movesLane) {
        clearTimeout(flashTimerRef.current);
        setFlashId(b.id);
        flashTimerRef.current = setTimeout(() => setFlashId(null), 1400);
      }
      return result;
    }
    if (movesLane) localLaneMutationIdsRef.current.delete(b.id);
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

  const performStatusUpdate = useCallback(async (
    booking,
    status,
    successMessage,
    failureMessage,
    options = {},
  ) => patch(
    booking,
    {
      status,
      ...(options.skipCollectionPrompt ? { _skipCollectionPrompt: true } : {}),
    },
    successMessage,
    failureMessage,
  ), [patch]);

  const updateStatus = useCallback(async (
    booking,
    status,
    successMessage,
    failureMessage,
    options = {},
  ) => {
    const skipped = requiresCareSkipConfirmation(booking.status, status);
    if (skipped && !options.skipConfirmation) {
      // In-product confirm (never window.confirm — see docs/modal-standard.md).
      setPendingCareSkip({ booking, status, successMessage, failureMessage, options, skippedText: skipped });
      return null;
    }
    return performStatusUpdate(booking, status, successMessage, failureMessage, options);
  }, [performStatusUpdate]);

  const confirmCareSkip = useCallback(async () => {
    const pending = pendingCareSkip;
    setPendingCareSkip(null);
    if (!pending) return;
    await performStatusUpdate(
      pending.booking,
      pending.status,
      pending.successMessage,
      pending.failureMessage,
      pending.options,
    );
  }, [pendingCareSkip, performStatusUpdate]);

  const onJourneyAction = useCallback(async (booking, action) => {
    if (action.completed && action.id !== "paid") return null;
    if (action.id === "checkIn") {
      return updateStatus(
        booking,
        BOOKING_STATUS.CHECKED_IN,
        `${booking.dogName} checked in — with us now`,
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
      const saved = await updateStatus(
        booking,
        BOOKING_STATUS.READY_FOR_PICKUP,
        `${booking.dogName} is ready to go home`,
        "Ready for collection could not be saved.",
        { skipCollectionPrompt: true, skipConfirmation: true },
      );
      if (saved) {
        onSendCollection({
          ...booking,
          ...saved,
          status: BOOKING_STATUS.READY_FOR_PICKUP,
        });
      }
      return saved;
    }
    if (action.id === "collected") {
      return updateStatus(
        booking,
        BOOKING_STATUS.COMPLETED,
        `${booking.dogName} collected — home today`,
        "Collection could not be saved.",
      );
    }
    if (action.id === "paid") setInvoiceBooking(booking);
    return null;
  }, [onSendCollection, updateStatus]);

  const onRequestCollected = useCallback((booking) => {
    const payment = paymentOf(booking);
    if (payment.amountDue != null && payment.amountDue > 0) {
      setCollectionDueBooking(booking);
      return;
    }
    onJourneyAction(booking, { id: "collected", completed: false });
  }, [onJourneyAction, paymentOf]);

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
      { status: BOOKING_STATUS.CANCELLED, cancelReason: NO_SHOW_REASON },
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
  const isRefreshing = bookingsLoading && selectedBookings.length > 0;

  const feedHandlers = {
    onOpenDog,
    onOpenHuman,
    onOpenBooking,
    onOpenInvoice,
    onMessageOwner,
    onJourneyAction,
    onRequestCollected,
    onDidntShow,
    onTheWaySignals,
  };

  return (
    <div className="min-h-full bg-brand-paper">
      <TodayHeader
        dateLabel={dateLabel}
        dogsBooked={summary.dogsBooked}
        capacityTotal={DAY_CAPACITY}
        nowCounts={nowCounts}
        actionCount={actionCount}
        unpaidTotal={unpaidTotal}
        isDayOpen={isDayOpen}
        isToday={isToday}
        nextOnlineSlot={availabilityView.nextOnlineSlot}
        nextUp={nextUp}
        onJumpToNext={jumpToNext}
        onOpenDatePicker={onOpenDatePicker}
        onManageAvailability={() => setShowAvailability(true)}
        actionFilterActive={showNeedsActionOnly}
        onToggleActionFilter={() => setShowNeedsActionOnly((active) => !active)}
      />

      <div className="mx-auto flex w-full max-w-[80rem] flex-col gap-6 pb-10">

        <p className="sr-only" aria-live="polite" aria-atomic="true">{boardAnnouncement}</p>

        {isRefreshing ? (
          <div role="status" aria-label="Refreshing bookings" className="-mt-3 h-0.5 overflow-hidden rounded-full bg-brand-purple/10">
            <span className="block h-full w-1/3 rounded-full bg-brand-purple/40 motion-safe:animate-[refresh-slide_1.2s_ease-in-out_infinite]" />
          </div>
        ) : null}

        {showNeedsActionOnly && (
          <p
            role="status"
            className="-mb-2 px-0.5 text-[12px] font-semibold text-brand-purple"
          >
            Showing {actionCount} {actionCount === 1 ? "booking" : "bookings"} needing attention — late, unconfirmed, waiting to be collected, or unpaid.
          </p>
        )}

        {bookingsError && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-brand-coral/30 bg-brand-coral/[0.06] px-4 py-3 text-[13px] text-brand-coral-dark">
            <span>Couldn&apos;t load bookings for this date.</span>
            {onRefresh && <button type="button" onClick={onRefresh} className="min-h-11 font-bold underline">Retry</button>}
          </div>
        )}

        {bookingsLoading && selectedBookings.length === 0 ? (
          <BoardSkeleton />
        ) : bookingsError && selectedBookings.length === 0 ? null : isEmptyDay ? (
          <>
            <div className="px-4 py-14 text-center">
              <p className="font-display text-[17px] font-bold text-brand-purple">No bookings on this date</p>
              <p className="mt-1 text-[13px] text-slate-500">
                Choose another day from the date above, or open slots with Manage availability.
              </p>
            </div>
            {notesReady && <TodayBriefNotes todayStr={dateStr} onOpenReports={onOpenReports} />}
          </>
        ) : (
          <>
            {isToday && !showNeedsActionOnly && (
              <AwaitingDepositsCard
                bookings={selectedBookings}
                now={now}
                onOpenBooking={onOpenDepositBooking}
              />
            )}
            <div className={isRefreshing ? "opacity-70 motion-safe:transition-opacity" : "motion-safe:transition-opacity"}>
              <StatusBoard
                board={board}
                resolve={resolve}
                getWelfare={getWelfare}
                paymentOf={paymentOf}
                liveFocusId={goldId}
                isToday={isToday}
                handlers={feedHandlers}
                onTheWaySignals={onTheWaySignals}
                busyIds={busyIds}
                flashId={flashId}
                summary={summary}
                takings={takings}
                capacityTotal={DAY_CAPACITY}
              />
            </div>
            <MissingSizeNotice dogs={dogsMissingSize} onOpenDog={onOpenDog} />
            {notesReady && <TodayBriefNotes todayStr={dateStr} onOpenReports={onOpenReports} />}
            {!isOnline && (
              <p className="text-center text-[12px] text-slate-500">Sample data preview — changes won&apos;t save.</p>
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
        {pendingCareSkip && (
          <ConfirmDialog
            title={`${pendingCareSkip.booking.dogName} has not ${pendingCareSkip.skippedText}`}
            body="You can continue anyway — the skipped step is simply left unrecorded."
            confirmLabel="Continue anyway"
            cancelLabel="Go back"
            onConfirm={confirmCareSkip}
            onClose={() => setPendingCareSkip(null)}
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
        {collectionDueBooking && (
          <UnpaidCollectionModal
            booking={collectionDueBooking}
            amountDue={paymentOf(collectionDueBooking).amountDue ?? 0}
            onTakePayment={() => {
              setInvoiceBooking(collectionDueBooking);
              setCollectionDueBooking(null);
            }}
            onMarkCollected={async () => {
              const booking = collectionDueBooking;
              setCollectionDueBooking(null);
              await onJourneyAction(booking, { id: "collected", completed: false });
            }}
            onClose={() => setCollectionDueBooking(null)}
          />
        )}
      </div>
    </div>
  );
}
