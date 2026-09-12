import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../client";
import { CHANNELS, uniqueChannelName } from "../realtimeChannels";
import { takeBootPrefetch } from "../bootPrefetch.js";
import { fetchDaySettingsWeek } from "../queries/bootQueries.js";
import { ALL_DAYS } from "../../constants/index";
import { toDateStr } from "../transforms";
import { logger } from "../../lib/logger";
import { closeDayWithRearrangementTasks } from "../rpc";
import type { Database } from "../database.types";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import type { DaySettings, SlotOverrides } from "../../types/index";

type DaySettingsRow = Database["public"]["Tables"]["day_settings"]["Row"];

/**
 * A day as held in this hook's week map. `isOpen` is nullable because the
 * column is; every write path normalises it to a boolean via mergeSetting.
 */
export type WeekDaySetting = Omit<DaySettings, "isOpen"> & { isOpen: boolean | null };
export type WeekDaySettingsMap = Record<string, WeekDaySetting>;

/** upsertSetting's outcome: the merged setting, or the error after rollback. */
export type DaySettingResult =
  | { ok: true; value: DaySettings }
  | { ok: false; error: string };

type DaySettingUpdater =
  | Partial<DaySettings>
  | ((current: WeekDaySetting) => Partial<DaySettings>);

/** The generated row types `overrides` / `extra_slots` as Json; narrow them once. */
function fromRow(
  row: Pick<DaySettingsRow, "is_open" | "overrides" | "extra_slots" | "immediate_slots">,
): WeekDaySetting {
  return {
    isOpen: row.is_open,
    overrides: (row.overrides as Record<string, SlotOverrides> | null) || {},
    extraSlots: (row.extra_slots as string[] | null) || [],
    immediateSlots: row.immediate_slots || [],
  };
}

function getDefaultOpen(dateObj: Date): boolean {
  const dayOfWeek = dateObj.getDay(); // 0=Sun
  const dayIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  return ALL_DAYS[dayIndex]?.defaultOpen ?? false;
}

function buildWeekDefaults(weekStart: Date): WeekDaySettingsMap {
  const defaults: WeekDaySettingsMap = {};
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    const dateStr = toDateStr(d);
    defaults[dateStr] = {
      isOpen: getDefaultOpen(d),
      overrides: {},
      extraSlots: [],
      immediateSlots: [],
    };
  }
  return defaults;
}

function mergeSetting(
  current: Partial<WeekDaySetting> = {},
  updates: Partial<DaySettings> = {},
): DaySettings {
  return {
    isOpen: updates.isOpen ?? current.isOpen ?? false,
    overrides: updates.overrides ?? current.overrides ?? {},
    extraSlots: updates.extraSlots ?? current.extraSlots ?? [],
    immediateSlots: updates.immediateSlots ?? current.immediateSlots ?? [],
  };
}

export function useDaySettings(weekStart: Date | null | undefined) {
  // daySettings: { "2026-03-25": { isOpen, overrides, extraSlots }, ... }
  const [daySettings, setDaySettings] = useState<WeekDaySettingsMap>({});
  // Mutations need the latest setting synchronously. Reading a value assigned
  // inside React's functional state updater is racy because React may defer
  // that updater until after the async persistence path has already started.
  const daySettingsRef = useRef<WeekDaySettingsMap>({});
  const [loading, setLoading] = useState(true);

  const commitDaySettings = useCallback(
    (updater: WeekDaySettingsMap | ((prev: WeekDaySettingsMap) => WeekDaySettingsMap)) => {
    const next =
      typeof updater === "function"
        ? updater(daySettingsRef.current)
        : updater;
    daySettingsRef.current = next;
    setDaySettings(next);
    },
    [],
  );

  useEffect(() => {
    if (!weekStart) {
      commitDaySettings({});
      setLoading(false);
      return;
    }

    const defaults = buildWeekDefaults(weekStart);

    if (!supabase) {
      commitDaySettings(defaults);
      setLoading(false);
      return;
    }
    // Narrowed once; the nested async function and cleanup keep the check.
    const client = supabase;

    const controller = new AbortController();

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const startStr = toDateStr(weekStart);
    const endStr = toDateStr(weekEnd);

    async function fetchSettings() {
      setLoading(true);

      // Consume the boot prefetch when one is in flight for this exact
      // week (primed by useAuth alongside the staff-profile fetch);
      // otherwise run the same query ourselves, as before.
      const { data, error } = await (takeBootPrefetch("daySettingsWeek", {
        startStr,
      }) ??
        fetchDaySettingsWeek(client, startStr, endStr, controller.signal));

      if (controller.signal.aborted) return;

      if (error) {
        logger.error("Failed to fetch day settings", error, {
          tags: { hook: "useDaySettings", op: "fetch" },
        });
        commitDaySettings(defaults);
        setLoading(false);
        return;
      }

      const merged: WeekDaySettingsMap = { ...defaults };
      for (const row of (data || []) as DaySettingsRow[]) {
        merged[row.setting_date] = fromRow(row);
      }

      commitDaySettings(merged);
      setLoading(false);
    }

    fetchSettings();

    // Real-time subscription for day_settings within the current week
    const channel = client
      .channel(uniqueChannelName(CHANNELS.daySettings))
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "day_settings" },
        (payload: RealtimePostgresChangesPayload<DaySettingsRow>) => {
          // On DELETE `new` is empty, so the missing setting_date returns
          // here and the row keeps its last value until the next fetch.
          const row = payload.new as Partial<DaySettingsRow>;
          const settingDate = row?.setting_date;
          if (!settingDate || settingDate < startStr || settingDate > endStr) return;
          commitDaySettings((prev) => ({
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
  }, [weekStart, commitDaySettings]);

  const upsertSetting = useCallback(async (
    dateStr: string,
    updater: DaySettingUpdater,
    persistence: "settings" | "atomic-closure" = "settings",
  ): Promise<DaySettingResult> => {
    const prevSetting: WeekDaySetting = daySettingsRef.current[dateStr] || {
      isOpen: false,
      overrides: {},
      extraSlots: [],
      immediateSlots: [],
    };
    const updates =
      typeof updater === "function" ? updater(prevSetting) : updater;
    const nextSetting = mergeSetting(prevSetting, updates);

    commitDaySettings((prev) => ({
      ...prev,
      [dateStr]: nextSetting,
    }));

    if (!supabase) return { ok: true, value: nextSetting };

    const useAtomicClosure =
      persistence === "atomic-closure" && nextSetting.isOpen === false;
    const { error } =
      useAtomicClosure
        ? await closeDayWithRearrangementTasks(supabase, { date: dateStr })
        : await supabase.from("day_settings").upsert(
            {
              setting_date: dateStr,
              is_open: nextSetting.isOpen,
              overrides: nextSetting.overrides,
              extra_slots: nextSetting.extraSlots,
              immediate_slots: nextSetting.immediateSlots,
            },
            { onConflict: "setting_date" },
          );

    if (error) {
      logger.error("Failed to upsert day setting", error, {
        tags: {
          hook: "useDaySettings",
          op: useAtomicClosure ? "closeDay" : "upsert",
        },
      });
      // Roll back the optimistic mutation so the UI matches the
      // server's authoritative state. Caller can toast the error.
      commitDaySettings((prev) => ({ ...prev, [dateStr]: prevSetting }));
      return { ok: false, error: error.message.includes("holiday_diary_busy_retry") ? "The diary is being updated. Please try again." : error.message.includes("holiday_dates_managed_in_settings") ? "Update or remove this holiday in Settings → Holidays before changing its dates." : error.message || "Couldn't save change." };
    }

    return { ok: true, value: nextSetting };
  }, [commitDaySettings]);

  const toggleDayOpen = useCallback(
    (dateStr: string, nextIsOpen?: boolean) =>
      upsertSetting(
        dateStr,
        (current) => ({
          isOpen:
            typeof nextIsOpen === "boolean"
              ? nextIsOpen
              : !current.isOpen,
        }),
        "atomic-closure",
      ),
    [upsertSetting],
  );

  // `seatIndex` takes a list as well as a single seat, and that matters: every
  // day-settings mutation upserts the WHOLE row, so blocking both seats as two
  // calls sent two full-row writes racing on the same primary key — the first
  // payload was already stale (seat 0 only) and, landing last, reopened seat 2.
  // One call means one payload. Each index still toggles independently, so the
  // same list un-blocks what it blocked.
  const setOverride = useCallback(
    (
      dateStr: string,
      slot: string,
      seatIndex: number | number[],
      action: SlotOverrides[number],
    ) =>
      upsertSetting(dateStr, (current) => {
        const overrides: Record<string, SlotOverrides> = { ...(current.overrides || {}) };
        const slotOv: SlotOverrides = { ...(overrides[slot] || {}) };

        for (const seat of Array.isArray(seatIndex) ? seatIndex : [seatIndex]) {
          if (slotOv[seat] === action) delete slotOv[seat];
          else slotOv[seat] = action;
        }

        if (Object.keys(slotOv).length === 0) delete overrides[slot];
        else overrides[slot] = slotOv;

        return { overrides };
      }),
    [upsertSetting],
  );

  // Whole-slot "open for immediate booking" toggle: customers may book the
  // slot same-day until 30 minutes before it starts (the DB enforces the
  // rule; this just flips the flag). Add/remove semantics like setOverride.
  const toggleImmediateSlot = useCallback(
    (dateStr: string, slot: string) =>
      upsertSetting(dateStr, (current) => {
        const existing = current.immediateSlots || [];
        return {
          immediateSlots: existing.includes(slot)
            ? existing.filter((s) => s !== slot)
            : [...existing, slot],
        };
      }),
    [upsertSetting],
  );

  const addExtraSlot = useCallback(
    (dateStr: string) =>
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
        // Past 23:30 the next slot would be 24:00 — not a real time, and
        // the DB grid sanitiser would reject it. Stop adding.
        if (h > 23) return {};
        const newSlot = `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
        return { extraSlots: [...existing, newSlot] };
      }),
    [upsertSetting],
  );

  const removeExtraSlot = useCallback(
    (dateStr: string) =>
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
    toggleImmediateSlot,
    addExtraSlot,
    removeExtraSlot,
  };
}
