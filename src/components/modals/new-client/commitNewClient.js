import { buildWizardBookings } from "./buildWizardBookings.js";

// Write-at-end commit for the New client wizard, sequenced human → each dog →
// each booked dog's booking. Pulled out of the component so the ordering,
// idempotent-retry, and partial-failure rules are unit-testable.
//
// `committed` is a mutable record ({ humanId, keyToDogId, bookedKeys:Set })
// carried across retries (the component keeps it in a ref). Each phase records
// what it wrote so a retry NEVER re-creates a human/dog or re-inserts a booking
// that already landed (which would 23505-collide, or double-book if the slot
// changed). Resolves { ok:true, humanId } or throws an Error whose message is
// safe to show the user.
export async function commitNewClient({
  addHuman,
  addDog,
  onAddBookings,
  human,
  phone,
  dogs,
  selections,
  dateStr,
  slot,
  committed,
  onCustomerCreated,
}) {
  const fullName = `${(human.name ?? "").trim()} ${(human.surname ?? "").trim()}`.trim();

  // 1. Customer (once).
  if (!committed.humanId) {
    const created = await addHuman({
      name: human.name.trim(),
      surname: human.surname.trim(),
      phone,
      email: (human.email ?? "").trim(),
      address: (human.address ?? "").trim(),
      sms: !!human.sms,
      whatsapp: !!human.whatsapp,
      notes: (human.notes ?? "").trim(),
    });
    const humanId = created?.id || created?.[0]?.id;
    if (!humanId) throw new Error("Couldn't create the customer. Please try again.");
    committed.humanId = humanId;
    onCustomerCreated?.();
  }
  const humanId = committed.humanId;

  // 2. Dogs (skip any already created on a prior attempt). Pass the owner
  //    explicitly — it was created moments ago and isn't in the live map yet.
  for (const dog of dogs) {
    if (committed.keyToDogId[dog.clientKey]) continue;
    const created = await addDog({
      name: dog.name,
      breed: dog.breed,
      size: dog.size,
      humanId,
      gender: dog.gender,
      colour: dog.colour,
      groomNotes: dog.groomNotes,
      _ownerOverride: { id: humanId, fullName },
    });
    const dogId = created?.id;
    if (!dogId) {
      throw new Error(
        `${human.name || "The customer"} and earlier dogs were saved, but "${dog.name}" didn't add. You can finish from their profile.`,
      );
    }
    committed.keyToDogId[dog.clientKey] = dogId;
  }

  // 3. Bookings — one row per booked dog, committed one at a time and recorded,
  //    so a retry after a partial capacity failure skips the ones that landed.
  const booked = (dogs ?? []).filter((d) => selections[d.clientKey]?.booked);
  for (const dog of booked) {
    if (committed.bookedKeys.has(dog.clientKey)) continue;
    const payloads = buildWizardBookings({
      humanId,
      keyToDogId: committed.keyToDogId,
      dogs: [dog],
      selections,
      dateStr,
      slot,
    });
    const res = await onAddBookings(payloads, dateStr);
    if (!res?.ok) {
      const saved = committed.bookedKeys.size;
      throw new Error(
        saved > 0
          ? `Booked ${saved} of ${booked.length} dogs, but ${dog.name}'s didn't go through${
              res?.error ? ` — ${res.error}` : ""
            }. Pick another slot to finish the rest.`
          : res?.error ||
              "The customer and dogs were saved, but the booking didn't go through — try another slot or book from their profile.",
      );
    }
    committed.bookedKeys.add(dog.clientKey);
  }

  return { ok: true, humanId };
}
