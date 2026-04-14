/**
 * useBookingActions — resolves online/offline booking operations for App.jsx.
 * Wraps Supabase callbacks with currentDateStr binding, then picks
 * online or offline versions based on connectivity.
 */
import { useCallback } from "react";
import type { Booking, Dog, Human, SalonConfig, DaySettings, BookingsByDate } from "../types/index.js";

interface SupabaseFns {
  sbAddBooking: (dateStr: string, booking: Booking) => Promise<void>;
  sbRemoveBooking: (dateStr: string, bookingId: string) => Promise<void>;
  sbUpdateBooking: (booking: Booking) => Promise<void>;
  sbToggleDayOpen: (dateStr: string) => Promise<void>;
  sbSetOverride: (dateStr: string, slot: string, seatIndex: number, action: string) => Promise<void>;
  sbAddExtraSlot: (dateStr: string) => Promise<void>;
  sbRemoveExtraSlot: (dateStr: string) => Promise<void>;
  sbUpdateDog: (dog: Dog) => Promise<void>;
  sbUpdateHuman: (human: Human) => Promise<void>;
  sbUpdateConfig: (config: SalonConfig) => Promise<void>;
  sbAddHuman: (human: Human) => Promise<void>;
  sbAddDog: (dog: Dog) => Promise<void>;
}

interface OfflineFns {
  handleAdd: (booking: Booking) => void;
  handleAddToDate: (booking: Booking, dateStr: string) => void;
  handleRemove: (bookingId: string) => void;
  handleUpdate: (booking: Booking) => void;
  toggleDayOpen: () => void;
  handleOverride: (slot: string, seatIndex: number, action: string) => void;
  handleAddSlot: () => void;
  handleRemoveSlot: () => void;
  updateDog: (dog: Dog) => void;
  updateHuman: (human: Human) => void;
  updateConfig: (config: SalonConfig) => void;
  addHuman: (human: Human) => void;
  addDog: (dog: Dog) => void;
  dogs: Record<string, Dog>;
  humans: Record<string, Human>;
  bookingsByDate: BookingsByDate;
  config: SalonConfig;
  daySettings: Record<string, DaySettings>;
}

interface UseBookingActionsParams {
  isOnline: boolean;
  currentDateStr: string;
  supabase: SupabaseFns;
  offline: OfflineFns;
  onlineData: {
    dogs: Record<string, Dog>;
    humans: Record<string, Human>;
    bookingsByDate: BookingsByDate;
    config: SalonConfig;
    daySettings: Record<string, DaySettings>;
  };
}

export function useBookingActions({
  isOnline,
  currentDateStr,
  supabase: sb,
  offline,
  onlineData,
}: UseBookingActionsParams) {
  // --- Online callbacks bound to currentDateStr ---
  const onlineHandleAdd = useCallback(
    (booking: Booking, targetDateStr: string = currentDateStr) =>
      sb.sbAddBooking(targetDateStr, booking),
    [sb.sbAddBooking, currentDateStr],
  );
  const onlineHandleAddToDate = useCallback(
    (booking: Booking, dateStr: string) => sb.sbAddBooking(dateStr, booking),
    [sb.sbAddBooking],
  );
  const onlineHandleRemove = useCallback(
    (bookingId: string) => sb.sbRemoveBooking(currentDateStr, bookingId),
    [sb.sbRemoveBooking, currentDateStr],
  );
  const onlineToggleDayOpen = useCallback(
    () => sb.sbToggleDayOpen(currentDateStr),
    [sb.sbToggleDayOpen, currentDateStr],
  );
  const onlineHandleOverride = useCallback(
    (slot: string, seatIndex: number, action: string) =>
      sb.sbSetOverride(currentDateStr, slot, seatIndex, action),
    [sb.sbSetOverride, currentDateStr],
  );
  const onlineHandleAddSlot = useCallback(
    () => sb.sbAddExtraSlot(currentDateStr),
    [sb.sbAddExtraSlot, currentDateStr],
  );
  const onlineHandleRemoveSlot = useCallback(
    () => sb.sbRemoveExtraSlot(currentDateStr),
    [sb.sbRemoveExtraSlot, currentDateStr],
  );

  // --- Resolve online vs offline ---
  return {
    dogs: isOnline ? onlineData.dogs : offline.dogs,
    humans: isOnline ? onlineData.humans : offline.humans,
    bookingsByDate: isOnline ? onlineData.bookingsByDate : offline.bookingsByDate,
    salonConfig: isOnline ? onlineData.config : offline.config,
    daySettings: isOnline ? onlineData.daySettings : offline.daySettings,
    handleAdd: isOnline ? onlineHandleAdd : offline.handleAdd,
    handleAddToDate: isOnline ? onlineHandleAddToDate : offline.handleAddToDate,
    handleRemove: isOnline ? onlineHandleRemove : offline.handleRemove,
    handleUpdate: isOnline ? sb.sbUpdateBooking : offline.handleUpdate,
    toggleDayOpen: isOnline ? onlineToggleDayOpen : offline.toggleDayOpen,
    handleOverride: isOnline ? onlineHandleOverride : offline.handleOverride,
    handleAddSlot: isOnline ? onlineHandleAddSlot : offline.handleAddSlot,
    handleRemoveSlot: isOnline ? onlineHandleRemoveSlot : offline.handleRemoveSlot,
    updateDog: isOnline ? sb.sbUpdateDog : offline.updateDog,
    updateHuman: isOnline ? sb.sbUpdateHuman : offline.updateHuman,
    updateConfig: isOnline ? sb.sbUpdateConfig : offline.updateConfig,
    addHuman: isOnline ? sb.sbAddHuman : offline.addHuman,
    addDog: isOnline ? sb.sbAddDog : offline.addDog,
  };
}
