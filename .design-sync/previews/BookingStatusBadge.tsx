import { BookingStatusBadge } from "smarter-dog-ui";

export const Statuses = () => (
  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
    <BookingStatusBadge status="Booked" />
    <BookingStatusBadge status="Reconfirmed" />
    <BookingStatusBadge status="Arrived" />
    <BookingStatusBadge status="Ready for collection" />
    <BookingStatusBadge status="Completed" />
    <BookingStatusBadge status="No-show" />
    <BookingStatusBadge status="Cancelled" />
  </div>
);

export const Sizes = () => (
  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
    <BookingStatusBadge status="Arrived" size="sm" />
    <BookingStatusBadge status="Arrived" size="md" />
  </div>
);

// `onTint` drops the pill fill and keeps only the ink, for a card that already
// carries the status tint. Shown here on the matching tinted surface.
export const OnTint = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
    <div style={{ background: "#D3EAE4", padding: "10px 14px", borderRadius: 10 }}>
      <BookingStatusBadge status="Arrived" variant="onTint" />
    </div>
    <div style={{ background: "#F7E6BE", padding: "10px 14px", borderRadius: 10 }}>
      <BookingStatusBadge status="Ready for collection" variant="onTint" />
    </div>
  </div>
);

// A Cancelled row carrying a no-show reason resolves to the no-show tone.
export const NoShowFromCancelled = () => (
  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
    <BookingStatusBadge status="Cancelled" cancelReason="No-show" />
    <BookingStatusBadge status="Cancelled" cancelReason="Rescheduled via WhatsApp" />
  </div>
);
