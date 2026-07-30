import { describe, expect, it } from "vitest";
import {
  parseCustomerBookingHorizonDays,
  resolveCustomerBookingHorizonDays,
} from "./customerBookingRules";

describe("parseCustomerBookingHorizonDays", () => {
  it.each([
    [{ bookingHorizonDays: 180 }, 180],
    [{ bookingHorizonDays: 1 }, 1],
    [{ bookingHorizonDays: 730 }, 730],
    [{ bookingHorizonDays: 180.5 }, 28],
    [{ bookingHorizonDays: 0 }, 28],
    [{ bookingHorizonDays: 731 }, 28],
    [{ bookingHorizonDays: "180" }, 28],
    [{}, 28],
    [null, 28],
    [undefined, 28],
  ])("returns %i for customer booking rules payload %o", (payload, expected) => {
    expect(parseCustomerBookingHorizonDays(payload)).toBe(expected);
  });
});

describe("resolveCustomerBookingHorizonDays", () => {
  it("accepts the production-shaped 180-day customer RPC payload", async () => {
    const client = {
      rpc: async () => ({ data: { bookingHorizonDays: 180 }, error: null }),
    };

    await expect(resolveCustomerBookingHorizonDays(client as never)).resolves.toBe(180);
  });

  it.each([
    ["an RPC error", { data: null, error: new Error("unavailable") }],
    ["a malformed RPC payload", { data: { bookingHorizonDays: 180.5 }, error: null }],
  ])("keeps the legacy fallback for %s", async (_description, response) => {
    const client = { rpc: async () => response };

    await expect(resolveCustomerBookingHorizonDays(client as never)).resolves.toBe(28);
  });
});
