import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

function setSupabase(value) {
  globalThis.__customerSupabaseMock = value;
}

vi.mock("../customerClient.js", () => ({
  get customerSupabase() {
    return globalThis.__customerSupabaseMock;
  },
}));

const { useCustomerAuth } = await import("./useCustomerAuth.js");

function makeStub({ session = null, onFile = true, linkRpcResult, otpVerifyResult } = {}) {
  const authStateListeners = [];
  return {
    auth: {
      onAuthStateChange: vi.fn((cb) => {
        authStateListeners.push(cb);
        return {
          data: {
            subscription: { unsubscribe: vi.fn() },
          },
        };
      }),
      getSession: vi.fn(() => Promise.resolve({ data: { session }, error: null })),
      signInWithOtp: vi.fn(() => Promise.resolve({ error: null })),
      verifyOtp: vi.fn(() =>
        Promise.resolve(
          otpVerifyResult ?? {
            data: { user: { phone: "+447700900111" } },
            error: null,
          },
        ),
      ),
      signOut: vi.fn(() => Promise.resolve({ error: null })),
    },
    functions: {
      invoke: vi.fn(() =>
        Promise.resolve({ data: { on_file: onFile }, error: null }),
      ),
    },
    rpc: vi.fn(() =>
      Promise.resolve(
        linkRpcResult ?? {
          data: [{ id: "h1", name: "Sarah", surname: "Jones", phone: "07700900111" }],
          error: null,
        },
      ),
    ),
    _trigger(event, sess) {
      for (const cb of authStateListeners) cb(event, sess);
    },
  };
}

describe("useCustomerAuth", () => {
  beforeEach(() => {
    setSupabase(undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns loading=false and no user in offline mode", async () => {
    setSupabase(null);
    const { result } = renderHook(() => useCustomerAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toBeNull();
    expect(result.current.humanRecord).toBeNull();
  });

  it("resolves with no session and clears loading", async () => {
    setSupabase(makeStub({ session: null }));
    const { result } = renderHook(() => useCustomerAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toBeNull();
  });

  it("links the human record when a session is already present", async () => {
    const session = { user: { id: "u1", phone: "+447700900111" } };
    setSupabase(makeStub({ session }));
    const { result } = renderHook(() => useCustomerAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toEqual(session.user);
    expect(result.current.humanRecord?.id).toBe("h1");
  });

  it("requestOtp rejects an invalid phone format without calling the API", async () => {
    const stub = makeStub({ session: null });
    setSupabase(stub);
    const { result } = renderHook(() => useCustomerAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let outcome;
    await act(async () => {
      outcome = await result.current.requestOtp("not-a-phone");
    });
    expect(outcome.error.message).toBe("Invalid phone number");
    expect(stub.functions.invoke).not.toHaveBeenCalled();
    expect(stub.auth.signInWithOtp).not.toHaveBeenCalled();
  });

  it("requestOtp surfaces the not-on-file error when the lookup says false", async () => {
    const stub = makeStub({ session: null, onFile: false });
    setSupabase(stub);
    const { result } = renderHook(() => useCustomerAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let outcome;
    await act(async () => {
      outcome = await result.current.requestOtp("07700 900111");
    });
    expect(outcome.error.message).toBe("Phone not on file");
    expect(stub.auth.signInWithOtp).not.toHaveBeenCalled();
  });

  it("verifyOtp sets user + human record on success", async () => {
    const stub = makeStub({ session: null });
    setSupabase(stub);
    const { result } = renderHook(() => useCustomerAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let outcome;
    await act(async () => {
      outcome = await result.current.verifyOtp("123456");
    });
    expect(outcome.data?.user?.phone).toBe("+447700900111");
    expect(result.current.user?.phone).toBe("+447700900111");
    expect(result.current.humanRecord?.id).toBe("h1");
  });
});
