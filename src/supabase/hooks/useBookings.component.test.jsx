import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { BOOKING_STATUS } from "../../constants/salon";

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

function makeChannel() {
  const handlers = [];
  const channel = { _handlers: handlers };
  channel.on = vi.fn((_event, filter, cb) => {
    handlers.push({ filter, cb });
    return channel;
  });
  channel.subscribe = vi.fn(() => channel);
  // Invoke a captured postgres_changes handler by event name, so tests
  // can simulate realtime INSERT/UPDATE/DELETE payloads.
  channel.fire = (event, payload) => {
    for (const h of handlers) {
      if (h.filter?.event === event) h.cb(payload);
    }
  };
  return channel;
}

function makeSupabaseStub({
  selectResult,
  insertResult,
  updateResult,
  deleteResult,
  historyResult,
  deferInsert,
  deferSelect,
  deferUpdate,
  deferDelete,
  rpcImpl,
} = {}) {
  const channel = makeChannel();
  const fromCalls = [];
  let fetchCount = 0;
  // Deferred-insert mode: .insert().select().single() stays pending until
  // the test calls stub.resolveInsert(...), so a realtime echo can be fired
  // BEFORE the insert resolves (the ordering that triggered the dup bug).
  let resolveInsert;
  const insertPromise = deferInsert
    ? new Promise((res) => { resolveInsert = res; })
    : null;
  // Deferred select/update/delete follow the same pattern. Holding the
  // request open lets React flush the optimistic setRows updater first,
  // which is what assigns the rollback snapshot (prevRow / removedRow) —
  // an immediately-resolving promise would settle before the updater runs.
  let resolveSelect;
  const selectPromise = deferSelect
    ? new Promise((res) => { resolveSelect = res; })
    : null;
  let resolveUpdate;
  const updatePromise = deferUpdate
    ? new Promise((res) => { resolveUpdate = res; })
    : null;
  let resolveDelete;
  const deletePromise = deferDelete
    ? new Promise((res) => { resolveDelete = res; })
    : null;
  const stub = {
    _channel: channel,
    from: vi.fn((table) => {
      const builder = {};
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
          eq: vi.fn(() =>
            deferDelete
              ? deletePromise
              : Promise.resolve(deleteResult ?? { error: null }),
          ),
        };
      });
      builder.gte = vi.fn(() => builder);
      builder.lte = vi.fn(() => builder);
      builder.eq = vi.fn(() => builder);
      builder.order = vi.fn(() => builder);
      // .limit() is the terminal call of the booking-history query only,
      // so it can resolve directly without disturbing the other chains.
      builder.limit = vi.fn(() =>
        Promise.resolve(historyResult ?? { data: [], error: null }),
      );
      builder.abortSignal = vi.fn(() => {
        fetchCount += 1;
        return deferSelect
          ? selectPromise
          : Promise.resolve(selectResult ?? { data: [], error: null });
      });
      builder.single = vi.fn(() => {
        if (fromCalls.at(-1)?.op === "insert") {
          return deferInsert
            ? insertPromise
            : Promise.resolve(insertResult ?? { data: null, error: null });
        }
        return deferUpdate
          ? updatePromise
          : Promise.resolve(updateResult ?? { data: null, error: null });
      });
      // Track the most recent terminal op so .single() returns the
      // right result. Payloads are kept so tests can assert what the
      // hook actually sent (id resolution, optional columns).
      const wrap = (op, fn) => (...args) => {
        fromCalls.push({ table, op, payload: args[0] });
        return fn(...args);
      };
      builder.insert = wrap("insert", builder.insert);
      builder.update = wrap("update", builder.update);
      return builder;
    }),
    channel: vi.fn(() => channel),
    removeChannel: vi.fn(),
    // The atomic group path (addBookingGroup → create_staff_booking_group).
    // Default: succeed by echoing the sent rows back, which mirrors the real
    // RPC's contract of returning the inserted rows under the client ids.
    rpc: vi.fn((fnName, args) =>
      rpcImpl
        ? rpcImpl(fnName, args)
        : Promise.resolve({ data: args?.p_bookings ?? [], error: null }),
    ),
  };
  // Number of week-range select fetches issued (one per fetchBookings).
  stub.getFetchCount = () => fetchCount;
  stub.resolveInsert = (result) =>
    resolveInsert?.(result ?? insertResult ?? { data: null, error: null });
  stub.resolveSelect = (result) =>
    resolveSelect?.(result ?? selectResult ?? { data: [], error: null });
  stub.resolveUpdate = (result) =>
    resolveUpdate?.(result ?? updateResult ?? { data: null, error: null });
  stub.resolveDelete = (result) =>
    resolveDelete?.(result ?? deleteResult ?? { error: null });
  stub.getLastPayload = (op) =>
    fromCalls.filter((c) => c.op === op).at(-1)?.payload;
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

  // Fix C: a capacity-gate rejection (a race after the client preflight) is
  // mapped to copy a groomer can act on — and crucially still returns null +
  // rolls back, so the rejection is never mistaken for success upstream.
  it("addBooking maps a capacity-gate rejection to a friendly message", async () => {
    const onError = vi.fn();
    setSupabase(
      makeSupabaseStub({
        selectResult: { data: [], error: null },
        insertResult: {
          data: null,
          error: { code: "P0001", message: "Slot is full" },
        },
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
    expect(result.current.error).toMatch(/just filled up/i);
    expect(onError).toHaveBeenCalledWith(expect.stringMatching(/just filled up/i));
  });

  // Fix C: the unique-constraint race (same dog, same slot) is mapped too.
  it("addBooking maps a 23505 duplicate to a friendly message", async () => {
    const onError = vi.fn();
    setSupabase(
      makeSupabaseStub({
        selectResult: { data: [], error: null },
        insertResult: {
          data: null,
          error: { code: "23505", message: "duplicate key value violates unique constraint" },
        },
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
    expect(onError).toHaveBeenCalledWith(expect.stringMatching(/already booked/i));
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

  it("does not refetch the week when the dogs/humans map identities change", async () => {
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
    const stub = makeSupabaseStub({
      selectResult: { data: [initialRow], error: null },
    });
    setSupabase(stub);

    const { result, rerender } = renderHook(
      ({ d, h }) => useBookings(weekStart, d, h),
      { initialProps: { d: dogsById, h: humansById } },
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(stub.getFetchCount()).toBe(1);

    // New object identities, same content — mimics ensureDogsByIds /
    // ensureHumansByIds replacing the maps shortly after the load. The
    // old hook re-ran the fetch effect here (the duplicate week pull).
    rerender({ d: { ...dogsById }, h: { ...humansById } });
    rerender({ d: { ...dogsById }, h: { ...humansById } });

    await waitFor(() =>
      expect(result.current.bookingsByDate["2026-05-18"]).toHaveLength(1),
    );
    expect(stub.getFetchCount()).toBe(1);
  });

  it("applies realtime INSERT / UPDATE / DELETE to the derived view", async () => {
    const stub = makeSupabaseStub({ selectResult: { data: [], error: null } });
    setSupabase(stub);

    const { result } = renderHook(() =>
      useBookings(weekStart, dogsById, humansById),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    // INSERT within the visible week.
    act(() => {
      stub._channel.fire("INSERT", {
        new: { id: "rt-1", booking_date: "2026-05-20", slot: "09:00", dog_id: "dog-1" },
      });
    });
    expect(result.current.bookingsByDate["2026-05-20"]).toHaveLength(1);
    expect(result.current.bookingsByDate["2026-05-20"][0].id).toBe("rt-1");

    // UPDATE that moves it to another in-week day — the memo regroups.
    act(() => {
      stub._channel.fire("UPDATE", {
        new: { id: "rt-1", booking_date: "2026-05-21", slot: "10:00", dog_id: "dog-1" },
        old: { id: "rt-1", booking_date: "2026-05-20" },
      });
    });
    expect(result.current.bookingsByDate["2026-05-20"]).toBeUndefined();
    expect(result.current.bookingsByDate["2026-05-21"]).toHaveLength(1);

    // DELETE removes it entirely.
    act(() => {
      stub._channel.fire("DELETE", { old: { id: "rt-1", booking_date: "2026-05-21" } });
    });
    expect(result.current.bookingsByDate["2026-05-21"] ?? []).toHaveLength(0);
  });

  it("does not duplicate when the realtime INSERT echo lands before the insert resolves", async () => {
    // The optimistic row, the insert payload, and the realtime echo must
    // share one id. Pin crypto.randomUUID so the test can fire the echo
    // with that same id. (Before the fix the optimistic row used a _temp_
    // id, so the echo's server id didn't match and got appended — the
    // doubling seen when two dogs are booked together.)
    vi.spyOn(crypto, "randomUUID").mockReturnValue("client-uuid-1");

    const stub = makeSupabaseStub({
      selectResult: { data: [], error: null },
      deferInsert: true,
    });
    setSupabase(stub);

    const { result } = renderHook(() =>
      useBookings(weekStart, dogsById, humansById),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Kick off the add but leave the insert pending (deferred).
    let addPromise;
    await act(async () => {
      addPromise = result.current.addBooking("2026-05-18", {
        _dogId: "dog-1",
        slot: "11:00",
        size: "small",
        service: "full-groom",
      });
      // Flush the optimistic setRows.
      await Promise.resolve();
    });

    // Optimistic row is present.
    expect(result.current.bookingsByDate["2026-05-18"]).toHaveLength(1);

    // Realtime echo arrives BEFORE the insert resolves, carrying the SAME
    // id as the optimistic row. It must replace, not append.
    act(() => {
      stub._channel.fire("INSERT", {
        new: {
          id: "client-uuid-1",
          booking_date: "2026-05-18",
          slot: "11:00",
          dog_id: "dog-1",
        },
      });
    });
    expect(result.current.bookingsByDate["2026-05-18"]).toHaveLength(1);

    // Now let the insert resolve; the row settles to the server payload.
    await act(async () => {
      stub.resolveInsert({
        data: {
          id: "client-uuid-1",
          booking_date: "2026-05-18",
          slot: "11:00",
          size: "small",
          service: "full-groom",
          status: "Booked",
          addons: [],
          dog_id: "dog-1",
          payment: "Due at Pick-up",
        },
        error: null,
      });
      await addPromise;
    });

    expect(result.current.bookingsByDate["2026-05-18"]).toHaveLength(1);
    expect(result.current.bookingsByDate["2026-05-18"][0].id).toBe("client-uuid-1");
  });

  it("surfaces the week-fetch error and falls back to an empty schedule", async () => {
    setSupabase(
      makeSupabaseStub({
        selectResult: { data: null, error: { message: "network down" } },
      }),
    );

    const { result } = renderHook(() =>
      useBookings(weekStart, dogsById, humansById),
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("network down");
    expect(result.current.bookingsByDate).toEqual({});
  });

  it("ignores the fetch result when the request was aborted by unmount", async () => {
    const stub = makeSupabaseStub({ deferSelect: true });
    setSupabase(stub);

    const { result, unmount } = renderHook(() =>
      useBookings(weekStart, dogsById, humansById),
    );
    expect(result.current.loading).toBe(true);

    // Unmount aborts the controller; the late response must be dropped
    // rather than setting state on an unmounted component.
    unmount();
    stub.resolveSelect({
      data: [{ id: "late-1", booking_date: "2026-05-18", slot: "09:00" }],
      error: null,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(stub.removeChannel).toHaveBeenCalled();
    expect(stub.getFetchCount()).toBe(1);
  });

  it("ignores realtime payloads it cannot apply and regroups edge transitions", async () => {
    const initialRow = {
      id: "booking-1",
      booking_date: "2026-05-18",
      slot: "09:00",
      size: "small",
      service: "full-groom",
      status: "Booked",
      addons: [],
      dog_id: "dog-1",
      payment: "Due at Pick-up",
    };
    const stub = makeSupabaseStub({
      selectResult: { data: [initialRow], error: null },
    });
    setSupabase(stub);

    const { result } = renderHook(() =>
      useBookings(weekStart, dogsById, humansById),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    // INSERT outside the visible week is irrelevant to this view.
    act(() => {
      stub._channel.fire("INSERT", {
        new: { id: "rt-far", booking_date: "2026-06-01", slot: "09:00" },
      });
    });
    expect(result.current.bookingsByDate["2026-06-01"]).toBeUndefined();
    expect(result.current.bookingsByDate["2026-05-18"]).toHaveLength(1);

    // INSERT echo for an id we already hold must replace, not append.
    act(() => {
      stub._channel.fire("INSERT", {
        new: { ...initialRow, slot: "14:00" },
      });
    });
    expect(result.current.bookingsByDate["2026-05-18"]).toHaveLength(1);
    expect(result.current.bookingsByDate["2026-05-18"][0].slot).toBe("14:00");

    // UPDATE and DELETE payloads with no usable id are dropped.
    act(() => {
      stub._channel.fire("UPDATE", { new: {}, old: {} });
      stub._channel.fire("DELETE", { old: {} });
    });
    expect(result.current.bookingsByDate["2026-05-18"]).toHaveLength(1);

    // UPDATE for a row we never fetched (e.g. inserted elsewhere while
    // this client was briefly disconnected) is appended, not lost.
    act(() => {
      stub._channel.fire("UPDATE", {
        new: { id: "rt-new", booking_date: "2026-05-18", slot: "15:00" },
        old: { id: "rt-new" },
      });
    });
    expect(result.current.bookingsByDate["2026-05-18"]).toHaveLength(2);

    // UPDATE that moves a row outside the week drops it from the view.
    act(() => {
      stub._channel.fire("UPDATE", {
        new: { id: "rt-new", booking_date: "2026-06-02", slot: "15:00" },
        old: { id: "rt-new", booking_date: "2026-05-18" },
      });
    });
    expect(result.current.bookingsByDate["2026-05-18"]).toHaveLength(1);
  });

  it("addBooking resolves ids by name and forwards the optional columns", async () => {
    const insertedRow = {
      id: "booking-50",
      booking_date: "2026-05-18",
      slot: "11:00",
      size: "small",
      service: "full-groom",
      status: "Booked",
      addons: [],
      dog_id: "dog-1",
      payment: "Due at Pick-up",
    };
    const stub = makeSupabaseStub({
      insertResult: { data: insertedRow, error: null },
    });
    setSupabase(stub);

    const { result } = renderHook(() =>
      useBookings(weekStart, dogsById, humansById),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    let returned;
    await act(async () => {
      returned = await result.current.addBooking("2026-05-18", {
        dogName: "Bella",
        pickupBy: "Sarah Jones",
        slot: "11:00",
        size: "small",
        service: "full-groom",
        group_id: "group-1",
        staff_capacity_override: true,
      });
    });

    expect(returned?.id).toBe("booking-50");
    const payload = stub.getLastPayload("insert");
    expect(payload.dog_id).toBe("dog-1");
    expect(payload.pickup_by_id).toBe("human-1");
    expect(payload.group_id).toBe("group-1");
    expect(payload.staff_capacity_override).toBe(true);
  });

  it("addBooking surfaces an error when the dog cannot be resolved", async () => {
    const onError = vi.fn();
    const stub = makeSupabaseStub();
    setSupabase(stub);

    const { result } = renderHook(() =>
      useBookings(weekStart, dogsById, humansById, { onError }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    let returned;
    await act(async () => {
      returned = await result.current.addBooking("2026-05-18", {
        dogName: "Zeus",
        slot: "11:00",
        size: "large",
        service: "full-groom",
      });
    });

    expect(returned).toBeNull();
    expect(result.current.error).toBe("Dog not found for booking: Zeus");
    expect(onError).toHaveBeenCalledWith("Dog not found for booking: Zeus");
    // The insert must never have been attempted.
    expect(stub.getLastPayload("insert")).toBeUndefined();
    expect(result.current.bookingsByDate["2026-05-18"] ?? []).toHaveLength(0);
  });

  it("removeBooking restores the snapshot row when the delete fails", async () => {
    const onError = vi.fn();
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
    const stub = makeSupabaseStub({
      selectResult: { data: [initialRow], error: null },
      deferDelete: true,
    });
    setSupabase(stub);

    const { result } = renderHook(() =>
      useBookings(weekStart, dogsById, humansById, { onError }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Hold the delete open so React flushes the optimistic removal —
    // that flush is what captures the rollback snapshot.
    let removePromise;
    await act(async () => {
      removePromise = result.current.removeBooking("2026-05-18", "booking-7");
    });
    expect(result.current.bookingsByDate["2026-05-18"] ?? []).toHaveLength(0);

    let outcome;
    await act(async () => {
      stub.resolveDelete({ error: { message: "delete failed" } });
      outcome = await removePromise;
    });

    expect(outcome).toEqual({ success: false, error: "delete failed" });
    expect(result.current.bookingsByDate["2026-05-18"]).toHaveLength(1);
    expect(result.current.bookingsByDate["2026-05-18"][0].id).toBe("booking-7");
    expect(result.current.error).toBe("delete failed");
    expect(onError).toHaveBeenCalledWith("delete failed");
  });

  it("removeBooking returns the removed booking snapshot on success", async () => {
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
    const stub = makeSupabaseStub({
      selectResult: { data: [initialRow], error: null },
      deferDelete: true,
    });
    setSupabase(stub);

    const { result } = renderHook(() =>
      useBookings(weekStart, dogsById, humansById),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    let removePromise;
    await act(async () => {
      removePromise = result.current.removeBooking("2026-05-18", "booking-7");
    });

    let outcome;
    await act(async () => {
      stub.resolveDelete({ error: null });
      outcome = await removePromise;
    });

    expect(outcome.success).toBe(true);
    // The caller gets the transformed snapshot back (used for undo).
    expect(outcome.removed?.id).toBe("booking-7");
    expect(result.current.bookingsByDate["2026-05-18"] ?? []).toHaveLength(0);
  });

  it("updateBooking rolls back the optimistic patch when the update fails", async () => {
    const onError = vi.fn();
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
    const stub = makeSupabaseStub({
      selectResult: { data: [initialRow], error: null },
      deferUpdate: true,
    });
    setSupabase(stub);

    const { result } = renderHook(() =>
      useBookings(weekStart, dogsById, humansById, { onError }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Hold the update open so the optimistic patch (and its rollback
    // snapshot) flushes before the failure lands.
    let updatePromise;
    await act(async () => {
      updatePromise = result.current.updateBooking(
        {
          ...result.current.bookingsByDate["2026-05-18"][0],
          slot: "10:00",
          staff_capacity_override: true,
        },
        "2026-05-18",
        "2026-05-18",
      );
    });
    expect(result.current.bookingsByDate["2026-05-18"][0].slot).toBe("10:00");

    let returned;
    await act(async () => {
      stub.resolveUpdate({ data: null, error: { message: "update failed" } });
      returned = await updatePromise;
    });

    expect(returned).toBeNull();
    expect(result.current.bookingsByDate["2026-05-18"][0].slot).toBe("09:00");
    expect(result.current.error).toBe("update failed");
    expect(onError).toHaveBeenCalledWith("update failed");
    expect(stub.getLastPayload("update").staff_capacity_override).toBe(true);
  });

  it("fires onReadyForPickup when a booking transitions into Ready", async () => {
    const onReadyForPickup = vi.fn();
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
    const readyRow = { ...initialRow, status: BOOKING_STATUS.READY_FOR_PICKUP };
    const stub = makeSupabaseStub({
      selectResult: { data: [initialRow], error: null },
      updateResult: { data: readyRow, error: null },
    });
    setSupabase(stub);

    const { result } = renderHook(() =>
      useBookings(weekStart, dogsById, humansById, { onReadyForPickup }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.updateBooking(
        {
          ...result.current.bookingsByDate["2026-05-18"][0],
          status: BOOKING_STATUS.READY_FOR_PICKUP,
          pickupBy: "Sarah Jones",
          staffCapacityOverride: true,
        },
        "2026-05-18",
        "2026-05-18",
      );
    });

    expect(onReadyForPickup).toHaveBeenCalledTimes(1);
    expect(onReadyForPickup.mock.calls[0][0].status).toBe(
      BOOKING_STATUS.READY_FOR_PICKUP,
    );
    // The camelCase override flag and the pickup-by name lookup both
    // funnel into the update payload.
    const payload = stub.getLastPayload("update");
    expect(payload.staff_capacity_override).toBe(true);
    expect(payload.pickup_by_id).toBe("human-1");
  });

  it("does not fire onReadyForPickup when the booking was already Ready", async () => {
    const onReadyForPickup = vi.fn();
    const initialRow = {
      id: "booking-7",
      booking_date: "2026-05-18",
      slot: "09:00",
      size: "small",
      service: "full-groom",
      status: BOOKING_STATUS.READY_FOR_PICKUP,
      addons: [],
      dog_id: "dog-1",
      payment: "Due at Pick-up",
    };
    const stub = makeSupabaseStub({
      selectResult: { data: [initialRow], error: null },
      deferUpdate: true,
    });
    setSupabase(stub);

    const { result } = renderHook(() =>
      useBookings(weekStart, dogsById, humansById, { onReadyForPickup }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Defer the update so the previous-status snapshot is captured —
    // it is what proves this is an edit, not a transition into Ready.
    let updatePromise;
    await act(async () => {
      updatePromise = result.current.updateBooking(
        {
          ...result.current.bookingsByDate["2026-05-18"][0],
          slot: "10:00",
          status: BOOKING_STATUS.READY_FOR_PICKUP,
        },
        "2026-05-18",
        "2026-05-18",
      );
    });

    await act(async () => {
      stub.resolveUpdate({
        data: { ...initialRow, slot: "10:00" },
        error: null,
      });
      await updatePromise;
    });

    expect(onReadyForPickup).not.toHaveBeenCalled();
  });

  it("fetchBookingHistoryForDog maps the recent bookings for a dog", async () => {
    const stub = makeSupabaseStub({
      historyResult: {
        data: [
          {
            id: "hist-1",
            booking_date: "2026-04-20",
            slot: "09:00",
            service: "full-groom",
            status: "Completed",
            size: "small",
            addons: null,
            payment: "Paid",
          },
        ],
        error: null,
      },
    });
    setSupabase(stub);

    const { result } = renderHook(() =>
      useBookings(weekStart, dogsById, humansById),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    const history = await result.current.fetchBookingHistoryForDog("dog-1");

    expect(history).toEqual([
      {
        id: "hist-1",
        date: "2026-04-20",
        slot: "09:00",
        service: "full-groom",
        status: "Completed",
        size: "small",
        addons: [],
        payment: "Paid",
      },
    ]);
  });

  it("fetchBookingHistoryForDog returns an empty list when the query fails", async () => {
    const stub = makeSupabaseStub({
      historyResult: { data: null, error: { message: "boom" } },
    });
    setSupabase(stub);

    const { result } = renderHook(() =>
      useBookings(weekStart, dogsById, humansById),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    const history = await result.current.fetchBookingHistoryForDog("dog-1");
    expect(history).toEqual([]);
  });

  it("mutation helpers no-op gracefully when supabase is unavailable", async () => {
    setSupabase(null);

    const { result } = renderHook(() =>
      useBookings(weekStart, dogsById, humansById),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    const booking = { id: "b-1", slot: "09:00" };
    await expect(
      result.current.addBooking("2026-05-18", booking),
    ).resolves.toBe(booking);
    await expect(
      result.current.removeBooking("2026-05-18", "b-1"),
    ).resolves.toEqual({ success: true });
    await expect(
      result.current.updateBooking(booking, "2026-05-18", "2026-05-18"),
    ).resolves.toBe(booking);
    await expect(
      result.current.fetchBookingHistoryForDog("dog-1"),
    ).resolves.toEqual([]);
  });

  it("addBookingGroup sends the whole group to the RPC and lands every row", async () => {
    const twoDogs = {
      ...dogsById,
      "dog-2": { id: "dog-2", name: "Max", breed: "Labrador", human_id: "human-1" },
    };
    const stub = makeSupabaseStub({});
    setSupabase(stub);

    const { result } = renderHook(() =>
      useBookings(weekStart, twoDogs, humansById),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    let saved;
    await act(async () => {
      saved = await result.current.addBookingGroup("2026-05-18", [
        { _dogId: "dog-1", slot: "09:00", size: "small", service: "full-groom" },
        { _dogId: "dog-2", slot: "09:00", size: "large", service: "bath-and-brush" },
      ]);
    });

    expect(stub.rpc).toHaveBeenCalledWith(
      "create_staff_booking_group",
      expect.objectContaining({
        p_booking_date: "2026-05-18",
        p_bookings: expect.arrayContaining([
          expect.objectContaining({ dog_id: "dog-1", slot: "09:00" }),
          expect.objectContaining({ dog_id: "dog-2", slot: "09:00" }),
        ]),
      }),
    );
    expect(saved).toHaveLength(2);
    expect(result.current.bookingsByDate["2026-05-18"]).toHaveLength(2);
    expect(result.current.error).toBeNull();
  });

  it("addBookingGroup rolls back EVERY optimistic row when the RPC rejects", async () => {
    // The bug class this path exists to close (AUDIT-3): with independent
    // inserts, dog 2's capacity rejection left dog 1 booked. Atomic path:
    // one rejection → zero rows, and one friendly error.
    const twoDogs = {
      ...dogsById,
      "dog-2": { id: "dog-2", name: "Max", breed: "Labrador", human_id: "human-1" },
    };
    const stub = makeSupabaseStub({
      rpcImpl: () =>
        Promise.resolve({
          data: null,
          error: { code: "P0001", message: "Slot is full" },
        }),
    });
    setSupabase(stub);

    const { result } = renderHook(() =>
      useBookings(weekStart, twoDogs, humansById),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    let saved;
    await act(async () => {
      saved = await result.current.addBookingGroup("2026-05-18", [
        { _dogId: "dog-1", slot: "09:00", size: "small", service: "full-groom" },
        { _dogId: "dog-2", slot: "09:00", size: "large", service: "bath-and-brush" },
      ]);
    });

    expect(saved).toBeNull();
    // No partial group: both optimistic rows are gone.
    expect(result.current.bookingsByDate["2026-05-18"] ?? []).toHaveLength(0);
    expect(result.current.error).toBeTruthy();
  });

  it("refetch issues a fresh week query and treats null data as empty", async () => {
    const stub = makeSupabaseStub({
      selectResult: { data: null, error: null },
    });
    setSupabase(stub);

    const { result } = renderHook(() =>
      useBookings(weekStart, dogsById, humansById),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.bookingsByDate).toEqual({});
    expect(stub.getFetchCount()).toBe(1);

    act(() => {
      result.current.refetch();
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(stub.getFetchCount()).toBe(2);
  });
});
