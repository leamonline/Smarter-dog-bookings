import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useState } from "react";

function setSupabase(value) {
  globalThis.__supabaseMockHumanLifecycle = value;
}

vi.mock("../../client.js", () => ({
  get supabase() {
    return globalThis.__supabaseMockHumanLifecycle;
  },
}));

const { useHumanLifecycle } = await import("./useHumanLifecycle");

function makeStub(rpcImpl, { invokeImpl } = {}) {
  return {
    rpc: vi.fn((fn, params) =>
      Promise.resolve(rpcImpl ? rpcImpl(fn, params) : { data: null, error: null }),
    ),
    functions: {
      invoke: vi.fn((name, opts) =>
        Promise.resolve(
          invokeImpl ? invokeImpl(name, opts) : { data: null, error: null },
        ),
      ),
    },
  };
}

const h1 = { id: "h1", fullName: "Sarah Jones" };
const h2 = { id: "h2", fullName: "Dave Smith" };

// Host harness owning the shared caches, as useHumansData does in the
// composer, so the optimistic map updates are observable.
function useHarness() {
  const [humans, setHumans] = useState({ "Sarah Jones": h1, "Dave Smith": h2 });
  const [humansById, setHumansById] = useState({ h1, h2 });
  const [totalCount, setTotalCount] = useState(2);
  const [directoryHumans, setDirectoryHumans] = useState([h1, h2]);
  const lifecycle = useHumanLifecycle({
    setHumans,
    setHumansById,
    setTotalCount,
    setDirectoryHumans,
  });
  return { humans, humansById, totalCount, directoryHumans, ...lifecycle };
}

beforeEach(() => {
  setSupabase(undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("useHumanLifecycle mergeHumans", () => {
  it("guards against missing ids and self-merges", async () => {
    setSupabase(makeStub());
    const { result } = renderHook(() => useHarness());

    expect(await result.current.mergeHumans("", "h2")).toEqual({
      ok: false,
      error: "Missing human id",
    });
    expect(await result.current.mergeHumans("h1", "h1")).toEqual({
      ok: false,
      error: "Cannot merge a record into itself",
    });
  });

  it("calls the merge_humans RPC and drops the loser from the local maps", async () => {
    const stub = makeStub();
    setSupabase(stub);
    const { result } = renderHook(() => useHarness());

    let outcome;
    await act(async () => {
      outcome = await result.current.mergeHumans("h1", "h2");
    });

    expect(outcome).toEqual({ ok: true });
    expect(stub.rpc).toHaveBeenCalledWith("merge_humans", {
      p_winner: "h1",
      p_loser: "h2",
    });
    expect(result.current.humansById.h2).toBeUndefined();
    expect(result.current.humans["Dave Smith"]).toBeUndefined();
    expect(result.current.totalCount).toBe(1);
  });

  it("keeps both records when the RPC fails", async () => {
    setSupabase(
      makeStub((fn) =>
        fn === "merge_humans"
          ? { data: null, error: { message: "merge blew up" } }
          : { data: null, error: null },
      ),
    );
    const { result } = renderHook(() => useHarness());

    let outcome;
    await act(async () => {
      outcome = await result.current.mergeHumans("h1", "h2");
    });

    expect(outcome).toEqual({ ok: false, error: "merge blew up" });
    expect(result.current.humansById.h2.id).toBe("h2");
    expect(result.current.totalCount).toBe(2);
  });
});

describe("useHumanLifecycle signup approval", () => {
  it("approveSignup calls the RPC, sends the welcome and marks the human approved", async () => {
    const stub = makeStub();
    setSupabase(stub);
    const { result } = renderHook(() => useHarness());

    let outcome;
    await act(async () => {
      outcome = await result.current.approveSignup("h1");
    });

    expect(outcome).toEqual({ ok: true });
    expect(stub.rpc).toHaveBeenCalledWith("approve_customer_signup", {
      p_human_id: "h1",
    });
    expect(stub.functions.invoke).toHaveBeenCalledWith(
      "notify-customer-welcome",
      { body: { human_id: "h1" } },
    );
    expect(result.current.humansById.h1.approvedAt).toBeTruthy();
    expect(result.current.humans["Sarah Jones"].approvedAt).toBeTruthy();
  });

  it("fails fast on RPC error without sending the welcome", async () => {
    const stub = makeStub((fn) =>
      fn === "approve_customer_signup"
        ? { data: null, error: { message: "staff only" } }
        : { data: null, error: null },
    );
    setSupabase(stub);
    const { result } = renderHook(() => useHarness());

    expect(await result.current.approveSignup("h1")).toEqual({
      ok: false,
      error: "staff only",
    });
    expect(stub.functions.invoke).not.toHaveBeenCalled();
  });

  it("a failed or throwing welcome message never fails the approval", async () => {
    // The approval has committed by the time the welcome goes out, so a
    // messaging hiccup must downgrade to a warning (logger.warn).
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const stub = makeStub(undefined, {
      invokeImpl: () => {
        throw new Error("network gone");
      },
    });
    setSupabase(stub);
    const { result } = renderHook(() => useHarness());

    let outcome;
    await act(async () => {
      outcome = await result.current.approveSignup("h1");
    });

    expect(outcome).toEqual({ ok: true });
    expect(result.current.humansById.h1.approvedAt).toBeTruthy();
    expect(warn).toHaveBeenCalled();
  });

  it("rejectSignup archives the human out of the maps and the directory", async () => {
    const stub = makeStub();
    setSupabase(stub);
    const { result } = renderHook(() => useHarness());

    let outcome;
    await act(async () => {
      outcome = await result.current.rejectSignup("h2", "spam signup");
    });

    expect(outcome).toEqual({ ok: true });
    expect(stub.rpc).toHaveBeenCalledWith("reject_customer_signup", {
      p_human_id: "h2",
      p_reason: "spam signup",
    });
    expect(result.current.humansById.h2).toBeUndefined();
    expect(result.current.directoryHumans.map((h) => h.id)).toEqual(["h1"]);
    expect(result.current.totalCount).toBe(1);
  });

  it("rejectSignup defaults the reason to null and keeps the human on RPC failure", async () => {
    const stub = makeStub((fn) =>
      fn === "reject_customer_signup"
        ? { data: null, error: { message: "staff only" } }
        : { data: null, error: null },
    );
    setSupabase(stub);
    const { result } = renderHook(() => useHarness());

    expect(await result.current.rejectSignup("h2")).toEqual({
      ok: false,
      error: "staff only",
    });
    expect(stub.rpc).toHaveBeenCalledWith("reject_customer_signup", {
      p_human_id: "h2",
      p_reason: null,
    });
    expect(result.current.humansById.h2.id).toBe("h2");
  });
});

describe("useHumanLifecycle offline (!supabase)", () => {
  it("connection-required actions explain themselves instead of failing silently", async () => {
    setSupabase(null);
    const { result } = renderHook(() => useHarness());

    expect(await result.current.mergeHumans("a", "b")).toEqual({
      ok: false,
      error: expect.stringMatching(/offline/),
    });
    expect(await result.current.approveSignup("a")).toEqual({
      ok: false,
      error: expect.stringMatching(/offline/),
    });
    expect(await result.current.rejectSignup("a")).toEqual({
      ok: false,
      error: expect.stringMatching(/offline/),
    });
  });
});
