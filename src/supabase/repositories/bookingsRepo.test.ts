import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { cancelCustomerBooking } from "./bookingsRepo";

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
