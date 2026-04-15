import { useState, useEffect } from "react";
import { supabase } from "../client.js";
import { toDateStr } from "../transforms.js";

function groupByDate(rows) {
  const grouped = {};
  for (const row of rows) {
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
export function useMonthBookings(year, month) {
  const [bookingsByDate, setBookingsByDate] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (year == null || month == null || !supabase) {
      setBookingsByDate({});
      setLoading(false);
      return;
    }

    let cancelled = false;

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startStr = toDateStr(firstDay);
    const endStr = toDateStr(lastDay);

    async function fetchBookings() {
      setLoading(true);

      const { data, error } = await supabase
        .from("bookings")
        .select("id, booking_date")
        .gte("booking_date", startStr)
        .lte("booking_date", endStr);

      if (cancelled) return;

      if (error) {
        console.error("Failed to fetch month bookings:", error);
        setBookingsByDate({});
        setLoading(false);
        return;
      }

      setBookingsByDate(groupByDate(data || []));
      setLoading(false);
    }

    fetchBookings();

    const channel = supabase
      .channel(`month-bookings-${year}-${month}-${Date.now()}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "bookings" },
        (payload) => {
          const row = payload.new;
          if (row.booking_date < startStr || row.booking_date > endStr) return;
          setBookingsByDate((prev) => {
            const dateKey = row.booking_date;
            const existing = (prev[dateKey] || []).filter((b) => b.id !== row.id);
            return { ...prev, [dateKey]: [...existing, { id: row.id, booking_date: row.booking_date }] };
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "bookings" },
        (payload) => {
          const newRow = payload.new;
          const oldRow = payload.old;
          if (newRow.booking_date < startStr || newRow.booking_date > endStr) {
            if (oldRow.id) {
              setBookingsByDate((prev) => {
                const next = { ...prev };
                for (const dateKey of Object.keys(next)) {
                  next[dateKey] = next[dateKey].filter((b) => b.id !== oldRow.id);
                }
                return next;
              });
            }
            return;
          }
          setBookingsByDate((prev) => {
            const next = { ...prev };
            if (oldRow.booking_date && oldRow.booking_date !== newRow.booking_date) {
              next[oldRow.booking_date] = (next[oldRow.booking_date] || []).filter(
                (b) => b.id !== newRow.id,
              );
            }
            const dateKey = newRow.booking_date;
            const existing = (next[dateKey] || []).filter((b) => b.id !== newRow.id);
            next[dateKey] = [...existing, { id: newRow.id, booking_date: newRow.booking_date }];
            return next;
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "bookings" },
        (payload) => {
          const oldRow = payload.old;
          if (!oldRow.id) return;
          setBookingsByDate((prev) => {
            const dateKey = oldRow.booking_date;
            if (dateKey && prev[dateKey]) {
              return { ...prev, [dateKey]: prev[dateKey].filter((b) => b.id !== oldRow.id) };
            }
            const next = { ...prev };
            for (const key of Object.keys(next)) {
              next[key] = next[key].filter((b) => b.id !== oldRow.id);
            }
            return next;
          });
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [year, month]);

  return { monthBookingsByDate: bookingsByDate, monthBookingsLoading: loading };
}
