// Boot-prefetch consumption tests for useBookings. The pre-existing
// useBookings.component.test.jsx never primes the prefetch, so it covers the
// fallback path end to end; this file covers the handover seam.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

function setSupabase(value) {
  globalThis.__supabaseMockBookingsPrefetch = value;
}

vi.mock("../client", () => ({
  get supabase() {
    return globalThis.__supabaseMockBookingsPrefetch;
  },
}));

vi.mock("../bootPrefetch.js", () => ({
  primeBootPrefetch: vi.fn(),
  takeBootPrefetch: vi.fn(() => null),
  _resetBootPrefetchForTests: vi.fn(),
}));

const { takeBootPrefetch } = await import("../bootPrefetch.js");
const { useBookings } = await import("./useBookings");

const ROW = {
  id: "booking-1",
  booking_date: "2026-05-18",
  slot: "09:00",
  size: "small",
  service: "full-groom",
  status: "Booked",
  addons: [],
  dog_id: "dog-1",
  payment: "Due at Pick-up",
  confirmed: false,
  pickup_by_id: null,
  dog_name_snapshot: "Bella",
  breed_snapshot: "Cockapoo",
  owner_name_snapshot: "Sarah Jones",
};

const dogsById = {
  "dog-1": { id: "dog-1", name: "Bella", breed: "Cockapoo", human_id: "human-1" },
};
const humansById = {
  "human-1": { id: "human-1", name: "Sarah", surname: "Jones", fullName: "Sarah Jones" },
};

const weekStart = new Date(2026, 4, 18); // Mon 18 May 2026

// Minimal stub: realtime channel only, plus a from() builder so the
// fallback path can run its week select (abortSignal is the terminal).
function makeStub({ selectResult } = {}) {
  const channel = {
    on: vi.fn(() => channel),
    subscribe: vi.fn(() => channel),
  };
  const builder = {};
  for (const m of ["select", "gte", "lte", "order"]) {
    builder[m] = vi.fn(() => builder);
  }
  builder.abortSignal = vi.fn(() =>
    Promise.resolve(selectResult ?? { data: [], error: null }),
  );
  return {
    from: vi.fn(() => builder),
    channel: vi.fn(() => channel),
    removeChannel: vi.fn(),
  };
}

beforeEach(() => {
  setSupabase(undefined);
  takeBootPrefetch.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useBookings boot prefetch", () => {
  it("consumes a primed week promise and skips its own initial read", async () => {
    takeBootPrefetch.mockReturnValue(
      Promise.resolve({ data: [ROW], error: null }),
    );
    const stub = makeStub();
    setSupabase(stub);

    const { result } = renderHook(() =>
      useBookings(weekStart, dogsById, humansById),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(takeBootPrefetch).toHaveBeenCalledWith("bookingsWeek", {
      startStr: "2026-05-18",
    });
    // The prefetched rows land through the normal transform pipeline…
    expect(result.current.bookingsByDate["2026-05-18"]).toHaveLength(1);
    expect(result.current.bookingsByDate["2026-05-18"][0].id).toBe("booking-1");
    expect(result.current.error).toBeNull();
    // …and the client was never asked for the initial read.
    expect(stub.from).not.toHaveBeenCalled();
  });

  it("falls back to its own read when the prefetch misses (param mismatch / not primed)", async () => {
    takeBootPrefetch.mockReturnValue(null);
    const stub = makeStub({ selectResult: { data: [ROW], error: null } });
    setSupabase(stub);

    const { result } = renderHook(() =>
      useBookings(weekStart, dogsById, humansById),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(stub.from).toHaveBeenCalledWith("bookings");
    expect(result.current.bookingsByDate["2026-05-18"]).toHaveLength(1);
    expect(result.current.error).toBeNull();
  });
});
