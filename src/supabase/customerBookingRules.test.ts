import { describe, expect, it, vi } from "vitest";
import {
  parseChangeDeadlinePreview,
  parseCustomerBookingHorizonDays,
  parseCustomerPortalPolicy,
  resolveChangeDeadlinePreview,
  resolveCustomerBookingHorizonDays,
  resolveCustomerPortalPolicy,
  UNKNOWN_PORTAL_POLICY,
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

describe("parseCustomerPortalPolicy", () => {
  // Captured from production `current_customer_booking_rules()` on 2026-08-20.
  const productionPayload = {
    termsUrl: "https://smarterdog.co.uk/terms",
    intakeEnabled: true,
    changeDeadline: {
      rule: "rolling_24h",
      description: "Changes close 24 hours before your appointment.",
    },
    customerPortal: {
      showHistory: true,
      allowRescheduling: true,
      allowCancellations: true,
      allowRepeatBooking: true,
    },
    bookingHorizonDays: 180,
  };

  it("reads the deadline sentence and cancellation flag from the production payload", () => {
    expect(parseCustomerPortalPolicy(productionPayload)).toEqual({
      horizonDays: 180,
      changeDeadlineDescription: "Changes close 24 hours before your appointment.",
      allowCancellations: true,
    });
  });

  it("reports an unknown deadline rather than inventing one", () => {
    expect(parseCustomerPortalPolicy({ bookingHorizonDays: 180 })).toEqual({
      horizonDays: 180,
      changeDeadlineDescription: null,
      allowCancellations: null,
    });
  });

  it.each([
    ["a non-string description", { changeDeadline: { description: 24 } }],
    ["a blank description", { changeDeadline: { description: "   " } }],
    ["a non-object changeDeadline", { changeDeadline: "24 hours" }],
  ])("treats %s as unknown", (_description, payload) => {
    expect(parseCustomerPortalPolicy(payload).changeDeadlineDescription).toBeNull();
  });

  it("distinguishes cancellations switched off from cancellations unknown", () => {
    expect(
      parseCustomerPortalPolicy({ customerPortal: { allowCancellations: false } })
        .allowCancellations,
    ).toBe(false);
    expect(
      parseCustomerPortalPolicy({ customerPortal: { allowCancellations: "yes" } })
        .allowCancellations,
    ).toBeNull();
  });

  it.each([[null], [undefined], ["not an object"]])(
    "falls back to the unknown policy for payload %o",
    (payload) => {
      expect(parseCustomerPortalPolicy(payload)).toEqual(UNKNOWN_PORTAL_POLICY);
    },
  );
});

describe("resolveCustomerPortalPolicy", () => {
  it("returns the unknown policy on an RPC error, so no promise is rendered", async () => {
    const client = { rpc: async () => ({ data: null, error: new Error("unavailable") }) };
    await expect(resolveCustomerPortalPolicy(client as never)).resolves.toEqual(
      UNKNOWN_PORTAL_POLICY,
    );
  });
});

describe("parseChangeDeadlinePreview", () => {
  // Telling a customer their booking is changeable when it is not is the
  // failure this whole path exists to prevent, so a half-formed payload has to
  // read as "not established", never as "fine".
  const complete = {
    deadline: "2026-09-01T08:30:00",
    passed: true,
    allowCancellations: true,
    minCancellationHours: 24,
  };

  it("accepts a complete payload verbatim", () => {
    expect(parseChangeDeadlinePreview(complete)).toEqual(complete);
  });

  it("accepts a numeric that arrived as a string", () => {
    // jsonb numerics normally come through as numbers, but a numeric column
    // can surface as a string; discarding a good answer over that would turn
    // a working warning off for no reason.
    expect(
      parseChangeDeadlinePreview({ ...complete, minCancellationHours: "48" }),
    ).toEqual({ ...complete, minCancellationHours: 48 });
  });

  it.each([
    ["deadline", { ...complete, deadline: undefined }],
    ["an empty deadline", { ...complete, deadline: "   " }],
    ["passed", { ...complete, passed: undefined }],
    ["a stringy passed", { ...complete, passed: "true" }],
    ["allowCancellations", { ...complete, allowCancellations: undefined }],
    ["minCancellationHours", { ...complete, minCancellationHours: undefined }],
    ["a nonsense number", { ...complete, minCancellationHours: "soon" }],
    ["a negative number", { ...complete, minCancellationHours: -1 }],
  ])("returns null when the payload is missing or malformed: %s", (_label, payload) => {
    expect(parseChangeDeadlinePreview(payload)).toBeNull();
  });

  it.each([[null], [undefined], ["not an object"], [42]])(
    "returns null for payload %o",
    (payload) => {
      expect(parseChangeDeadlinePreview(payload)).toBeNull();
    },
  );

  it("keeps a negative-free zero, which is a legitimate setting", () => {
    // minCancellationHours = 0 means "changeable right up to the appointment".
    // It is a real configuration, not a malformed one.
    expect(
      parseChangeDeadlinePreview({ ...complete, minCancellationHours: 0 }),
    ).toEqual({ ...complete, minCancellationHours: 0 });
  });
});

describe("resolveChangeDeadlinePreview", () => {
  it("returns null on an RPC error, so no warning is rendered", async () => {
    const client = { rpc: async () => ({ data: null, error: new Error("unavailable") }) };
    await expect(
      resolveChangeDeadlinePreview(client as never, { bookingDate: "2026-09-01", slot: "08:30" }),
    ).resolves.toBeNull();
  });

  it("reports the error so a silent warning outage is visible", async () => {
    const client = { rpc: async () => ({ data: null, error: new Error("unavailable") }) };
    const onRpcError = vi.fn();
    await resolveChangeDeadlinePreview(
      client as never,
      { bookingDate: "2026-09-01", slot: "08:30" },
      onRpcError,
    );
    expect(onRpcError).toHaveBeenCalledOnce();
  });
});
