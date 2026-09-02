import { useState, useEffect, useMemo } from "react";
import { supabase } from "../client";
import { CHANNELS, uniqueChannelName } from "../realtimeChannels";
import { fetchDaySettingsWeek, fetchBookingsWeek } from "../queries/bootQueries.js";
import { toDateStr } from "../transforms";
import { getDefaultOpenForDate } from "../../engine/utils";
import { logger } from "../../lib/logger";
import { groupBookingsByDate } from "./useBookings";
import type { Database } from "../database.types";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import type { BookingsByDate, SlotOverrides } from "../../types/index";

type DaySettingsRow = Database["public"]["Tables"]["day_settings"]["Row"];
type BookingRow = Database["public"]["Tables"]["bookings"]["Row"];

/** One diary day's settings; `isOpen` is null when the row never set it (callers test truthiness). */
export interface DiaryDaySetting {
  isOpen: boolean | null;
  overrides: Record<string, SlotOverrides>;
  extraSlots: string[];
  immediateSlots: string[];
}

export type DiaryDaySettingsMap = Record<string, DiaryDaySetting>;

export interface UseInboxDiaryDataResult {
  daySettings: DiaryDaySettingsMap;
  bookingsByDate: BookingsByDate;
  loading: boolean;
}

interface DateRange {
  start: string;
  end: string;
}

// How far either side of the diary's currently-viewed date to keep loaded.
// The window only moves (and re-fetches) once the diary is paged outside
// it — not on every single day step — per the "avoid unnecessary refetches"
// requirement this hook was built against.
const WINDOW_PAD_DAYS = 14;

function addDays(dateStr: string, delta: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + delta);
  return toDateStr(date);
}

function buildWindowDefaults(startStr: string, endStr: string): DiaryDaySettingsMap {
  const defaults: DiaryDaySettingsMap = {};
  for (let cursor = startStr; cursor <= endStr; cursor = addDays(cursor, 1)) {
    const [y, m, d] = cursor.split("-").map(Number);
    defaults[cursor] = {
      isOpen: getDefaultOpenForDate(new Date(y, m - 1, d)),
      overrides: {},
      extraSlots: [],
      immediateSlots: [],
    };
  }
  return defaults;
}

/** The generated row types the jsonb columns as Json; narrow them once. */
function fromRow(row: Pick<DaySettingsRow, "is_open" | "overrides" | "extra_slots" | "immediate_slots">): DiaryDaySetting {
  return {
    isOpen: row.is_open,
    overrides: (row.overrides as Record<string, SlotOverrides> | null) || {},
    extraSlots: (row.extra_slots as string[] | null) || [],
    immediateSlots: (row.immediate_slots as string[] | null) || [],
  };
}

/**
 * Read-only day_settings + bookings for the Inbox booking pane's diary,
 * scoped to a rolling window around whichever date the diary is currently
 * showing — independent of the staff calendar's `weekStart` (SalonContext /
 * useDaySettings / useBookings). The diary pages its own date, so pinning it
 * to the calendar's currently-loaded week meant any date paged outside that
 * week silently fell back to the default weekday open/closed pattern and
 * showed zero bookings — both wrong, and the second one meant the pane could
 * offer an already-full or closed slot.
 *
 * `useDaySettings`/`useBookings` are deliberately left untouched: they're
 * the data feed for the entire staff shell (App.jsx) plus WeeklyCashUp, so
 * reshaping them to take an arbitrary range would risk the main calendar to
 * fix one panel. This hook is additive and only the Inbox imports it.
 */
export function useInboxDiaryData(centerDateStr: string | null | undefined): UseInboxDiaryDataResult {
  // The loaded window. Only moves when centerDateStr falls outside it — see
  // the effect below — so paging within the window never re-triggers the
  // fetch/subscribe effect that depends on this value.
  const [range, setRange] = useState<DateRange | null>(null);
  const [daySettings, setDaySettings] = useState<DiaryDaySettingsMap>({});
  const [bookingRows, setBookingRows] = useState<BookingRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!centerDateStr) {
      setLoading(false);
      return;
    }
    setRange((prev) => {
      if (prev && centerDateStr >= prev.start && centerDateStr <= prev.end) {
        return prev;
      }
      return {
        start: addDays(centerDateStr, -WINDOW_PAD_DAYS),
        end: addDays(centerDateStr, WINDOW_PAD_DAYS),
      };
    });
  }, [centerDateStr]);

  useEffect(() => {
    if (!range) return;

    const { start: startStr, end: endStr } = range;
    const inRange = (d: string | null | undefined): d is string => !!d && d >= startStr && d <= endStr;

    if (!supabase) {
      setDaySettings(buildWindowDefaults(startStr, endStr));
      setBookingRows([]);
      setLoading(false);
      return;
    }
    // Narrowed once here; the nested async function and cleanup below would
    // otherwise lose the null check.
    const client = supabase;

    const controller = new AbortController();

    async function fetchWindow() {
      setLoading(true);

      const [settingsRes, bookingsRes] = await Promise.all([
        fetchDaySettingsWeek(client, startStr, endStr, controller.signal),
        fetchBookingsWeek(client, startStr, endStr, controller.signal),
      ]);

      if (controller.signal.aborted) return;

      if (settingsRes.error) {
        logger.error("Failed to fetch inbox diary day settings", settingsRes.error, {
          tags: { hook: "useInboxDiaryData", op: "fetchDaySettings" },
        });
      } else {
        const merged = buildWindowDefaults(startStr, endStr);
        for (const row of (settingsRes.data || []) as DaySettingsRow[]) {
          merged[row.setting_date] = fromRow(row);
        }
        setDaySettings(merged);
      }

      if (bookingsRes.error) {
        logger.error("Failed to fetch inbox diary bookings", bookingsRes.error, {
          tags: { hook: "useInboxDiaryData", op: "fetchBookings" },
        });
      } else {
        setBookingRows((bookingsRes.data || []) as BookingRow[]);
      }

      setLoading(false);
    }

    fetchWindow();

    // Kept live (not just fetch-once) because unlike the calendar, staff can
    // leave a conversation open for a long session — without this, a
    // closure or booking made elsewhere mid-session would silently go
    // stale in exactly the "diary offers an impossible appointment" way
    // this hook exists to prevent.
    const settingsChannel = client
      .channel(uniqueChannelName(CHANNELS.inboxDiaryDaySettings))
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "day_settings" },
        (payload: RealtimePostgresChangesPayload<DaySettingsRow>) => {
          // On DELETE `new` is an empty object: no setting_date, so the guard
          // returns and the day keeps its last value until the next fetch.
          const row = payload.new as Partial<DaySettingsRow>;
          if (!inRange(row.setting_date)) return;
          setDaySettings((prev) => ({
            ...prev,
            [row.setting_date as string]: fromRow(row as DaySettingsRow),
          }));
        },
      )
      .subscribe();

    // Raw rows in, grouped-by-date derived below (useMemo) — same split as
    // useBookings. Rows carry their own dog_name_snapshot/breed_snapshot, so
    // unlike useBookings there's no dogs/humans map to keep resolving
    // against here.
    const bookingsChannel = client
      .channel(uniqueChannelName(CHANNELS.inboxDiaryBookings))
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "bookings" },
        (payload: RealtimePostgresChangesPayload<BookingRow>) => {
          const newRow = payload.new as BookingRow;
          if (!inRange(newRow?.booking_date)) return;
          setBookingRows((prev) =>
            prev.some((r) => r.id === newRow.id) ? prev : [...prev, newRow],
          );
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "bookings" },
        (payload: RealtimePostgresChangesPayload<BookingRow>) => {
          const newRow = payload.new as BookingRow;
          const oldRow = payload.old as Partial<BookingRow>;
          const id = newRow?.id ?? oldRow?.id;
          if (!id) return;
          setBookingRows((prev) => {
            if (!inRange(newRow?.booking_date)) {
              return prev.filter((r) => r.id !== id);
            }
            return prev.some((r) => r.id === id)
              ? prev.map((r) => (r.id === id ? newRow : r))
              : [...prev, newRow];
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "bookings" },
        (payload: RealtimePostgresChangesPayload<BookingRow>) => {
          const id = (payload.old as Partial<BookingRow>)?.id;
          if (!id) return;
          setBookingRows((prev) => prev.filter((r) => r.id !== id));
        },
      )
      .subscribe();

    return () => {
      controller.abort();
      client.removeChannel(settingsChannel);
      client.removeChannel(bookingsChannel);
    };
  }, [range]);

  // groupBookingsByDate still lives in the JS useBookings, so its return
  // type is inferred as {}; the shape is the calendar's BookingsByDate.
  const bookingsByDate = useMemo<BookingsByDate>(
    () => groupBookingsByDate(bookingRows, {}, {}) as BookingsByDate,
    [bookingRows],
  );

  return { daySettings, bookingsByDate, loading };
}
