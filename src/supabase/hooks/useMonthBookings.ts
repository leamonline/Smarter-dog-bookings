import { useState, useEffect } from "react";
import { supabase } from "../client";
import { CHANNELS, uniqueChannelName } from "../realtimeChannels";
import { toDateStr } from "../transforms";
import { logger } from "../../lib/logger";
import { BOOKING_STATUS } from "../../constants/salon";
import type { Database } from "../database.types";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";

type BookingRow = Database["public"]["Tables"]["bookings"]["Row"];

/** The per-day occupancy entry the month grids count; status is only read while grouping. */
export interface MonthBookingEntry {
  id: string;
  booking_date: string;
  status?: string | null;
}

export type MonthBookingsByDate = Record<string, MonthBookingEntry[]>;

export interface UseMonthBookingsResult {
  monthBookingsByDate: MonthBookingsByDate;
  monthBookingsLoading: boolean;
}

const isCancelled = (row: { status?: string | null } | null | undefined): boolean =>
  row?.status === BOOKING_STATUS.CANCELLED;

// Exported for tests. Cancelled rows are soft-deletes that free their seat,
// so they must not inflate the month grid's per-day counts.
export function groupByDate(rows: ReadonlyArray<MonthBookingEntry>): MonthBookingsByDate {
  const grouped: MonthBookingsByDate = {};
  for (const row of rows) {
    if (isCancelled(row)) continue;
    const dateKey = row.booking_date;
    if (!grouped[dateKey]) grouped[dateKey] = [];
    grouped[dateKey].push(row);
  }
  return grouped;
}

/**
 * Read-only month-scoped booking data for calendar views.
 * Returns raw rows grouped by date — consumers only need .length per day.
 */
export function useMonthBookings(
  year: number | null | undefined,
  month: number | null | undefined,
): UseMonthBookingsResult {
  const [bookingsByDate, setBookingsByDate] = useState<MonthBookingsByDate>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (year == null || month == null || !supabase) {
      setBookingsByDate({});
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

    async function fetchBookings() {
      setLoading(true);

      const { data, error } = await client
        .from("bookings")
        .select("id, booking_date, status")
        .gte("booking_date", startStr)
        .lte("booking_date", endStr)
        .abortSignal(controller.signal);

      if (controller.signal.aborted) return;

      if (error) {
        logger.error("Failed to fetch month bookings", error, {
          tags: { hook: "useMonthBookings", op: "fetch" },
        });
        setBookingsByDate({});
        setLoading(false);
        return;
      }

      setBookingsByDate(groupByDate(data || []));
      setLoading(false);
    }

    fetchBookings();

    // Realtime payloads carry the full row on INSERT/UPDATE; `old` is only the
    // primary key unless the table has REPLICA IDENTITY FULL, so treat both as
    // partial and read the fields defensively, exactly as before.
    const channel = client
      .channel(uniqueChannelName(`${CHANNELS.monthBookings}-${year}-${month}`))
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "bookings" },
        (payload: RealtimePostgresChangesPayload<BookingRow>) => {
          const row = payload.new as Partial<BookingRow>;
          if (!row.id || !row.booking_date) return;
          if (row.booking_date < startStr || row.booking_date > endStr) return;
          if (isCancelled(row)) return;
          const entry: MonthBookingEntry = { id: row.id, booking_date: row.booking_date };
          setBookingsByDate((prev) => {
            const dateKey = entry.booking_date;
            const existing = (prev[dateKey] || []).filter((b) => b.id !== entry.id);
            return { ...prev, [dateKey]: [...existing, entry] };
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "bookings" },
        (payload: RealtimePostgresChangesPayload<BookingRow>) => {
          const newRow = payload.new as Partial<BookingRow>;
          const oldRow = payload.old as Partial<BookingRow>;
          if (!newRow.id || !newRow.booking_date) return;
          const entry: MonthBookingEntry = { id: newRow.id, booking_date: newRow.booking_date };
          if (entry.booking_date < startStr || entry.booking_date > endStr) {
            if (oldRow.id) {
              const oldId = oldRow.id;
              setBookingsByDate((prev) => {
                const next: MonthBookingsByDate = { ...prev };
                for (const dateKey of Object.keys(next)) {
                  next[dateKey] = next[dateKey].filter((b) => b.id !== oldId);
                }
                return next;
              });
            }
            return;
          }
          setBookingsByDate((prev) => {
            const next: MonthBookingsByDate = { ...prev };
            if (oldRow.booking_date && oldRow.booking_date !== entry.booking_date) {
              next[oldRow.booking_date] = (next[oldRow.booking_date] || []).filter(
                (b) => b.id !== entry.id,
              );
            }
            const dateKey = entry.booking_date;
            const existing = (next[dateKey] || []).filter((b) => b.id !== entry.id);
            // A cancellation is an UPDATE to status — it frees the seat, so
            // drop the row instead of re-adding it.
            next[dateKey] = isCancelled(newRow) ? existing : [...existing, entry];
            return next;
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "bookings" },
        (payload: RealtimePostgresChangesPayload<BookingRow>) => {
          const oldRow = payload.old as Partial<BookingRow>;
          const oldId = oldRow.id;
          if (!oldId) return;
          setBookingsByDate((prev) => {
            const dateKey = oldRow.booking_date;
            if (dateKey && prev[dateKey]) {
              return { ...prev, [dateKey]: prev[dateKey].filter((b) => b.id !== oldId) };
            }
            const next: MonthBookingsByDate = { ...prev };
            for (const key of Object.keys(next)) {
              next[key] = next[key].filter((b) => b.id !== oldId);
            }
            return next;
          });
        },
      )
      .subscribe();

    return () => {
      controller.abort();
      client.removeChannel(channel);
    };
  }, [year, month]);

  return { monthBookingsByDate: bookingsByDate, monthBookingsLoading: loading };
}
