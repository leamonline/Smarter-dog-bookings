// src/components/booking/SlotGrid.jsx
import { useMemo, useCallback, useEffect, useRef } from "react";
import { getSeatStatesForSlot, canBookSlot } from "../../engine/capacity";
import { excludeCancelled } from "../../engine/occupancy";
import { BookingCardNew } from "./BookingCardNew.jsx";
import { GhostSeat } from "./GhostSeat.jsx";
import { BlockedSeatCell } from "./BlockedSeatCell.jsx";
import { SkeletonCard } from "../shared/SkeletonCard.jsx";
import { SlotRowMenu } from "./SlotRowMenu.jsx";
import { Zap } from "lucide-react";
import { useToast } from "../../contexts/ToastContext.jsx";
import { useSlotDragAndDrop } from "../../hooks/useSlotDragAndDrop";
import { currentSlotIndex } from "../../engine/utilisation";
import { isBeforeImmediateCutoff } from "../../engine/immediateBooking";
import { SLOT_SHAPE } from "../../engine/slotGrid";
import { toDateStr } from "../../supabase/transforms";

export function SlotGrid({
  bookings,
  loading,
  activeSlots,
  onOpenNewBooking,
  draftPick,
  onMoveBooking,
  currentDateStr,
  overrides,
  onOverride,
  immediateSlots,
  onToggleImmediate,
  searchQuery,
}) {
  const toast = useToast();

  // The capacity engine treats its input as the day's non-cancelled occupancy.
  // Strip cancelled rows once here so the grid never renders a phantom card or
  // counts a freed seat, independent of how the caller assembled the day.
  const activeBookings = useMemo(
    () => excludeCancelled(bookings || []),
    [bookings],
  );

  const canDropAt = useCallback(
    (booking, targetSlot) => {
      const otherBookings = activeBookings.filter((b) => b.id !== booking.id);
      const check = canBookSlot(
        otherBookings,
        targetSlot,
        booking.size,
        activeSlots,
        {
          overrides: overrides?.[targetSlot] || {},
          dogId: booking._dogId,
          staffOverride: true,
        },
      );
      return check.allowed;
    },
    [activeBookings, activeSlots, overrides],
  );

  const handleMoveBooking = useCallback(
    async (booking, targetSlot) => {
      if (!onMoveBooking) return;
      if (!canDropAt(booking, targetSlot)) {
        toast.show("Can't move the booking there", "error");
        return;
      }
      try {
        await onMoveBooking(booking, targetSlot);
        toast.show(`Moved ${booking.dogName || "booking"} to ${targetSlot}`, "success");
      } catch {
        toast.show("Move didn't work", "error");
      }
    },
    [onMoveBooking, canDropAt, toast],
  );

  const dnd = useSlotDragAndDrop({
    onMoveBooking: handleMoveBooking,
    canDropAt,
  });

  // `seatIndex` may be a list — a whole-slot block sends both seats together so
  // they land as ONE day_settings write (two calls raced the same row and could
  // leave the slot half-blocked).
  const block = useCallback(async (slot, seatIndex) => {
    if (!onOverride) return;
    const wholeSlot = Array.isArray(seatIndex) && seatIndex.length > 1;
    // Surface the optimistic "blocked" toast with an undo handle immediately,
    // then await the mutation so we can flag a rollback if the upsert actually
    // fails on the server.
    const blockedToastId = toast.show(
      wholeSlot ? `${slot} blocked off` : "Seat blocked",
      "info",
      () => onOverride(slot, seatIndex, "blocked"),
    );
    const result = await onOverride(slot, seatIndex, "blocked");
    if (result?.ok === false) {
      toast.dismiss?.(blockedToastId);
      toast.show(
        result.error ||
          (wholeSlot
            ? "Couldn't block that timeslot — give it another go?"
            : "Couldn't block that seat — give it another go?"),
        "error",
      );
    }
  }, [onOverride, toast]);

  const unblock = useCallback(async (slot, seatIndex) => {
    if (!onOverride) return;
    const unblockedToastId = toast.show("Seat unblocked", "info", () => onOverride(slot, seatIndex, "blocked"));
    const result = await onOverride(slot, seatIndex, "blocked");
    if (result?.ok === false) {
      toast.dismiss?.(unblockedToastId);
      toast.show(result.error || "Couldn't unblock that seat — give it another go?", "error");
    }
  }, [onOverride, toast]);

  // Whole-slot "open for immediate booking" toggle — same optimistic
  // toast-with-undo shape as block/unblock above.
  const toggleImmediate = useCallback(async (slot, wasImmediate) => {
    if (!onToggleImmediate) return;
    const message = wasImmediate
      ? "Last-minute booking closed"
      : `Open for last-minute booking — customers can grab ${slot} online`;
    const toastId = toast.show(message, "info", () => onToggleImmediate(slot));
    const result = await onToggleImmediate(slot);
    if (result?.ok === false) {
      toast.dismiss?.(toastId);
      toast.show(result.error || "Couldn't update last-minute booking — give it another go?", "error");
    }
  }, [onToggleImmediate, toast]);

  const searchActive = searchQuery && searchQuery.trim().length > 0;
  const searchLower = searchActive ? searchQuery.toLowerCase().trim() : "";

  // Today-only "Now" row: the slot currently in progress. -1 (no marker) when
  // viewing any other date or when outside salon hours.
  const nowIdx = useMemo(() => {
    if (currentDateStr !== toDateStr(new Date())) return -1;
    return currentSlotIndex(activeSlots, new Date());
  }, [currentDateStr, activeSlots]);

  // "Open for immediate booking" only exists on today's view — the flag
  // means "customers may book this slot TODAY", so it has nothing to say
  // on any other date.
  const isToday = currentDateStr === toDateStr(new Date());

  // Opening today's schedule mid-shift lands you on the slot in progress
  // rather than 8:30. Once per mount — navigating between days and back
  // shouldn't keep yanking the scroll position around.
  const nowRowRef = useRef(null);
  const didAutoScroll = useRef(false);
  useEffect(() => {
    if (didAutoScroll.current || nowIdx < 0 || loading) return;
    didAutoScroll.current = true;
    // Optional-call form: jsdom (tests) has no scrollIntoView.
    nowRowRef.current?.scrollIntoView?.({ block: "center" });
  }, [nowIdx, loading]);

  const rows = useMemo(() => {
    const result = activeSlots.map((slot, i) => {
      const slotOverrides = overrides?.[slot] || {};
      const seatStates = getSeatStatesForSlot(activeBookings, slot, activeSlots, slotOverrides);
      return { type: "slot", slot, index: i, seatStates };
    });
    if (result.length > 0) result[result.length - 1].isLast = true;
    return result;
  }, [activeSlots, activeBookings, overrides]);

  const renderSlot = useCallback((slot, index, precalculatedSeatStates, isLast) => {
    const slotOverrides = overrides?.[slot] || {};
    const seatStates = precalculatedSeatStates || getSeatStatesForSlot(activeBookings, slot, activeSlots, slotOverrides);

    const hasBooking = seatStates.some((s) => s.type === "booking");

    // Immediate ("last minute") booking: offer the toggle on today's slots
    // — canonical AND well-formed extra slots (the DB grid accepts a date's
    // sanitised extra_slots) — while the 30-min cutoff hasn't passed. An
    // already-flagged slot can always be un-flagged, even after its cutoff.
    const isImmediate = isToday && (immediateSlots || []).includes(slot);
    const canToggleImmediate =
      isToday &&
      !!onToggleImmediate &&
      SLOT_SHAPE.test(slot) &&
      (isImmediate || isBeforeImmediateCutoff(slot, new Date()));

    // Subtle alternating row tint to give the eye an anchor as it
    // scans down the day. Even-index rows (08:30, 09:30, 10:30…)
    // pick up a hint of blue; odd-index rows stay clean white.
    const rowBg = index % 2 === 0 ? "bg-sky-50/60" : "bg-white";
    const isNow = index === nowIdx;

    // Live booking-draft marker: while the booking drawer targets this
    // day+slot, pin a chip on the row so staff always see where the
    // booking will land.
    const isDraftTarget =
      !!draftPick && draftPick.dateStr === currentDateStr && draftPick.slot === slot;

    // One boxed time button PER SLOT, spanning both seats: the clock + time
    // (like the old list view's arrival pill) sits beside the stacked seats
    // and opens the slot-actions menu (book / block / override).
    const timeBox = (
      <div className="self-stretch">
        <SlotRowMenu
          slot={slot}
          seatStates={seatStates}
          onBlockSeat={onOverride ? (idx) => block(slot, idx) : undefined}
          disabled={loading}
          hasBooking={hasBooking}
          onOpenBooking={
            onOpenNewBooking
              ? () => onOpenNewBooking(currentDateStr, slot)
              : undefined
          }
          onOverbook={
            onOpenNewBooking
              ? () => onOpenNewBooking(currentDateStr, slot, { capacityOverride: true })
              : undefined
          }
          isImmediate={isImmediate}
          onToggleImmediate={
            canToggleImmediate
              ? () => toggleImmediate(slot, isImmediate)
              : undefined
          }
        />
      </div>
    );

    const rowGrid = "grid grid-cols-[64px_1fr] md:grid-cols-[80px_1fr] gap-2 md:gap-3 items-stretch";

    const seatCell = (seat) => {
      if (seat.type === "reserved") {
        return (
          <div
            key={seat.seatIndex}
            className="border-[1.5px] border-slate-200 rounded-xl min-h-[76px] lg:min-h-[80px] flex items-center justify-center bg-slate-50 text-slate-500 text-[11px] font-semibold italic"
          >
            (large dog)
          </div>
        );
      }
      if (seat.type === "blocked" && seat.staffBlocked) {
        return (
          <BlockedSeatCell
            key={seat.seatIndex}
            onClick={() => unblock(slot, seat.seatIndex)}
          />
        );
      }
      if (seat.type === "blocked") {
        return (
          <div
            key={seat.seatIndex}
            className="border-[1.5px] border-slate-200 rounded-xl min-h-[76px] lg:min-h-[80px] flex flex-col items-center justify-center gap-0.5 bg-slate-50 text-slate-600"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="9" stroke="#94A3B8" strokeWidth="2" />
              <line x1="6" y1="6" x2="18" y2="18" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <span className="text-[10px] font-semibold text-slate-600">Closed</span>
          </div>
        );
      }
      return (
        <GhostSeat
          key={seat.seatIndex}
          onClick={() => onOpenNewBooking(currentDateStr, slot)}
          onDragOver={onMoveBooking ? (e) => dnd.onSlotDragOver(slot, e) : undefined}
          onDragLeave={onMoveBooking ? () => dnd.onSlotDragLeave(slot) : undefined}
          onDrop={onMoveBooking ? (e) => dnd.onSlotDrop(slot, e) : undefined}
          isDropTarget={dnd.drag.overSlot === slot}
        />
      );
    };

    return (
      <div
        key={slot}
        ref={isNow ? nowRowRef : undefined}
        className={[
          `relative flex flex-col gap-1.5 md:gap-2 p-2 md:p-[10px_14px]`,
          hasBooking ? "min-h-0" : "min-h-[48px] md:min-h-[56px]",
          isLast ? "" : "border-b border-[#F1F3F5]",
          rowBg,
          isDraftTarget ? "ring-2 ring-inset ring-brand-teal" : "",
        ].filter(Boolean).join(" ")}
      >
        {isDraftTarget && (
          <span className={`absolute ${index === 0 ? "top-1" : "-top-2"} left-16 md:left-20 z-[1] inline-flex items-center rounded-full bg-brand-teal text-white text-[10px] font-bold px-2 py-0.5 shadow-sm pointer-events-none`}>
            Booking here
          </span>
        )}

        {isNow && (
          <>
            <span
              className="pointer-events-none absolute inset-y-0 left-0 w-[3px] bg-brand-teal"
              aria-hidden="true"
            />
            <span className="pointer-events-none absolute top-0 left-0 z-10 inline-flex items-center rounded-br-lg bg-brand-teal px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-white shadow-sm">
              Now
            </span>
          </>
        )}

        {/* "Last minute" chip on flagged rows — top-right ("Now" owns
            top-left) so the two can share a row without colliding. */}
        {isImmediate && (
          <span className="pointer-events-none absolute top-0 right-0 z-10 inline-flex items-center gap-1 rounded-bl-lg bg-brand-yellow px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-brand-purple shadow-sm">
            <Zap size={9} strokeWidth={2.6} aria-hidden="true" />
            Last minute
          </span>
        )}

        {loading ? (
          <div className={rowGrid}>
            {timeBox}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 md:gap-3 items-stretch">
              <SkeletonCard />
              <SkeletonCard className="hidden md:block" />
            </div>
          </div>
        ) : (
          // One time box spanning the whole slot, with both seats rendered
          // side by side from md up and stacked below it.
          //
          // md rather than lg because that is where the measurement lands. A
          // seat card is 291px wide at lg on a 1024 window — the width that
          // has always shipped. At 768, with no sidebar yet and the 80px time
          // column removed, two-up gives each seat 300px, so the pair is no
          // tighter than desktop. At 700 it would be 274px, narrower than
          // anything that ships, so the fold stays single-column and wins its
          // space back from the chrome instead. Below md the schedule ran one
          // seat per row across a 704px column, wasting half the width.
          <div className={rowGrid}>
            {timeBox}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 md:gap-3 items-stretch">
              {seatStates.map((seat) => {
                if (seat.type === "booking") {
                  const b = seat.booking;
                  const dimmed = searchActive && !`${b.dogName} ${b.breed} ${b.owner} ${b.ownerName || ""}`.toLowerCase().includes(searchLower);
                  return (
                    <BookingCardNew
                      key={b.id || seat.seatIndex}
                      booking={b}
                      searchDimmed={dimmed}
                      draggable={!!onMoveBooking}
                      onDragStart={onMoveBooking ? dnd.onCardDragStart : undefined}
                      onDragEnd={onMoveBooking ? dnd.onCardDragEnd : undefined}
                      isBeingDragged={dnd.drag.booking?.id === b.id}
                    />
                  );
                }
                return seatCell(seat);
              })}
            </div>
          </div>
        )}
      </div>
    );
  }, [block, unblock, toggleImmediate, onOpenNewBooking, currentDateStr, searchActive, searchLower, loading, activeBookings, overrides, immediateSlots, onToggleImmediate, isToday, activeSlots, onOverride, onMoveBooking, dnd, nowIdx, draftPick]);

  return (
    <div>
      {rows.map((row) => renderSlot(row.slot, row.index, row.seatStates, row.isLast))}
    </div>
  );
}
