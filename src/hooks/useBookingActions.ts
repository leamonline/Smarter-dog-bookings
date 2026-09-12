/**
 * useBookingActions — resolves online/offline booking operations for App.jsx.
 * Wraps Supabase callbacks with currentDateStr binding, then picks
 * online or offline versions based on connectivity.
 */
import { useCallback } from "react";
import type { Booking, Dog, Human, SalonConfig, DaySettings, BookingsByDate, SlotOverrides } from "../types/index";
import type { useDogs } from "../supabase/hooks/useDogs";
import type { useHumans } from "../supabase/hooks/useHumans";
import type { WeekDaySettingsMap } from "../supabase/hooks/useDaySettings";
import type { useOfflineState } from "./useOfflineState";

// A seat override action ("open" | "blocked") — the same literal union the
// day-settings hook and the offline fallback accept.
type SeatAction = SlotOverrides[number];

// The update-family signatures below were corrected to the REAL contracts
// (the originals declared 1-arg/void shapes that the implementations never
// had — PR #255's "latent drift" findings 2 and 3):
//   - updateBooking is 3-arg (booking, fromDateStr, toDateStr) and resolves
//     to the saved booking or null (useBookings.ts), and callers
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
    nextIsOpen?: boolean,
  ) => Promise<{ ok: true; value: DaySettings } | { ok: false; error: string }>;
  // seatIndex takes a list as well as a single seat: a whole-slot block has to
  // travel as ONE call, or the two full-row upserts race (see setOverride).
  sbSetOverride: (
    dateStr: string,
    slot: string,
    seatIndex: number | number[],
    action: SeatAction,
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
  // The dog/human updaters are the data hooks' own contracts (DogPatch /
  // HumanPatch in, the merged record or null/undefined out) — derived rather
  // than restated so this file can't drift from them again.
  sbUpdateDog: ReturnType<typeof useDogs>["updateDog"];
  sbUpdateHuman: ReturnType<typeof useHumans>["updateHuman"];
  // updateConfig accepts a value OR an updater function and resolves to an
  // outcome object (useSalonConfig.ts) — the settings panels all call it
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
  // Likewise derived: useDogs' addDog requires a name (NewDogInput).
  sbAddDog: ReturnType<typeof useDogs>["addDog"];
}

// The offline fallback IS the contract: derive it from useOfflineState so the
// two can't drift (the hand-written copy this replaced had, over time,
// declared several 1-arg/void shapes the implementation never had).
type OfflineFns = ReturnType<typeof useOfflineState>;

interface UseBookingActionsParams {
  isOnline: boolean;
  currentDateStr: string;
  supabase: SupabaseFns;
  offline: OfflineFns;
  onlineData: {
    dogs: Record<string, Dog>;
    humans: Record<string, Human>;
    bookingsByDate: BookingsByDate;
    // null until salon_config loads (useSalonConfig) — the shell
    // optional-chains every read (salonConfig?.pricing).
    config: SalonConfig | null;
    // Per-date rows may carry isOpen: null ("use the weekday default");
    // dayOpenState resolves that with getDefaultOpenForDate.
    daySettings: WeekDaySettingsMap;
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
    (nextIsOpen?: boolean) => sbToggleDayOpen(currentDateStr, nextIsOpen),
    [sbToggleDayOpen, currentDateStr],
  );
  const onlineHandleOverride = useCallback(
    (slot: string, seatIndex: number | number[], action: SeatAction) =>
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
