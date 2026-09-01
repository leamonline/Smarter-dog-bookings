import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

function setSupabase(value) {
  globalThis.__supabaseMockOwnerEvents = value;
}

vi.mock("../client", () => ({
  get supabase() {
    return globalThis.__supabaseMockOwnerEvents;
  },
}));

const { useOwnerBookingEvents } = await import("./useOwnerBookingEvents");

function makeStub({ bookingRows = [{ id: "bk-1" }], events = [] } = {}) {
  const eventsLimit = vi.fn(() => Promise.resolve({ data: events, error: null }));
  const eventsOrder = vi.fn(() => ({ limit: eventsLimit }));
  const eventsIn = vi.fn(() => ({ order: eventsOrder }));
  const bookingsIn = vi.fn(() => Promise.resolve({ data: bookingRows, error: null }));
  const from = vi.fn((table) => {
    if (table === "bookings") return { select: vi.fn(() => ({ in: bookingsIn })) };
    if (table === "booking_events") return { select: vi.fn(() => ({ in: eventsIn })) };
    throw new Error(`unexpected table ${table}`);
  });
  return {
    from,
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn(() => ({})),
    })),
    removeChannel: vi.fn(),
    _from: from,
    _bookingsIn: bookingsIn,
    _eventsIn: eventsIn,
  };
}

describe("useOwnerBookingEvents", () => {
  beforeEach(() => setSupabase(undefined));
  afterEach(() => vi.restoreAllMocks());

  it("scopes events to the owner's dogs via bookings → booking_events", async () => {
    const stub = makeStub({
      bookingRows: [{ id: "bk-1" }, { id: "bk-2" }],
      events: [{ id: "e1", event_type: "cancelled" }],
    });
    setSupabase(stub);

    const { result } = renderHook(() =>
      useOwnerBookingEvents({ dogIds: ["d1", "d2"] }),
    );

    await waitFor(() => expect(result.current.events).toHaveLength(1));
    expect(stub._bookingsIn).toHaveBeenCalledWith("dog_id", ["d1", "d2"]);
    expect(stub._eventsIn).toHaveBeenCalledWith("booking_id", ["bk-1", "bk-2"]);
  });

  it("returns no events and never queries when the owner has no dogs", async () => {
    const stub = makeStub();
    setSupabase(stub);

    const { result } = renderHook(() => useOwnerBookingEvents({ dogIds: [] }));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.events).toEqual([]);
    expect(stub._from).not.toHaveBeenCalled();
  });

  it("returns no events when the owner's dogs have no bookings", async () => {
    const stub = makeStub({ bookingRows: [] });
    setSupabase(stub);

    const { result } = renderHook(() =>
      useOwnerBookingEvents({ dogIds: ["d1"] }),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.events).toEqual([]);
    expect(stub._eventsIn).not.toHaveBeenCalled();
  });
});
