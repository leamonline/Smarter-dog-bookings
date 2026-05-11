import { PRICING } from "../constants/index.ts";

export function computeRevenue(bookings, dogs) {
  let total = 0;
  for (const b of bookings || []) {
    const dog = dogs ? Object.values(dogs).find((d) => d.id === b._dogId) : null;
    if (dog?.customPrice != null && dog.customPrice > 0) {
      total += dog.customPrice;
    } else {
      const priceStr = PRICING[b.service]?.[b.size] || "";
      const num = parseFloat(priceStr.replace(/[^0-9.]/g, ""));
      if (!isNaN(num)) total += num;
    }
  }
  return total;
}
