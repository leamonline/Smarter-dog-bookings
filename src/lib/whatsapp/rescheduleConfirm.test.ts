import { describe, expect, it } from "vitest";

type SnapshotRow = {
  booking_id: string;
  dog_id: string;
  booking_date: string;
  slot: string;
  service: string | null;
};

type RescheduleConfirmModule = {
  reviewedBookingSnapshotsEqual?: (
    left: SnapshotRow[],
    right: SnapshotRow[],
  ) => boolean;
  gateFlowSession?: (args: {
    session: {
      flowMode?: "reschedule";
      status: string;
      bookingId?: string | null;
    };
    expired: boolean;
    loadCommittedReceipt: () => Promise<string[] | null>;
  }) => Promise<
    | { action: "continue" }
    | { action: "reject" }
    | { action: "replay"; bookingIds: string[] }
  >;
};

async function loadModule(): Promise<RescheduleConfirmModule> {
  return await import(
    "../../../supabase/functions/whatsapp-flow-endpoint/rescheduleConfirm.ts"
  ) as RescheduleConfirmModule;
}

describe("reviewedBookingSnapshotsEqual", () => {
  it("treats logically identical rows as equal when JSON object keys are permuted", async () => {
    const reviewed: SnapshotRow[] = [{
      booking_id: "booking-a",
      dog_id: "dog-a",
      booking_date: "2026-08-03",
      slot: "09:00",
      service: "full-groom",
    }];
    const live = [{
      service: "full-groom",
      slot: "09:00",
      booking_date: "2026-08-03",
      dog_id: "dog-a",
      booking_id: "booking-a",
    }];
    const { reviewedBookingSnapshotsEqual } = await loadModule();

    expect(reviewedBookingSnapshotsEqual?.(reviewed, live)).toBe(true);
  });
});

describe("gateFlowSession", () => {
  it("replays every durable id for a completed reschedule before status rejection", async () => {
    const { gateFlowSession } = await loadModule();

    const result = await gateFlowSession?.({
      session: {
        flowMode: "reschedule",
        status: "completed",
        bookingId: "representative-only",
      },
      expired: true,
      loadCommittedReceipt: async () => ["new-a", "new-b"],
    });

    expect(result).toEqual({
      action: "replay",
      bookingIds: ["new-a", "new-b"],
    });
  });

  it("rejects a completed reschedule with no receipt instead of fabricating representative-id success", async () => {
    const { gateFlowSession } = await loadModule();

    const result = await gateFlowSession?.({
      session: {
        flowMode: "reschedule",
        status: "completed",
        bookingId: "representative-only",
      },
      expired: true,
      loadCommittedReceipt: async () => null,
    });

    expect(result).toEqual({ action: "reject" });
  });

  it("leaves an ordinary active booking session unchanged without a receipt lookup", async () => {
    let receiptLookups = 0;
    const { gateFlowSession } = await loadModule();

    const result = await gateFlowSession?.({
      session: { status: "active", bookingId: null },
      expired: false,
      loadCommittedReceipt: async () => {
        receiptLookups += 1;
        return ["should-not-be-read"];
      },
    });

    expect(result).toEqual({ action: "continue" });
    expect(receiptLookups).toBe(0);
  });
});
