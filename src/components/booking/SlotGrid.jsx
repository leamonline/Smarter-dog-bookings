// src/components/booking/SlotGrid.jsx
import { useMemo, useCallback, useEffect, useRef } from "react";
import { getSeatStatesForSlot, canBookSlot } from "../../engine/capacity";
import { BookingCardNew } from "./BookingCardNew.jsx";
import { GhostSeat } from "./GhostSeat.jsx";
import { BlockedSeatCell } from "./BlockedSeatCell.jsx";
import { SkeletonCard } from "../shared/SkeletonCard.jsx";
import { SlotRowMenu } from "./SlotRowMenu.jsx";
import { useToast } from "../../contexts/ToastContext.jsx";
import { useSlotDragAndDrop } from "../../hooks/useSlotDragAndDrop";
import { currentSlotIndex } from "../../engine/utilisation";
import { toDateStr } from "../../supabase/transforms";

export function SlotGrid({
  bookings,
  loading,
  activeSlots,
  onOpenNewBooking,
  onMoveBooking,
  currentDateStr,
  overrides,
  onOverride,
  searchQuery,
}) {
  const toast = useToast();

  const canDropAt = useCallback(
    (booking, targetSlot) => {
      const otherBookings = bookings.filter((b) => b.id !== booking.id);
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
    [bookings, activeSlots, overrides],
  );

  const handleMoveBooking = useCallback(
    async (booking, targetSlot) => {
      if (!onMoveBooking) return;
      if (!canDropAt(booking, targetSlot)) {
        toast.show("Can't move booking there", "error");
        return;
      }
      try {
        await onMoveBooking(booking, targetSlot);
        toast.show(`Moved ${booking.dogName || "booking"} to ${targetSlot}`, "success");
      } catch {
        toast.show("Move failed", "error");
      }
    },
    [onMoveBooking, canDropAt, toast],
  );

  const dnd = useSlotDragAndDrop({
    onMoveBooking: handleMoveBooking,
    canDropAt,
  });

  const block = useCallback(async (slot, seatIndex) => {
    if (!onOverride) return;
    // Surface the optimistic "Seat blocked" toast with an undo handle
    // immediately, then await the mutation so we can flag a rollback
    // if the upsert actually fails on the server.
    const blockedToastId = toast.show("Seat blocked", "info", () => onOverride(slot, seatIndex, "blocked"));
    const result = await onOverride(slot, seatIndex, "blocked");
    if (result?.ok === false) {
      toast.dismiss?.(blockedToastId);
      toast.show(result.error || "Couldn't block seat — try again?", "error");
    }
  }, [onOverride, toast]);

  const unblock = useCallback(async (slot, seatIndex) => {
    if (!onOverride) return;
    const unblockedToastId = toast.show("Seat unblocked", "info", () => onOverride(slot, seatIndex, "blocked"));
    const result = await onOverride(slot, seatIndex, "blocked");
    if (result?.ok === false) {
      toast.dismiss?.(unblockedToastId);
      toast.show(result.error || "Couldn't unblock seat — try again?", "error");
    }
  }, [onOverride, toast]);

  const searchActive = searchQuery && searchQuery.trim().length > 0;
  const searchLower = searchActive ? searchQuery.toLowerCase().trim() : "";

  // Today-only "Now" row: the slot currently in progress. -1 (no marker) when
  // viewing any other date or when outside salon hours.
  const nowIdx = useMemo(() => {
    if (currentDateStr !== toDateStr(new Date())) return -1;
    return currentSlotIndex(activeSlots, new Date());
  }, [currentDateStr, activeSlots]);

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
      const seatStates = getSeatStatesForSlot(bookings, slot, activeSlots, slotOverrides);
      return { type: "slot", slot, index: i, seatStates };
    });
    if (result.length > 0) result[result.length - 1].isLast = true;
    return result;
  }, [activeSlots, bookings, overrides]);

  const renderSlot = useCallback((slot, index, precalculatedSeatStates, isLast) => {
    const slotOverrides = overrides?.[slot] || {};
    const seatStates = precalculatedSeatStates || getSeatStatesForSlot(bookings, slot, activeSlots, slotOverrides);

    const allAvailable = seatStates.every((s) => s.type === "available");
    const allBlockedByStaff = seatStates.every((s) => s.type === "blocked" && s.staffBlocked);
    const hasBooking = seatStates.some((s) => s.type === "booking");

    // Subtle alternating row tint to give the eye an anchor as it
    // scans down the day. Even-index rows (08:30, 09:30, 10:30…)
    // pick up a hint of blue; odd-index rows stay clean white.
    const rowBg = index % 2 === 0 ? "bg-sky-50/60" : "bg-white";
    const isNow = index === nowIdx;

    return (
      <div
        key={slot}
        ref={isNow ? nowRowRef : undefined}
        className={[
          `relative grid grid-cols-[64px_1fr] md:grid-cols-[80px_1fr] gap-2 md:gap-3 p-2 md:p-[10px_14px] items-stretch`,
          hasBooking ? "min-h-0" : "min-h-[48px] md:min-h-[56px]",
          isLast ? "" : "border-b border-[#F1F3F5]",
          !hasBooking && !isNow ? "opacity-70 hover:opacity-100 transition-opacity" : "",
          rowBg,
        ].filter(Boolean).join(" ")}
      >
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
        {/* Boxed time button — the whole box opens the slot actions menu
            (book / override / block), echoing the old list-view pill. */}
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
          />
        </div>

        {/* Seat container: single-column list at every size — one
            full-width card per booking, stacked. An empty slot shows a
            single "+ Book" ghost row rather than one per seat; the slot
            menu still offers per-seat blocking and overbooking. */}
        <div className="flex flex-col gap-1.5 md:gap-2">
        {loading ? (
          <SkeletonCard />
        ) : allAvailable ? (
          <GhostSeat
            onClick={() => onOpenNewBooking(currentDateStr, slot)}
            onDragOver={onMoveBooking ? (e) => dnd.onSlotDragOver(slot, e) : undefined}
            onDragLeave={onMoveBooking ? () => dnd.onSlotDragLeave(slot) : undefined}
            onDrop={onMoveBooking ? (e) => dnd.onSlotDrop(slot, e) : undefined}
            isDropTarget={dnd.drag.overSlot === slot}
          />
        ) : allBlockedByStaff ? (
          <>
            <BlockedSeatCell onClick={() => unblock(slot, 0)} />
            <BlockedSeatCell onClick={() => unblock(slot, 1)} />
          </>
        ) : (
          <>
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
              if (seat.type === "reserved") {
                return (
                  <div
                    key={seat.seatIndex}
                    className="border-[1.5px] border-slate-200 rounded-xl min-h-[60px] md:min-h-[80px] flex items-center justify-center bg-slate-50 text-slate-500 text-[11px] font-semibold italic"
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
                    className="border-[1.5px] border-slate-200 rounded-xl min-h-[36px] md:min-h-[44px] flex flex-col items-center justify-center gap-0.5 bg-slate-50 text-slate-600"
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
            })}
          </>
        )}
        </div>
      </div>
    );
  }, [block, unblock, onOpenNewBooking, currentDateStr, searchActive, searchLower, loading, bookings, overrides, activeSlots, onOverride, onMoveBooking, dnd, nowIdx]);

  return (
    <div>
      {rows.map((row) => renderSlot(row.slot, row.index, row.seatStates, row.isLast))}
    </div>
  );
}
