import { useState, useEffect, useCallback } from "react";
import { supabase } from "../client.js";
import { dbBookingsToArray, toDateStr } from "../transforms.js";

export function useBookings(weekStart, dogsById, humansById) {
  const [bookingsByDate, setBookingsByDate] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!supabase || !weekStart || !dogsById || !humansById) {
      setLoading(false);
      return;
    }
    if (Object.keys(dogsById).length === 0 || Object.keys(humansById).length === 0) {
      return;
    }

    async function fetch() {
      setLoading(true);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);

      const startStr = toDateStr(weekStart);
      const endStr = toDateStr(weekEnd);

      const { data, error: err } = await supabase
        .from("bookings")
        .select("*")
        .gte("booking_date", startStr)
        .lte("booking_date", endStr)
        .order("slot");

      if (err) { setError(err.message); setLoading(false); return; }

      const transformed = dbBookingsToArray(data, dogsById, humansById);
      const grouped = {};
      for (let i = 0; i < transformed.length; i++) {
        const dateKey = data[i].booking_date;
        if (!grouped[dateKey]) grouped[dateKey] = [];
        grouped[dateKey].push(transformed[i]);
      }
      setBookingsByDate(grouped);
      setLoading(false);
    }
    fetch();
  }, [weekStart, dogsById, humansById]);

  const addBooking = useCallback(
    async (dateStr, booking) => {
      // Optimistic update
      setBookingsByDate((prev) => ({
        ...prev,
        [dateStr]: [...(prev[dateStr] || []), booking],
      }));

      if (!supabase) return;

      // Resolve dog UUID from name (try exact match first, then partial)
      const dog = Object.values(dogsById).find((d) => d.name === booking.dogName);

      if (!dog) {
        console.error("Dog not found for booking:", booking.dogName);
        return;
      }

      const { error: err } = await supabase.from("bookings").insert({
        booking_date: dateStr,
        slot: booking.slot,
        dog_id: dog.id,
        size: booking.size,
        service: booking.service,
        status: "Not Arrived",
        addons: booking.addons || [],
        pickup_by_id: null,
        payment: "Due at Pick-up",
        confirmed: false,
      });
      if (err) console.error("Failed to add booking:", err);
    },
    [dogsById, humansById]
  );

  const removeBooking = useCallback(
    async (dateStr, bookingId) => {
      setBookingsByDate((prev) => ({
        ...prev,
        [dateStr]: (prev[dateStr] || []).filter((b) => b.id !== bookingId),
      }));

      if (!supabase) return;
      const { error: err } = await supabase.from("bookings").delete().eq("id", bookingId);
      if (err) console.error("Failed to remove booking:", err);
    },
    []
  );

  const updateBooking = useCallback(
    async (updatedBooking, fromDateStr, toDateStr) => {
      setBookingsByDate((prev) => {
        const newState = { ...prev };
        if (fromDateStr === toDateStr) {
          newState[fromDateStr] = (newState[fromDateStr] || []).map((b) =>
            b.id === updatedBooking.id ? updatedBooking : b
          );
        } else {
          newState[fromDateStr] = (newState[fromDateStr] || []).filter(
            (b) => b.id !== updatedBooking.id
          );
          newState[toDateStr] = [...(newState[toDateStr] || []), updatedBooking];
        }
        return newState;
      });

      if (!supabase) return;

      const pickupHuman = updatedBooking.pickupBy
        ? Object.values(humansById).find((h) => h.fullName === updatedBooking.pickupBy)
        : null;

      const { error: err } = await supabase
        .from("bookings")
        .update({
          booking_date: toDateStr,
          slot: updatedBooking.slot,
          service: updatedBooking.service,
          addons: updatedBooking.addons || [],
          pickup_by_id: pickupHuman?.id || null,
          payment: updatedBooking.payment,
          status: updatedBooking.status,
          confirmed: updatedBooking.confirmed || false,
        })
        .eq("id", updatedBooking.id);
      if (err) console.error("Failed to update booking:", err);
    },
    [humansById]
  );

  return { bookingsByDate, loading, error, addBooking, removeBooking, updateBooking };
}
