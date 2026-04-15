import { useState, useEffect } from "react";
import { supabase } from "../client.js";
import { ALL_DAYS } from "../../constants/index.js";
import { toDateStr } from "../transforms.js";

function getDefaultOpen(dateObj) {
  const dayOfWeek = dateObj.getDay(); // 0=Sun
  const dayIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  return ALL_DAYS[dayIndex]?.defaultOpen ?? false;
}

function buildMonthDefaults(year, month) {
  const lastDay = new Date(year, month + 1, 0);
  const defaults = {};
  for (let d = 1; d <= lastDay.getDate(); d++) {
    const dateObj = new Date(year, month, d);
    const dateStr = toDateStr(dateObj);
    defaults[dateStr] = {
      isOpen: getDefaultOpen(dateObj),
      overrides: {},
      extraSlots: [],
    };
  }
  return defaults;
}

/**
 * Read-only month-scoped day settings for calendar views.
 * Returns daySettings and a derived dayOpenState map for the full month.
 */
export function useMonthDaySettings(year, month) {
  const [daySettings, setDaySettings] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (year == null || month == null) {
      setDaySettings({});
      setLoading(false);
      return;
    }

    const defaults = buildMonthDefaults(year, month);

    if (!supabase) {
      setDaySettings(defaults);
      setLoading(false);
      return;
    }

    let cancelled = false;

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startStr = toDateStr(firstDay);
    const endStr = toDateStr(lastDay);

    async function fetchSettings() {
      setLoading(true);

      const { data, error } = await supabase
        .from("day_settings")
        .select("*")
        .gte("setting_date", startStr)
        .lte("setting_date", endStr);

      if (cancelled) return;

      if (error) {
        console.error("Failed to fetch month day settings:", error);
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

    const channel = supabase
      .channel(`month-day-settings-${year}-${month}-${Date.now()}`)
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
  }, [year, month]);

  // Derive dayOpenState from daySettings
  const dayOpenState = {};
  for (const [dateStr, settings] of Object.entries(daySettings)) {
    dayOpenState[dateStr] = settings.isOpen;
  }

  return { monthDaySettings: daySettings, monthDayOpenState: dayOpenState, monthDaySettingsLoading: loading };
}
