/**
 * useBookingActions — resolves online/offline booking operations for App.jsx.
 * Wraps Supabase callbacks with currentDateStr binding, then picks
 * online or offline versions based on connectivity.
 */
import { useCallback } from "react";
import type { Booking, Dog, Human, SalonConfig, DaySettings, BookingsByDate } from "../types/index";

// The update-family signatures below were corrected to the REAL contracts
// (the originals declared 1-arg/void shapes that the implementations never
// had — PR #255's "latent drift" findings 2 and 3):
//   - updateBooking is 3-arg (booking, fromDateStr, toDateStr) and resolves
//     to the saved booking or null (useBookings.js), and callers
//     (useBookingSave) branch on that result.
//   - updateDog / updateHuman take (idOrName, updates) and resolve to the
//     saved record, null on failure, or undefined for an unknown record
//     (useDogs.ts / useHumans.ts).
interface SupabaseFns {
  sbAddBooking: (dateStr: string, booking: Booking) => Promise<unknown>;
  sbRemoveBooking: (dateStr: string, bookingId: string) => Promise<unknown>;
  sbUpdateBooking: (
    booking: Booking & { staff_capacity_override?: boolean },
    fromDateStr: string,
    toDateStr: string,
  ) => Promise<Booking | null>;
  sbToggleDayOpen: (dateStr: string) => Promise<void>;
  sbSetOverride: (dateStr: string, slot: string, seatIndex: number, action: string) => Promise<void>;
  sbAddExtraSlot: (dateStr: string) => Promise<void>;
  sbRemoveExtraSlot: (dateStr: string) => Promise<void>;
  sbUpdateDog: (
    dogIdOrName: string,
    updates: Partial<Dog> & Record<string, unknown>,
  ) => Promise<Dog | null | undefined>;
  sbUpdateHuman: (
    humanIdOrName: string,
    updates: Partial<Human> & Record<string, unknown>,
  ) => Promise<Human | null | undefined>;
  sbUpdateConfig: (config: SalonConfig) => Promise<void>;
  sbAddHuman: (human: Human) => Promise<unknown>;
  sbAddDog: (dog: Dog) => Promise<unknown>;
}

interface OfflineFns {
  handleAdd: (booking: Booking) => void;
  handleAddToDate: (booking: Booking, dateStr: string) => void;
  handleRemove: (bookingId: string) => void;
  // Same shape as sbUpdateBooking: the offline handler also applies
  // cross-date moves and resolves to the updated booking, so the
  // booking-detail save path behaves identically off WiFi.
  handleUpdate: (
    booking: Booking & { staff_capacity_override?: boolean },
    fromDateStr: string,
    toDateStr: string,
  ) => Promise<Booking>;
  toggleDayOpen: () => void;
  handleOverride: (
    slot: string,
    seatIndex: number,
    action: string,
  ) => Promise<{ ok: true } | { ok: false; error: string }> | { ok: true };
  handleAddSlot: () => void;
  handleRemoveSlot: () => void;
  // (idOrName, updates) like the online hooks; updateDog resolves to the
  // merged dog or null when the identifier matches nothing, so save flows
  // can tell the two apart (useBookingSave checks `== null`).
  updateDog: (
    dogIdOrName: string,
    updates: Partial<Dog> & Record<string, unknown>,
  ) => Dog | null;
  updateHuman: (
    humanIdOrName: string,
    updates: Partial<Human> & Record<string, unknown>,
  ) => void;
  updateConfig: (
    config: SalonConfig | ((prev: SalonConfig) => SalonConfig),
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
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
  // Destructure so the dep arrays below name the actual function
  // references rather than a property access on `sb` — exhaustive-deps
  // can't follow property reads and would otherwise demand the entire
  // `sb` object as a dep.
  const {
    sbAddBooking,
    sbRemoveBooking,
    sbToggleDayOpen,
    sbSetOverride,
    sbAddExtraSlot,
    sbRemoveExtraSlot,
  } = sb;

  const onlineHandleAdd = useCallback(
    (booking: Booking, targetDateStr: string = currentDateStr) =>
      sbAddBooking(targetDateStr, booking),
    [sbAddBooking, currentDateStr],
  );
  const onlineHandleAddToDate = useCallback(
    (booking: Booking, dateStr: string) => sbAddBooking(dateStr, booking),
    [sbAddBooking],
  );
  const onlineHandleRemove = useCallback(
    (bookingId: string) => sbRemoveBooking(currentDateStr, bookingId),
    [sbRemoveBooking, currentDateStr],
  );
  const onlineToggleDayOpen = useCallback(
    () => sbToggleDayOpen(currentDateStr),
    [sbToggleDayOpen, currentDateStr],
  );
  const onlineHandleOverride = useCallback(
    (slot: string, seatIndex: number, action: string) =>
      sbSetOverride(currentDateStr, slot, seatIndex, action),
    [sbSetOverride, currentDateStr],
  );
  const onlineHandleAddSlot = useCallback(
    () => sbAddExtraSlot(currentDateStr),
    [sbAddExtraSlot, currentDateStr],
  );
  const onlineHandleRemoveSlot = useCallback(
    () => sbRemoveExtraSlot(currentDateStr),
    [sbRemoveExtraSlot, currentDateStr],
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
