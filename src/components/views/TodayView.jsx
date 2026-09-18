// The live salon board — the staff landing screen.
//
// One dog, one token, in the zone that says where that dog physically is:
// Arriving → With us → Ready → Gone home. Position carries the status, so the
// question staff actually ask ("where is Teddy?") is answered by looking
// rather than by reading a column of badges, and the answer to "does anything
// need me?" is one sentence at the top.
//
// This file composes; it does not decide. Zones, ranking and which actions are
// legal live in `engine/salonBoard.ts`; every write lives in
// `useBookingActions`. The viewport still never moves by itself, and the date
// still never leaves the screen — it is the only guard against doing today's
// work on Thursday's bookings.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { resolveBookingDisplay, getDogByIdOrName } from "../../engine/bookingRules";
import { buildSlotGrid } from "../../engine/slotGrid";
import {
  londonDateStr,
  londonWallClockToUtcMs,
  paymentState,
  buildDaySummary,
  buildTakingsByMethod,
  buildSlotOpportunities,
  buildAvailabilityView,
  selectDogsMissingSize,
} from "../../engine/today";
import {
  BOARD_ZONES,
  BOARD_ZONE_META,
  buildAttentionSummary,
  buildBoardTokens,
  buildZoneCounts,
} from "../../engine/salonBoard";
import { buildDayStack } from "../../engine/dayStack";
import { DAY_CAPACITY } from "../../engine/utilisation";
import { buildDailyBriefBoard } from "../../engine/dailyBrief";
import { applyChatConfirmations } from "../../engine/replyConfirmation";
import { BOOKING_STATUS } from "../../constants/index";
import { FEATURE_FLAGS } from "../../constants/features";
import { useToast } from "../../contexts/ToastContext.jsx";
import { useOnTheWaySignals } from "../../hooks/useOnTheWaySignals.ts";
import { useReplyConfirmations } from "../../hooks/useReplyConfirmations.ts";
import { ConfirmDialog } from "../modals/ConfirmDialog.jsx";
import { TodayHeader } from "./today/TodayHeader.jsx";
import { UnpaidCollectionModal } from "./today/UnpaidCollectionModal.jsx";
import { MiniInvoiceModal } from "./today/MiniInvoiceModal.jsx";
import { AwaitingDepositsCard } from "./today/AwaitingDepositsCard.jsx";
import { AvailabilityModal } from "./today/AvailabilityModal.jsx";
import { TodayBriefNotes } from "./today/TodayBriefNotes.jsx";
import { MissingSizeNotice } from "./today/MissingSizeNotice.jsx";
import { useBookingActions } from "./today/useBookingActions.ts";
import { SalonBoard } from "./today/board/SalonBoard.jsx";
import { CompletedDogs, EndOfDayFacts } from "./today/board/CompletedDogs.jsx";
import { DayStack } from "./today/stack/DayStack.jsx";
import { CollectedSummary } from "./today/stack/CollectedSummary.jsx";
import { UnknownStatusRecovery } from "./today/board/UnknownStatusRecovery.jsx";

// Mirrors the real board: three zones of token ghosts.
function BoardSkeleton() {
  return (
    <div
      aria-label="Loading the salon board"
      className="grid grid-cols-1 items-start gap-3 motion-safe:animate-pulse md:grid-cols-2 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)_minmax(0,1fr)]"
    >
      {[0, 1, 2].map((zone) => (
        <div key={zone} className="min-w-0 p-2">
          <div className="mb-3 h-3 w-20 rounded bg-slate-200/80" />
          <div className="flex gap-3">
            {Array.from({ length: zone === 0 ? 3 : 2 }, (_, index) => (
              <div key={index} className="flex flex-col items-center gap-1.5">
                <div className="size-16 rounded-full bg-slate-200/70" />
                <div className="h-2.5 w-12 rounded bg-slate-200/60" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function zoneEntries(tokens) {
  return ["due", "withUs", "ready", "home"].flatMap((zone) =>
    tokens[zone].map((token) => [String(token.booking.id), {
      zone,
      dogName: token.booking.dogName || "Booking",
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
  /**
   * Escape hatch back to the four-zone board. Off by default; see
   * FEATURE_FLAGS.legacy_salon_board_enabled. Taken as a prop so the board's
   * own tests can exercise it without reaching into module state.
   */
  useLegacyBoard = FEATURE_FLAGS.legacy_salon_board_enabled,
}) {
  const navigate = useNavigate();
  const toast = useToast();

  // Re-tick every minute so "15 min late" / "waiting 25 min" stay live, and so
  // priority gravity re-ranks on a real clock rather than on every render.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const [showAvailability, setShowAvailability] = useState(false);
  // Which attention reason is highlighted, or null. Per-reason rather than a
  // single union toggle: "highlight the 2 late dogs" beats "highlight all 11".
  const [attentionReason, setAttentionReason] = useState(null);
  // Board only: which token has its action panel open. The stack keeps its own
  // open-row state inside DayStack, because only one row opens at a time there.
  const [selectedTokenId, setSelectedTokenId] = useState(null);
  const [boardAnnouncement, setBoardAnnouncement] = useState("");
  const previousZonesRef = useRef(null);

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
  const availabilityNow = useMemo(
    () => dateStr === realTodayStr
      ? now
      : new Date(londonWallClockToUtcMs(dateStr, "00:00")),
    [dateStr, now, realTodayStr],
  );

  // ---- Display + welfare + payment resolvers ----
  const resolve = useCallback((booking) => resolveBookingDisplay(booking, dogs, humans), [dogs, humans]);
  const getWelfare = useCallback((booking) => {
    const dog = getDogByIdOrName(dogs, booking._dogId || booking.dogName);
    return { alerts: dog?.alerts || [], pregnant: !!dog?.isPregnant, notes: booking.notes || "" };
  }, [dogs]);
  const paymentOf = useCallback((booking) => {
    const dog = getDogByIdOrName(dogs, booking._dogId || booking.dogName);
    return paymentState(booking, dog?.customPrice ?? null, configPricing);
  }, [dogs, configPricing]);
  const amountDueFor = useCallback((booking) => paymentOf(booking).amountDue ?? null, [paymentOf]);

  // ---- Engine selectors ----
  const summary = useMemo(
    () => buildDaySummary(selectedBookings, dogs, configPricing),
    [selectedBookings, dogs, configPricing],
  );
  const takings = useMemo(() => buildTakingsByMethod(selectedBookings), [selectedBookings]);
  // Owners who answered the reminder by typing rather than tapping Confirm
  // never stamp reminder_confirmed_at, so the engine still calls them
  // unconfirmed. Folding the signal in here clears the flag everywhere at
  // once: the token's tier, the zone's exception line and the attention count.
  const replyConfirmations = useReplyConfirmations(selectedBookings);
  const board = useMemo(() => {
    const built = buildDailyBriefBoard(selectedBookings, dateStr, now);
    return {
      ...built,
      due: applyChatConfirmations(built.due, replyConfirmations),
      withUs: applyChatConfirmations(built.withUs, replyConfirmations),
      ready: applyChatConfirmations(built.ready, replyConfirmations),
      home: applyChatConfirmations(built.home, replyConfirmations),
    };
  }, [dateStr, now, selectedBookings, replyConfirmations]);

  // A welfare flag lifts a mid-groom dog's prominence, so the pure ranking
  // layer is handed the ids rather than the dog records.
  const flaggedBookingIds = useMemo(() => {
    const flagged = new Set();
    for (const zone of ["due", "withUs", "ready", "home"]) {
      for (const entry of board[zone]) {
        const welfare = getWelfare(entry.booking);
        if (welfare.pregnant || welfare.alerts.length > 0) flagged.add(String(entry.booking.id));
      }
    }
    return flagged;
  }, [board, getWelfare]);

  const tokens = useMemo(
    () => buildBoardTokens({ board, now, isToday, flaggedBookingIds }),
    [board, now, isToday, flaggedBookingIds],
  );

  // ---- The stack ----
  // Built from the feed directly rather than from the zoned board: the stack is
  // strict time order, and the board's job is to rank within a zone. Breeds are
  // resolved here so the pure layer needs no dog lookup.
  const breedById = useMemo(() => {
    const map = {};
    for (const booking of selectedBookings) {
      const dog = getDogByIdOrName(dogs, booking._dogId || booking.dogName);
      if (dog?.breed) map[String(booking.id)] = dog.breed;
    }
    return map;
  }, [selectedBookings, dogs]);

  const stackRows = useMemo(
    () => buildDayStack({ bookings: selectedBookings, dateStr, now, breedById }),
    [selectedBookings, dateStr, now, breedById],
  );

  // The stack renders in time order but still asks the board layer what each
  // dog's legal actions are, so `tokenActions` stays the one place that knows.
  const tokensById = useMemo(() => {
    const map = new Map();
    for (const zone of BOARD_ZONES) {
      for (const token of tokens[zone] || []) map.set(String(token.booking.id), token);
    }
    return map;
  }, [tokens]);

  const lastVisitFor = useCallback((booking) => {
    const dog = getDogByIdOrName(dogs, booking._dogId || booking.dogName);
    return dog?.lastGroomedDate || null;
  }, [dogs]);
  const attention = useMemo(() => buildAttentionSummary(tokens, isToday), [tokens, isToday]);
  const zoneCounts = useMemo(() => buildZoneCounts(tokens), [tokens]);

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
  const availabilityView = useMemo(
    () => buildAvailabilityView(opportunities, immediateSet),
    [opportunities, immediateSet],
  );

  // "Owner on the way" — read-only WhatsApp signal for dogs waiting to go home.
  // Read off the stack rather than the board's Ready zone, so the one list the
  // screen renders is also the one the signal is fetched for.
  const readyBookings = useMemo(
    () => stackRows
      .filter((row) => row.booking.status === BOOKING_STATUS.READY_FOR_PICKUP)
      .map((row) => row.booking),
    [stackRows],
  );
  const onTheWaySignals = useOnTheWaySignals(readyBookings);

  const unpaidTotal = useMemo(() => {
    let total = 0;
    for (const zone of ["due", "withUs", "ready", "home"]) {
      for (const token of tokens[zone]) {
        if (token.entry.owes) total += paymentOf(token.booking).amountDue ?? 0;
      }
    }
    return total;
  }, [tokens, paymentOf]);

  // The actionable balance — money on dogs from Ready onward, where taking it
  // is what unblocks the door. This is the strip's £ figure; the whole-day
  // total (including dogs not yet arrived) stays in the end-of-day facts.
  const dueNow = useMemo(() => {
    const ids = new Set(attention.reasons.unpaid);
    let total = 0;
    for (const zone of ["due", "withUs", "ready", "home"]) {
      for (const token of tokens[zone]) {
        if (ids.has(String(token.booking.id))) {
          total += paymentOf(token.booking).amountDue ?? 0;
        }
      }
    }
    return total;
  }, [attention.reasons.unpaid, tokens, paymentOf]);

  const highlightIds = useMemo(
    () => (attentionReason ? new Set(attention.reasons[attentionReason]) : null),
    [attentionReason, attention.reasons],
  );

  // ---- Actions (one path, shared by the menu, the sheet and drag-drop) ----
  const onMessageOwner = useCallback((booking) => {
    if (booking._ownerId) navigate(`/inbox?human=${booking._ownerId}`);
    else toast.show("Messaging isn't available for this booking", "info");
  }, [navigate, toast]);

  const actions = useBookingActions({
    dateStr,
    toast,
    onUpdateBooking,
    onSendCollection,
    onOpenBooking,
    onOpenDog,
    onOpenHuman,
    onMessageOwner,
    amountDueFor,
  });

  // The chain hands back a method and the amount taken; the pricing inputs it
  // needs to record the payment are resolved here, where the dog is in scope.
  const collectWithPayment = useCallback((booking, { method, amountTaken }) => {
    const dog = getDogByIdOrName(dogs, booking._dogId || booking.dogName);
    return actions.collectWithPayment(
      booking,
      {
        service: booking.service,
        size: booking.size,
        addons: booking.addons,
        payment: booking.payment,
        depositAmount: booking.depositAmount,
        priceOverride: booking.priceOverride,
        customPrice: dog?.customPrice,
        configPricing,
      },
      method,
      amountTaken,
    );
  }, [actions, dogs, configPricing]);

  useEffect(() => {
    setAttentionReason(null);
    setSelectedTokenId(null);
  }, [dateStr]);
  useEffect(() => {
    // A reason whose last dog was dealt with clears itself — an empty
    // highlight would dim the whole board for nothing.
    if (attentionReason && attention.reasons[attentionReason].length === 0) {
      setAttentionReason(null);
    }
  }, [attention.reasons, attentionReason]);

  useEffect(() => {
    if (board.excludedCount === 0 || !import.meta.env?.DEV) return;
    // eslint-disable-next-line no-console -- development-only data recovery signal
    console.warn(
      `The salon board excluded ${board.excludedCount} booking(s) with an unknown or missing status.`,
    );
  }, [board.excludedCount]);

  // A dog that changes zone because a colleague moved it must be spoken, since
  // nobody here pressed anything. Moves this session made are already covered
  // by their own toast, so they are consumed silently.
  useEffect(() => {
    const current = new Map(zoneEntries(tokens));
    const previous = previousZonesRef.current;
    previousZonesRef.current = { dateStr, zones: current };
    if (!previous || previous.dateStr !== dateStr) {
      actions.resetLocalMoves();
      return;
    }

    const byId = new Map(selectedBookings.map((booking) => [String(booking.id), booking]));
    const changes = [];
    for (const [id, next] of current) {
      const was = previous.zones.get(id);
      if (was && was.zone !== next.zone) {
        changes.push({ id, dogName: next.dogName, to: BOARD_ZONE_META[next.zone].title });
      }
    }
    for (const [id, was] of previous.zones) {
      if (current.has(id)) continue;
      if (byId.get(id)?.status === BOOKING_STATUS.CANCELLED) {
        changes.push({ id, dogName: was.dogName, to: "cancelled" });
      }
    }

    const remote = changes.filter((change) => !actions.consumeLocalMove(change.id));
    if (remote.length === 0) return;

    const message = remote.length === 1
      ? `${remote[0].dogName} moved to ${remote[0].to}.`
      : `${remote.length} dogs moved to their latest status.`;
    setBoardAnnouncement("");
    requestAnimationFrame(() => setBoardAnnouncement(message));
    toast.show(message, "info");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reacts to arrangement changes only; `actions` is a stable bag of callbacks
  }, [dateStr, tokens, selectedBookings, toast]);

  // Warm notes mount after first paint so their queries never delay the page.
  const [notesReady, setNotesReady] = useState(false);
  useEffect(() => setNotesReady(true), []);
  const onOpenReports = useCallback(() => navigate("/reports"), [navigate]);

  // Dogs in this week's diary whose RECORD has no size. Anchored to the REAL
  // today, not the browsed date, so navigating the calendar doesn't change
  // what is outstanding.
  const dogsMissingSize = useMemo(
    () => selectDogsMissingSize(bookingsByDate, dogs, realTodayStr),
    [bookingsByDate, dogs, realTodayStr],
  );

  const ATTENTION_STATUS_COPY = {
    late: "late arrivals",
    toConfirm: "bookings to confirm",
    waiting: "dogs waiting to be collected",
    unpaid: "unpaid balances",
  };

  const dateLabel = dateObj.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const isEmptyDay = selectedBookings.length === 0
    || (tokens.due.length + tokens.withUs.length + tokens.ready.length + tokens.home.length === 0
      && board.excludedCount === 0);
  const isRefreshing = bookingsLoading && selectedBookings.length > 0;

  const boardHandlers = useMemo(
    () => ({ onTokenAction: actions.runTokenAction }),
    [actions.runTokenAction],
  );

  /**
   * Selecting a segment also takes you to the first dog it names, but only if
   * that dog is off screen — the viewport never moves on its own, and the
   * date must stay put. This is the one deliberate exception, on a press.
   */
  const selectAttentionReason = useCallback((reason) => {
    setAttentionReason(reason);
    if (!reason) return;
    const firstId = attention.reasons[reason]?.[0];
    if (!firstId) return;
    requestAnimationFrame(() => {
      const target = document.querySelector(
        `[data-booking-id="${firstId}"] [data-dog-token], [data-booking-id="${firstId}"] [data-stack-head]`,
      );
      if (!target) return;
      const box = target.getBoundingClientRect();
      if (box.top >= 0 && box.bottom <= window.innerHeight) return;
      const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
      target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
    });
  }, [attention.reasons]);

  return (
    <div className="min-h-full bg-brand-paper">
      <TodayHeader
        dateLabel={dateLabel}
        dogsBooked={summary.dogsBooked}
        capacityTotal={DAY_CAPACITY}
        attention={attention}
        zoneCounts={zoneCounts}
        collectedTotal={takings?.total ?? 0}
        dueNow={dueNow}
        unpaidTotal={unpaidTotal}
        isDayOpen={isDayOpen}
        isToday={isToday}
        nextOnlineSlot={availabilityView.nextOnlineSlot}
        onOpenDatePicker={onOpenDatePicker}
        onManageAvailability={() => setShowAvailability(true)}
        attentionReason={attentionReason}
        onSelectAttentionReason={selectAttentionReason}
      />

      <div className="mx-auto flex w-full max-w-[80rem] flex-col gap-5 pb-10">
        <p className="sr-only" aria-live="polite" aria-atomic="true">{boardAnnouncement}</p>

        {isRefreshing ? (
          <div role="status" aria-label="Refreshing bookings" className="-mt-3 h-0.5 overflow-hidden rounded-full bg-brand-purple/10">
            <span className="block h-full w-1/3 rounded-full bg-brand-purple/40 motion-safe:animate-[refresh-slide_1.2s_ease-in-out_infinite]" />
          </div>
        ) : null}

        {attentionReason ? (
          <p role="status" className="-mb-2 px-1 text-[12px] font-semibold text-brand-purple">
            Highlighting {new Set(attention.reasons[attentionReason]).size}{" "}
            {ATTENTION_STATUS_COPY[attentionReason]} — every other dog is dimmed, not hidden.
          </p>
        ) : null}

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
            {isToday && (
              <AwaitingDepositsCard
                bookings={selectedBookings}
                now={now}
                onOpenBooking={(booking) => onOpenBooking?.(booking.id)}
              />
            )}
            <UnknownStatusRecovery
              bookings={board.excludedBookings || []}
              resolve={resolve}
              onOpenBooking={onOpenBooking}
            />
            <div className={isRefreshing ? "opacity-70 motion-safe:transition-opacity" : "motion-safe:transition-opacity"}>
              {useLegacyBoard ? (
                <SalonBoard
                  tokens={tokens}
                  resolve={resolve}
                  getWelfare={getWelfare}
                  paymentOf={paymentOf}
                  handlers={boardHandlers}
                  onTheWaySignals={onTheWaySignals}
                  busyIds={actions.busyIds}
                  highlightIds={highlightIds}
                  landedId={actions.landedId}
                  boardKey={dateStr}
                  selectedId={selectedTokenId}
                  onSelectToken={setSelectedTokenId}
                />
              ) : (
                <DayStack
                  rows={stackRows}
                  resolve={resolve}
                  getWelfare={getWelfare}
                  paymentOf={paymentOf}
                  lastVisitFor={lastVisitFor}
                  onTheWaySignals={onTheWaySignals}
                  highlightIds={highlightIds}
                  tokensById={tokensById}
                  onAction={actions.runTokenAction}
                  onCollectWithPayment={collectWithPayment}
                  onSetPrice={actions.setPrice}
                  onOpenInvoice={actions.setInvoiceBooking}
                  busyIds={actions.busyIds}
                />
              )}
            </div>
            {useLegacyBoard ? (
              <CompletedDogs
                tokens={tokens.home}
                landedId={actions.landedId}
                isToday={isToday}
                resolve={resolve}
                paymentOf={paymentOf}
                onOpenBooking={onOpenBooking}
                onOpenToken={(token) => setSelectedTokenId(String(token.booking.id))}
              />
            ) : (
              <CollectedSummary takings={takings} resolve={resolve} />
            )}
            <EndOfDayFacts summary={summary} takings={takings} capacityTotal={DAY_CAPACITY} />
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
            onToggleImmediate={(slot) => toggleImmediateSlot(slot)}
            onNewBooking={(slot) => { setShowAvailability(false); onNewBooking({ dateStr, slot }); }}
          />
        )}
        {actions.pendingCareSkip && (
          <ConfirmDialog
            title={`${actions.pendingCareSkip.booking.dogName} has not ${actions.pendingCareSkip.skippedText}`}
            body="You can continue anyway — the skipped step is simply left unrecorded."
            confirmLabel="Continue anyway"
            cancelLabel="Go back"
            onConfirm={actions.confirmCareSkip}
            onClose={() => actions.setPendingCareSkip(null)}
          />
        )}
        {actions.invoiceBooking && (
          <MiniInvoiceModal
            booking={actions.invoiceBooking}
            dog={getDogByIdOrName(dogs, actions.invoiceBooking._dogId || actions.invoiceBooking.dogName)}
            configPricing={configPricing}
            onSave={(invoicePatch) => actions.saveInvoice(actions.invoiceBooking, invoicePatch)}
            onClose={() => actions.setInvoiceBooking(null)}
          />
        )}
        {actions.collectionDueBooking && (
          <UnpaidCollectionModal
            booking={actions.collectionDueBooking}
            amountDue={paymentOf(actions.collectionDueBooking).amountDue ?? 0}
            onTakePayment={() => {
              actions.setInvoiceBooking(actions.collectionDueBooking);
              actions.setCollectionDueBooking(null);
            }}
            onMarkCollected={async () => {
              const booking = actions.collectionDueBooking;
              actions.setCollectionDueBooking(null);
              await actions.markCollected(booking);
            }}
            onClose={() => actions.setCollectionDueBooking(null)}
          />
        )}
      </div>
    </div>
  );
}
