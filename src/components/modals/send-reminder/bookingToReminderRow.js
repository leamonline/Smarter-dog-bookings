// Adapts an app Booking object onto the row shape SendReminderModal expects
// (it was built for the dashboard's reminder rows). Lets the booking-detail
// reminder card reuse the same modal. The reminder-send edge function gathers
// the customer's whole day itself, so bookingIds only needs the anchor — the
// modal uses it for service-name display, not for the send.
export function bookingToReminderRow(booking) {
  return {
    anchorBookingId: booking.id,
    customerKey: booking._ownerId ?? null,
    bookingIds: [booking.id],
    customerName: booking.owner || "",
    dogNames: booking.dogName ? [booking.dogName] : [],
    dogNamesDisplay: booking.dogName || "",
    slot: booking.slot || "",
    slots: booking.slot ? [booking.slot] : [],
    // 'sent' opens the modal's existing read-only "already sent" view, which
    // is exactly the no-resend behaviour we want. undefined → composer view.
    reminderStatus: booking.reminderState === "sent" ? "sent" : undefined,
    reminderChannel: booking.reminderChannel ?? null,
    reminderSentAt: booking.reminderSentAt ?? null,
  };
}
