import { useState, useEffect, useCallback } from "react";
import { supabase } from "../client.ts";
import { ALL_DAYS } from "../../constants/index.ts";
import { toDateStr } from "../transforms.ts";
import { useToast } from "../../hooks/useToast.tsx";
import type { DaySettings } from "../../types.ts";

function getDefaultOpen(dateObj: Date): boolean {
  const dayOfWeek = dateObj.getDay(); // 0=Sun
  const dayIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  return ALL_DAYS[dayIndex]?.defaultOpen ?? false;
}

export function useDaySettings(weekStart: Date | null) {
  const [daySettings, setDaySettings] = useState<Record<string, DaySettings>>({});
  const [loading, setLoading] = useState<boolean>(true);
  const showToast = useToast();

  useEffect(() => {
    if (!weekStart) { setLoading(false); return; }

    const defaults: Record<string, DaySettings> = {};
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

    if (!supabase) {
      setDaySettings(defaults);
      setLoading(false);
      return;
    }

    async function fetch() {
      const weekEnd = new Date(weekStart!);
      weekEnd.setDate(weekEnd.getDate() + 6);

      const { data } = await supabase!
        .from("day_settings")
        .select("*")
        .gte("setting_date", toDateStr(weekStart!))
        .lte("setting_date", toDateStr(weekEnd));

      const merged: Record<string, DaySettings> = { ...defaults };
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
    fetch();
  }, [weekStart]);

  const upsertSetting = useCallback(
    async (dateStr: string, updates: Partial<DaySettings>) => {
      const prev = daySettings;
      setDaySettings((p) => ({
        ...p,
        [dateStr]: { ...p[dateStr], ...updates },
      }));

      if (!supabase) return;

      const current = daySettings[dateStr] || {};
      const merged = { ...current, ...updates };
      const { error: err } = await supabase.from("day_settings").upsert({
        setting_date: dateStr,
        is_open: merged.isOpen,
        overrides: merged.overrides,
        extra_slots: merged.extraSlots,
      }, { onConflict: "setting_date" });

      if (err) {
        console.error("Failed to update day settings:", err);
        showToast?.("Failed to save day settings", "error");
        setDaySettings(prev);
      }
    },
    [daySettings, showToast]
  );

  const toggleDayOpen = useCallback(
    (dateStr: string) => {
      const current = daySettings[dateStr];
      if (!current) return;
      upsertSetting(dateStr, { isOpen: !current.isOpen });
    },
    [daySettings, upsertSetting]
  );

  const setOverride = useCallback(
    (dateStr: string, slot: string, seatIndex: string, action: string) => {
      const current = daySettings[dateStr];
      if (!current) return;
      const overrides = { ...current.overrides };
      const slotOv = { ...(overrides[slot] || {}) };
      if (slotOv[seatIndex] === action) delete slotOv[seatIndex];
      else slotOv[seatIndex] = action;
      overrides[slot] = slotOv;
      upsertSetting(dateStr, { overrides });
    },
    [daySettings, upsertSetting]
  );

  const addExtraSlot = useCallback(
    (dateStr: string) => {
      const current = daySettings[dateStr];
      if (!current) return;
      const existing = current.extraSlots || [];
      const lastSlot = existing.length > 0 ? existing[existing.length - 1] : "13:00";
      let [h, m] = lastSlot.split(":").map(Number);
      m += 30;
      if (m >= 60) { h += 1; m -= 60; }
      const newSlot = `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
      upsertSetting(dateStr, { extraSlots: [...existing, newSlot] });
    },
    [daySettings, upsertSetting]
  );

  const removeExtraSlot = useCallback(
    (dateStr: string) => {
      const current = daySettings[dateStr];
      if (!current) return;
      const existing = current.extraSlots || [];
      if (existing.length === 0) return;
      upsertSetting(dateStr, { extraSlots: existing.slice(0, -1) });
    },
    [daySettings, upsertSetting]
  );

  return { daySettings, loading, toggleDayOpen, setOverride, addExtraSlot, removeExtraSlot };
}
