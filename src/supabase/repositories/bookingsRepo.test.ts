import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { cancelCustomerBooking, rescheduleCustomerBooking } from "./bookingsRepo";

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
