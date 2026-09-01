import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import {
  cancelCustomerBooking,
  createMany,
  hasCustomerBookingsBefore,
  listCustomerBookings,
  listOlderCustomerBookings,
  rescheduleCustomerBooking,
} from "./bookingsRepo";

const TARGET = "40000000-0000-4000-8000-000000000001";
const GROUP = "40000000-0000-4000-8000-000000000010";
const SIBLING = "40000000-0000-4000-8000-000000000002";
const OTHER_TARGET = "40000000-0000-4000-8000-000000000099";

const validRow = {
  target_booking_id: TARGET,
  booking_group_id: GROUP,
  cancelled_booking_ids: [TARGET, SIBLING],
  cancelled_count: 2,
  cancelled_at: "2026-07-12T14:30:00.000Z",
};

function fakeClient(result: unknown) {
  const rpc = vi.fn().mockResolvedValue(result);
  return {
    client: { rpc } as unknown as SupabaseClient,
    rpc,
  };
}

describe("cancelCustomerBooking", () => {
  it("calls only the narrow cancellation RPC with booking ID and reason", async () => {
    const { client, rpc } = fakeClient({ data: [validRow], error: null });

    await cancelCustomerBooking(client, {
      bookingId: TARGET,
      reason: "Changed plans",
    });

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("cancel_customer_booking", {
      p_booking_id: TARGET,
      p_reason: "Changed plans",
    });
  });

  it("preserves structured remote errors", async () => {
    const remoteError = {
      code: "SDC01",
      message: "online_cancellation_disabled",
      details: "customerPortal.allowCancellations=false",
      hint: "contact_staff",
    };
    const { client } = fakeClient({ data: null, error: remoteError });

    const result = await cancelCustomerBooking(client, {
      bookingId: TARGET,
      reason: "Changed plans",
    });

    expect(result).toEqual({ receipt: null, error: remoteError });
  });

  it("returns a structured error when the RPC promise rejects", async () => {
    const rpc = vi.fn().mockRejectedValue(new Error("network offline"));
    const client = { rpc } as unknown as SupabaseClient;

    const result = await cancelCustomerBooking(client, {
      bookingId: TARGET,
      reason: "Changed plans",
    });

    expect(result.receipt).toBeNull();
    expect(result.error).toMatchObject({ message: "network offline" });
  });

  it.each([
    ["no rows", []],
    ["multiple rows", [validRow, validRow]],
    ["empty ID array", [{ ...validRow, cancelled_booking_ids: [], cancelled_count: 0 }]],
    ["target absent", [{ ...validRow, cancelled_booking_ids: [SIBLING], cancelled_count: 1 }]],
    ["count mismatch", [{ ...validRow, cancelled_count: 1 }]],
    ["malformed target", [{ ...validRow, target_booking_id: "not-a-uuid" }]],
    ["malformed timestamp", [{ ...validRow, cancelled_at: "not-a-date" }]],
  ])("rejects a malformed receipt: %s", async (_label, data) => {
    const { client } = fakeClient({ data, error: null });

    const result = await cancelCustomerBooking(client, {
      bookingId: TARGET,
      reason: "Changed plans",
    });

    expect(result.receipt).toBeNull();
    expect(result.error).toMatchObject({
      code: "INVALID_CANCELLATION_RECEIPT",
    });
  });

  it("maps one valid snake-case receipt", async () => {
    const { client } = fakeClient({ data: [validRow], error: null });

    const result = await cancelCustomerBooking(client, {
      bookingId: TARGET,
      reason: "Changed plans",
    });

    expect(result).toEqual({
      receipt: {
        targetBookingId: TARGET,
        bookingGroupId: GROUP,
        cancelledBookingIds: [TARGET, SIBLING],
        cancelledCount: 2,
        cancelledAt: "2026-07-12T14:30:00.000Z",
      },
      error: null,
    });
  });

  it("rejects a well-formed receipt for a different requested booking", async () => {
    const otherReceipt = {
      ...validRow,
      target_booking_id: OTHER_TARGET,
      cancelled_booking_ids: [OTHER_TARGET, SIBLING],
    };
    const { client } = fakeClient({ data: [otherReceipt], error: null });

    const result = await cancelCustomerBooking(client, {
      bookingId: TARGET,
      reason: "Changed plans",
    });

    expect(result.receipt).toBeNull();
    expect(result.error).toMatchObject({
      code: "INVALID_CANCELLATION_RECEIPT",
    });
  });

  it("accepts a valid singleton receipt with no group ID", async () => {
    const singleton = {
      ...validRow,
      booking_group_id: null,
      cancelled_booking_ids: [TARGET],
      cancelled_count: 1,
    };
    const { client } = fakeClient({ data: [singleton], error: null });

    const result = await cancelCustomerBooking(client, {
      bookingId: TARGET,
      reason: "Changed plans",
    });

    expect(result.receipt).toMatchObject({
      targetBookingId: TARGET,
      bookingGroupId: null,
      cancelledBookingIds: [TARGET],
      cancelledCount: 1,
    });
    expect(result.error).toBeNull();
  });
});

describe("rescheduleCustomerBooking", () => {
  it("uses one atomic RPC for replacement creation and original cancellation", async () => {
    const replacementIds = [
      "50000000-0000-4000-8000-000000000001",
      "50000000-0000-4000-8000-000000000002",
    ];
    const { client, rpc } = fakeClient({
      data: replacementIds.map((id) => ({ id })),
      error: null,
    });

    const result = await rescheduleCustomerBooking(client, {
      bookingId: TARGET,
      bookingDate: "2099-06-15",
      reason: "Rescheduled to 15 Jun 2099 at 9:00am",
      bookings: [
        {
          dogId: "42000000-0000-4000-8000-000000000001",
          slot: "09:00",
          service: "full-groom",
          size: "small",
        },
        {
          dogId: "42000000-0000-4000-8000-000000000002",
          slot: "10:00",
          service: "full-groom",
          size: "medium",
        },
      ],
    });

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("reschedule_customer_booking", {
      p_booking_id: TARGET,
      p_booking_date: "2099-06-15",
      p_bookings: [
        {
          dog_id: "42000000-0000-4000-8000-000000000001",
          slot: "09:00",
          service: "full-groom",
          size: "small",
          addons: [],
          payment: "Due at Pick-up",
        },
        {
          dog_id: "42000000-0000-4000-8000-000000000002",
          slot: "10:00",
          service: "full-groom",
          size: "medium",
          addons: [],
          payment: "Due at Pick-up",
        },
      ],
      p_reason: "Rescheduled to 15 Jun 2099 at 9:00am",
    });
    expect(result).toEqual({ ids: replacementIds, error: null });
  });
});

// The gates emit their reason code in the exception's DETAIL (#665), and
// PostgREST surfaces it as `details`. This repository narrowed the error to
// {code, message}, which silently discarded the code before any consumer could
// prefer it — leaving the portal wizard on prose inference while appearing to
// honour the contract. cancelCustomerBooking has had a test for exactly this
// property since it was written; createMany never did.
describe("createMany", () => {
  const input = [
    {
      dogId: "dog-1",
      bookingDate: "2099-06-15",
      slot: "09:00",
      service: "full-groom",
      size: "small",
    },
  ];

  it("preserves the reason code the gate emitted in DETAIL", async () => {
    const { client } = fakeClient({
      data: null,
      error: {
        code: "P0001",
        message: "Slot is full",
        details: "large_dog_ineligible",
      },
    });

    const result = await createMany(client, input);

    expect(result.ids).toEqual([]);
    expect(result.error).toEqual({
      code: "P0001",
      message: "Slot is full",
      details: "large_dog_ineligible",
    });
  });

  it("reports no code rather than undefined when a gate emits none", async () => {
    // Two raise sites are deliberately bare, and a database predating the
    // migration emits nothing. `null` is the documented "fall back to prose"
    // signal, so it must be stated, not left absent.
    const { client } = fakeClient({
      data: null,
      error: { code: "P0001", message: "Slot is full" },
    });

    const result = await createMany(client, input);

    expect(result.error?.details).toBeNull();
  });
});

describe("customer dashboard reads", () => {
  const DOG = "42000000-0000-4000-8000-000000000001";

  const dbRow = {
    id: TARGET,
    booking_date: "2099-06-15",
    slot: "09:00",
    size: "small",
    service: "full-groom",
    status: "Booked",
    payment: "Due at Pick-up",
    dog_id: DOG,
    visit_id: null,
    group_id: GROUP,
    staff_capacity_override: true,
    deposit_required: true,
    deposit_received_at: null,
    deposit_amount: 10,
    deposit_reference: "SDG-7K3M",
    deposit_due_by: "2099-06-14T09:00:00Z",
    dogs: { name: "Alfie", breed: "Boston Terrier", size: "small" },
  };

  // Thenable chainable builder standing in for the PostgREST query object.
  function fakeQueryClient(result: unknown) {
    const calls: Record<string, unknown[][]> = {};
    const q: Record<string, unknown> = {};
    for (const m of ["select", "in", "gte", "lt", "order", "limit"]) {
      calls[m] = [];
      q[m] = vi.fn((...args: unknown[]) => {
        calls[m].push(args);
        return q;
      });
    }
    q.then = (
      resolve: (v: unknown) => unknown,
      reject: (e: unknown) => unknown,
    ) => Promise.resolve(result).then(resolve, reject);
    const from = vi.fn(() => q);
    return { client: { from } as unknown as SupabaseClient, from, calls };
  }

  it("maps a snake_case row (with joined dog) to the app shape", async () => {
    const { client } = fakeQueryClient({ data: [dbRow], error: null });

    const { bookings, error } = await listCustomerBookings(client, {
      dogIds: [DOG],
      sinceDate: "2099-01-01",
    });

    expect(error).toBeNull();
    expect(bookings).toEqual([
      {
        id: TARGET,
        bookingDate: "2099-06-15",
        slot: "09:00",
        size: "small",
        service: "full-groom",
        status: "Booked",
        payment: "Due at Pick-up",
        dogId: DOG,
        visitId: null,
        groupId: GROUP,
        staffCapacityOverride: true,
        depositRequired: true,
        depositReceivedAt: null,
        depositAmount: 10,
        depositReference: "SDG-7K3M",
        depositDueBy: "2099-06-14T09:00:00Z",
        dog: { name: "Alfie", breed: "Boston Terrier", size: "small" },
      },
    ]);
  });

  it("returns empty without querying when the customer has no dogs", async () => {
    const { client, from } = fakeQueryClient({ data: [], error: null });

    const recent = await listCustomerBookings(client, {
      dogIds: [],
      sinceDate: "2099-01-01",
    });
    const older = await listOlderCustomerBookings(client, {
      dogIds: [],
      beforeDate: "2099-01-01",
      limit: 20,
    });
    const more = await hasCustomerBookingsBefore(client, {
      dogIds: [],
      beforeDate: "2099-01-01",
    });

    expect(recent).toEqual({ bookings: [], error: null });
    expect(older).toEqual({ bookings: [], error: null });
    expect(more).toBe(false);
    expect(from).not.toHaveBeenCalled();
  });

  it("surfaces a query error as an Error and no rows", async () => {
    const { client } = fakeQueryClient({
      data: null,
      error: { message: "permission denied" },
    });

    const { bookings, error } = await listCustomerBookings(client, {
      dogIds: [DOG],
      sinceDate: "2099-01-01",
    });

    expect(bookings).toEqual([]);
    expect(error?.message).toBe("permission denied");
  });

  it("passes the page limit through on the older page", async () => {
    const { client, calls } = fakeQueryClient({ data: [dbRow], error: null });

    await listOlderCustomerBookings(client, {
      dogIds: [DOG],
      beforeDate: "2099-06-15",
      limit: 20,
    });

    expect(calls.limit).toEqual([[20]]);
    expect(calls.lt).toEqual([["booking_date", "2099-06-15"]]);
  });

  it("answers the has-more probe from the count and degrades to false on error", async () => {
    const yes = fakeQueryClient({ count: 3, error: null });
    const no = fakeQueryClient({ count: 0, error: null });
    const broken = fakeQueryClient({ count: null, error: { message: "boom" } });

    expect(
      await hasCustomerBookingsBefore(yes.client, { dogIds: [DOG], beforeDate: "2099-01-01" }),
    ).toBe(true);
    expect(
      await hasCustomerBookingsBefore(no.client, { dogIds: [DOG], beforeDate: "2099-01-01" }),
    ).toBe(false);
    expect(
      await hasCustomerBookingsBefore(broken.client, { dogIds: [DOG], beforeDate: "2099-01-01" }),
    ).toBe(false);
  });
});
