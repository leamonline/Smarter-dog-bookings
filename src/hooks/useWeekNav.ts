/**
 * useWeekNav — manages week navigation state and date computation.
 * Extracted from App.jsx to reduce its size and improve testability.
 */
import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import { useSearchParams } from "react-router-dom";
import { ALL_DAYS } from "../constants/index";
import { toDateStr } from "../supabase/transforms";
import type { DayConfig } from "../types/index";

/** One column of the weekly calendar: the display pieces plus the Date it stands for. */
export interface WeekDate {
  full: string;
  dayNum: number;
  monthShort: string;
  year: number;
  dateObj: Date;
  dateStr: string;
}

export interface UseWeekNavResult {
  weekOffset: number;
  weekStart: Date;
  /** 0..6, Monday-indexed. */
  selectedDay: number;
  setSelectedDay: Dispatch<SetStateAction<number>>;
  dates: WeekDate[];
  currentDateObj: Date;
  currentDateStr: string;
  currentDayConfig: DayConfig;
  goToNextWeek: () => void;
  goToPrevWeek: () => void;
  handleDatePick: (pickedDate: Date) => void;
}

/**
 * Returns 0..6 where 0 = Monday, 6 = Sunday — i.e. the index into the
 * weekly `dates` array. Exported for testing only.
 */
export function mondayIndexedDayOfWeek(date: Date): number {
  const dow = date.getDay(); // 0 = Sunday in JS
  return dow === 0 ? 6 : dow - 1;
}

/** The Monday (local midnight) of the week containing `date`. */
function mondayOf(date: Date): Date {
  const monday = new Date(date);
  monday.setDate(date.getDate() - mondayIndexedDayOfWeek(date));
  monday.setHours(0, 0, 0, 0);
  return monday;
}

export function useWeekNav(): UseWeekNavResult {
  const [searchParams, setSearchParams] = useSearchParams();
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedDay, setSelectedDay] = useState(() => mondayIndexedDayOfWeek(new Date()));
  const initialised = useRef(false);
  // Tracks whether internal (selectedDay/weekOffset) state has caught up to
  // the URL's ?date= param. Until it has, the sync effect must NOT write to
  // the URL — otherwise an early render captures stale `dates` and clobbers
  // the URL with a wrong day before handleDatePick's setState calls land.
  const initSynced = useRef(false);

  const weekStart = useMemo(() => {
    const monday = mondayOf(new Date());
    monday.setDate(monday.getDate() + weekOffset * 7);
    return monday;
  }, [weekOffset]);

  const goToNextWeek = useCallback(() => setWeekOffset((o) => o + 1), []);
  const goToPrevWeek = useCallback(() => setWeekOffset((o) => o - 1), []);

  const dates = useMemo<WeekDate[]>(
    () =>
      ALL_DAYS.map((_, i) => {
        const d = new Date(weekStart);
        d.setDate(weekStart.getDate() + i);
        return {
          full: d.toLocaleDateString("en-GB", {
            day: "numeric",
            month: "long",
            year: "numeric",
          }),
          dayNum: d.getDate(),
          monthShort: d
            .toLocaleDateString("en-GB", { month: "short" })
            .toUpperCase(),
          year: d.getFullYear(),
          dateObj: d,
          dateStr: toDateStr(d),
        };
      }),
    [weekStart],
  );

  const currentDateObj = dates[selectedDay]?.dateObj || new Date();
  const currentDateStr = dates[selectedDay]?.dateStr || toDateStr(new Date());
  const currentDayConfig = ALL_DAYS[selectedDay];

  const handleDatePick = useCallback((pickedDate: Date) => {
    setSelectedDay(mondayIndexedDayOfWeek(pickedDate));

    const thisMonday = mondayOf(new Date());
    const pickedMonday = mondayOf(pickedDate);

    const diffWeeks = Math.round(
      (pickedMonday.getTime() - thisMonday.getTime()) / (7 * 24 * 60 * 60 * 1000),
    );
    setWeekOffset(diffWeeks);
  }, []);

  // Initialise from ?date= param on mount
  useEffect(() => {
    if (initialised.current) return;
    initialised.current = true;
    const dateParam = searchParams.get("date");
    if (!dateParam) {
      // No URL date to honour — the sync effect can write freely.
      initSynced.current = true;
      return;
    }
    const parsed = new Date(dateParam + "T00:00:00");
    if (!isNaN(parsed.getTime())) {
      handleDatePick(parsed);
    } else {
      initSynced.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial URL-honour pass; later URL changes go through navigation
  }, []);

  // Sync current date to URL params. Skipped while the URL is still being
  // honoured — `initSynced` flips once the rendered dateStr matches the URL.
  useEffect(() => {
    const dateStr = dates[selectedDay]?.dateStr;
    if (!dateStr) return;
    const current = searchParams.get("date");

    if (!initSynced.current) {
      if (current && dateStr === current) {
        initSynced.current = true;
      }
      return;
    }

    if (current !== dateStr) {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set("date", dateStr);
          return next;
        },
        { replace: true },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- URL writer reacts to state changes only; including searchParams would re-fire on our own writes
  }, [selectedDay, dates]);

  return {
    weekOffset,
    weekStart,
    selectedDay,
    setSelectedDay,
    dates,
    currentDateObj,
    currentDateStr,
    currentDayConfig,
    goToNextWeek,
    goToPrevWeek,
    handleDatePick,
  };
}
