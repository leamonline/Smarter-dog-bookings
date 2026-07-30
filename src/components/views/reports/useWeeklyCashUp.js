import { useState, useEffect } from "react";
import { supabase } from "../../../supabase/client";
import { fetchBookingsWeek } from "../../../supabase/queries/bootQueries.js";
import {
  buildDogsById,
  buildHumansById,
  dbBookingsToArray,
  dbDogsToMap,
  dbHumansToMap,
  toDateStr,
} from "../../../supabase/transforms";
import {
  SAMPLE_BOOKINGS_BY_DAY,
  SAMPLE_DOGS,
  SAMPLE_HUMANS,
} from "../../../data/sample.js";
import { logger } from "../../../lib/logger";

// Offset (Mon-first) of each sample day bucket, mirroring useOfflineState's
// buildOfflineBookingsByDate so the cash-up shows sample data on whatever week
// is selected — prev/next navigation works offline without touching the live
// cloud Supabase (which holds real customer PII).
const DAY_KEY_OFFSET = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6 };

function buildOfflineWeek(weekStart) {
  const byDate = {};
  for (const [dayKey, bookings] of Object.entries(SAMPLE_BOOKINGS_BY_DAY)) {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + DAY_KEY_OFFSET[dayKey]);
    byDate[toDateStr(d)] = bookings;
  }
  return byDate;
}

const EMPTY = { bookingsByDate: {}, dogs: {}, humans: {} };

/**
 * Week-scoped data source for the Weekly Cash-Up sheet. Modelled on
 * useReportsData (online fetch + offline fallback) but scoped to the single
 * Mon–Sun week starting at `weekStart`.
 *
 * Returns app-shaped bookings grouped by date plus the dog/human maps the
 * cash-up engine (custom price) and resolveBookingDisplay (names) consume.
 * `weekStart` must be a stable Date reference (memoise it by week offset).
 */
export function useWeeklyCashUp(weekStart) {
  const [data, setData] = useState(EMPTY);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!weekStart) {
      setData(EMPTY);
      setLoading(false);
      return;
    }

    // Offline / sample mode.
    if (!supabase) {
      setData({
        bookingsByDate: buildOfflineWeek(weekStart),
        dogs: SAMPLE_DOGS,
        humans: SAMPLE_HUMANS,
      });
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const startStr = toDateStr(weekStart);
    const endStr = toDateStr(weekEnd);

    async function load() {
      setLoading(true);
      try {
        const [bk, dg, hm] = await Promise.all([
          fetchBookingsWeek(supabase, startStr, endStr, controller.signal),
          supabase
            .from("dogs")
            .select("id, name, breed, human_id, custom_price, size")
            .abortSignal(controller.signal),
          supabase
            .from("humans")
            .select("id, name, surname, phone")
            .abortSignal(controller.signal),
        ]);

        if (controller.signal.aborted) return;
        if (bk.error || dg.error || hm.error) {
          throw new Error(
            [bk.error?.message, dg.error?.message, hm.error?.message]
              .filter(Boolean)
              .join(" | "),
          );
        }

        // Reuse the staff booking transform so cash-up names + prices match the
        // calendar exactly (snake_case → app objects, snapshot fallbacks).
        const humansById = buildHumansById(hm.data || []);
        const dogsById = buildDogsById(dg.data || []);
        const bookings = dbBookingsToArray(bk.data || [], dogsById, humansById);

        const bookingsByDate = {};
        for (const booking of bookings) {
          const key = booking._bookingDate;
          (bookingsByDate[key] ??= []).push(booking);
        }

        setData({
          bookingsByDate,
          dogs: dbDogsToMap(dg.data || [], humansById),
          humans: dbHumansToMap(hm.data || [], {}),
        });
      } catch (err) {
        if (!controller.signal.aborted) {
          logger.error("WeeklyCashUp: failed to load week", err, {
            tags: { hook: "useWeeklyCashUp", op: "fetch" },
          });
          setData(EMPTY);
        }
      }
      if (!controller.signal.aborted) setLoading(false);
    }

    load();
    return () => controller.abort();
  }, [weekStart]);

  return { ...data, loading };
}
