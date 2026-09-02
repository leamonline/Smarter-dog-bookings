// ============================================================
// src/components/views/inbox/hooks/useSlotCapacityPreview.js
//
// Reads the bookings for a single date and feeds them through the
// capacity engine to answer "would this proposed booking fit?".
// Used by BookingCapacityPreview inside BookingActionPanel.
//
// We refetch on date change only — bookings rarely flip during the
// edit window, and BookingActionPanel only renders when the action
// is pending so the values are bounded.
// ============================================================

import { useEffect, useState } from "react";
import { useStaffInboxReads } from "../../../../supabase/hooks/useStaffInboxReads";
import { SALON_SLOTS, BOOKING_STATUS } from "../../../../constants/index.ts";
import { classifyProposedBooking } from "./slotCapacityPreview.js";

export function useSlotCapacityPreview({ date, slot, size }) {
  const inboxReads = useStaffInboxReads();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    if (!date) {
      setBookings([]);
      setLoading(false);
      setError(null);
      return undefined;
    }

    if (!inboxReads.connected) {
      setBookings([]);
      setLoading(false);
      setError(null);
      return undefined;
    }

    setLoading(true);
    setError(null);

    (async () => {
      const { rows: data, error: err } = await inboxReads.listSeatsOnDate(date);

      if (cancelled) return;

      if (err) {
        setError(err.message);
        setBookings([]);
        setLoading(false);
        return;
      }

      // Shape into the minimal Booking the engine needs. We don't
      // hydrate dog names / owners / services here — capacity logic
      // only touches slot / size / _dogId.
      const shaped = (data || []).map((row) => ({
        id: row.id,
        slot: row.slot,
        size: row.size,
        _dogId: row.dog_id,
        _bookingDate: date,
        // Padding for type-shape; the engine doesn't read these.
        dogName: "",
        breed: "",
        service: "full-groom",
        owner: "",
        status: BOOKING_STATUS.BOOKED,
        addons: [],
        pickupBy: "",
        payment: "",
        confirmed: true,
        _ownerId: null,
        _pickupById: null,
        _groupId: null,
      }));

      setBookings(shaped);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [date, inboxReads]);

  const classification = classifyProposedBooking({
    bookings,
    slot,
    size,
    activeSlots: SALON_SLOTS,
  });

  return {
    ...classification,
    bookings,
    loading,
    error,
  };
}
