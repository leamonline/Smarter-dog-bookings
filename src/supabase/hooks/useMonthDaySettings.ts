import { useState, useEffect } from "react";
import { supabase } from "../client";
import { CHANNELS, uniqueChannelName } from "../realtimeChannels";
import { ALL_DAYS } from "../../constants/index";
import { toDateStr } from "../transforms";
import { logger } from "../../lib/logger";
import type { Database } from "../database.types";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import type { SlotOverrides } from "../../types/index";

type DaySettingsRow = Database["public"]["Tables"]["day_settings"]["Row"];

/** One calendar day's settings as the month views read them. */
export interface MonthDaySetting {
  /** null when the row exists but is_open was never set; callers test truthiness. */
  isOpen: boolean | null;
  overrides: Record<string, SlotOverrides>;
  extraSlots: string[];
}

export type MonthDaySettingsMap = Record<string, MonthDaySetting>;

export interface UseMonthDaySettingsResult {
  monthDaySettings: MonthDaySettingsMap;
  monthDayOpenState: Record<string, boolean | null>;
  monthDaySettingsLoading: boolean;
}

/** The generated row types `overrides` and `extra_slots` as Json; narrow them once. */
function fromRow(row: Pick<DaySettingsRow, "is_open" | "overrides" | "extra_slots">): MonthDaySetting {
  return {
    isOpen: row.is_open,
    overrides: (row.overrides as Record<string, SlotOverrides> | null) || {},
    extraSlots: (row.extra_slots as string[] | null) || [],
  };
}

function getDefaultOpen(dateObj: Date): boolean {
  const dayOfWeek = dateObj.getDay(); // 0=Sun
  const dayIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  return ALL_DAYS[dayIndex]?.defaultOpen ?? false;
}

function buildMonthDefaults(year: number, month: number): MonthDaySettingsMap {
  const lastDay = new Date(year, month + 1, 0);
  const defaults: MonthDaySettingsMap = {};
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
export function useMonthDaySettings(
  year: number | null | undefined,
  month: number | null | undefined,
): UseMonthDaySettingsResult {
  const [daySettings, setDaySettings] = useState<MonthDaySettingsMap>({});
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
    // Narrowed once here; the nested async function and cleanup below would
    // otherwise lose the null check.
    const client = supabase;

    const controller = new AbortController();

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startStr = toDateStr(firstDay);
    const endStr = toDateStr(lastDay);

    async function fetchSettings() {
      setLoading(true);

      const { data, error } = await client
        .from("day_settings")
        .select("*")
        .gte("setting_date", startStr)
        .lte("setting_date", endStr)
        .abortSignal(controller.signal);

      if (controller.signal.aborted) return;

      if (error) {
        logger.error("Failed to fetch month day settings", error, {
          tags: { hook: "useMonthDaySettings", op: "fetch" },
        });
        setDaySettings(defaults);
        setLoading(false);
        return;
      }

      const merged: MonthDaySettingsMap = { ...defaults };
      for (const row of data || []) {
        merged[row.setting_date] = fromRow(row);
      }

      setDaySettings(merged);
      setLoading(false);
    }

    fetchSettings();

    const channel = client
      .channel(uniqueChannelName(`${CHANNELS.monthDaySettings}-${year}-${month}`))
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "day_settings" },
        (payload: RealtimePostgresChangesPayload<DaySettingsRow>) => {
          // On DELETE `new` is an empty object, so it has no setting_date and
          // the guard below returns — the row keeps its last value until the
          // next fetch, exactly as before.
          const row = payload.new as Partial<DaySettingsRow>;
          const settingDate = row?.setting_date;
          if (!settingDate || settingDate < startStr || settingDate > endStr) return;
          setDaySettings((prev) => ({
            ...prev,
            [settingDate]: fromRow(row as DaySettingsRow),
          }));
        },
      )
      .subscribe();

    return () => {
      controller.abort();
      client.removeChannel(channel);
    };
  }, [year, month]);

  // Derive dayOpenState from daySettings
  const dayOpenState: Record<string, boolean | null> = {};
  for (const [dateStr, settings] of Object.entries(daySettings)) {
    dayOpenState[dateStr] = settings.isOpen;
  }

  return { monthDaySettings: daySettings, monthDayOpenState: dayOpenState, monthDaySettingsLoading: loading };
}
