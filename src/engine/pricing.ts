import { computeBookingPricing, getDogByIdOrName } from "./bookingRules";
import type { Booking, Dog } from "../types/index";

/**
 * Day / week / lifetime money figure. Delegates to the single pricing source
 * (computeBookingPricing) and sums each booking's `subtotal` — the full
 * appointment value (service + add-ons + the dog's custom price), independent
 * of how much has actually been paid. This is what the booking cards show, so
 * card totals and revenue totals can't drift. "Revenue" here means appointment
 * value, not the amount still due at pick-up.
 */
export function computeRevenue(
  bookings: Booking[] | null | undefined,
  dogs: Record<string, Dog> | null | undefined,
): number {
  let total = 0;
  for (const b of bookings || []) {
    const dog = dogs ? getDogByIdOrName(dogs, b._dogId || b.dogName) : null;
    const { subtotal } = computeBookingPricing({
      service: b.service,
      size: b.size,
      addons: b.addons,
      priceOverride: b.priceOverride,
      customPrice: dog?.customPrice,
    });
    total += subtotal;
  }
  return total;
}
