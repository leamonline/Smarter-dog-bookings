import { describe, expect, it, vi } from "vitest";
import {
  changeAppointmentCopy,
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
      changeDeadlineRule: "rolling_24h",
      allowCancellations: true,
    });
  });

  it("reports an unknown deadline rather than inventing one", () => {
    expect(parseCustomerPortalPolicy({ bookingHorizonDays: 180 })).toEqual({
      horizonDays: 180,
      changeDeadlineDescription: null,
      changeDeadlineRule: null,
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
    allowRescheduling: true,
    minCancellationHours: 24,
  };

  it("accepts a complete payload verbatim", () => {
    expect(parseChangeDeadlinePreview(complete)).toEqual(complete);
  });

  it("reads a missing or malformed rescheduling switch as not established", () => {
    // A server from before 20261110140000 sends no allowRescheduling. That is
    // "unknown", and must never be read as permission to move a booking.
    const { allowRescheduling: _omitted, ...older } = complete;
    expect(parseChangeDeadlinePreview(older)?.allowRescheduling).toBeNull();
    expect(
      parseChangeDeadlinePreview({ ...complete, allowRescheduling: "yes" })?.allowRescheduling,
    ).toBeNull();
    expect(
      parseChangeDeadlinePreview({ ...complete, allowRescheduling: false })?.allowRescheduling,
    ).toBe(false);
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

describe("changeAppointmentCopy", () => {
  // The owner's wording (22 November 2026), with every fact taken from the server.
  const rolling = { rule: "rolling_24h", minCancellationHours: 24, allowCancellations: true, allowRescheduling: true };

  it("says the owner's sentence with the notice period the server enforces", () => {
    expect(changeAppointmentCopy(rolling)).toBe(
      "You can reschedule up to 24 hours before your appointment. You can also cancel anytime before it starts, " +
        "although late cancellations (less than 24 hours\u2019 notice) may mean we ask for a deposit on future bookings.",
    );
  });

  it("follows a changed setting rather than repeating 24", () => {
    expect(changeAppointmentCopy({ ...rolling, minCancellationHours: 48 })).toContain("up to 48 hours before");
    expect(changeAppointmentCopy({ ...rolling, minCancellationHours: 48 })).toContain("less than 48 hours\u2019 notice");
    expect(changeAppointmentCopy({ ...rolling, minCancellationHours: 1 })).toContain("up to 1 hour before");
    expect(changeAppointmentCopy({ ...rolling, minCancellationHours: 1 })).toContain("less than 1 hour\u2019s notice");
  });

  it("names a deposit, as the Terms do, never a fee", () => {
    const text = changeAppointmentCopy(rolling) ?? "";
    expect(text).toMatch(/deposit on future bookings/);
    expect(text).not.toMatch(/charge|fee/i);
  });

  it("promises rescheduling only when the server said it is switched on", () => {
    for (const allowRescheduling of [false, null, undefined]) {
      const text = changeAppointmentCopy({ ...rolling, allowRescheduling }) ?? "";
      expect(text).not.toMatch(/reschedule/i);
      expect(text).toMatch(/^You can cancel anytime before it starts/);
    }
  });

  it.each([
    ["the 3:00 pm day-before rule", { ...rolling, rule: "previous_day_1500" }],
    ["an unknown rule", { ...rolling, rule: null }],
    ["cancellation switched off", { ...rolling, allowCancellations: false }],
    ["cancellation not yet known", { ...rolling, allowCancellations: undefined }],
    ["no hours from the server", { ...rolling, minCancellationHours: undefined }],
    ["zero hours", { ...rolling, minCancellationHours: 0 }],
  ])("stays silent for %s, so the server's own sentence shows instead", (_label, input) => {
    expect(changeAppointmentCopy(input)).toBeNull();
  });
});
