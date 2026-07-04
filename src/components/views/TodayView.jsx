// Today command centre — the staff daily landing screen. A calm, fast work
// queue answering "what needs attention right now?" built on the pure Today
// engine selectors (src/engine/today.ts) so all logic stays testable and the
// component just wires data + actions to the section views.
//
// Section order is the operational priority order, and a section with nothing
// in it renders as a one-line reassurance row (or nothing) instead of an empty
// card — a good day should read calm, not padded:
//   1 needs attention → 2 next up → 3 in salon → 4 ready for collection
//   → 5 payments → 6 capacity → 7 earlier today → day totals.
import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { resolveBookingDisplay, getDogByIdOrName } from "../../engine/bookingRules";
import { buildSlotGrid } from "../../engine/slotGrid";
import { findNextAvailable } from "../../engine/utilisation";
import {
  londonDateStr,
  paymentState,
  buildDaySummary,
  buildImmediateAttention,
  buildArrivalsBySlot,
  splitArrivalGroups,
  buildInSalonList,
  buildCollectionQueue,
  buildPaymentsList,
  buildTakingsByMethod,
  buildSlotOpportunities,
} from "../../engine/today";
import { BOOKING_STATUS } from "../../constants/index";
import { safeGet, safeSet } from "../../lib/storage";
import { useToast } from "../../contexts/ToastContext.jsx";
import { useOnTheWaySignals } from "../../hooks/useOnTheWaySignals.ts";
import { TodayHeader } from "./today/TodayHeader.jsx";
import { AttentionPanel } from "./today/AttentionPanel.jsx";
import { NextUp, EarlierToday } from "./today/NextUp.jsx";
import { InSalonNow } from "./today/InSalonNow.jsx";
import { CollectionQueue } from "./today/CollectionQueue.jsx";
import { PaymentsList } from "./today/PaymentsList.jsx";
import { CapacitySummary } from "./today/CapacitySummary.jsx";
import { TodaySummaryStrip } from "./today/TodaySummaryStrip.jsx";
import { CompactZeroState } from "./today/parts.jsx";

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

  // Re-tick every minute so "15 min overdue" / "waiting 25 min" stay live.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const todayStr = londonDateStr(now);
  const todaySettings = daySettings?.[todayStr] || {};
  const todayBookings = useMemo(() => bookingsByDate?.[todayStr] || [], [bookingsByDate, todayStr]);
  const activeSlots = useMemo(() => buildSlotGrid(todaySettings.extraSlots || []), [todaySettings.extraSlots]);
  const immediateSet = useMemo(() => new Set(todaySettings.immediateSlots || []), [todaySettings.immediateSlots]);

  // ---- Engine selectors ----
  const summary = useMemo(() => buildDaySummary(todayBookings, dogs), [todayBookings, dogs]);
  const takings = useMemo(() => buildTakingsByMethod(todayBookings), [todayBookings]);
  const attention = useMemo(() => buildImmediateAttention(todayBookings, now), [todayBookings, now]);
  const arrivals = useMemo(() => buildArrivalsBySlot(todayBookings, activeSlots, now), [todayBookings, activeSlots, now]);
  const nextUp = useMemo(() => splitArrivalGroups(arrivals), [arrivals]);
  const inSalon = useMemo(() => buildInSalonList(todayBookings, now), [todayBookings, now]);
  const collection = useMemo(() => buildCollectionQueue(todayBookings, now), [todayBookings, now]);
  // "Owner on the way" chips (improvement #2) — read-only WhatsApp signal for
  // the dogs currently waiting to be collected.
  const collectionBookings = useMemo(() => collection.map((e) => e.booking), [collection]);
  const onTheWaySignals = useOnTheWaySignals(collectionBookings);
  const payments = useMemo(() => buildPaymentsList(todayBookings), [todayBookings]);
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
  const nextAvailable = useMemo(
    () => findNextAvailable({ fromDate: now, bookingsByDate, dayOpenState, daySettings, size: "small", now }),
    [now, bookingsByDate, dayOpenState, daySettings],
  );

  // ---- Per-day hides (local UI only; never mutates booking data). Only
  // unconfirmed rows offer this, as "Hide until tomorrow" — money never hides.
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
  const visibleAttention = useMemo(
    () => attention.filter((i) => i.primary !== "unconfirmed" || !dismissed.has(i.booking.id)),
    [attention, dismissed],
  );

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

  // ---- Actions (reuse the exact update path the detail modal uses) ----
  const patch = useCallback(async (b, changes, message) => {
    const result = await onUpdateBooking({ ...b, ...changes }, b._bookingDate, b._bookingDate);
    if (result !== null && message) toast.show(message, "success");
    return result;
  }, [onUpdateBooking, toast]);

  const onMarkArrived = useCallback((b) => patch(b, { status: BOOKING_STATUS.CHECKED_IN }, `${b.dogName} checked in`), [patch]);
  const onMarkReady = useCallback((b) => patch(b, { status: BOOKING_STATUS.READY_FOR_PICKUP }, `${b.dogName} is ready to go home`), [patch]);
  const onMarkCollected = useCallback((b) => patch(b, { status: BOOKING_STATUS.COMPLETED }, `${b.dogName} collected — lovely`), [patch]);
  const onMarkPaid = useCallback(
    (b, method) =>
      patch(
        b,
        { payment: "Paid in Full", paymentMethod: method ?? null, paidAmount: paymentOf(b).subtotal },
        `${b.dogName} — payment recorded`,
      ),
    [patch, paymentOf],
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

  // Shared handler bundles for the arrival components.
  const arrivalHandlers = {
    resolve,
    getWelfare,
    paymentOf,
    onMarkArrived,
    onUpdateBooking,
    onOpenBooking,
    onMessageOwner,
    onMarkPaid,
  };

  const hasNextUp = nextUp.next !== null || nextUp.upcoming.length > 0;
  const allArrivedForToday = !hasNextUp && nextUp.earlier.length > 0;

  return (
    <div className="mx-auto w-full max-w-3xl px-3 sm:px-4 pt-3 pb-6 flex flex-col gap-3">
      <TodayHeader
        dateLabel={dateLabel}
        dogsBooked={summary.dogsBooked}
        actionCount={visibleAttention.length}
        isDayOpen={isDayOpen}
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
        <>
          <div className="rounded-2xl border border-slate-200 bg-white px-6 py-10 text-center">
            <p className="text-[16px] font-bold text-slate-700">No dogs booked in today.</p>
            <p className="text-[13px] text-slate-600 mt-1">
              {isDayOpen ? "A quiet one — a good chance to catch up or fill a slot." : "The salon is closed today."}
            </p>
          </div>
          {isDayOpen && (
            <CapacitySummary
              opportunities={opportunities}
              immediateSet={immediateSet}
              nextAvailable={nextAvailable}
              dogsBooked={summary.dogsBooked}
              onToggleImmediate={onToggleImmediate}
              onNewBooking={onNewBookingSlot}
            />
          )}
        </>
      ) : (
        <>
          {/* 1 — Needs attention now (or one calm line when there's nothing) */}
          {visibleAttention.length > 0 ? (
            <AttentionPanel
              items={visibleAttention}
              resolve={resolve}
              getWelfare={getWelfare}
              paymentOf={paymentOf}
              onMarkArrived={onMarkArrived}
              onMarkCollected={onMarkCollected}
              onSendCollection={onSendCollection}
              onMessageOwner={onMessageOwner}
              onMarkPaid={onMarkPaid}
              onDidntShow={onDidntShow}
              onOpenBooking={onOpenBooking}
              onHideUntilTomorrow={onHideUntilTomorrow}
            />
          ) : (
            <CompactZeroState>Nothing needs attention right now — the day is on track.</CompactZeroState>
          )}

          {/* 2 — Next up */}
          {hasNextUp && (
            <NextUp next={nextUp.next} upcoming={nextUp.upcoming} now={now} {...arrivalHandlers} />
          )}
          {allArrivedForToday && (
            <CompactZeroState>Everyone booked in today has arrived.</CompactZeroState>
          )}

          {/* 3 — In salon now */}
          {inSalon.length > 0 && (
            <InSalonNow
              entries={inSalon}
              resolve={resolve}
              getWelfare={getWelfare}
              onMarkReady={onMarkReady}
              onOpenBooking={onOpenBooking}
            />
          )}

          {/* 4 — Ready for collection */}
          {collection.length > 0 && (
            <CollectionQueue
              entries={collection}
              resolve={resolve}
              paymentOf={paymentOf}
              onSendCollection={onSendCollection}
              onMarkCollected={onMarkCollected}
              onOpenBooking={onOpenBooking}
              onTheWaySignals={onTheWaySignals}
            />
          )}

          {/* 5 — Payments */}
          {payments.length > 0 ? (
            <PaymentsList
              entries={payments}
              resolve={resolve}
              paymentOf={paymentOf}
              onMarkPaid={onMarkPaid}
              onOpenBooking={onOpenBooking}
            />
          ) : (
            <CompactZeroState>Everyone&apos;s settled up — no payments to chase.</CompactZeroState>
          )}

          {/* 6 — Capacity */}
          {isDayOpen && (
            <CapacitySummary
              opportunities={opportunities}
              immediateSet={immediateSet}
              nextAvailable={nextAvailable}
              dogsBooked={summary.dogsBooked}
              onToggleImmediate={onToggleImmediate}
              onNewBooking={onNewBookingSlot}
            />
          )}

          {/* 7 — Earlier today + day totals */}
          {nextUp.earlier.length > 0 && (
            <EarlierToday groups={nextUp.earlier} now={now} {...arrivalHandlers} />
          )}
          <TodaySummaryStrip summary={summary} takings={takings} />

          {!isOnline && (
            <p className="text-center text-[12px] text-slate-500">Offline preview — showing sample data.</p>
          )}
        </>
      )}
    </div>
  );
}
