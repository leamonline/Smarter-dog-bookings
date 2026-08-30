import { describe, expect, it } from "vitest";
import {
  CONFIRM_FAILURE_CODES,
  CONFIRM_FAILURE_DETAIL_MAX,
  categoriseConfirmFailure,
} from "./confirmFailure";

const notFlagged = { isTriggerError: false, isHandledReschedule: false };

describe("categoriseConfirmFailure", () => {
  it("trusts the wizard's own gate detection over everything else", () => {
    // The flags outrank message inspection: the wizard's trigger matcher
    // chooses the customer's copy, and the logged category must never
    // disagree with what the customer was shown.
    const failure = categoriseConfirmFailure(
      { code: "P0001", message: "Slot is full" },
      { isTriggerError: true, isHandledReschedule: false },
    );
    expect(failure.code).toBe("gate_rejected");
    expect(failure.detail).toBe("[P0001] Slot is full");
  });

  it("classifies handled reschedule codes as reschedule_rule", () => {
    const failure = categoriseConfirmFailure(
      { code: "SDC02", message: "Within 24 hours" },
      { isTriggerError: false, isHandledReschedule: true },
    );
    expect(failure.code).toBe("reschedule_rule");
  });

  it("recognises each browser's fetch-rejection message as network_failed", () => {
    const messages = [
      "TypeError: Failed to fetch", // Chrome, wrapped by supabase-js
      "NetworkError when attempting to fetch a resource.", // Firefox
      "Load failed", // Safari
      "network request failed",
      "The operation timed out",
    ];
    for (const message of messages) {
      expect(categoriseConfirmFailure({ message }, notFlagged).code).toBe("network_failed");
    }
  });

  it("treats a structured error code as server_error — the defect candidate", () => {
    const failure = categoriseConfirmFailure(
      { code: "23505", message: "duplicate key value violates unique constraint" },
      notFlagged,
    );
    expect(failure.code).toBe("server_error");
    expect(failure.detail).toContain("[23505]");
  });

  it("does not let a network-sounding message hide a coded server error", () => {
    // A real Postgres error whose message mentions a timeout is still a
    // structured server response, not a fetch failure.
    const failure = categoriseConfirmFailure(
      { code: "57014", message: "canceling statement due to statement timeout" },
      notFlagged,
    );
    expect(failure.code).toBe("server_error");
  });

  it("falls back to unknown for a bare error with no code and no network signature", () => {
    expect(categoriseConfirmFailure({ message: "Not connected" }, notFlagged).code).toBe("unknown");
    expect(categoriseConfirmFailure(null, notFlagged).code).toBe("unknown");
    // supabase-js can surface an empty-string code on wrapped failures.
    expect(categoriseConfirmFailure({ code: "", message: "something odd" }, notFlagged).code).toBe(
      "unknown",
    );
  });

  it("caps the detail under the server-side truncation so nothing is silently cut", () => {
    const failure = categoriseConfirmFailure({ message: "x".repeat(1000) }, notFlagged);
    expect(failure.detail.length).toBe(CONFIRM_FAILURE_DETAIL_MAX);
    expect(CONFIRM_FAILURE_DETAIL_MAX).toBeLessThanOrEqual(300);
  });
});

describe("the governed vocabulary", () => {
  it("is the exact set the database CHECK constraint allows", () => {
    // Adding a code means adding it to the migration in the same change;
    // this pins the two together so a value cannot be logged that the
    // database will drop to null.
    expect([...CONFIRM_FAILURE_CODES]).toEqual([
      "gate_rejected",
      "reschedule_rule",
      "slot_taken_recheck",
      "network_failed",
      "server_error",
      "unknown",
    ]);
  });

  it("only ever returns a value from that set", () => {
    const produced = [
      categoriseConfirmFailure({ code: "P0001" }, { isTriggerError: true, isHandledReschedule: false }),
      categoriseConfirmFailure({ code: "SDR01" }, { isTriggerError: false, isHandledReschedule: true }),
      categoriseConfirmFailure({ message: "Failed to fetch" }, notFlagged),
      categoriseConfirmFailure({ code: "XX000", message: "boom" }, notFlagged),
      categoriseConfirmFailure(undefined, notFlagged),
    ];
    for (const failure of produced) {
      expect(CONFIRM_FAILURE_CODES).toContain(failure.code);
    }
  });
});
