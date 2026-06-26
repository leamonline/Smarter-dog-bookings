import { bookedDogs } from "./wizardValidation.js";

// Build the booking objects the staff `onAdd` handler expects — the SAME shape
// as NewBookingModal.buildBookingsForOverride: one row per BOOKED dog at the
// chosen date/slot, carrying the resolved real dog id (`_dogId`) and owner.
// Like the existing staff multi-dog flow, no `group_id` — each dog is its own
// row, grouped visually by owner + slot + date.
//
// Pure; `makeId` is injectable so tests are deterministic.
export function buildWizardBookings(
  { humanId, keyToDogId, dogs, selections, dateStr, slot },
  makeId = () => crypto.randomUUID(),
) {
  return bookedDogs(dogs, selections).map((dog) => {
    const sel = selections[dog.clientKey] ?? {};
    return {
      id: makeId(),
      slot,
      dogName: dog.name,
      breed: dog.breed,
      size: dog.size || "small",
      service: sel.service,
      addons: sel.addons ?? [],
      owner: humanId,
      _dogId: keyToDogId[dog.clientKey],
      _bookingDate: dateStr,
    };
  });
}
