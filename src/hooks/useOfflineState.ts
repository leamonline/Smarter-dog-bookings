/**
 * useOfflineState — manages all offline/demo mode state and callbacks.
 * Extracted from App.jsx to reduce its size by ~200 lines.
 */
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  ALL_DAYS,
  SALON_SLOTS,
  createDefaultSalonConfig,
} from "../constants/index";
import {
  SAMPLE_BOOKINGS_BY_DAY,
  SAMPLE_HUMANS,
  SAMPLE_DOGS,
} from "../data/sample.js";
import { toDateStr } from "../supabase/transforms";
import { getDefaultOpenForDate } from "../engine/utils";
import { applyLifecycleStamps } from "../engine/lifecycleStamps";
import type {
  Booking,
  BookingsByDate,
  DaySettings,
  Dog,
  Human,
  SalonConfig,
  SlotOverrides,
} from "../types/index";

export type OfflineDaySettingsMap = Record<string, DaySettings>;
type SeatAction = SlotOverrides[number];
type ConfigUpdater = SalonConfig | ((prev: SalonConfig) => SalonConfig);

/** A dog as the offline directory holds it: the app Dog plus any extra form fields. */
type OfflineDog = Dog & Record<string, unknown>;
type OfflineHuman = Human & Record<string, unknown>;

// The sample fixtures are deliberately loose JS; widen them once here to
// the app shapes the offline state holds.
const SAMPLE_DOG_MAP = SAMPLE_DOGS as unknown as Record<string, OfflineDog>;
const SAMPLE_HUMAN_MAP = SAMPLE_HUMANS as unknown as Record<string, OfflineHuman>;
const SAMPLE_WEEK = SAMPLE_BOOKINGS_BY_DAY as unknown as Record<string, Booking[]>;

function emptyDay(dateObj: Date): DaySettings {
  return {
    isOpen: getDefaultOpenForDate(dateObj),
    overrides: {},
    extraSlots: [],
    immediateSlots: [],
  };
}

// Convert sample bookings to date-based format for a given week
function buildOfflineBookingsByDate(weekStart: Date): BookingsByDate {
  const dayToOffset: Record<string, number> = {
    mon: 0,
    tue: 1,
    wed: 2,
    thu: 3,
    fri: 4,
    sat: 5,
    sun: 6,
  };
  const result: BookingsByDate = {};
  for (const [dayKey, bookings] of Object.entries(SAMPLE_WEEK)) {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + (dayToOffset[dayKey] ?? 0));
    const dateStr = toDateStr(d);
    result[dateStr] = bookings;
  }
  return result;
}

function buildDefaultDaySettings(weekStart: Date): OfflineDaySettingsMap {
  const settings: OfflineDaySettingsMap = {};
  ALL_DAYS.forEach((day, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    settings[toDateStr(d)] = {
      isOpen: day.defaultOpen,
      overrides: {},
      extraSlots: [],
      immediateSlots: [],
    };
  });
  return settings;
}

export function useOfflineState(weekStart: Date, currentDateStr: string, currentDateObj: Date) {
  const [offlineDogs, setOfflineDogs] = useState<Record<string, OfflineDog>>(SAMPLE_DOG_MAP);
  const [offlineHumans, setOfflineHumans] = useState<Record<string, OfflineHuman>>(SAMPLE_HUMAN_MAP);
  const [offlineBookings, setOfflineBookings] = useState<BookingsByDate>(() =>
    buildOfflineBookingsByDate(weekStart),
  );
  const [offlineConfig, setOfflineConfig] = useState<SalonConfig>(() => createDefaultSalonConfig());
  const [offlineDaySettings, setOfflineDaySettings] = useState<OfflineDaySettingsMap>(() =>
    buildDefaultDaySettings(weekStart),
  );

  // When weekStart changes in offline mode, rebuild data for the new week
  useEffect(() => {
    setOfflineBookings(buildOfflineBookingsByDate(weekStart));
    setOfflineDaySettings(buildDefaultDaySettings(weekStart));
  }, [weekStart]);

  const offlineBookingsByDate = useMemo(() => offlineBookings, [offlineBookings]);
  // The status a booking had BEFORE the update being applied. Held in a ref so
  // the lifecycle mirror can read it without being inside the state updater.
  const offlineBookingsRef = useRef(offlineBookings);
  useEffect(() => { offlineBookingsRef.current = offlineBookings; }, [offlineBookings]);

  // --- Dog/Human CRUD ---

  const offlineUpdateDog = useCallback(
    (dogIdentifier: string, updates: Partial<OfflineDog>): OfflineDog | null => {
      // Resolve outside the setState updater so the result can be RETURNED:
      // callers (useBookingSave via useBookingActions) treat a nullish
      // result as "dog not found / save failed", mirroring the online
      // useDogs.updateDog contract. Returning nothing here used to make the
      // not-found case indistinguishable from success.
      const found = Object.entries(offlineDogs).find(
        ([key, dog]) =>
          key === dogIdentifier ||
          dog.id === dogIdentifier ||
          dog.name === dogIdentifier,
      );
      if (!found) return null;
      const [key, dog] = found;
      const merged: OfflineDog = { ...dog, ...updates };
      const nextKey = (updates.name as string | undefined) || dog.name || key;
      setOfflineDogs((prev) => {
        const next = { ...prev };
        delete next[key];
        next[nextKey] = merged;
        return next;
      });
      return merged;
    },
    [offlineDogs],
  );

  const offlineUpdateHuman = useCallback((humanIdentifier: string, updates: Partial<OfflineHuman>): OfflineHuman | null => {
    const found = Object.entries(offlineHumans).find(
      ([key, human]) =>
        key === humanIdentifier ||
        human.id === humanIdentifier ||
        human.fullName === humanIdentifier,
    );
    if (!found) return null;

    const [key, human] = found;
    const nextName = updates.name ?? human.name;
    const nextSurname = updates.surname ?? human.surname;
    const nextKey = `${nextName} ${nextSurname}`.trim();
    const merged: OfflineHuman = { ...human, ...updates, fullName: nextKey };

    setOfflineHumans((prev) => {
      const next = { ...prev };
      delete next[key];
      next[nextKey] = merged;
      return next;
    });
    return merged;
  }, [offlineHumans]);

  const offlineUpdateConfig = useCallback((updater: ConfigUpdater): { ok: true } => {
    setOfflineConfig((prev) =>
      typeof updater === "function" ? updater(prev) : updater,
    );
    // Mirror useSalonConfig's return shape so consumers can await the same
    // outcome contract in online and offline modes.
    return { ok: true };
  }, []);

  const offlineAddHuman = useCallback((humanData: Partial<Human> & { name: string; surname: string }): OfflineHuman => {
    const key = `${humanData.name} ${humanData.surname}`.trim();
    const newHuman = {
      id: `h-${Date.now()}`,
      ...humanData,
      fullName: key,
      fb: "",
      insta: "",
      tiktok: "",
      historyFlag: "",
      trustedIds: [],
      trustedContacts: [],
    } as OfflineHuman;
    setOfflineHumans((prev) => ({ ...prev, [key]: newHuman }));
    return newHuman;
  }, []);

  const offlineAddDog = useCallback(
    (dogData: Partial<Dog> & { name: string; humanId: string }): OfflineDog => {
      const humanEntry = Object.values(offlineHumans).find(
        (human) =>
          human.id === dogData.humanId ||
          `${human.name} ${human.surname}`.trim() === dogData.humanId,
      );
      const newDog = {
        id: `d-${Date.now()}`,
        ...dogData,
        humanId: humanEntry?.fullName || dogData.humanId,
        _humanId: humanEntry?.id || null,
        alerts: [],
        groomNotes: dogData.groomNotes || "",
        customPrice: undefined,
      } as OfflineDog;
      setOfflineDogs((prev) => ({ ...prev, [dogData.name]: newDog }));
      return newDog;
    },
    [offlineHumans],
  );

  // --- Booking CRUD ---

  const offlineHandleAdd = useCallback(
    async (booking: Booking, targetDateStr: string = currentDateStr): Promise<Booking> => {
      setOfflineBookings((prev) => ({
        ...prev,
        [targetDateStr]: [...(prev[targetDateStr] || []), booking],
      }));
      return booking;
    },
    [currentDateStr],
  );

  const offlineHandleAddToDate = useCallback((booking: Booking, dateStr: string) => {
    setOfflineBookings((prev) => ({
      ...prev,
      [dateStr]: [...(prev[dateStr] || []), booking],
    }));
  }, []);

  const offlineHandleRemove = useCallback(
    async (bookingId: string): Promise<boolean> => {
      setOfflineBookings((prev) => ({
        ...prev,
        [currentDateStr]: (prev[currentDateStr] || []).filter(
          (b) => b.id !== bookingId,
        ),
      }));
      return true;
    },
    [currentDateStr],
  );

  const offlineHandleUpdate = useCallback(
    async (updatedBooking: Booking, fromDateStr: string, toDateStrValue: string): Promise<Booking> => {
      // Online, two database triggers stamp checked_in_at / ready_at /
      // completed_at on a status change. Offline there is no database, so
      // without this mirror the sample data can never show how long a dog has
      // been here — the one thing the day stack exists to show, and therefore
      // the one thing a preview or demo could not demonstrate.
      const before = (offlineBookingsRef.current[fromDateStr] || [])
        .find((b) => b.id === updatedBooking.id);
      const stamped = applyLifecycleStamps(updatedBooking, before?.status);

      setOfflineBookings((prev) => {
        const newState = { ...prev };
        if (fromDateStr === toDateStrValue) {
          newState[fromDateStr] = (newState[fromDateStr] || []).map((b) =>
            b.id === stamped.id ? stamped : b,
          );
        } else {
          newState[fromDateStr] = (newState[fromDateStr] || []).filter(
            (b) => b.id !== stamped.id,
          );
          newState[toDateStrValue] = [
            ...(newState[toDateStrValue] || []),
            stamped,
          ];
        }
        return newState;
      });
      return stamped;
    },
    [],
  );

  // --- Day settings ---

  const offlineToggleDayOpen = useCallback((nextIsOpen?: boolean) => {
    setOfflineDaySettings((prev) => ({
      ...prev,
      [currentDateStr]: {
        ...(prev[currentDateStr] || emptyDay(currentDateObj)),
        isOpen:
          typeof nextIsOpen === "boolean"
            ? nextIsOpen
            : !(
                prev[currentDateStr]?.isOpen ??
                getDefaultOpenForDate(currentDateObj)
              ),
      },
    }));
  }, [currentDateStr, currentDateObj]);

  // Mirrors useDaySettings.setOverride, seat list included: the whole-slot
  // block arrives as one call there so it becomes one row write, and offline
  // has to accept the same shape.
  const offlineHandleOverride = useCallback(
    (
      slot: string,
      seatIndex: number | number[],
      action: SeatAction,
    ): { ok: true } => {
      setOfflineDaySettings((prev) => {
        const current = prev[currentDateStr] || emptyDay(currentDateObj);
        const overrides: Record<string, SlotOverrides> = { ...current.overrides };
        const slotOv: SlotOverrides = { ...(overrides[slot] || {}) };
        for (const seat of Array.isArray(seatIndex) ? seatIndex : [seatIndex]) {
          if (slotOv[seat] === action) delete slotOv[seat];
          else slotOv[seat] = action;
        }
        if (Object.keys(slotOv).length === 0) delete overrides[slot];
        else overrides[slot] = slotOv;
        return { ...prev, [currentDateStr]: { ...current, overrides } };
      });
      return { ok: true };
    },
    [currentDateStr, currentDateObj],
  );

  // Offline mirror of useDaySettings.toggleImmediateSlot — powers the E2E
  // suite and the offline preview. Synchronous + infallible like
  // offlineHandleOverride.
  const offlineToggleImmediateSlot = useCallback(
    (slot: string): { ok: true } => {
      setOfflineDaySettings((prev) => {
        const current = prev[currentDateStr] || emptyDay(currentDateObj);
        const existing = current.immediateSlots || [];
        const immediateSlots = existing.includes(slot)
          ? existing.filter((s) => s !== slot)
          : [...existing, slot];
        return { ...prev, [currentDateStr]: { ...current, immediateSlots } };
      });
      return { ok: true };
    },
    [currentDateStr, currentDateObj],
  );

  const offlineHandleAddSlot = useCallback(() => {
    setOfflineDaySettings((prev) => {
      const current = prev[currentDateStr] || emptyDay(currentDateObj);
      const existing = current.extraSlots || [];
      const lastSlot =
        existing.length > 0
          ? existing[existing.length - 1]
          : SALON_SLOTS[SALON_SLOTS.length - 1];
      let [h, m] = lastSlot.split(":").map(Number);
      m += 30;
      if (m >= 60) {
        h += 1;
        m -= 60;
      }
      // Mirror useDaySettings.addExtraSlot: never generate a 24:00+ slot.
      if (h > 23) return prev;
      const newSlot = `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
      return {
        ...prev,
        [currentDateStr]: { ...current, extraSlots: [...existing, newSlot] },
      };
    });
  }, [currentDateStr, currentDateObj]);

  const offlineHandleRemoveSlot = useCallback(() => {
    setOfflineDaySettings((prev) => {
      const current = prev[currentDateStr] || emptyDay(currentDateObj);
      const existing = current.extraSlots || [];
      if (existing.length === 0) return prev;
      return {
        ...prev,
        [currentDateStr]: { ...current, extraSlots: existing.slice(0, -1) },
      };
    });
  }, [currentDateStr, currentDateObj]);

  return {
    dogs: offlineDogs,
    humans: offlineHumans,
    bookingsByDate: offlineBookingsByDate,
    config: offlineConfig,
    daySettings: offlineDaySettings,
    updateDog: offlineUpdateDog,
    updateHuman: offlineUpdateHuman,
    updateConfig: offlineUpdateConfig,
    addHuman: offlineAddHuman,
    addDog: offlineAddDog,
    handleAdd: offlineHandleAdd,
    handleAddToDate: offlineHandleAddToDate,
    handleRemove: offlineHandleRemove,
    handleUpdate: offlineHandleUpdate,
    toggleDayOpen: offlineToggleDayOpen,
    handleOverride: offlineHandleOverride,
    toggleImmediateSlot: offlineToggleImmediateSlot,
    handleAddSlot: offlineHandleAddSlot,
    handleRemoveSlot: offlineHandleRemoveSlot,
  };
}
