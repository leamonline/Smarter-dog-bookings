// Regression coverage for the Inbox booking pane showing the wrong
// open/closed state and zero bookings once paged outside the staff
// calendar's currently-loaded week. See useInboxDiaryData.js for why this
// hook exists instead of reusing useDaySettings/useBookings directly.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

function setSupabase(value) {
  globalThis.__supabaseMockInboxDiary = value;
}

vi.mock("../client", () => ({
  get supabase() {
    return globalThis.__supabaseMockInboxDiary;
  },
}));

const { useInboxDiaryData } = await import("./useInboxDiaryData.js");

function makeChannel() {
  const channel = {};
  channel.on = vi.fn(() => channel);
  channel.subscribe = vi.fn(() => channel);
  return channel;
}

// day_settings terminates on .abortSignal(); bookings additionally chains
// two .order() calls first — both fall out of the same shared builder.
function makeBuilder(result) {
  const builder = {};
  for (const m of ["select", "gte", "lte", "order"]) {
    builder[m] = vi.fn(() => builder);
  }
  builder.abortSignal = vi.fn(() => Promise.resolve(result));
  return builder;
}

function makeStub({ daySettingsRows = [], bookingRows = [] } = {}) {
  const daySettingsBuilder = makeBuilder({ data: daySettingsRows, error: null });
  const bookingsBuilder = makeBuilder({ data: bookingRows, error: null });
  return {
    from: vi.fn((table) => {
      if (table === "day_settings") return daySettingsBuilder;
      if (table === "bookings") return bookingsBuilder;
      throw new Error(`Unexpected table: ${table}`);
    }),
    channel: vi.fn(() => makeChannel()),
    removeChannel: vi.fn(),
  };
}

beforeEach(() => {
  setSupabase(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useInboxDiaryData", () => {
  it("reports a manually closed day even when it's outside a 7-day window from today", async () => {
    // Monday 10 Aug 2026 is a normally-open weekday that staff have
    // explicitly closed — the DB row must win over the weekday default.
    const stub = makeStub({
      daySettingsRows: [
        {
          setting_date: "2026-08-10",
          is_open: false,
          overrides: {},
          extra_slots: [],
          immediate_slots: [],
        },
      ],
    });
    setSupabase(stub);

    const { result } = renderHook(() => useInboxDiaryData("2026-08-10"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.daySettings["2026-08-10"].isOpen).toBe(false);
  });

  it("shows a booking that exists on a date outside the current staff-calendar week", async () => {
    const stub = makeStub({
      bookingRows: [
        {
          id: "b1",
          booking_date: "2026-08-11",
          slot: "09:00",
          dog_id: "dog-1",
          size: "medium",
          service: "full_groom",
          status: "booked",
          addons: [],
          // Resolved via the snapshot columns, not a dogsById/humansById
          // join — the hook deliberately passes empty maps.
          dog_name_snapshot: "Alfie",
          breed_snapshot: "Cockapoo",
          owner_name_snapshot: "Leam Waddington",
        },
      ],
    });
    setSupabase(stub);

    const { result } = renderHook(() => useInboxDiaryData("2026-08-11"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.bookingsByDate["2026-08-11"]).toMatchObject([
      { dogName: "Alfie", breed: "Cockapoo", slot: "09:00", size: "medium" },
    ]);
  });

  it("still applies the weekday default when a date in-window has no day_settings row", async () => {
    setSupabase(makeStub());

    // 4 Aug 2026 is a Tuesday — default-open per ALL_DAYS — with no row.
    const { result } = renderHook(() => useInboxDiaryData("2026-08-04"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.daySettings["2026-08-04"].isOpen).toBe(true);
  });

  it("does not refetch when the diary is paged to a date still inside the loaded window", async () => {
    const stub = makeStub();
    setSupabase(stub);

    const { result, rerender } = renderHook(
      ({ dateStr }) => useInboxDiaryData(dateStr),
      { initialProps: { dateStr: "2026-08-05" } },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(stub.from).toHaveBeenCalledTimes(2); // day_settings + bookings

    rerender({ dateStr: "2026-08-08" }); // 3 days on, still inside ±14
    await waitFor(() => expect(stub.from).toHaveBeenCalledTimes(2));
  });

  it("re-centres and refetches once the diary is paged outside the loaded window", async () => {
    const stub = makeStub();
    setSupabase(stub);

    const { result, rerender } = renderHook(
      ({ dateStr }) => useInboxDiaryData(dateStr),
      { initialProps: { dateStr: "2026-08-05" } },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(stub.from).toHaveBeenCalledTimes(2);

    rerender({ dateStr: "2026-08-25" }); // 20 days on, outside ±14
    await waitFor(() => expect(stub.from).toHaveBeenCalledTimes(4));
  });
});
