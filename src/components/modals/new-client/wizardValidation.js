// Pure per-step gate predicates for the New client wizard. No React/Supabase
// so they're unit-testable in isolation and keep the step "Next"/"Confirm"
// buttons honest.

import { isRealPersonName } from "../../../utils/text";

/** Step 1 → 2: customer needs a real first name (not "?"/"n/a" — see
 *  isRealPersonName; StepCustomer shows the inline hint), a surname and a
 *  phone (presence only; phone *format* is checked via validateContactPhone
 *  at the call site). */
export function canAdvanceCustomer(human) {
  return Boolean(
    human &&
      isRealPersonName(String(human.name ?? "")) &&
      String(human.surname ?? "").trim() &&
      String(human.phone ?? "").trim(),
  );
}

/** Step 2 → 3: at least one dog, each with a name and a size. */
export function canAdvanceDogs(dogs) {
  return (
    Array.isArray(dogs) &&
    dogs.length >= 1 &&
    dogs.every((d) => String(d?.name ?? "").trim() && d?.size)
  );
}

/** The dogs the staff member ticked to book now (the rest are still created). */
export function bookedDogs(dogs, selections) {
  return (dogs ?? []).filter((d) => selections?.[d.clientKey]?.booked);
}

/** Confirm: a date + slot, at least one booked dog, and every booked dog has a service. */
export function canConfirm(dogs, selections, dateStr, slot) {
  if (!dateStr || !slot) return false;
  const booked = bookedDogs(dogs, selections);
  if (booked.length === 0) return false;
  return booked.every((d) => selections[d.clientKey]?.service);
}
