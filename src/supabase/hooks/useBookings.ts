import { useState, useEffect, useCallback } from "react";
import { supabase } from "../client.ts";
import { dbBookingsToArray, toDateStr } from "../transforms.ts";
import { useToast } from "../../hooks/useToast.tsx";
import type { Booking, BookingsByDate, DogsById, HumansById } from "../../types.ts";

export function useBookings(weekStart: Date | null, dogsById: DogsById | null, humansById: HumansById | null) {
  const [bookingsByDate, setBookingsByDate] = useState<BookingsByDate>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const showToast = useToast();

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
      const weekEnd = new Date(weekStart!);
      weekEnd.setDate(weekEnd.getDate() + 6);

      const startStr = toDateStr(weekStart!);
      const endStr = toDateStr(weekEnd);

      const { data, error: err } = await supabase!
        .from("bookings")
        .select("*")
        .gte("booking_date", startStr)
        .lte("booking_date", endStr)
        .order("slot");

      if (err) { setError(err.message); setLoading(false); return; }

      const transformed = dbBookingsToArray(data, dogsById!, humansById!);
      const grouped: Record<string, Booking[]> = {};
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
    async (dateStr: string, booking: Booking) => {
      const prev = bookingsByDate;
      setBookingsByDate((p) => ({
        ...p,
        [dateStr]: [...(p[dateStr] || []), booking],
      }));

      if (!supabase) return;

      const dog = Object.values(dogsById!).find((d) => d.name === booking.dogName);
      const owner = Object.values(humansById!).find((h) => h.fullName === booking.owner);

      const { error: err } = await supabase.from("bookings").insert({
        booking_date: dateStr,
        slot: booking.slot,
        dog_id: dog?.id,
        size: booking.size,
        service: booking.service,
        status: "Not Arrived",
        addons: booking.addons || [],
        pickup_by_id: null,
        payment: "Due at Pick-up",
      });
      if (err) {
        console.error("Failed to add booking:", err);
        showToast?.("Failed to add booking", "error");
        setBookingsByDate(prev);
      }
    },
    [bookingsByDate, dogsById, humansById, showToast]
  );

  const removeBooking = useCallback(
    async (dateStr: string, bookingId: string | number) => {
      const prev = bookingsByDate;
      setBookingsByDate((p) => ({
        ...p,
        [dateStr]: (p[dateStr] || []).filter((b) => b.id !== bookingId),
      }));

      if (!supabase) return;
      const { error: err } = await supabase.from("bookings").delete().eq("id", bookingId);
      if (err) {
        console.error("Failed to remove booking:", err);
        showToast?.("Failed to remove booking", "error");
        setBookingsByDate(prev);
      }
    },
    [bookingsByDate, showToast]
  );

  const updateBooking = useCallback(
    async (updatedBooking: Booking, fromDateStr: string, toDateStr: string) => {
      const prev = bookingsByDate;
      setBookingsByDate((p) => {
        const newState = { ...p };
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
        ? Object.values(humansById!).find((h) => h.fullName === updatedBooking.pickupBy)
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
        })
        .eq("id", updatedBooking.id);
      if (err) {
        console.error("Failed to update booking:", err);
        showToast?.("Failed to update booking", "error");
        setBookingsByDate(prev);
      }
    },
    [bookingsByDate, humansById, showToast]
  );

  return { bookingsByDate, loading, error, addBooking, removeBooking, updateBooking };
}
