import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

// vi.mock factories must not reference outer variables, so we define
// stub state on globalThis and let the mock pull values from there.
function setSupabase(value) {
  globalThis.__supabaseMock = value;
}

vi.mock("../client.js", () => ({
  get supabase() {
    return globalThis.__supabaseMock;
  },
}));

// Pull dogId from the inserted row so the hook's optimistic-replace
// path produces deterministic shapes regardless of what
// dbBookingsToArray would normally do with the joined data.
vi.mock("../transforms.js", async () => {
  const actual = await vi.importActual("../transforms.js");
  return {
    ...actual,
    dbBookingsToArray: (rows) =>
      rows.map((row) => ({
        id: row.id,
        slot: row.slot,
        size: row.size,
        service: row.service,
        status: row.status,
        addons: row.addons ?? [],
        confirmed: row.confirmed === true,
        payment: row.payment,
        _dogId: row.dog_id,
        _bookingDate: row.booking_date,
      })),
  };
});

const { useBookings } = await import("./useBookings.js");

function makeBuilder({ data = null, error = null } = {}) {
  const builder = {};
  const fns = [
    "select",
    "insert",
    "update",
    "delete",
    "eq",
    "gte",
    "lte",
    "order",
    "limit",
    "abortSignal",
  ];
  for (const name of fns) builder[name] = vi.fn(() => builder);
  builder.single = vi.fn(() => Promise.resolve({ data, error }));
  builder.then = (resolve) => Promise.resolve({ data, error }).then(resolve);
  return builder;
}

function makeChannel() {
  const channel = { _events: {} };
  channel.on = vi.fn(() => channel);
  channel.subscribe = vi.fn(() => channel);
  return channel;
}

function makeSupabaseStub({ selectResult, insertResult, updateResult, deleteResult } = {}) {
  const channel = makeChannel();
  const fromCalls = [];
  const stub = {
    _channel: channel,
    from: vi.fn((table) => {
      const builder = {};
      const chain = () => builder;
      builder.select = vi.fn(() => {
        // Two call shapes:
        //   .from('bookings').select('*').gte().lte().order().order().abortSignal()
        //   .from('bookings').insert(...).select('*').single()
        // Both consume select-then-chain, so we just return the chainable
        // builder and let the terminal call decide.
        return builder;
      });
      builder.insert = vi.fn(() => builder);
      builder.update = vi.fn(() => builder);
      builder.delete = vi.fn(() => {
        // .delete().eq() resolves directly
        return {
          eq: vi.fn(() => Promise.resolve(deleteResult ?? { error: null })),
        };
      });
      builder.gte = vi.fn(() => builder);
      builder.lte = vi.fn(() => builder);
      builder.eq = vi.fn(() => builder);
      builder.order = vi.fn(() => builder);
      builder.limit = vi.fn(() => builder);
      builder.abortSignal = vi.fn(() =>
        Promise.resolve(selectResult ?? { data: [], error: null }),
      );
      builder.single = vi.fn(() =>
        Promise.resolve(
          fromCalls.at(-1)?.op === "insert"
            ? insertResult ?? { data: null, error: null }
            : updateResult ?? { data: null, error: null },
        ),
      );
      // Track the most recent terminal op so .single() returns the
      // right result.
      const wrap = (op, fn) => (...args) => {
        fromCalls.push({ table, op });
        return fn(...args);
      };
      builder.insert = wrap("insert", builder.insert);
      builder.update = wrap("update", builder.update);
      return builder;
    }),
    channel: vi.fn(() => channel),
    removeChannel: vi.fn(),
  };
  return stub;
}

const dogsById = {
  "dog-1": { id: "dog-1", name: "Bella", breed: "Cockapoo", human_id: "human-1" },
};

const humansById = {
  "human-1": {
    id: "human-1",
    name: "Sarah",
    surname: "Jones",
    fullName: "Sarah Jones",
  },
};

const weekStart = new Date(2026, 4, 18); // Mon 18 May 2026

describe("useBookings", () => {
  // Reset on entry so each test starts from a clean slot. We don't
  // clear it in afterEach: testing-library's cleanup() unmounts the
  // component after our afterEach runs, and the hook's effect tear-
  // down still calls supabase.removeChannel — so the stub must
  // survive until React is done.
  beforeEach(() => {
    setSupabase(undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("falls back to empty state when supabase client is null", async () => {
    setSupabase(null);
    const { result } = renderHook(() =>
      useBookings(weekStart, dogsById, humansById),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.bookingsByDate).toEqual({});
    expect(result.current.error).toBeNull();
  });

  it("loads initial bookings from supabase and groups them by date", async () => {
    const rows = [
      {
        id: "booking-1",
        booking_date: "2026-05-18",
        slot: "09:00",
        size: "small",
        service: "full-groom",
        status: "Booked",
        addons: [],
        dog_id: "dog-1",
        payment: "Due at Pick-up",
      },
      {
        id: "booking-2",
        booking_date: "2026-05-19",
        slot: "10:00",
        size: "medium",
        service: "bath-and-brush",
        status: "Booked",
        addons: [],
        dog_id: "dog-1",
        payment: "Due at Pick-up",
      },
    ];

    setSupabase(makeSupabaseStub({ selectResult: { data: rows, error: null } }));

    const { result } = renderHook(() =>
      useBookings(weekStart, dogsById, humansById),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(Object.keys(result.current.bookingsByDate)).toEqual([
      "2026-05-18",
      "2026-05-19",
    ]);
    expect(result.current.bookingsByDate["2026-05-18"]).toHaveLength(1);
    expect(result.current.bookingsByDate["2026-05-18"][0].id).toBe("booking-1");
  });

  it("addBooking optimistically inserts and replaces with server row on success", async () => {
    const insertedRow = {
      id: "booking-99",
      booking_date: "2026-05-18",
      slot: "11:00",
      size: "small",
      service: "full-groom",
      status: "Booked",
      addons: [],
      dog_id: "dog-1",
      payment: "Due at Pick-up",
    };

    setSupabase(
      makeSupabaseStub({
        selectResult: { data: [], error: null },
        insertResult: { data: insertedRow, error: null },
      }),
    );

    const { result } = renderHook(() =>
      useBookings(weekStart, dogsById, humansById),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    let returned;
    await act(async () => {
      returned = await result.current.addBooking("2026-05-18", {
        _dogId: "dog-1",
        slot: "11:00",
        size: "small",
        service: "full-groom",
      });
    });

    expect(returned?.id).toBe("booking-99");
    const day = result.current.bookingsByDate["2026-05-18"];
    expect(day).toHaveLength(1);
    expect(day[0].id).toBe("booking-99");
    // No temp id should remain.
    expect(day.find((b) => String(b.id).startsWith("_temp_"))).toBeUndefined();
  });

  it("addBooking rolls back the optimistic insert when supabase errors", async () => {
    const onError = vi.fn();
    setSupabase(
      makeSupabaseStub({
        selectResult: { data: [], error: null },
        insertResult: { data: null, error: { message: "duplicate slot" } },
      }),
    );

    const { result } = renderHook(() =>
      useBookings(weekStart, dogsById, humansById, { onError }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    let returned;
    await act(async () => {
      returned = await result.current.addBooking("2026-05-18", {
        _dogId: "dog-1",
        slot: "11:00",
        size: "small",
        service: "full-groom",
      });
    });

    expect(returned).toBeNull();
    expect(result.current.bookingsByDate["2026-05-18"] ?? []).toHaveLength(0);
    expect(result.current.error).toBe("duplicate slot");
    expect(onError).toHaveBeenCalledWith("duplicate slot");
  });

  it("updateBooking replaces the in-place row when same-day update succeeds", async () => {
    const initialRow = {
      id: "booking-7",
      booking_date: "2026-05-18",
      slot: "09:00",
      size: "small",
      service: "full-groom",
      status: "Booked",
      addons: [],
      dog_id: "dog-1",
      payment: "Due at Pick-up",
    };
    const updatedRow = { ...initialRow, slot: "10:00", status: "Checked in" };

    setSupabase(
      makeSupabaseStub({
        selectResult: { data: [initialRow], error: null },
        updateResult: { data: updatedRow, error: null },
      }),
    );

    const { result } = renderHook(() =>
      useBookings(weekStart, dogsById, humansById),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    let returned;
    await act(async () => {
      returned = await result.current.updateBooking(
        { ...result.current.bookingsByDate["2026-05-18"][0], slot: "10:00", status: "Checked in" },
        "2026-05-18",
        "2026-05-18",
      );
    });

    expect(returned?.slot).toBe("10:00");
    expect(returned?.status).toBe("Checked in");
    expect(result.current.bookingsByDate["2026-05-18"]).toHaveLength(1);
    expect(result.current.bookingsByDate["2026-05-18"][0].slot).toBe("10:00");
  });

  it("removeBooking deletes optimistically and reports success", async () => {
    const initialRow = {
      id: "booking-7",
      booking_date: "2026-05-18",
      slot: "09:00",
      size: "small",
      service: "full-groom",
      status: "Booked",
      addons: [],
      dog_id: "dog-1",
      payment: "Due at Pick-up",
    };

    setSupabase(
      makeSupabaseStub({
        selectResult: { data: [initialRow], error: null },
        deleteResult: { error: null },
      }),
    );

    const { result } = renderHook(() =>
      useBookings(weekStart, dogsById, humansById),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    let outcome;
    await act(async () => {
      outcome = await result.current.removeBooking("2026-05-18", "booking-7");
    });

    expect(outcome.success).toBe(true);
    expect(result.current.bookingsByDate["2026-05-18"] ?? []).toHaveLength(0);
  });
});
