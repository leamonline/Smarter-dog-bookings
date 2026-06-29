import { describe, it, expect } from "vitest";

import { buildWeeklyCashUp } from "./cashup";
import { BOOKING_STATUS } from "../constants/salon";

// Pricing reference (from constants/salon PRICING + Flea Bath £10):
//   full-groom small £42 · bath-and-brush medium £42 · bath-and-deshed large £55
const dogs = {
  d1: { id: "d1", name: "Bella" },
  d2: { id: "d2", name: "Max" },
  vip: { id: "vip", name: "Rex", customPrice: 55 },
} as never;

function booking(overrides: Record<string, unknown>) {
  return {
    service: "full-groom",
    size: "small",
    addons: [],
    payment: "Due at Pick-up",
    status: BOOKING_STATUS.BOOKED,
    ...overrides,
  } as never;
}

const ZERO_BREAKDOWN = {
  paid: { count: 0, amount: 0 },
  deposit: { count: 0, amount: 0 },
  due: { count: 0, amount: 0 },
};

describe("buildWeeklyCashUp", () => {
  it("returns an empty cash-up for a week with no open days", () => {
    const result = buildWeeklyCashUp([], {}, dogs);
    expect(result.days).toEqual([]);
    expect(result.weekTotal).toBe(0);
    expect(result.weekDueTotal).toBe(0);
    expect(result.weekStatusBreakdown).toEqual(ZERO_BREAKDOWN);
  });

  it("renders an open day with no bookings as £0 with no rows", () => {
    const result = buildWeeklyCashUp(["2026-06-01"], {}, dogs);
    expect(result.days).toHaveLength(1);
    expect(result.days[0]).toMatchObject({
      dateStr: "2026-06-01",
      rows: [],
      dayTotal: 0,
      dueTotal: 0,
      statusBreakdown: ZERO_BREAKDOWN,
    });
    expect(result.weekTotal).toBe(0);
  });

  it("sums a single due booking into the expected total", () => {
    const bookings = { "2026-06-01": [booking({ _dogId: "d1" })] };
    const result = buildWeeklyCashUp(["2026-06-01"], bookings, dogs);
    expect(result.weekTotal).toBe(42);
    expect(result.weekDueTotal).toBe(42);
    expect(result.days[0].rows[0]).toMatchObject({
      subtotal: 42,
      amountDue: 42,
      status: "due",
    });
    expect(result.days[0].statusBreakdown.due).toEqual({ count: 1, amount: 42 });
  });

  it("adds add-ons (Flea Bath £10) on top of the base price", () => {
    const bookings = {
      "2026-06-01": [booking({ _dogId: "d1", addons: ["Flea Bath"] })],
    };
    const result = buildWeeklyCashUp(["2026-06-01"], bookings, dogs);
    expect(result.weekTotal).toBe(52);
  });

  it("honours a dog's custom price and still adds add-ons on top", () => {
    const bookings = {
      "2026-06-01": [booking({ _dogId: "vip", addons: ["Flea Bath"] })],
    };
    const result = buildWeeklyCashUp(["2026-06-01"], bookings, dogs);
    // £55 custom price + £10 flea bath
    expect(result.days[0].rows[0].subtotal).toBe(65);
  });

  it("treats a deposit-paid booking as the deposit bucket and nets the deposit off the amount due", () => {
    const bookings = {
      "2026-06-01": [booking({ _dogId: "d1", payment: "Deposit Paid" })],
    };
    const result = buildWeeklyCashUp(["2026-06-01"], bookings, dogs);
    const row = result.days[0].rows[0];
    expect(row.subtotal).toBe(42);
    expect(row.amountDue).toBe(32); // 42 − £10 default deposit
    expect(row.status).toBe("deposit");
    expect(result.days[0].statusBreakdown.deposit).toEqual({ count: 1, amount: 42 });
    expect(result.weekDueTotal).toBe(32);
  });

  it("treats a paid-in-full booking as the paid bucket with nothing left to collect", () => {
    const bookings = {
      "2026-06-01": [booking({ _dogId: "d1", payment: "Paid in Full" })],
    };
    const result = buildWeeklyCashUp(["2026-06-01"], bookings, dogs);
    const row = result.days[0].rows[0];
    expect(row.amountDue).toBe(0);
    expect(row.status).toBe("paid");
    expect(result.days[0].dueTotal).toBe(0);
    expect(result.days[0].statusBreakdown.paid).toEqual({ count: 1, amount: 42 });
  });

  it("excludes cancelled bookings from every total", () => {
    const bookings = {
      "2026-06-01": [
        booking({ _dogId: "d1" }),
        booking({ _dogId: "d2", status: BOOKING_STATUS.CANCELLED }),
      ],
    };
    const result = buildWeeklyCashUp(["2026-06-01"], bookings, dogs);
    expect(result.days[0].rows).toHaveLength(1);
    expect(result.weekTotal).toBe(42);
  });

  it("excludes closed days entirely (only openDates are rendered)", () => {
    const bookings = {
      "2026-06-01": [booking({ _dogId: "d1" })], // Mon — open
      "2026-06-04": [
        booking({ _dogId: "d2", size: "large", service: "bath-and-deshed" }), // Thu — closed (£55)
      ],
    };
    const result = buildWeeklyCashUp(["2026-06-01"], bookings, dogs);
    expect(result.days).toHaveLength(1);
    expect(result.days[0].dateStr).toBe("2026-06-01");
    expect(result.weekTotal).toBe(42); // the closed Thursday's £55 never counts
  });

  it("aggregates multi-day totals and the week-level payment-status breakdown", () => {
    const bookings = {
      "2026-06-01": [
        booking({ _dogId: "d1", payment: "Paid in Full" }), // £42 paid
        booking({
          _dogId: "d2",
          size: "medium",
          service: "bath-and-brush",
          payment: "Deposit Paid",
        }), // £42 deposit, £32 due
      ],
      "2026-06-02": [booking({ _dogId: "d1", addons: ["Flea Bath"] })], // £52 due
    };
    const result = buildWeeklyCashUp(["2026-06-01", "2026-06-02"], bookings, dogs);

    expect(result.days).toHaveLength(2);
    expect(result.days[0]).toMatchObject({ dayTotal: 84, dueTotal: 32 });
    expect(result.days[1]).toMatchObject({ dayTotal: 52, dueTotal: 52 });
    expect(result.weekTotal).toBe(136);
    expect(result.weekDueTotal).toBe(84);
    expect(result.weekStatusBreakdown).toEqual({
      paid: { count: 1, amount: 42 },
      deposit: { count: 1, amount: 42 },
      due: { count: 1, amount: 52 },
    });
  });
});
