/**
 * useStaffAppData — the staff app's data layer, extracted from App.jsx
 * (Debt 11).
 *
 * Composes the five Supabase data hooks (humans, dogs, bookings, salon
 * config, day settings), the pagination-compensating pre-fetch effects, the
 * offline sample-data fallback and `useBookingActions` (which picks the
 * online or offline implementation of every write). Returns both the raw
 * per-hook APIs (for the few call sites that need a hook-specific method
 * such as `humansApi.mergeHumans`) and the resolved data + actions the
 * views and modals consume.
 *
 * Nothing here changes behaviour: it is the same declarations App.jsx used
 * to hold inline, in the same order, so hook identity and effect timing
 * are unchanged.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Booking } from "../types/index";
import { getDefaultOpenForDate } from "../engine/utils";
import { useHumans } from "../supabase/hooks/useHumans";
import { useDogs } from "../supabase/hooks/useDogs";
import { useBookings } from "../supabase/hooks/useBookings";
import { useSalonConfig } from "../supabase/hooks/useSalonConfig";
import { useDaySettings } from "../supabase/hooks/useDaySettings";
import { useOfflineState } from "./useOfflineState";
import { useBookingActions } from "./useBookingActions";
import type { WeekDate } from "./useWeekNav";

export interface UseStaffAppDataOptions {
  isOnline: boolean;
  isOwner: boolean;
  weekStart: Date;
  dates: WeekDate[];
  currentDateStr: string;
  currentDateObj: Date;
  /** Boot-path deferral flag from useDirectoryWarmup. */
  directoriesWarm: boolean;
  /** A booking flipped to ready-for-pickup (realtime) — App opens the
   *  collection-notice modal. */
  onReadyForPickup: (booking: Booking) => void;
}

export interface CommitBookingListResult {
  ok: boolean;
  error: string | null;
}

/** A booking draft that may carry its own target date (multi-date series). */
type DatedBooking = Booking & { _bookingDate?: string };

export function useStaffAppData({
  isOnline,
  isOwner,
  weekStart,
  dates,
  currentDateStr,
  currentDateObj,
  directoriesWarm,
  onReadyForPickup,
}: UseStaffAppDataOptions) {
  // Friendly message from the most recent staff booking insert failure, written
  // by useBookings' onError below and read back (after the awaited insert) so the
  // booking modal can show it instead of a premature "Booking created" toast.
  const bookingInsertErrorRef = useRef<string | null>(null);

  const humansApi = useHumans({ startDirectoryFetch: directoriesWarm });
  const {
    humans: sbHumans,
    humansById,
    loading: hl,
    error: he,
    updateHuman: sbUpdateHuman,
    addHuman: sbAddHuman,
    ensureHumansByIds: sbEnsureHumansByIds,
  } = humansApi;

  const dogsApi = useDogs(humansById, { startDirectoryFetch: directoriesWarm });
  const {
    dogs: sbDogs,
    dogsById,
    ensureDogsByIds: sbEnsureDogsByIds,
    loading: dl,
    error: de,
    updateDog: sbUpdateDog,
    addDog: sbAddDog,
  } = dogsApi;

  const bookingsApi = useBookings(weekStart, dogsById, humansById, {
    onReadyForPickup,
    // Capture the (already-friendly) insert error so the booking modal can
    // surface it after awaiting the save, rather than toasting a false success.
    onError: (msg) => {
      bookingInsertErrorRef.current = msg;
    },
  });
  const {
    bookingsByDate: sbBookings,
    loading: bl,
    error: be,
    addBooking: sbAddBooking,
    addBookingGroup: sbAddBookingGroup,
    removeBooking: sbRemoveBooking,
    updateBooking: sbUpdateBooking,
  } = bookingsApi;

  const configApi = useSalonConfig({ canSeed: isOwner });
  const { config: sbConfig, loading: cl, updateConfig: sbUpdateConfig } = configApi;

  const daySettingsApi = useDaySettings(weekStart);
  const {
    daySettings: sbDaySettings,
    loading: dsl,
    toggleDayOpen: sbToggleDayOpen,
    setOverride: sbSetOverride,
    toggleImmediateSlot: sbToggleImmediateSlot,
    addExtraSlot: sbAddExtraSlot,
    removeExtraSlot: sbRemoveExtraSlot,
    addClosure: sbAddClosure,
    removeClosure: sbRemoveClosure,
    updateClosureReason: sbUpdateClosureReason,
  } = daySettingsApi;

  // ── Owner pre-fetch ────────────────────────────────────────────
  // useHumans paginates so the local map only holds the first page.
  // Without pre-fetching, every dog or booking whose owner sits past
  // the page boundary renders as "Unknown owner" because dog.humanId
  // falls back to the raw UUID and formatOwnerLabel refuses to render
  // that. ensureHumansByIds dedupes + caches so re-renders are cheap.
  useEffect(() => {
    if (!sbEnsureHumansByIds) return;
    const ids = new Set<string>();
    for (const d of Object.values(sbDogs || {})) {
      if (d?._humanId) ids.add(d._humanId);
    }
    if (ids.size > 0) sbEnsureHumansByIds([...ids]);
  }, [sbDogs, sbEnsureHumansByIds]);

  useEffect(() => {
    if (!sbEnsureHumansByIds) return;
    const ids = new Set<string>();
    for (const list of Object.values(sbBookings || {})) {
      for (const b of list || []) {
        if (b?._ownerId) ids.add(b._ownerId);
        if (b?._pickupById) ids.add(b._pickupById);
      }
    }
    if (ids.size > 0) sbEnsureHumansByIds([...ids]);
  }, [sbBookings, sbEnsureHumansByIds]);

  // Same pattern as the owner pre-fetch above, but for dogs. useDogs
  // paginates by name so any booking whose dog row sits past the first
  // page would render as "Unknown" on the day view (and lose its size,
  // breed and alerts in the detail modal). Resolving the missing rows
  // by id here closes that gap.
  useEffect(() => {
    if (!sbEnsureDogsByIds) return;
    const ids = new Set<string>();
    for (const list of Object.values(sbBookings || {})) {
      for (const b of list || []) {
        if (b?._dogId) ids.add(b._dogId);
      }
    }
    if (ids.size > 0) sbEnsureDogsByIds([...ids]);
  }, [sbBookings, sbEnsureDogsByIds]);

  const offline = useOfflineState(weekStart, currentDateStr, currentDateObj);

  const actions = useBookingActions({
    isOnline,
    currentDateStr,
    supabase: {
      sbAddBooking,
      sbAddBookingGroup,
      sbRemoveBooking,
      sbUpdateBooking,
      sbToggleDayOpen,
      sbSetOverride,
      sbToggleImmediateSlot,
      sbAddExtraSlot,
      sbRemoveExtraSlot,
      sbAddClosure,
      sbRemoveClosure,
      sbUpdateClosureReason,
      sbUpdateDog,
      sbUpdateHuman,
      sbUpdateConfig,
      sbAddHuman,
      sbAddDog,
    },
    offline,
    onlineData: {
      dogs: sbDogs,
      humans: sbHumans,
      bookingsByDate: sbBookings,
      config: sbConfig,
      daySettings: sbDaySettings,
    },
  });
  const { daySettings, handleAddToDate, handleAddGroupToDate } = actions;

  // Truthful save shared by the New Booking modal and the New Client wizard:
  // await the real insert(s) and resolve { ok, error } so the modal only
  // toasts success once the DB accepts. The list is grouped by target date;
  // a date's dogs save ATOMICALLY via create_staff_booking_group (AUDIT-3 —
  // a mid-group rejection no longer leaves a partial booking), while dates
  // stay independent of each other so a recurring series keeps its existing
  // skip-the-full-week semantics. Single-dog dates keep the plain insert.
  const commitBookingList = useCallback(
    async (
      bookingOrArray: DatedBooking | DatedBooking[],
      dateStr: string,
    ): Promise<CommitBookingListResult> => {
      bookingInsertErrorRef.current = null;
      const list = Array.isArray(bookingOrArray) ? bookingOrArray : [bookingOrArray];
      const byDate = new Map<string, DatedBooking[]>();
      for (const b of list) {
        const key = b._bookingDate || dateStr;
        if (!byDate.has(key)) byDate.set(key, []);
        byDate.get(key)?.push(b);
      }
      const results = await Promise.all(
        [...byDate.entries()].map(([dateKey, group]) =>
          group.length === 1
            ? handleAddToDate(group[0], dateKey)
            : handleAddGroupToDate(group, dateKey),
        ),
      );
      const ok = results.every((r) => r !== null && r !== false);
      return {
        ok,
        error: ok
          ? null
          : bookingInsertErrorRef.current ||
            "Couldn't save the booking — please try again.",
      };
    },
    [handleAddToDate, handleAddGroupToDate],
  );

  const isLoading = isOnline && (hl || dl || cl || dsl);
  const bookingsLoading = bl;
  const dataError = he || de || be;
  const [errorDismissed, setErrorDismissed] = useState(false);
  useEffect(() => {
    setErrorDismissed(false);
  }, [dataError]);

  const currentSettings = daySettings[currentDateStr] || {
    isOpen: getDefaultOpenForDate(currentDateObj),
    overrides: {},
    extraSlots: [],
    closures: [],
  };
  const dayOpenState = useMemo(() => {
    const state: Record<string, boolean> = {};
    for (const d of dates) {
      state[d.dateStr] =
        daySettings[d.dateStr]?.isOpen ?? getDefaultOpenForDate(d.dateObj);
    }
    return state;
  }, [dates, daySettings]);

  return {
    // Raw per-hook APIs, for hook-specific methods the shell still needs.
    humansApi,
    dogsApi,
    bookingsApi,
    configApi,
    daySettingsApi,
    // Online/offline-resolved data + write actions.
    ...actions,
    commitBookingList,
    // Loading / error roll-ups.
    isLoading,
    bookingsLoading,
    dataError,
    errorDismissed,
    dismissError: () => setErrorDismissed(true),
    loadErrors: { humans: he, dogs: de, bookings: be },
    // Derived day state.
    currentSettings,
    dayOpenState,
  };
}

export type StaffAppData = ReturnType<typeof useStaffAppData>;
