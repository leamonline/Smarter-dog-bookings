// Endpoint-level reschedule completion races exercised through the
// side-effect-free production seam.
import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { handleRescheduleConfirm } from "./rescheduleConfirm.ts";

type StoredSession = {
  status: "active" | "completed" | "failed";
  bookingIds: string[];
};

class DurableFlowState {
  readonly session: StoredSession;
  private readonly receipt: string[] | null;
  failedWrites = 0;

  constructor(args: { session: StoredSession; receipt: string[] | null }) {
    this.session = args.session;
    this.receipt = args.receipt;
  }

  async loadCommittedReceipt(): Promise<string[] | null> {
    return this.receipt ? [...this.receipt] : null;
  }

  async complete(bookingIds: string[]): Promise<void> {
    this.session.status = "completed";
    this.session.bookingIds = [...bookingIds];
  }

  async fail(): Promise<void> {
    this.failedWrites += 1;
    // This models the durable conditional update required at the endpoint's
    // session boundary: a stale request cannot demote a terminal success.
    if (this.session.status === "active") this.session.status = "failed";
  }
}

Deno.test("a stale active confirm replays the committed receipt before old-visit validation can fail", async () => {
  const durable = new DurableFlowState({
    session: { status: "completed", bookingIds: ["new-dog-a", "new-dog-b"] },
    receipt: ["new-dog-a", "new-dog-b"],
  });

  let atomicCalls = 0;
  const result = await handleRescheduleConfirm({
    // Simulates the concurrent delivery's already-loaded, stale object.
    inMemorySession: { flowToken: "flow-race", status: "active" },
    loadCommittedReceipt: () => durable.loadCommittedReceipt(),
    runAtomicReschedule: async () => {
      atomicCalls += 1;
      return {
        ok: false as const,
        kind: "old_visit_unavailable" as const,
      };
    },
    completeSession: (bookingIds: string[]) => durable.complete(bookingIds),
    failSession: () => durable.fail(),
  });

  assertEquals(result, { ok: true, bookingIds: ["new-dog-a", "new-dog-b"], replayed: true });
  assertEquals(atomicCalls, 0);
  assertEquals(durable.session.status, "completed");
  assertEquals(durable.failedWrites, 0);
});

Deno.test("a receipt committed between lookups wins over a stale atomic failure", async () => {
  const durable = new DurableFlowState({
    session: { status: "completed", bookingIds: ["new-dog-a", "new-dog-b"] },
    receipt: null,
  });
  let receiptLookups = 0;
  let atomicCalls = 0;

  const result = await handleRescheduleConfirm({
    inMemorySession: { flowToken: "flow-second-lookup-race", status: "active" },
    loadCommittedReceipt: async () => {
      receiptLookups += 1;
      return receiptLookups === 1 ? null : ["new-dog-a", "new-dog-b"];
    },
    runAtomicReschedule: async () => {
      atomicCalls += 1;
      return {
        ok: false as const,
        kind: "old_visit_unavailable" as const,
      };
    },
    completeSession: (bookingIds: string[]) => durable.complete(bookingIds),
    failSession: () => durable.fail(),
  });

  assertEquals(result, { ok: true, bookingIds: ["new-dog-a", "new-dog-b"], replayed: true });
  assertEquals(receiptLookups, 2);
  assertEquals(atomicCalls, 1);
  assertEquals(durable.failedWrites, 0);
  assertEquals(durable.session.status, "completed");
});

Deno.test("a completed session replays every stored multi-dog replacement id", async () => {
  const durable = new DurableFlowState({
    session: { status: "completed", bookingIds: ["new-dog-a", "new-dog-b"] },
    receipt: ["new-dog-a", "new-dog-b"],
  });

  const result = await handleRescheduleConfirm({
    inMemorySession: { flowToken: "flow-multi-dog", status: "completed" },
    loadCommittedReceipt: () => durable.loadCommittedReceipt(),
    runAtomicReschedule: async () => {
      throw new Error("a completed Flow must replay instead of allocating again");
    },
    completeSession: (bookingIds: string[]) => durable.complete(bookingIds),
    failSession: () => durable.fail(),
  });

  assertEquals(result, { ok: true, bookingIds: ["new-dog-a", "new-dog-b"], replayed: true });
  assertEquals(durable.session.status, "completed");
  assertEquals(durable.session.bookingIds, ["new-dog-a", "new-dog-b"]);
});

Deno.test("a completed session with a pruned receipt cannot fabricate representative-id success", async () => {
  const durable = new DurableFlowState({
    session: { status: "completed", bookingIds: ["representative-only"] },
    receipt: null,
  });
  let atomicCalls = 0;

  const result = await handleRescheduleConfirm({
    inMemorySession: {
      flowToken: "flow-pruned-receipt",
      status: "completed",
      bookingIds: ["representative-only"],
    },
    loadCommittedReceipt: () => durable.loadCommittedReceipt(),
    runAtomicReschedule: async () => {
      atomicCalls += 1;
      return {
        ok: false as const,
        kind: "old_visit_unavailable" as const,
      };
    },
    completeSession: (bookingIds: string[]) => durable.complete(bookingIds),
    failSession: () => durable.fail(),
  });

  assertEquals(result.ok, false);
  assertEquals(atomicCalls, 0);
  assertEquals(durable.failedWrites, 0);
  assertEquals(durable.session.status, "completed");
});
