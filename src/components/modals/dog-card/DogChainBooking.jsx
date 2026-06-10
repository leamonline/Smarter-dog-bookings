import { lazy, Suspense } from "react";
import { BOOKING_STATUS } from "../../../constants/index";

// Lazy so the chain-booking bundle is only fetched when staff actually
// open the flow — viewing a dog never pays for it.
const ChainBookingModal = lazy(() =>
  import("../ChainBookingModal.jsx").then((m) => ({ default: m.ChainBookingModal })),
);

/**
 * The dog's most recent booking — gates the "Recurring Bookings" button
 * and seeds the chain modal's defaults.
 */
export function findLastBooking(dog, bookingsByDate) {
  if (!dog?.id && !dog?.name) return null;
  const allBookings = Object.values(bookingsByDate || {}).flat();
  const dogBookings = allBookings.filter(
    (b) => b.dog_id === dog.id || b.dogName === dog.name,
  );
  if (dogBookings.length === 0) return null;
  return dogBookings.sort((a, b) => (b.booking_date || "").localeCompare(a.booking_date || ""))[0] || null;
}

/**
 * Sibling modal wrapper for the chain-booking flow. Mounted by the dog
 * card only after staff press "Recurring Bookings"; maps each confirmed
 * chain link to a handleAdd booking insert under one shared group_id.
 */
export function DogChainBooking({
  dog,
  lastBooking,
  owner,
  onClose,
  onUpdateDog,
  handleAdd,
}) {
  return (
    <Suspense fallback={null}>
      <ChainBookingModal
        dog={dog}
        lastBooking={lastBooking}
        onClose={onClose}
        onUpdateDog={onUpdateDog}
        onCreateChain={async (chain) => {
          const chainId = crypto.randomUUID();
          for (const link of chain) {
            await handleAdd({
              dogName: dog.name,
              dog_id: dog.id,
              breed: dog.breed,
              size: link.size,
              service: link.service,
              slot: link.slot,
              owner: owner?.id || dog.human_id || "",
              ownerName: owner
                ? `${owner.name || ""} ${owner.surname || ""}`.trim()
                : "",
              status: BOOKING_STATUS.BOOKED,
              group_id: chainId,
              // Per-link override flag from ChainBookingModal — useBookings.add
              // conditionally spreads it into the insert payload so the
              // trigger stamps _by/_at.
              ...(link.staffCapacityOverride
                ? { staff_capacity_override: true }
                : {}),
            }, link.dateStr);
          }
        }}
      />
    </Suspense>
  );
}
