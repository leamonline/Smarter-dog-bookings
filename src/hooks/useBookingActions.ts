/**
 * useBookingActions — resolves online/offline booking operations for App.jsx.
 * Wraps Supabase callbacks with currentDateStr binding, then picks
 * online or offline versions based on connectivity.
 */
import { useCallback } from "react";

interface SupabaseFns {
  sbAddBooking: (dateStr: string, booking: any) => Promise<any>;
  sbRemoveBooking: (dateStr: string, bookingId: string) => Promise<any>;
  sbUpdateBooking: (booking: any) => Promise<any>;
  sbToggleDayOpen: (dateStr: string) => Promise<any>;
  sbSetOverride: (dateStr: string, slot: string, seatIndex: number, action: string) => Promise<any>;
  sbAddExtraSlot: (dateStr: string) => Promise<any>;
  sbRemoveExtraSlot: (dateStr: string) => Promise<any>;
  sbUpdateDog: (dog: any) => Promise<any>;
  sbUpdateHuman: (human: any) => Promise<any>;
  sbUpdateConfig: (config: any) => Promise<any>;
  sbAddHuman: (human: any) => Promise<any>;
  sbAddDog: (dog: any) => Promise<any>;
}

interface OfflineFns {
  handleAdd: (booking: any) => void;
  handleAddToDate: (booking: any, dateStr: string) => void;
  handleRemove: (bookingId: string) => void;
  handleUpdate: (booking: any) => void;
  toggleDayOpen: () => void;
  handleOverride: (slot: string, seatIndex: number, action: string) => void;
  handleAddSlot: () => void;
  handleRemoveSlot: () => void;
  updateDog: (dog: any) => void;
  updateHuman: (human: any) => void;
  updateConfig: (config: any) => void;
  addHuman: (human: any) => void;
  addDog: (dog: any) => void;
  dogs: any[];
  humans: any[];
  bookingsByDate: Record<string, any>;
  config: any;
  daySettings: Record<string, any>;
}

interface UseBookingActionsParams {
  isOnline: boolean;
  currentDateStr: string;
  supabase: SupabaseFns;
  offline: OfflineFns;
  onlineData: {
    dogs: any[];
    humans: any[];
    bookingsByDate: Record<string, any>;
    config: any;
    daySettings: Record<string, any>;
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
    (booking: any, targetDateStr: string = currentDateStr) =>
      sb.sbAddBooking(targetDateStr, booking),
    [sb.sbAddBooking, currentDateStr],
  );
  const onlineHandleAddToDate = useCallback(
    (booking: any, dateStr: string) => sb.sbAddBooking(dateStr, booking),
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
