import { useState, useEffect, useCallback, useRef } from "react";
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

export function useBookings(weekStart, dogsById, humansById, { onError } = {}) {
  const [bookingsByDate, setBookingsByDate] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const dogsByIdRef = useRef(dogsById);
  const humansByIdRef = useRef(humansById);
  useEffect(() => { dogsByIdRef.current = dogsById; }, [dogsById]);
  useEffect(() => { humansByIdRef.current = humansById; }, [humansById]);

  const onErrorRef = useRef(onError);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);

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

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const startStr = toDateStr(weekStart);
    const endStr = toDateStr(weekEnd);

    async function fetchBookings() {
      setLoading(true);
      setError(null);

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

    // Real-time subscription for bookings within the current week
    const channel = supabase
      .channel(`bookings-realtime-${Date.now()}-${Math.random()}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "bookings" },
        (payload) => {
          const newRow = payload.new;
          if (newRow.booking_date < startStr || newRow.booking_date > endStr)
            return;
          const transformed = dbBookingsToArray(
            [newRow],
            dogsByIdRef.current,
            humansByIdRef.current,
          )[0];
          setBookingsByDate((prev) => {
            const dateKey = newRow.booking_date;
            const existing = (prev[dateKey] || []).filter(
              (b) => b.id !== newRow.id,
            );
            return { ...prev, [dateKey]: [...existing, transformed] };
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
            // Updated booking moved outside our week — remove it if it was here
            if (oldRow.id) {
              setBookingsByDate((prev) => {
                const next = { ...prev };
                for (const dateKey of Object.keys(next)) {
                  next[dateKey] = next[dateKey].filter(
                    (b) => b.id !== oldRow.id,
                  );
                }
                return next;
              });
            }
            return;
          }
          const transformed = dbBookingsToArray(
            [newRow],
            dogsByIdRef.current,
            humansByIdRef.current,
          )[0];
          setBookingsByDate((prev) => {
            const next = { ...prev };
            // Remove from old date if date changed
            if (oldRow.booking_date && oldRow.booking_date !== newRow.booking_date) {
              next[oldRow.booking_date] = (next[oldRow.booking_date] || []).filter(
                (b) => b.id !== newRow.id,
              );
            }
            // Upsert on new date
            const dateKey = newRow.booking_date;
            const existing = (next[dateKey] || []).filter(
              (b) => b.id !== newRow.id,
            );
            next[dateKey] = [...existing, transformed];
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
              return {
                ...prev,
                [dateKey]: prev[dateKey].filter((b) => b.id !== oldRow.id),
              };
            }
            // If we don't have the date, search all dates
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
  }, [weekStart, dogsById, humansById, refreshKey]);

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
        onErrorRef.current?.(message);
        return null;
      }

      // Optimistic: add temp booking to state immediately
      const tempId = `_temp_${Date.now()}`;
      const tempBooking = { ...booking, id: tempId };
      setBookingsByDate((prev) => ({
        ...prev,
        [dateStr]: [...(prev[dateStr] || []), tempBooking],
      }));

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
        status: booking.status || "No-show",
        addons: booking.addons || [],
        pickup_by_id: pickupHumanId || null,
        payment: booking.payment || "Due at Pick-up",
        confirmed: booking.confirmed ?? false,
        ...(booking.chain_id ? { chain_id: booking.chain_id } : {}),
      };

      const { data, error: err } = await supabase
        .from("bookings")
        .insert(insertPayload)
        .select("*")
        .single();

      if (err) {
        // Rollback optimistic change
        setBookingsByDate((prev) => ({
          ...prev,
          [dateStr]: (prev[dateStr] || []).filter((b) => b.id !== tempId),
        }));
        console.error("Failed to add booking:", err);
        setError(err.message);
        onErrorRef.current?.(err.message);
        return null;
      }

      const inserted = dbBookingsToArray([data], dogsById, humansById)[0];

      // Replace temp entry with real server data
      setBookingsByDate((prev) => ({
        ...prev,
        [dateStr]: (prev[dateStr] || []).map((b) =>
          b.id === tempId ? inserted : b,
        ),
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
      return { success: true };
    }

    setError(null);

    // Snapshot for rollback, then remove optimistically
    let removed = null;
    setBookingsByDate((prev) => {
      removed = (prev[dateStr] || []).find((b) => b.id === bookingId) || null;
      return {
        ...prev,
        [dateStr]: (prev[dateStr] || []).filter((b) => b.id !== bookingId),
      };
    });

    const { error: err } = await supabase
      .from("bookings")
      .delete()
      .eq("id", bookingId);

    if (err) {
      // Rollback: re-add the removed booking
      if (removed) {
        setBookingsByDate((prev) => ({
          ...prev,
          [dateStr]: [...(prev[dateStr] || []), removed],
        }));
      }
      console.error("Failed to remove booking:", err);
      setError(err.message);
      onErrorRef.current?.(err.message);
      return { success: false, error: err.message };
    }

    return { success: true, removed };
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

      // Snapshot for rollback, then apply optimistically
      let snapshot = null;
      setBookingsByDate((prev) => {
        snapshot =
          (prev[fromDateStr] || []).find(
            (b) => b.id === updatedBooking.id,
          ) || null;

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
        status: updatedBooking.status || "No-show",
        confirmed: updatedBooking.confirmed ?? false,
      };

      const { data, error: err } = await supabase
        .from("bookings")
        .update(updatePayload)
        .eq("id", updatedBooking.id)
        .select("*")
        .single();

      if (err) {
        // Rollback to snapshot
        if (snapshot) {
          setBookingsByDate((prev) => {
            const next = { ...prev };
            if (fromDateStr === toDateStrValue) {
              next[fromDateStr] = (next[fromDateStr] || []).map((b) =>
                b.id === snapshot.id ? snapshot : b,
              );
            } else {
              next[toDateStrValue] = (next[toDateStrValue] || []).filter(
                (b) => b.id !== snapshot.id,
              );
              next[fromDateStr] = [...(next[fromDateStr] || []), snapshot];
            }
            return next;
          });
        }
        console.error("Failed to update booking:", err);
        setError(err.message);
        onErrorRef.current?.(err.message);
        return null;
      }

      const persisted = dbBookingsToArray([data], dogsById, humansById)[0];

      // Replace optimistic entry with confirmed server data
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
          const existing = (next[toDateStrValue] || []).filter(
            (b) => b.id !== persisted.id,
          );
          next[toDateStrValue] = [...existing, persisted];
        }
        return next;
      });

      return persisted;
    },
    [humansById, dogsById],
  );

  const fetchBookingHistoryForDog = useCallback(async (dogId) => {
    if (!supabase) return [];

    const { data, error: err } = await supabase
      .from("bookings")
      .select("*")
      .eq("dog_id", dogId)
      .order("booking_date", { ascending: false })
      .limit(10);

    if (err) {
      console.error("Failed to fetch booking history:", err);
      return [];
    }

    return (data || []).map((row) => ({
      id: row.id,
      date: row.booking_date,
      slot: row.slot,
      service: row.service,
      status: row.status,
      size: row.size,
      addons: row.addons || [],
      payment: row.payment,
    }));
  }, []);

  const refetch = useCallback(() => setRefreshKey((k) => k + 1), []);

  return {
    bookingsByDate,
    loading,
    error,
    addBooking,
    removeBooking,
    updateBooking,
    fetchBookingHistoryForDog,
    refetch,
  };
}
