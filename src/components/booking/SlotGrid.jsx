// src/components/booking/SlotGrid.jsx
import { useState, useMemo, useCallback } from "react";
import { getSeatStatesForSlot, canBookSlot } from "../../engine/capacity.js";
import { BookingCardNew } from "./BookingCardNew.jsx";
import { GhostSeat } from "./GhostSeat.jsx";
import { BlockedSeatCell } from "./BlockedSeatCell.jsx";
import { SkeletonCard } from "../shared/SkeletonCard.jsx";
import { useToast } from "../../contexts/ToastContext.jsx";
import { useSlotDragAndDrop } from "../../hooks/useSlotDragAndDrop.js";

function formatSlotTime(slot) {
  const [hourStr, minStr] = slot.split(":");
  const hour = parseInt(hourStr, 10);
  const suffix = hour < 12 ? "am" : "pm";
  const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${displayHour}:${minStr}${suffix}`;
}

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

  const block = useCallback((slot, seatIndex) => {
    if (onOverride) {
      onOverride(slot, seatIndex, "blocked");
      toast.show("Seat blocked", "info", () => onOverride(slot, seatIndex, "blocked"));
    }
  }, [onOverride, toast]);

  const unblock = useCallback((slot, seatIndex) => {
    if (onOverride) {
      onOverride(slot, seatIndex, "blocked");
      toast.show("Seat unblocked", "info", () => onOverride(slot, seatIndex, "blocked"));
    }
  }, [onOverride, toast]);

  const searchActive = searchQuery && searchQuery.trim().length > 0;
  const searchLower = searchActive ? searchQuery.toLowerCase().trim() : "";

  const [expandedBlocks, setExpandedBlocks] = useState({});

  const rows = useMemo(() => {
    const minCollapseCount = 2;
    const result = [];
    let currentEmptyBlock = null;

    for (let i = 0; i < activeSlots.length; i++) {
      const slot = activeSlots[i];
      const slotOverrides = overrides?.[slot] || {};
      const seatStates = getSeatStatesForSlot(bookings, slot, activeSlots, slotOverrides);
      
      const allAvailable = seatStates.every((s) => s.type === "available");
      
      if (allAvailable) {
        if (!currentEmptyBlock) {
          currentEmptyBlock = { type: 'emptyBlock', startSlot: slot, startTime: slot, startIndex: i, count: 1, endSlot: slot, endIndex: i };
        } else {
          currentEmptyBlock.count++;
          currentEmptyBlock.endSlot = slot;
          currentEmptyBlock.endIndex = i;
        }
      } else {
        if (currentEmptyBlock) {
          if (currentEmptyBlock.count >= minCollapseCount) {
            result.push(currentEmptyBlock);
          } else {
            for (let j = currentEmptyBlock.startIndex; j <= currentEmptyBlock.endIndex; j++) {
              result.push({ type: 'slot', slot: activeSlots[j], index: j });
            }
          }
          currentEmptyBlock = null;
        }
        result.push({ type: 'slot', slot, index: i, seatStates });
      }
    }
    
    if (currentEmptyBlock) {
      if (currentEmptyBlock.count >= minCollapseCount) {
        result.push(currentEmptyBlock);
      } else {
        for (let j = currentEmptyBlock.startIndex; j <= currentEmptyBlock.endIndex; j++) {
          result.push({ type: 'slot', slot: activeSlots[j], index: j });
        }
      }
    }

    if (result.length > 0 && result[result.length - 1].type === 'slot') {
      result[result.length - 1].isLast = true;
    }

    return result;
  }, [activeSlots, bookings, overrides]);

  const renderSlot = useCallback((slot, index, precalculatedSeatStates, isLast) => {
    const slotOverrides = overrides?.[slot] || {};
    const seatStates = precalculatedSeatStates || getSeatStatesForSlot(bookings, slot, activeSlots, slotOverrides);

    const allAvailable = seatStates.every((s) => s.type === "available");
    const allBlockedByStaff = seatStates.every((s) => s.type === "blocked" && s.staffBlocked);
    const hasBooking = seatStates.some((s) => s.type === "booking");

    return (
      <div
        key={slot}
        className={[
          `grid grid-cols-[56px_1fr] sm:grid-cols-[56px_1fr_1fr] md:grid-cols-[72px_1fr_1fr] gap-1.5 md:gap-2.5 p-2 md:p-[10px_14px] items-stretch`,
          hasBooking ? "min-h-0 sm:min-h-[110px] md:min-h-[140px]" : "min-h-[48px] md:min-h-[56px]",
          isLast ? "" : "border-b border-[#F1F3F5]",
          !hasBooking ? "opacity-60 hover:opacity-100 transition-opacity" : "",
        ].filter(Boolean).join(" ")}
      >
        <div className={`text-sm font-extrabold text-center border-r-2 border-slate-200 pr-2 md:pr-2.5 self-stretch flex items-center justify-center ${hasBooking ? "text-slate-800" : "text-slate-400"}`}>
          {formatSlotTime(slot)}
        </div>

        <div className="flex flex-col gap-1.5 sm:contents">
        {loading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : allAvailable ? (
          <>
            <GhostSeat
              onClick={() => onOpenNewBooking(currentDateStr, slot)}
              onBlock={onOverride ? () => block(slot, 0) : undefined}
              onDragOver={onMoveBooking ? (e) => dnd.onSlotDragOver(slot, e) : undefined}
              onDragLeave={onMoveBooking ? () => dnd.onSlotDragLeave(slot) : undefined}
              onDrop={onMoveBooking ? (e) => dnd.onSlotDrop(slot, e) : undefined}
              isDropTarget={dnd.drag.overSlot === slot}
            />
            <GhostSeat
              onClick={() => onOpenNewBooking(currentDateStr, slot)}
              onBlock={onOverride ? () => block(slot, 1) : undefined}
              onDragOver={onMoveBooking ? (e) => dnd.onSlotDragOver(slot, e) : undefined}
              onDragLeave={onMoveBooking ? () => dnd.onSlotDragLeave(slot) : undefined}
              onDrop={onMoveBooking ? (e) => dnd.onSlotDrop(slot, e) : undefined}
              isDropTarget={dnd.drag.overSlot === slot}
            />
          </>
        ) : allBlockedByStaff ? (
          <>
            <BlockedSeatCell
              onClick={() => unblock(slot, 0)}
            />
            <BlockedSeatCell
              onClick={() => unblock(slot, 1)}
            />
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
                    className="border-[1.5px] border-slate-200 rounded-xl min-h-[60px] md:min-h-[80px] flex items-center justify-center bg-slate-50 text-slate-400 text-[11px] font-semibold italic"
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
                    className="border-[1.5px] border-slate-200 rounded-xl min-h-[36px] md:min-h-[44px] flex flex-col items-center justify-center gap-0.5 bg-slate-50 text-slate-300"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="9" stroke="#D1D5DB" strokeWidth="2" />
                      <line x1="6" y1="6" x2="18" y2="18" stroke="#D1D5DB" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                    <span className="text-[10px] font-semibold text-slate-300">Closed</span>
                  </div>
                );
              }
              return (
                <GhostSeat
                  key={seat.seatIndex}
                  onClick={() => onOpenNewBooking(currentDateStr, slot)}
                  onBlock={onOverride ? () => block(slot, seat.seatIndex) : undefined}
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
  }, [block, unblock, onOpenNewBooking, currentDateStr, searchActive, searchLower, loading, bookings, overrides, activeSlots, onOverride]);

  return (
    <div className="bg-white border border-slate-200 border-t-0 rounded-b-xl overflow-hidden">
      {rows.map((row, i) => {
        if (row.type === 'emptyBlock') {
          const isExpanded = expandedBlocks[row.startSlot];
          if (!isExpanded) {
            const rangeLabel = `${formatSlotTime(row.startTime)} \u2013 ${formatSlotTime(activeSlots[row.endIndex] || row.endSlot)}`;
            return (
              <div
                key={`empty-${row.startSlot}`}
                className="group flex items-stretch border-b border-[#F1F3F5] bg-slate-50 hover:bg-brand-yellow/15 text-slate-500 min-h-[44px] md:min-h-[52px] transition-colors"
              >
                <button
                  type="button"
                  onClick={() => onOpenNewBooking(currentDateStr, row.startSlot)}
                  aria-label={`Add a booking between ${rangeLabel}`}
                  className="flex-1 flex items-center gap-2 p-3 text-sm font-bold text-left font-[inherit] bg-transparent border-none cursor-pointer text-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-yellow focus:ring-inset"
                >
                  <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-500 group-hover:bg-brand-yellow group-hover:text-brand-purple flex items-center justify-center text-sm font-bold transition-colors shrink-0">+</span>
                  <span className="group-hover:text-brand-purple transition-colors">
                    Free <span className="opacity-60 ml-1 font-semibold">({rangeLabel})</span>
                  </span>
                </button>
                <button
                  type="button"
                  aria-label="Expand timeslots to see or block individual seats"
                  onClick={() => setExpandedBlocks(prev => ({ ...prev, [row.startSlot]: true }))}
                  className="text-[10px] font-bold uppercase tracking-wider text-slate-400 hover:text-slate-700 bg-transparent border-none cursor-pointer px-3 font-[inherit] focus:outline-none focus:ring-2 focus:ring-brand-yellow focus:ring-inset transition-colors"
                >
                  Expand
                </button>
              </div>
            );
          } else {
            return (
              <div key={`expanded-${row.startSlot}`} className="contents">
                {Array.from({ length: row.endIndex - row.startIndex + 1 }).map((_, idx) => {
                  const j = row.startIndex + idx;
                  const subSlot = activeSlots[j];
                  const subIsLast = j === activeSlots.length - 1;
                  return renderSlot(subSlot, j, null, subIsLast);
                })}
                <div className="p-2 px-4 border-b border-[#F1F3F5] bg-slate-50/70 flex justify-end">
                  <button 
                    onClick={() => setExpandedBlocks(prev => ({ ...prev, [row.startSlot]: false }))} 
                    className="text-[10px] font-bold text-slate-400 hover:text-slate-700 font-[inherit] uppercase tracking-wider py-1 cursor-pointer transition-colors flex items-center gap-1"
                  >
                    <span>Collapse</span><span>&#9650;</span>
                  </button>
                </div>
              </div>
            );
          }
        }
        
        return renderSlot(row.slot, row.index, row.seatStates, row.isLast);
      })}
    </div>
  );
}
