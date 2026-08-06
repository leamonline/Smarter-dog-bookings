// Hook-level tests for the two read-only inbox signals the Daily Brief cards
// render: "On the way" and "Confirmed in chat".
//
// Both are keyed by BOOKING id, because that is how the cards read them
// (`signals[booking.id]` in StatusBoard.jsx / ArrivingSlotGroup.jsx).
// useOnTheWaySignals used to key by CONVERSATION id, so the lookup never hit
// and the chip never rendered in production — the component tests passed a
// hand-built map and couldn't catch it. These tests pin the contract at the
// hook boundary, on both hooks, so it can't drift back.
import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const clientRef = { current: null };
vi.mock("../supabase/client", () => ({
  get supabase() {
    return clientRef.current;
  },
}));

import { useOnTheWaySignals } from "./useOnTheWaySignals";
import { useReplyConfirmations } from "./useReplyConfirmations";

// A stub whose terminal `abortSignal` resolves with the given message rows.
function stubClient(rows) {
  const builder = {};
  for (const m of ["select", "in", "eq", "gte"]) {
    builder[m] = vi.fn().mockReturnValue(builder);
  }
  builder.abortSignal = vi.fn().mockResolvedValue({ data: rows, error: null });
  return { from: vi.fn().mockReturnValue(builder) };
}

const RECENT = new Date(Date.now() - 5 * 60_000).toISOString();

beforeEach(() => {
  clientRef.current = null;
});

describe("useOnTheWaySignals", () => {
  it("keys signals by booking id, not conversation id", async () => {
    clientRef.current = stubClient([
      { conversation_id: "conv-1", direction: "inbound", content: "on my way", sent_at: RECENT },
    ]);

    const { result } = renderHook(() =>
      useOnTheWaySignals([{ id: "booking-1", whatsappConversationId: "conv-1" }]),
    );

    await waitFor(() => expect(result.current["booking-1"]).toBeTruthy());
    expect(result.current["booking-1"].text).toBe("on my way");
    expect(result.current["conv-1"]).toBeUndefined();
  });

  it("fans one household's thread out across every booking on it", async () => {
    clientRef.current = stubClient([
      { conversation_id: "conv-1", direction: "inbound", content: "omw", sent_at: RECENT },
    ]);

    const { result } = renderHook(() =>
      useOnTheWaySignals([
        { id: "booking-1", whatsappConversationId: "conv-1" },
        { id: "booking-2", whatsappConversationId: "conv-1" },
        { id: "booking-3", whatsappConversationId: "conv-2" },
      ]),
    );

    await waitFor(() => expect(result.current["booking-1"]).toBeTruthy());
    expect(result.current["booking-2"]).toBeTruthy();
    expect(result.current["booking-3"]).toBeUndefined();
  });

  it("is empty offline", async () => {
    const { result } = renderHook(() =>
      useOnTheWaySignals([{ id: "booking-1", whatsappConversationId: "conv-1" }]),
    );
    await waitFor(() => expect(result.current).toEqual({}));
  });
});

describe("useReplyConfirmations", () => {
  const booking = (overrides = {}) => ({
    id: "booking-1",
    whatsappConversationId: "conv-1",
    reminderSentAt: "2026-08-05T17:00:00Z",
    reminderConfirmedAt: null,
    ...overrides,
  });

  it("keys the confirmation by booking id", async () => {
    clientRef.current = stubClient([
      {
        conversation_id: "conv-1",
        direction: "inbound",
        content: "See you then",
        sent_at: "2026-08-05T17:06:00Z",
      },
    ]);

    const { result } = renderHook(() => useReplyConfirmations([booking()]));

    await waitFor(() => expect(result.current["booking-1"]).toBeTruthy());
    expect(result.current["booking-1"].text).toBe("See you then");
  });

  it("skips bookings already confirmed the recorded way", async () => {
    clientRef.current = stubClient([]);
    const { result } = renderHook(() =>
      useReplyConfirmations([booking({ reminderConfirmedAt: "2026-08-05T17:06:00Z" })]),
    );
    await waitFor(() => expect(result.current).toEqual({}));
    expect(clientRef.current.from).not.toHaveBeenCalled();
  });

  it("skips bookings that were never sent a reminder", async () => {
    clientRef.current = stubClient([]);
    const { result } = renderHook(() =>
      useReplyConfirmations([booking({ reminderSentAt: null })]),
    );
    await waitFor(() => expect(result.current).toEqual({}));
    expect(clientRef.current.from).not.toHaveBeenCalled();
  });
});
