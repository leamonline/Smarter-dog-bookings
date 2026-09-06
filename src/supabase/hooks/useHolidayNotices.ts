import { useEffect, useState } from "react";
import { customerSupabase as supabase } from "../customerClient";
import { scheduleHolidayNotices, type HolidayNotice } from "../../engine/holidayNotice";

export { holidayCopy, isHolidayDate, londonDate } from "../../engine/holidayNotice";
export type { HolidayNotice };

type RawNotice = Omit<HolidayNotice, "phase"> & { phase: string };

const REFRESH_MS = 60_000;

/**
 * Verified public holiday notices for the customer portal. The server only
 * returns a holiday whose closure and reopening day match the live diary, so a
 * failed or empty read means "no verified notice", never "we're open".
 */
export function useHolidayNotices(): HolidayNotice[] {
  const [notices, setNotices] = useState<RawNotice[]>([]);
  useEffect(() => {
    let alive = true;
    let request = 0;
    const refresh = async () => {
      const current = ++request;
      // Do not retain a reopening claim while revalidating it.
      setNotices([]);
      if (!supabase) return;
      try {
        const { data, error } = await supabase.rpc("get_public_holiday_notices");
        if (alive && current === request) setNotices(error ? [] : ((data ?? []) as RawNotice[]));
      } catch {
        if (alive && current === request) setNotices([]);
      }
    };
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, REFRESH_MS);
    const focus = () => { void refresh(); };
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", focus);
    return () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener("focus", focus);
      document.removeEventListener("visibilitychange", focus);
    };
  }, []);
  return scheduleHolidayNotices(notices);
}
