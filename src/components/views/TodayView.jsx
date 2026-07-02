// Today command centre — the staff daily landing screen. A calm, fast work
// queue answering "what needs attention right now?" built on the pure Today
// engine selectors (src/engine/today.ts) so all logic stays testable and the
// component just wires data + actions to the section views.
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
  buildCollectionQueue,
  buildPaymentsList,
  buildSlotOpportunities,
} from "../../engine/today";
import { BOOKING_STATUS } from "../../constants/index";
import { safeGet, safeSet } from "../../lib/storage";
import { useToast } from "../../contexts/ToastContext.jsx";
import { TodaySummaryStrip } from "./today/TodaySummaryStrip.jsx";
import { ImmediateAttention } from "./today/ImmediateAttention.jsx";
import { NextArrivals } from "./today/NextArrivals.jsx";
import { ChasingList } from "./today/ChasingList.jsx";
import { CollectionQueue } from "./today/CollectionQueue.jsx";
import { PaymentsList } from "./today/PaymentsList.jsx";
import { CapacityOpportunities } from "./today/CapacityOpportunities.jsx";

function SectionSkeleton() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 animate-pulse">
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
  const attention = useMemo(() => buildImmediateAttention(todayBookings, now), [todayBookings, now]);
  const arrivals = useMemo(() => buildArrivalsBySlot(todayBookings, activeSlots, now), [todayBookings, activeSlots, now]);
  const collection = useMemo(() => buildCollectionQueue(todayBookings, now), [todayBookings, now]);
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

  // ---- Per-day dismissals (local UI only; never mutates booking data) ----
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
  const onDismiss = useCallback((id) => setDismissed((prev) => new Set(prev).add(id)), []);
  const visibleAttention = useMemo(() => attention.filter((i) => !dismissed.has(i.booking.id)), [attention, dismissed]);

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
  const onMarkCollected = useCallback((b) => patch(b, { status: BOOKING_STATUS.COMPLETED }, `${b.dogName} collected — lovely`), [patch]);
  const onMarkPaid = useCallback((b) => patch(b, { payment: "Paid in Full" }, `${b.dogName} — payment recorded`), [patch]);
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

  return (
    <div className="mx-auto w-full max-w-5xl px-3 sm:px-4 py-4 flex flex-col gap-4">
      <header className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[22px] font-extrabold text-slate-800 leading-tight">Today</h1>
          <p className="text-[13px] text-slate-500">{dateLabel}{!isDayOpen && " · salon closed"}</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => navigate("/")} className="inline-flex items-center min-h-[38px] px-3 rounded-lg bg-brand-yellow text-brand-purple text-[13px] font-bold hover:brightness-95 transition">Open calendar</button>
          <button type="button" onClick={() => onNewBooking({ dateStr: todayStr, slot: "" })} className="inline-flex items-center min-h-[38px] px-3 rounded-lg bg-brand-teal text-white text-[13px] font-bold hover:bg-brand-teal-dark transition">New booking</button>
        </div>
      </header>

      {bookingsError && (
        <div className="rounded-xl border border-brand-coral/30 bg-brand-coral/[0.06] px-4 py-3 text-[13px] text-brand-coral-dark flex items-center justify-between gap-3">
          <span>Couldn&apos;t load today&apos;s bookings.</span>
          {onRefresh && <button type="button" onClick={onRefresh} className="font-bold underline">Retry</button>}
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
            <p className="text-[13px] text-slate-500 mt-1">
              {isDayOpen ? "A quiet one — a good chance to catch up or fill a slot." : "The salon is closed today."}
            </p>
          </div>
          {isDayOpen && (
            <CapacityOpportunities
              opportunities={opportunities}
              immediateSet={immediateSet}
              nextAvailable={nextAvailable}
              onToggleImmediate={onToggleImmediate}
              onNewBooking={onNewBookingSlot}
            />
          )}
          <TodaySummaryStrip summary={summary} />
        </>
      ) : (
        <>
          <ImmediateAttention
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
            onDismiss={onDismiss}
          />

          <NextArrivals
            groups={arrivals}
            resolve={resolve}
            getWelfare={getWelfare}
            paymentOf={paymentOf}
            onUpdateBooking={onUpdateBooking}
            onOpenBooking={onOpenBooking}
            onMessageOwner={onMessageOwner}
            onMarkPaid={onMarkPaid}
          />

          <div className="grid gap-4 lg:grid-cols-2">
            <ChasingList
              items={visibleAttention}
              resolve={resolve}
              onMessageOwner={onMessageOwner}
              onMarkArrived={onMarkArrived}
              onDidntShow={onDidntShow}
              onDismiss={onDismiss}
            />
            <CollectionQueue
              entries={collection}
              resolve={resolve}
              paymentOf={paymentOf}
              onSendCollection={onSendCollection}
              onMarkCollected={onMarkCollected}
              onOpenBooking={onOpenBooking}
            />
            <PaymentsList
              entries={payments}
              resolve={resolve}
              paymentOf={paymentOf}
              onMarkPaid={onMarkPaid}
              onOpenBooking={onOpenBooking}
            />
            <CapacityOpportunities
              opportunities={opportunities}
              immediateSet={immediateSet}
              nextAvailable={nextAvailable}
              onToggleImmediate={onToggleImmediate}
              onNewBooking={onNewBookingSlot}
            />
          </div>

          <TodaySummaryStrip summary={summary} />

          {!isOnline && (
            <p className="text-center text-[12px] text-slate-400">Offline preview — showing sample data.</p>
          )}
        </>
      )}
    </div>
  );
}
