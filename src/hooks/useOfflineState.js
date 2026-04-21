/**
 * useOfflineState — manages all offline/demo mode state and callbacks.
 * Extracted from App.jsx to reduce its size by ~200 lines.
 */
import { useState, useEffect, useCallback, useMemo } from "react";
import {
  ALL_DAYS,
  SALON_SLOTS,
  PRICING,
  LARGE_DOG_SLOTS,
} from "../constants/index.js";
import {
  SAMPLE_BOOKINGS_BY_DAY,
  SAMPLE_HUMANS,
  SAMPLE_DOGS,
} from "../data/sample.js";
import { toDateStr } from "../supabase/transforms.js";
import { getDefaultOpenForDate } from "../engine/utils.js";

// Convert sample bookings to date-based format for a given week
function buildOfflineBookingsByDate(weekStart) {
  const dayToOffset = {
    mon: 0,
    tue: 1,
    wed: 2,
    thu: 3,
    fri: 4,
    sat: 5,
    sun: 6,
  };
  const result = {};
  for (const [dayKey, bookings] of Object.entries(SAMPLE_BOOKINGS_BY_DAY)) {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + dayToOffset[dayKey]);
    const dateStr = toDateStr(d);
    result[dateStr] = bookings;
  }
  return result;
}

function buildDefaultDaySettings(weekStart) {
  const settings = {};
  ALL_DAYS.forEach((day, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    settings[toDateStr(d)] = {
      isOpen: day.defaultOpen,
      overrides: {},
      extraSlots: [],
    };
  });
  return settings;
}

export function useOfflineState(weekStart, currentDateStr, currentDateObj) {
  const [offlineDogs, setOfflineDogs] = useState(SAMPLE_DOGS);
  const [offlineHumans, setOfflineHumans] = useState(SAMPLE_HUMANS);
  const [offlineBookings, setOfflineBookings] = useState(() =>
    buildOfflineBookingsByDate(weekStart),
  );
  const [offlineConfig, setOfflineConfig] = useState({
    defaultPickupOffset: 120,
    pricing: { ...PRICING },
    enforceCapacity: true,
    largeDogSlots: { ...LARGE_DOG_SLOTS },
  });
  const [offlineDaySettings, setOfflineDaySettings] = useState(() =>
    buildDefaultDaySettings(weekStart),
  );

  // When weekStart changes in offline mode, rebuild data for the new week
  useEffect(() => {
    setOfflineBookings(buildOfflineBookingsByDate(weekStart));
    setOfflineDaySettings(buildDefaultDaySettings(weekStart));
  }, [weekStart]);

  const offlineBookingsByDate = useMemo(() => offlineBookings, [offlineBookings]);

  // --- Dog/Human CRUD ---

  const offlineUpdateDog = useCallback((dogIdentifier, updates) => {
    setOfflineDogs((prev) => {
      const entries = Object.entries(prev);
      const found = entries.find(
        ([key, dog]) =>
          key === dogIdentifier ||
          dog.id === dogIdentifier ||
          dog.name === dogIdentifier,
      );
      if (!found) return prev;
      const [key, dog] = found;
      const nextKey = updates.name || dog.name || key;
      const next = { ...prev };
      delete next[key];
      next[nextKey] = { ...dog, ...updates };
      return next;
    });
  }, []);

  const offlineUpdateHuman = useCallback((humanIdentifier, updates) => {
    setOfflineHumans((prev) => {
      const entries = Object.entries(prev);
      const found = entries.find(
        ([key, human]) =>
          key === humanIdentifier ||
          human.id === humanIdentifier ||
          human.fullName === humanIdentifier,
      );
      if (!found) return prev;
      const [key, human] = found;
      const nextName = updates.name ?? human.name;
      const nextSurname = updates.surname ?? human.surname;
      const nextKey = `${nextName} ${nextSurname}`.trim();
      const next = { ...prev };
      delete next[key];
      next[nextKey] = { ...human, ...updates, fullName: nextKey };
      return next;
    });
  }, []);

  const offlineUpdateConfig = useCallback((updater) => {
    setOfflineConfig((prev) =>
      typeof updater === "function" ? updater(prev) : updater,
    );
  }, []);

  const offlineAddHuman = useCallback((humanData) => {
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
    };
    setOfflineHumans((prev) => ({ ...prev, [key]: newHuman }));
    return newHuman;
  }, []);

  const offlineAddDog = useCallback(
    (dogData) => {
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
      };
      setOfflineDogs((prev) => ({ ...prev, [dogData.name]: newDog }));
      return newDog;
    },
    [offlineHumans],
  );

  // --- Booking CRUD ---

  const offlineHandleAdd = useCallback(
    async (booking, targetDateStr = currentDateStr) => {
      setOfflineBookings((prev) => ({
        ...prev,
        [targetDateStr]: [...(prev[targetDateStr] || []), booking],
      }));
      return booking;
    },
    [currentDateStr],
  );

  const offlineHandleAddToDate = useCallback((booking, dateStr) => {
    setOfflineBookings((prev) => ({
      ...prev,
      [dateStr]: [...(prev[dateStr] || []), booking],
    }));
  }, []);

  const offlineHandleRemove = useCallback(
    async (bookingId) => {
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
    async (updatedBooking, fromDateStr, toDateStrValue) => {
      setOfflineBookings((prev) => {
        const newState = { ...prev };
        if (fromDateStr === toDateStrValue) {
          newState[fromDateStr] = (newState[fromDateStr] || []).map((b) =>
            b.id === updatedBooking.id ? updatedBooking : b,
          );
        } else {
          newState[fromDateStr] = (newState[fromDateStr] || []).filter(
            (b) => b.id !== updatedBooking.id,
          );
          newState[toDateStrValue] = [
            ...(newState[toDateStrValue] || []),
            updatedBooking,
          ];
        }
        return newState;
      });
      return updatedBooking;
    },
    [],
  );

  // --- Day settings ---

  const offlineToggleDayOpen = useCallback(() => {
    setOfflineDaySettings((prev) => ({
      ...prev,
      [currentDateStr]: {
        ...(prev[currentDateStr] || {
          isOpen: getDefaultOpenForDate(currentDateObj),
          overrides: {},
          extraSlots: [],
        }),
        isOpen: !(
          prev[currentDateStr]?.isOpen ?? getDefaultOpenForDate(currentDateObj)
        ),
      },
    }));
  }, [currentDateStr, currentDateObj]);

  const offlineHandleOverride = useCallback(
    (slot, seatIndex, action) => {
      setOfflineDaySettings((prev) => {
        const current = prev[currentDateStr] || {
          isOpen: getDefaultOpenForDate(currentDateObj),
          overrides: {},
          extraSlots: [],
        };
        const overrides = { ...current.overrides };
        const slotOv = { ...(overrides[slot] || {}) };
        if (slotOv[seatIndex] === action) delete slotOv[seatIndex];
        else slotOv[seatIndex] = action;
        if (Object.keys(slotOv).length === 0) delete overrides[slot];
        else overrides[slot] = slotOv;
        return { ...prev, [currentDateStr]: { ...current, overrides } };
      });
    },
    [currentDateStr, currentDateObj],
  );

  const offlineHandleAddSlot = useCallback(() => {
    setOfflineDaySettings((prev) => {
      const current = prev[currentDateStr] || {
        isOpen: getDefaultOpenForDate(currentDateObj),
        overrides: {},
        extraSlots: [],
      };
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
      const newSlot = `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
      return {
        ...prev,
        [currentDateStr]: { ...current, extraSlots: [...existing, newSlot] },
      };
    });
  }, [currentDateStr, currentDateObj]);

  const offlineHandleRemoveSlot = useCallback(() => {
    setOfflineDaySettings((prev) => {
      const current = prev[currentDateStr] || {
        isOpen: getDefaultOpenForDate(currentDateObj),
        overrides: {},
        extraSlots: [],
      };
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
    handleAddSlot: offlineHandleAddSlot,
    handleRemoveSlot: offlineHandleRemoveSlot,
  };
}
