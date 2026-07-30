// Directory-deferral tests for useHumansData: with startDirectoryFetch
// false, the page-0 search_humans_directory RPC (and realtime-triggered
// refetches) are held back; flipping the flag true runs the fetch with the
// current params. The pre-existing useHumansData.component.test.jsx never
// passes the flag, covering the default-true path unmodified.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

function setSupabase(value) {
  globalThis.__supabaseMockHumansDeferral = value;
}

vi.mock("../../client", () => ({
  get supabase() {
    return globalThis.__supabaseMockHumansDeferral;
  },
}));

const { useHumansData } = await import("./useHumansData");

const h1 = { id: "h1", name: "Sarah", surname: "Jones", phone: "07700900111" };

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
    Promise.resolve({ data: { rows: [h1], total: 1, letters: ["S"] }, error: null }),
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
    ({ start }) =>
      useHumansData({
        effectiveSearch: "",
        finishSearching: () => {},
        startDirectoryFetch: start,
      }),
    { initialProps: { start: false } },
  );
}

beforeEach(() => {
  setSupabase(undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("useHumansData directory deferral", () => {
  it("startDirectoryFetch:false skips the page-0 RPC and keeps loading true", async () => {
    const stub = makeStub();
    setSupabase(stub);
    const { result } = renderDeferred();

    // Give any (wrongly) scheduled fetch a chance to land.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(stub.rpc).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(true);
    expect(result.current.directoryHumans).toEqual([]);
  });

  it("a realtime INSERT/UPDATE while deferred does not trigger a refetch", async () => {
    const stub = makeStub();
    setSupabase(stub);
    renderDeferred();

    await act(async () => {
      stub._channel.fire("INSERT", { new: { id: "h9" } });
      stub._channel.fire("UPDATE", { new: { id: "h9" } });
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
    expect(stub.rpc.mock.calls[0][0]).toBe("search_humans_directory");
    expect(stub.rpc.mock.calls[0][1]).toMatchObject({ p_offset: 0 });
    expect(result.current.directoryHumans.map((h) => h.id)).toEqual(["h1"]);

    // Once warm, realtime refetches behave as before.
    await act(async () => {
      stub._channel.fire("INSERT", { new: { id: "h9" } });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(stub.rpc).toHaveBeenCalledTimes(2);
  });
});
