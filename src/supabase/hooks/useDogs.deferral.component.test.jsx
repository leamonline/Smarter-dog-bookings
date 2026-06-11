// Directory-deferral tests for useDogs: with startDirectoryFetch false, the
// page-0 search_dogs_directory RPC (and realtime-triggered refetches) are
// held back; flipping the flag true runs the fetch with the current params.
// The pre-existing useDogs.component.test.jsx never passes the flag,
// covering the default-true path unmodified.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

function setSupabase(value) {
  globalThis.__supabaseMockDogsDeferral = value;
}

vi.mock("../client.js", () => ({
  get supabase() {
    return globalThis.__supabaseMockDogsDeferral;
  },
}));

const { useDogs } = await import("./useDogs");

const dogRow = {
  id: "dog-1",
  name: "Bella",
  breed: "Cockapoo",
  human_id: "h1",
  owner_name: "Sarah",
  owner_surname: "Jones",
};

function makeStub() {
  const handlers = [];
  const channel = { _handlers: handlers };
  channel.on = vi.fn((_type, filter, cb) => {
    handlers.push({ filter, cb });
    return channel;
  });
  channel.subscribe = vi.fn(() => channel);
  channel.fire = (event, payload) => {
    for (const h of handlers) {
      if (h.filter?.event === event) h.cb(payload);
    }
  };
  const rpc = vi.fn(() =>
    Promise.resolve({
      data: { rows: [dogRow], total: 1, letters: ["B"] },
      error: null,
    }),
  );
  return {
    rpc,
    from: vi.fn(),
    channel: vi.fn(() => channel),
    removeChannel: vi.fn(),
    _channel: channel,
  };
}

function renderDeferred() {
  return renderHook(
    ({ start }) => useDogs({}, { startDirectoryFetch: start }),
    { initialProps: { start: false } },
  );
}

beforeEach(() => {
  setSupabase(undefined);
  try {
    localStorage.removeItem("dogsDirSort");
  } catch {
    /* ignore */
  }
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("useDogs directory deferral", () => {
  it("startDirectoryFetch:false skips the page-0 RPC and keeps loading true", async () => {
    const stub = makeStub();
    setSupabase(stub);
    const { result } = renderDeferred();

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(stub.rpc).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(true);
    expect(result.current.directoryDogs).toEqual([]);
  });

  it("a realtime INSERT/UPDATE while deferred does not trigger a refetch", async () => {
    const stub = makeStub();
    setSupabase(stub);
    renderDeferred();

    await act(async () => {
      stub._channel.fire("INSERT", { new: { id: "dog-9", human_id: "h1" } });
      stub._channel.fire("UPDATE", {
        new: { id: "dog-9", human_id: "h1" },
        old: { id: "dog-9", human_id: "h1" },
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(stub.rpc).not.toHaveBeenCalled();
  });

  it("flipping the flag true fires the page-0 fetch with current params", async () => {
    const stub = makeStub();
    setSupabase(stub);
    const { result, rerender } = renderDeferred();

    expect(stub.rpc).not.toHaveBeenCalled();

    rerender({ start: true });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(stub.rpc).toHaveBeenCalledTimes(1);
    expect(stub.rpc.mock.calls[0][0]).toBe("search_dogs_directory");
    expect(stub.rpc.mock.calls[0][1]).toMatchObject({ p_offset: 0 });
    expect(result.current.directoryDogs.map((d) => d.id)).toEqual(["dog-1"]);

    // Once warm, realtime refetches behave as before.
    await act(async () => {
      stub._channel.fire("INSERT", { new: { id: "dog-9", human_id: "h1" } });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(stub.rpc).toHaveBeenCalledTimes(2);
  });
});
