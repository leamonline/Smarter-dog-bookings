import { useState, useEffect, useCallback } from "react";
import { supabase } from "../client.js";
import { ALL_DAYS } from "../../constants/index.js";
import { toDateStr } from "../transforms.js";

function getDefaultOpen(dateObj) {
  const dayOfWeek = dateObj.getDay(); // 0=Sun
  const dayIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  return ALL_DAYS[dayIndex]?.defaultOpen ?? false;
}

function buildWeekDefaults(weekStart) {
  const defaults = {};
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    const dateStr = toDateStr(d);
    defaults[dateStr] = {
      isOpen: getDefaultOpen(d),
      overrides: {},
      extraSlots: [],
    };
  }
  return defaults;
}

function mergeSetting(current = {}, updates = {}) {
  return {
    isOpen: updates.isOpen ?? current.isOpen ?? false,
    overrides: updates.overrides ?? current.overrides ?? {},
    extraSlots: updates.extraSlots ?? current.extraSlots ?? [],
  };
}

export function useDaySettings(weekStart) {
  // daySettings: { "2026-03-25": { isOpen, overrides, extraSlots }, ... }
  const [daySettings, setDaySettings] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!weekStart) {
      setDaySettings({});
      setLoading(false);
      return;
    }

    const defaults = buildWeekDefaults(weekStart);

    if (!supabase) {
      setDaySettings(defaults);
      setLoading(false);
      return;
    }

    let cancelled = false;

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const startStr = toDateStr(weekStart);
    const endStr = toDateStr(weekEnd);

    async function fetchSettings() {
      setLoading(true);

      const { data, error } = await supabase
        .from("day_settings")
        .select("*")
        .gte("setting_date", startStr)
        .lte("setting_date", endStr);

      if (cancelled) return;

      if (error) {
        console.error("Failed to fetch day settings:", error);
        setDaySettings(defaults);
        setLoading(false);
        return;
      }

      const merged = { ...defaults };
      for (const row of data || []) {
        merged[row.setting_date] = {
          isOpen: row.is_open,
          overrides: row.overrides || {},
          extraSlots: row.extra_slots || [],
        };
      }

      setDaySettings(merged);
      setLoading(false);
    }

    fetchSettings();

    // Real-time subscription for day_settings within the current week
    const channel = supabase
      .channel(`day-settings-rt-${Date.now()}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "day_settings" },
        (payload) => {
          const row = payload.new;
          if (!row || row.setting_date < startStr || row.setting_date > endStr) return;
          setDaySettings((prev) => ({
            ...prev,
            [row.setting_date]: {
              isOpen: row.is_open,
              overrides: row.overrides || {},
              extraSlots: row.extra_slots || [],
            },
          }));
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [weekStart]);

  const upsertSetting = useCallback(async (dateStr, updater) => {
    let nextSetting;

    setDaySettings((prev) => {
      const current = prev[dateStr] || {
        isOpen: false,
        overrides: {},
        extraSlots: [],
      };
      const updates =
        typeof updater === "function" ? updater(current) : updater;
      nextSetting = mergeSetting(current, updates);
      return {
        ...prev,
        [dateStr]: nextSetting,
      };
    });

    if (!supabase) return nextSetting;

    const { error } = await supabase.from("day_settings").upsert(
      {
        setting_date: dateStr,
        is_open: nextSetting.isOpen,
        overrides: nextSetting.overrides,
        extra_slots: nextSetting.extraSlots,
      },
      { onConflict: "setting_date" },
    );

    if (error) {
      console.error("Failed to upsert day setting:", error);
    }

    return nextSetting;
  }, []);

  const toggleDayOpen = useCallback(
    (dateStr) =>
      upsertSetting(dateStr, (current) => ({ isOpen: !current.isOpen })),
    [upsertSetting],
  );

  const setOverride = useCallback(
    (dateStr, slot, seatIndex, action) =>
      upsertSetting(dateStr, (current) => {
        const overrides = { ...(current.overrides || {}) };
        const slotOv = { ...(overrides[slot] || {}) };

        if (slotOv[seatIndex] === action) delete slotOv[seatIndex];
        else slotOv[seatIndex] = action;

        if (Object.keys(slotOv).length === 0) delete overrides[slot];
        else overrides[slot] = slotOv;

        return { overrides };
      }),
    [upsertSetting],
  );

  const addExtraSlot = useCallback(
    (dateStr) =>
      upsertSetting(dateStr, (current) => {
        const existing = current.extraSlots || [];
        const lastSlot =
          existing.length > 0 ? existing[existing.length - 1] : "13:00";
        let [h, m] = lastSlot.split(":").map(Number);
        m += 30;
        if (m >= 60) {
          h += 1;
          m -= 60;
        }
        const newSlot = `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
        return { extraSlots: [...existing, newSlot] };
      }),
    [upsertSetting],
  );

  const removeExtraSlot = useCallback(
    (dateStr) =>
      upsertSetting(dateStr, (current) => {
        const existing = current.extraSlots || [];
        if (existing.length === 0) return {};
        return { extraSlots: existing.slice(0, -1) };
      }),
    [upsertSetting],
  );

  return {
    daySettings,
    loading,
    toggleDayOpen,
    setOverride,
    addExtraSlot,
    removeExtraSlot,
  };
}
