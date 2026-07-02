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
  // Atomic same-date multi-dog save (AUDIT-3): resolves to the saved
  // bookings array, or null when the DB rejected the group (all rows
  // rolled back together).
  sbAddBookingGroup: (
    dateStr: string,
    bookings: Booking[],
  ) => Promise<unknown>;
  sbRemoveBooking: (dateStr: string, bookingId: string) => Promise<unknown>;
  sbUpdateBooking: (
    booking: Booking & { staff_capacity_override?: boolean },
    fromDateStr: string,
    toDateStr: string,
  ) => Promise<Booking | null>;
  // The day-settings family all resolve to upsertSetting's outcome
  // (useDaySettings.js): { ok: true, value } carrying the merged setting,
  // or { ok: false, error } after the optimistic change is rolled back.
  // The original Promise<void> shapes hid a result a real caller depends
  // on — SlotGrid awaits handleOverride and branches on
  // `result?.ok === false` to dismiss its optimistic toast.
  sbToggleDayOpen: (
    dateStr: string,
  ) => Promise<{ ok: true; value: DaySettings } | { ok: false; error: string }>;
  sbSetOverride: (
    dateStr: string,
    slot: string,
    seatIndex: number,
    action: string,
  ) => Promise<{ ok: true; value: DaySettings } | { ok: false; error: string }>;
  // Whole-slot "open for immediate booking" toggle (useDaySettings) — same
  // upsertSetting outcome union as the rest of the day-settings family.
  sbToggleImmediateSlot: (
    dateStr: string,
    slot: string,
  ) => Promise<{ ok: true; value: DaySettings } | { ok: false; error: string }>;
  sbAddExtraSlot: (
    dateStr: string,
  ) => Promise<{ ok: true; value: DaySettings } | { ok: false; error: string }>;
  sbRemoveExtraSlot: (
    dateStr: string,
  ) => Promise<{ ok: true; value: DaySettings } | { ok: false; error: string }>;
  sbUpdateDog: (
    dogIdOrName: string,
    updates: Partial<Dog> & Record<string, unknown>,
  ) => Promise<Dog | null | undefined>;
  sbUpdateHuman: (
    humanIdOrName: string,
    updates: Partial<Human> & Record<string, unknown>,
  ) => Promise<Human | null | undefined>;
  // updateConfig accepts a value OR an updater function and resolves to an
  // outcome object (useSalonConfig.js) — the settings panels all call it
  // with `(prev) => ...` and branch on `result?.ok === false`, neither of
  // which the original (config) => Promise<void> shape allowed.
  sbUpdateConfig: (
    config: SalonConfig | ((prev: SalonConfig) => SalonConfig),
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  // The add pair take partial form payloads from the Add modals (which can
  // carry non-model fields like AddDogModal's `gender`), not fully-built
  // records — the implementations (useHumanMutations.ts / useDogs.ts) fill
  // in the rest.
  sbAddHuman: (
    humanData: Partial<Human> & Record<string, unknown>,
  ) => Promise<unknown>;
  sbAddDog: (
    dogData: Partial<Dog> & Record<string, unknown>,
  ) => Promise<unknown>;
}

interface OfflineFns {
  // Two args like the online wrapper (callers may pass a target date and
  // await the returned booking); the original 1-arg/void shape was a liar
  // in the same way as the pre-#259 handleUpdate.
  handleAdd: (booking: Booking, targetDateStr?: string) => Promise<Booking>;
  handleAddToDate: (booking: Booking, dateStr: string) => void;
  // Resolves true after the optimistic removal (useOfflineState.js); the
  // original declared void.
  handleRemove: (bookingId: string) => Promise<boolean>;
  // Same shape as sbUpdateBooking: the offline handler also applies
  // cross-date moves and resolves to the updated booking, so the
  // booking-detail save path behaves identically off WiFi.
  handleUpdate: (
    booking: Booking & { staff_capacity_override?: boolean },
    fromDateStr: string,
    toDateStr: string,
  ) => Promise<Booking>;
  toggleDayOpen: () => void;
  // Synchronous and infallible: applies the override locally and returns
  // { ok: true } — never a Promise and never ok: false (the Promise half
  // of the old declared union belonged to the ONLINE setOverride, which is
  // now typed truthfully above).
  handleOverride: (slot: string, seatIndex: number, action: string) => { ok: true };
  // Offline mirror of the immediate-slot toggle — synchronous + infallible
  // like handleOverride.
  toggleImmediateSlot: (slot: string) => { ok: true };
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
  // Also synchronous + infallible — it mirrors useSalonConfig's outcome
  // SHAPE so callers can `await` either mode, but it never returns a
  // Promise and never fails, so the declared Promise<ok-union> was a liar.
  updateConfig: (
    config: SalonConfig | ((prev: SalonConfig) => SalonConfig),
  ) => { ok: true };
  // Like the online pair these take Add-modal form payloads, and both
  // return the stored record — the Add modals branch on the result and
  // read `.id` from it, which the original (full model) => void shapes
  // got wrong on both ends.
  addHuman: (humanData: Partial<Human> & Record<string, unknown>) => Human;
  addDog: (dogData: Partial<Dog> & Record<string, unknown>) => Dog;
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
    sbAddBookingGroup,
    sbRemoveBooking,
    sbToggleDayOpen,
    sbSetOverride,
    sbToggleImmediateSlot,
    sbAddExtraSlot,
    sbRemoveExtraSlot,
  } = sb;
  const { handleAddToDate: offlineHandleAddToDate } = offline;

  const onlineHandleAdd = useCallback(
    (booking: Booking, targetDateStr: string = currentDateStr) =>
      sbAddBooking(targetDateStr, booking),
    [sbAddBooking, currentDateStr],
  );
  const onlineHandleAddToDate = useCallback(
    (booking: Booking, dateStr: string) => sbAddBooking(dateStr, booking),
    [sbAddBooking],
  );
  const onlineHandleAddGroupToDate = useCallback(
    (bookings: Booking[], dateStr: string) => sbAddBookingGroup(dateStr, bookings),
    [sbAddBookingGroup],
  );
  // Offline has no transaction to speak of — the optimistic adds are local
  // and infallible, so "atomic" degrades gracefully to a per-dog loop.
  const offlineHandleAddGroupToDate = useCallback(
    async (bookings: Booking[], dateStr: string) => {
      for (const b of bookings) offlineHandleAddToDate(b, dateStr);
      return bookings;
    },
    [offlineHandleAddToDate],
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
  const onlineToggleImmediateSlot = useCallback(
    (slot: string) => sbToggleImmediateSlot(currentDateStr, slot),
    [sbToggleImmediateSlot, currentDateStr],
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
    handleAddGroupToDate: isOnline
      ? onlineHandleAddGroupToDate
      : offlineHandleAddGroupToDate,
    handleRemove: isOnline ? onlineHandleRemove : offline.handleRemove,
    handleUpdate: isOnline ? sb.sbUpdateBooking : offline.handleUpdate,
    toggleDayOpen: isOnline ? onlineToggleDayOpen : offline.toggleDayOpen,
    handleOverride: isOnline ? onlineHandleOverride : offline.handleOverride,
    toggleImmediateSlot: isOnline
      ? onlineToggleImmediateSlot
      : offline.toggleImmediateSlot,
    handleAddSlot: isOnline ? onlineHandleAddSlot : offline.handleAddSlot,
    handleRemoveSlot: isOnline ? onlineHandleRemoveSlot : offline.handleRemoveSlot,
    updateDog: isOnline ? sb.sbUpdateDog : offline.updateDog,
    updateHuman: isOnline ? sb.sbUpdateHuman : offline.updateHuman,
    updateConfig: isOnline ? sb.sbUpdateConfig : offline.updateConfig,
    addHuman: isOnline ? sb.sbAddHuman : offline.addHuman,
    addDog: isOnline ? sb.sbAddDog : offline.addDog,
  };
}
