import { useState, useEffect, useCallback } from "react";
import { supabase } from "../client.js";
import { dbBookingsToArray, toDateStr } from "../transforms.js";

function groupBookingsByDate(rows, dogsById, humansById) {
  const transformed = dbBookingsToArray(rows, dogsById, humansById);
  const grouped = {};

  for (let i = 0; i < transformed.length; i++) {
    const row = rows[i];
    const dateKey = row.booking_date;
    if (!grouped[dateKey]) grouped[dateKey] = [];
    grouped[dateKey].push(transformed[i]);
  }

  return grouped;
}

export function useBookings(weekStart, dogsById, humansById) {
  const [bookingsByDate, setBookingsByDate] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!supabase || !weekStart) {
      setBookingsByDate({});
      setLoading(false);
      return;
    }

    if (!dogsById || !humansById) {
      setLoading(true);
      return;
    }

    const dogIds = Object.keys(dogsById);
    const humanIds = Object.keys(humansById);

    // Empty humans or dogs should not deadlock the app.
    // A fresh project can legitimately have no records yet.
    if (dogIds.length === 0 || humanIds.length === 0) {
      setBookingsByDate({});
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function fetchBookings() {
      setLoading(true);
      setError(null);

      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);

      const startStr = toDateStr(weekStart);
      const endStr = toDateStr(weekEnd);

      const { data, error: err } = await supabase
        .from("bookings")
        .select("*")
        .gte("booking_date", startStr)
        .lte("booking_date", endStr)
        .order("booking_date")
        .order("slot");

      if (cancelled) return;

      if (err) {
        setError(err.message);
        setBookingsByDate({});
        setLoading(false);
        return;
      }

      setBookingsByDate(groupBookingsByDate(data || [], dogsById, humansById));
      setLoading(false);
    }

    fetchBookings();

    return () => {
      cancelled = true;
    };
  }, [weekStart, dogsById, humansById]);

  const addBooking = useCallback(
    async (dateStr, booking) => {
      if (!supabase) {
        setBookingsByDate((prev) => ({
          ...prev,
          [dateStr]: [...(prev[dateStr] || []), booking],
        }));
        return booking;
      }

      setError(null);

      const dogId =
        booking._dogId ||
        Object.values(dogsById || {}).find((d) => d.name === booking.dogName)
          ?.id;

      if (!dogId) {
        const message = `Dog not found for booking: ${booking.dogName}`;
        console.error(message);
        setError(message);
        return null;
      }

      const pickupHumanId =
        booking._pickupById ||
        (booking.pickupBy
          ? Object.values(humansById || {}).find(
              (h) => h.fullName === booking.pickupBy,
            )?.id
          : null);

      const insertPayload = {
        booking_date: dateStr,
        slot: booking.slot,
        dog_id: dogId,
        size: booking.size,
        service: booking.service,
        status: booking.status || "Not Arrived",
        addons: booking.addons || [],
        pickup_by_id: pickupHumanId || null,
        payment: booking.payment || "Due at Pick-up",
        confirmed: booking.confirmed ?? false,
      };

      const { data, error: err } = await supabase
        .from("bookings")
        .insert(insertPayload)
        .select("*")
        .single();

      if (err) {
        console.error("Failed to add booking:", err);
        setError(err.message);
        return null;
      }

      const inserted = dbBookingsToArray([data], dogsById, humansById)[0];

      setBookingsByDate((prev) => ({
        ...prev,
        [dateStr]: [...(prev[dateStr] || []), inserted],
      }));

      return inserted;
    },
    [dogsById, humansById],
  );

  const removeBooking = useCallback(async (dateStr, bookingId) => {
    if (!supabase) {
      setBookingsByDate((prev) => ({
        ...prev,
        [dateStr]: (prev[dateStr] || []).filter((b) => b.id !== bookingId),
      }));
      return true;
    }

    setError(null);

    const { error: err } = await supabase
      .from("bookings")
      .delete()
      .eq("id", bookingId);

    if (err) {
      console.error("Failed to remove booking:", err);
      setError(err.message);
      return false;
    }

    setBookingsByDate((prev) => ({
      ...prev,
      [dateStr]: (prev[dateStr] || []).filter((b) => b.id !== bookingId),
    }));

    return true;
  }, []);

  const updateBooking = useCallback(
    async (updatedBooking, fromDateStr, toDateStrValue) => {
      if (!supabase) {
        setBookingsByDate((prev) => {
          const next = { ...prev };
          if (fromDateStr === toDateStrValue) {
            next[fromDateStr] = (next[fromDateStr] || []).map((b) =>
              b.id === updatedBooking.id ? updatedBooking : b,
            );
          } else {
            next[fromDateStr] = (next[fromDateStr] || []).filter(
              (b) => b.id !== updatedBooking.id,
            );
            next[toDateStrValue] = [
              ...(next[toDateStrValue] || []),
              updatedBooking,
            ];
          }
          return next;
        });
        return updatedBooking;
      }

      setError(null);

      const pickupHumanId =
        updatedBooking._pickupById ||
        (updatedBooking.pickupBy
          ? Object.values(humansById || {}).find(
              (h) => h.fullName === updatedBooking.pickupBy,
            )?.id
          : null);

      const updatePayload = {
        booking_date: toDateStrValue,
        slot: updatedBooking.slot,
        service: updatedBooking.service,
        addons: updatedBooking.addons || [],
        pickup_by_id: pickupHumanId || null,
        payment: updatedBooking.payment || "Due at Pick-up",
        status: updatedBooking.status || "Not Arrived",
        confirmed: updatedBooking.confirmed ?? false,
      };

      const { data, error: err } = await supabase
        .from("bookings")
        .update(updatePayload)
        .eq("id", updatedBooking.id)
        .select("*")
        .single();

      if (err) {
        console.error("Failed to update booking:", err);
        setError(err.message);
        return null;
      }

      const persisted = dbBookingsToArray([data], dogsById, humansById)[0];

      setBookingsByDate((prev) => {
        const next = { ...prev };

        if (fromDateStr === toDateStrValue) {
          next[fromDateStr] = (next[fromDateStr] || []).map((b) =>
            b.id === persisted.id ? persisted : b,
          );
        } else {
          next[fromDateStr] = (next[fromDateStr] || []).filter(
            (b) => b.id !== persisted.id,
          );
          next[toDateStrValue] = [...(next[toDateStrValue] || []), persisted];
        }

        return next;
      });

      return persisted;
    },
    [humansById, dogsById],
  );

  return {
    bookingsByDate,
    loading,
    error,
    addBooking,
    removeBooking,
    updateBooking,
  };
}
