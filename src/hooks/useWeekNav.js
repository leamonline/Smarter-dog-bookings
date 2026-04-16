/**
 * useWeekNav — manages week navigation state and date computation.
 * Extracted from App.jsx to reduce its size and improve testability.
 */
import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { ALL_DAYS } from "../constants/index.js";
import { toDateStr } from "../supabase/transforms.js";

export function useWeekNav() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedDay, setSelectedDay] = useState(0);
  const initialised = useRef(false);

  const weekStart = useMemo(() => {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(today);
    monday.setDate(today.getDate() + mondayOffset + weekOffset * 7);
    monday.setHours(0, 0, 0, 0);
    return monday;
  }, [weekOffset]);

  const goToNextWeek = useCallback(() => setWeekOffset((o) => o + 1), []);
  const goToPrevWeek = useCallback(() => setWeekOffset((o) => o - 1), []);

  const dates = useMemo(
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

  const handleDatePick = useCallback((pickedDate) => {
    const dayOfWeek = pickedDate.getDay();
    const dayIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    setSelectedDay(dayIndex);

    const today = new Date();
    const todayDow = today.getDay();
    const mondayOff = todayDow === 0 ? -6 : 1 - todayDow;
    const thisMonday = new Date(today);
    thisMonday.setDate(today.getDate() + mondayOff);
    thisMonday.setHours(0, 0, 0, 0);

    const pickedMonday = new Date(pickedDate);
    const pickedDow = pickedDate.getDay();
    const pickedMondayOff = pickedDow === 0 ? -6 : 1 - pickedDow;
    pickedMonday.setDate(pickedDate.getDate() + pickedMondayOff);
    pickedMonday.setHours(0, 0, 0, 0);

    const diffWeeks = Math.round(
      (pickedMonday - thisMonday) / (7 * 24 * 60 * 60 * 1000),
    );
    setWeekOffset(diffWeeks);
  }, []);

  // Initialise from ?date= param on mount
  useEffect(() => {
    if (initialised.current) return;
    initialised.current = true;
    const dateParam = searchParams.get("date");
    if (!dateParam) return;
    const parsed = new Date(dateParam + "T00:00:00");
    if (!isNaN(parsed.getTime())) {
      handleDatePick(parsed);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync current date to URL params
  useEffect(() => {
    const dateStr = dates[selectedDay]?.dateStr;
    if (!dateStr) return;
    const current = searchParams.get("date");
    if (current !== dateStr) {
      setSearchParams({ date: dateStr }, { replace: true });
    }
  }, [selectedDay, dates]); // eslint-disable-line react-hooks/exhaustive-deps

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
