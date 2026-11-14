import { describe, expect, it } from "vitest";
import { BOOKING_STATUS, DOG_SIZE, SALON_SLOTS } from "../../../constants/salon";
import type { DogSize } from "../../../types/index";
import { describeDayAvailability, findNextAvailableDate } from "./slotFit";

const luna = { id: "luna", name: "Luna", size: DOG_SIZE.SMALL, service: "full-groom" };
const biscuit = { id: "biscuit", name: "Biscuit", size: DOG_SIZE.SMALL, service: "bath-and-brush" };

let bookingSerial = 0;
function booked(slot: string, size: DogSize = DOG_SIZE.SMALL) {
  bookingSerial += 1;
  return {
    id: `occupied-${bookingSerial}`,
    slot,
    size,
    status: BOOKING_STATUS.BOOKED,
    dogName: "Occupied",
  };
}

describe("describeDayAvailability", () => {
  it("asks for a dog instead of calling an empty selection full", () => {
    const fits = describeDayAvailability({
      dogs: [],
      dayBookings: [],
      activeSlots: ["08:30"],
      dailyDogCap: 14,
    });
    expect(fits["08:30"]).toMatchObject({
      kind: "unselected",
      label: "Choose dogs to check",
      choosable: false,
    });
  });

  it("names every selected dog when they can share the drop-off", () => {
    const fits = describeDayAvailability({
      dogs: [luna, biscuit],
      dayBookings: [],
      activeSlots: SALON_SLOTS,
      dailyDogCap: 14,
    });
    expect(fits["08:30"]).toMatchObject({
      kind: "available",
      label: "Available for Luna + Biscuit",
      assignment: null,
      choosable: true,
    });
  });

  it("keeps a sequential drop-off available when the dogs cannot share one slot", () => {
    const fits = describeDayAvailability({
      dogs: [luna, biscuit],
      dayBookings: [booked("08:30")],
      activeSlots: SALON_SLOTS,
      dailyDogCap: 14,
    });
    expect(fits["08:30"].kind).toBe("available");
    expect(fits["08:30"].label).toBe("Available for Luna + Biscuit");
    expect(fits["08:30"].assignment).toContain("08:30");
    expect(fits["08:30"].assignment).toContain("09:00");
    expect(fits["08:30"].choosable).toBe(true);
  });

  it("says how many of the selected dogs fit when the group cannot", () => {
    const fits = describeDayAvailability({
      dogs: [luna, biscuit],
      dayBookings: [booked("08:30"), booked("09:00"), booked("09:00", DOG_SIZE.MEDIUM)],
      activeSlots: ["08:30", "09:00"],
      dailyDogCap: 14,
    });
    expect(fits["08:30"]).toMatchObject({
      kind: "partial",
      label: "Only fits 1 of 2 dogs",
      choosable: false,
    });
  });

  it("marks a slot full when none of the selected dogs can start there", () => {
    const fits = describeDayAvailability({
      dogs: [luna, biscuit],
      dayBookings: [booked("09:30"), booked("09:30", DOG_SIZE.MEDIUM)],
      activeSlots: ["09:30"],
      dailyDogCap: 14,
    });
    expect(fits["09:30"]).toMatchObject({ kind: "full", label: "Full", choosable: false });
  });

  it("does not treat a different service as a longer appointment", () => {
    const same = describeDayAvailability({
      dogs: [luna, biscuit],
      dayBookings: [],
      activeSlots: ["08:30"],
      dailyDogCap: 14,
    });
    const swapped = describeDayAvailability({
      dogs: [
        { ...luna, service: "puppy-groom" },
        { ...biscuit, service: "bath-and-deshed" },
      ],
      dayBookings: [],
      activeSlots: ["08:30"],
      dailyDogCap: 14,
    });
    expect(swapped["08:30"].label).toBe(same["08:30"].label);
    expect(swapped["08:30"].kind).toBe(same["08:30"].kind);
  });
});

describe("findNextAvailableDate", () => {
  it("skips a closed day and a full open day", () => {
    const next = findNextAvailableDate({
      fromDate: "2026-08-10",
      dogs: [luna],
      dailyDogCap: 14,
      daySettings: {
        "2026-08-11": { isOpen: false, extraSlots: [], overrides: {} },
        "2026-08-12": { isOpen: true, extraSlots: [], overrides: {} },
      },
      bookingsByDate: {
        "2026-08-12": SALON_SLOTS.flatMap((slot) => [booked(slot), booked(slot)]),
      },
    });
    expect(next).toBe("2026-08-17");
  });

  it("returns nothing when no dog is selected", () => {
    expect(findNextAvailableDate({
      fromDate: "2026-08-10",
      dogs: [],
      dailyDogCap: 14,
      daySettings: {},
      bookingsByDate: {},
    })).toBeNull();
  });
});
