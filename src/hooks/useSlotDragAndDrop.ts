import { useCallback, useRef, useState } from "react";
import type { Booking } from "../types/index.js";

export interface DragState {
  booking: Booking | null;
  sourceSlot: string | null;
  overSlot: string | null;
}

interface UseSlotDragAndDropReturn {
  drag: DragState;
  onCardDragStart: (booking: Booking, e: React.DragEvent) => void;
  onCardDragEnd: () => void;
  onSlotDragOver: (slot: string, e: React.DragEvent) => void;
  onSlotDragLeave: (slot: string) => void;
  onSlotDrop: (slot: string, e: React.DragEvent) => Promise<void>;
  isDragging: boolean;
}

interface UseSlotDragAndDropOptions {
  onMoveBooking: (booking: Booking, targetSlot: string) => void | Promise<void>;
  canDropAt?: (booking: Booking, targetSlot: string) => boolean;
}

/**
 * Thin wrapper around HTML5 drag events for moving bookings between slots
 * on the same day. The `onMoveBooking` callback is the authoritative path;
 * this hook only surfaces drag state and wires the handlers.
 *
 * Touch devices need a separate path (HTML5 drag events don't fire on iOS
 * Safari without vendor polyfills). See follow-up task.
 */
export function useSlotDragAndDrop({
  onMoveBooking,
  canDropAt,
}: UseSlotDragAndDropOptions): UseSlotDragAndDropReturn {
  const [drag, setDrag] = useState<DragState>({
    booking: null,
    sourceSlot: null,
    overSlot: null,
  });
  const draggedBookingRef = useRef<Booking | null>(null);

  const onCardDragStart = useCallback((booking: Booking, e: React.DragEvent) => {
    draggedBookingRef.current = booking;
    setDrag({ booking, sourceSlot: booking.slot, overSlot: null });
    // We don't rely on dataTransfer content — we keep the booking in a ref —
    // but we must set *something* so the browser treats the drag as valid.
    e.dataTransfer.setData("text/plain", booking.id != null ? String(booking.id) : "");
    e.dataTransfer.effectAllowed = "move";
  }, []);

  const onCardDragEnd = useCallback(() => {
    draggedBookingRef.current = null;
    setDrag({ booking: null, sourceSlot: null, overSlot: null });
  }, []);

  const onSlotDragOver = useCallback(
    (slot: string, e: React.DragEvent) => {
      const booking = draggedBookingRef.current;
      if (!booking) return;
      if (slot === booking.slot) return;
      if (canDropAt && !canDropAt(booking, slot)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setDrag((prev) => (prev.overSlot === slot ? prev : { ...prev, overSlot: slot }));
    },
    [canDropAt],
  );

  const onSlotDragLeave = useCallback((slot: string) => {
    setDrag((prev) => (prev.overSlot === slot ? { ...prev, overSlot: null } : prev));
  }, []);

  const onSlotDrop = useCallback(
    async (slot: string, e: React.DragEvent) => {
      e.preventDefault();
      const booking = draggedBookingRef.current;
      draggedBookingRef.current = null;
      setDrag({ booking: null, sourceSlot: null, overSlot: null });
      if (!booking || slot === booking.slot) return;
      if (canDropAt && !canDropAt(booking, slot)) return;
      await onMoveBooking(booking, slot);
    },
    [onMoveBooking, canDropAt],
  );

  return {
    drag,
    onCardDragStart,
    onCardDragEnd,
    onSlotDragOver,
    onSlotDragLeave,
    onSlotDrop,
    isDragging: drag.booking !== null,
  };
}
