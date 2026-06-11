import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

// vi.mock factories must not reference outer variables, so stub state lives
// on globalThis (same pattern as the other hook component tests).
function setSupabase(value) {
  globalThis.__supabaseMockAuth = value;
}

vi.mock("../client.js", () => ({
  get supabase() {
    return globalThis.__supabaseMockAuth;
  },
}));

vi.mock("../bootPrefetch.js", () => ({
  primeBootPrefetch: vi.fn(),
  takeBootPrefetch: vi.fn(() => null),
  _resetBootPrefetchForTests: vi.fn(),
}));

const { primeBootPrefetch } = await import("../bootPrefetch.js");
const { useAuth } = await import("./useAuth.js");

const PROFILE = {
  id: "sp-1",
  user_id: "user-1",
  role: "owner",
  display_name: "Bleep",
};

const SESSION = {
  access_token: "token",
  user: { id: "user-1", email: "bleep@smarterdog.test" },
};

// Auth + profile stub. `order` is a shared trace: primeBootPrefetch and the
// staff_profiles read both push into it so tests can assert their relative
// ordering. fireAuth replays a captured onAuthStateChange event.
function makeSupabaseStub({ session = null, order = [] } = {}) {
  let authCallback = null;
  return {
    auth: {
      getSession: vi.fn(() =>
        Promise.resolve({ data: { session }, error: null }),
      ),
      onAuthStateChange: vi.fn((cb) => {
        authCallback = cb;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }),
    },
    from: vi.fn((table) => {
      order.push(`from:${table}`);
      const builder = {
        select: vi.fn(() => builder),
        eq: vi.fn(() => builder),
        single: vi.fn(() => Promise.resolve({ data: PROFILE, error: null })),
      };
      return builder;
    }),
    fireAuth: (event, s) => authCallback?.(event, s),
  };
}

beforeEach(() => {
  setSupabase(undefined);
  primeBootPrefetch.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useAuth boot prefetch priming", () => {
  it("primes once with a session, in the same flush as (and before) the profile fetch", async () => {
    const order = [];
    primeBootPrefetch.mockImplementation(() => order.push("prime"));
    const stub = makeSupabaseStub({ session: SESSION, order });
    setSupabase(stub);

    const { result } = renderHook(() => useAuth());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user?.id).toBe("user-1");
    expect(result.current.staffProfile).toEqual(PROFILE);

    expect(primeBootPrefetch).toHaveBeenCalledTimes(1);
    // The prime must precede the staff_profiles read so the tier-1 queries
    // and the profile fetch leave in the same task, concurrently.
    expect(order[0]).toBe("prime");
    expect(order).toContain("from:staff_profiles");
    expect(order.indexOf("prime")).toBeLessThan(
      order.indexOf("from:staff_profiles"),
    );
  });

  it("never primes when there is no session", async () => {
    const stub = makeSupabaseStub({ session: null });
    setSupabase(stub);

    const { result } = renderHook(() => useAuth());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toBeNull();
    expect(primeBootPrefetch).not.toHaveBeenCalled();
    expect(stub.from).not.toHaveBeenCalled();
  });

  it("does not re-prime on a later auth event (TOKEN_REFRESHED)", async () => {
    const stub = makeSupabaseStub({ session: SESSION });
    setSupabase(stub);

    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(primeBootPrefetch).toHaveBeenCalledTimes(1);
    const profileFetches = stub.from.mock.calls.length;

    await act(async () => {
      stub.fireAuth("TOKEN_REFRESHED", SESSION);
      // Let scheduleProfileFetch's setTimeout(0) task run.
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    // The auth event still refetches the profile…
    await waitFor(() =>
      expect(stub.from.mock.calls.length).toBeGreaterThan(profileFetches),
    );
    // …but must not re-prime the boot prefetch.
    expect(primeBootPrefetch).toHaveBeenCalledTimes(1);
  });
});
