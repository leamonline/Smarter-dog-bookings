import { describe, it, expect } from "vitest";
import {
  DEFAULT_DEPOSIT_RELEASE_HOURS,
  isDepositReference,
  depositDueByMs,
  isAwaitingDeposit,
  partitionSlotsForHuman,
  buildAwaitingDeposits,
} from "./deposits";
import { londonWallClockToUtcMs } from "./today";

describe("isDepositReference", () => {
  it("accepts SDG- plus four unambiguous chars", () => {
    expect(isDepositReference("SDG-7K3M")).toBe(true);
    expect(isDepositReference("SDG-ABCD")).toBe(true);
  });
  it("rejects ambiguous chars, wrong length, wrong prefix", () => {
    expect(isDepositReference("SDG-0OI1")).toBe(false); // 0/O/I/1 excluded from the alphabet
    expect(isDepositReference("SDG-AB")).toBe(false);
    expect(isDepositReference("XXX-ABCD")).toBe(false);
    expect(isDepositReference("")).toBe(false);
  });
});

describe("depositDueByMs", () => {
  // Booking made Mon 2026-07-13 09:00 UTC for Wed 2026-07-15 10:00 London.
  const created = Date.UTC(2026, 6, 13, 9, 0, 0);
  it("is created + 12h when the appointment is further away", () => {
    expect(depositDueByMs(created, "2026-07-15", "10:00")).toBe(
      created + DEFAULT_DEPOSIT_RELEASE_HOURS * 3_600_000,
    );
  });
  it("caps at the appointment start when that is sooner", () => {
    // Same-day: created 09:00 UTC (=10:00 London), appointment 13:00 London.
    const start = londonWallClockToUtcMs("2026-07-13", "13:00");
    expect(depositDueByMs(created, "2026-07-13", "13:00")).toBe(start);
  });
  it("honours a custom release window", () => {
    expect(depositDueByMs(created, "2026-07-20", "10:00", 2)).toBe(
      created + 2 * 3_600_000,
    );
  });
});

describe("isAwaitingDeposit", () => {
  const base = {
    depositRequired: true,
    depositReceivedAt: null,
    payment: "Due at Pick-up",
    status: "Booked",
  };
  it("is true for an unpaid deposit-required Booked row", () => {
    expect(isAwaitingDeposit(base)).toBe(true);
  });
  it("is false once Deposit Paid, Paid in Full, received stamp, cancelled, or untagged", () => {
    expect(isAwaitingDeposit({ ...base, payment: "Deposit Paid" })).toBe(false);
    expect(isAwaitingDeposit({ ...base, payment: "Paid in Full" })).toBe(false);
    expect(isAwaitingDeposit({ ...base, depositReceivedAt: "2026-07-13T10:00:00Z" })).toBe(false);
    expect(isAwaitingDeposit({ ...base, status: "Cancelled" })).toBe(false);
    expect(isAwaitingDeposit({ ...base, depositRequired: false })).toBe(false);
  });
});

describe("partitionSlotsForHuman", () => {
  const slots = [{ dropOffTime: "08:30" }, { dropOffTime: "09:00" }, { dropOffTime: "10:00" }];
  it("drops blocked slots and floats preferred first", () => {
    const { preferred, rest } = partitionSlotsForHuman(slots, {
      blockedSlots: ["09:00"],
      preferredSlots: ["10:00"],
    });
    expect(preferred.map((s) => s.dropOffTime)).toEqual(["10:00"]);
    expect(rest.map((s) => s.dropOffTime)).toEqual(["08:30"]);
  });
  it("passes everything through untouched with no rules", () => {
    const { preferred, rest } = partitionSlotsForHuman(slots, {});
    expect(preferred).toEqual([]);
    expect(rest).toEqual(slots);
  });
});

describe("buildAwaitingDeposits", () => {
  const now = new Date("2026-07-13T10:00:00Z");
  const mk = (id: string, dueBy: string | null, extra: Record<string, unknown> = {}) => ({
    id,
    status: "Booked",
    payment: "Due at Pick-up",
    depositRequired: true,
    depositReceivedAt: null,
    depositDueBy: dueBy,
    ...extra,
  });
  it("lists awaiting rows, overdue first then soonest-due", () => {
    const rows = [
      mk("later", "2026-07-13T20:00:00Z"),
      mk("overdue", "2026-07-13T09:00:00Z"),
      mk("soon", "2026-07-13T11:00:00Z"),
      mk("paid", "2026-07-13T11:00:00Z", { payment: "Deposit Paid" }),
      mk("untagged", null, { depositRequired: false }),
    ];
    const out = buildAwaitingDeposits(rows, now);
    expect(out.map((e) => (e.booking as { id: string }).id)).toEqual(["overdue", "soon", "later"]);
    expect(out[0].overdue).toBe(true);
    expect(out[1].minutesLeft).toBe(60);
  });
});
