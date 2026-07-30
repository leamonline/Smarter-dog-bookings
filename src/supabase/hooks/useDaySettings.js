import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../client";
import { CHANNELS, uniqueChannelName } from "../realtimeChannels";
import { takeBootPrefetch } from "../bootPrefetch.js";
import { fetchDaySettingsWeek } from "../queries/bootQueries.js";
import { ALL_DAYS } from "../../constants/index";
import { toDateStr } from "../transforms";
import { logger } from "../../lib/logger";
import { closeDayWithRearrangementTasks } from "../rpc";

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
      immediateSlots: [],
    };
  }
  return defaults;
}

function mergeSetting(current = {}, updates = {}) {
  return {
    isOpen: updates.isOpen ?? current.isOpen ?? false,
    overrides: updates.overrides ?? current.overrides ?? {},
    extraSlots: updates.extraSlots ?? current.extraSlots ?? [],
    immediateSlots: updates.immediateSlots ?? current.immediateSlots ?? [],
  };
}

export function useDaySettings(weekStart) {
  // daySettings: { "2026-03-25": { isOpen, overrides, extraSlots }, ... }
  const [daySettings, setDaySettings] = useState({});
  // Mutations need the latest setting synchronously. Reading a value assigned
  // inside React's functional state updater is racy because React may defer
  // that updater until after the async persistence path has already started.
  const daySettingsRef = useRef({});
  const [loading, setLoading] = useState(true);

  const commitDaySettings = useCallback((updater) => {
    const next =
      typeof updater === "function"
        ? updater(daySettingsRef.current)
        : updater;
    daySettingsRef.current = next;
    setDaySettings(next);
  }, []);

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
        fetchDaySettingsWeek(supabase, startStr, endStr, controller.signal));

      if (controller.signal.aborted) return;

      if (error) {
        logger.error("Failed to fetch day settings", error, {
          tags: { hook: "useDaySettings", op: "fetch" },
        });
        commitDaySettings(defaults);
        setLoading(false);
        return;
      }

      const merged = { ...defaults };
      for (const row of data || []) {
        merged[row.setting_date] = {
          isOpen: row.is_open,
          overrides: row.overrides || {},
          extraSlots: row.extra_slots || [],
          immediateSlots: row.immediate_slots || [],
        };
      }

      commitDaySettings(merged);
      setLoading(false);
    }

    fetchSettings();

    // Real-time subscription for day_settings within the current week
    const channel = supabase
      .channel(uniqueChannelName(CHANNELS.daySettings))
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "day_settings" },
        (payload) => {
          const row = payload.new;
          if (!row || row.setting_date < startStr || row.setting_date > endStr) return;
          commitDaySettings((prev) => ({
            ...prev,
            [row.setting_date]: {
              isOpen: row.is_open,
              overrides: row.overrides || {},
              extraSlots: row.extra_slots || [],
              immediateSlots: row.immediate_slots || [],
            },
          }));
        },
      )
      .subscribe();

    return () => {
      controller.abort();
      supabase.removeChannel(channel);
    };
  }, [weekStart, commitDaySettings]);

  const upsertSetting = useCallback(async (dateStr, updater, persistence = "settings") => {
    const prevSetting = daySettingsRef.current[dateStr] || {
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
      return { ok: false, error: error.message || "Couldn't save change." };
    }

    return { ok: true, value: nextSetting };
  }, [commitDaySettings]);

  const toggleDayOpen = useCallback(
    (dateStr, nextIsOpen) =>
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

  // Whole-slot "open for immediate booking" toggle: customers may book the
  // slot same-day until 30 minutes before it starts (the DB enforces the
  // rule; this just flips the flag). Add/remove semantics like setOverride.
  const toggleImmediateSlot = useCallback(
    (dateStr, slot) =>
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
        // Past 23:30 the next slot would be 24:00 — not a real time, and
        // the DB grid sanitiser would reject it. Stop adding.
        if (h > 23) return {};
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
    toggleImmediateSlot,
    addExtraSlot,
    removeExtraSlot,
  };
}
