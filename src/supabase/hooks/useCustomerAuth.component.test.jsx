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

function makeStub({
  session = null,
  onFile = true,
  hasPassword = false,
  linkRpcResult,
  otpVerifyResult,
  passwordSignInResult,
} = {}) {
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
      signInWithPassword: vi.fn(() =>
        Promise.resolve(
          passwordSignInResult ?? {
            data: { user: { phone: "+447700900111" } },
            error: null,
          },
        ),
      ),
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
        Promise.resolve({
          data: { on_file: onFile, has_password: hasPassword },
          error: null,
        }),
      ),
    },
    rpc: vi.fn(() =>
      Promise.resolve(
        linkRpcResult ?? {
          data: [
            {
              id: "h1",
              name: "Sarah",
              surname: "Jones",
              phone: "07700900111",
              has_password: hasPassword,
            },
          ],
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
    setSupabase(makeStub({ session, hasPassword: true }));
    const { result } = renderHook(() => useCustomerAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toEqual(session.user);
    expect(result.current.humanRecord?.id).toBe("h1");
    // has_password rides on the linked record.
    expect(result.current.hasPassword).toBe(true);
  });

  it("checkPhone rejects an invalid phone format without calling the API", async () => {
    const stub = makeStub({ session: null });
    setSupabase(stub);
    const { result } = renderHook(() => useCustomerAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let outcome;
    await act(async () => {
      outcome = await result.current.checkPhone("not-a-phone");
    });
    expect(outcome.error.message).toBe("Invalid phone number");
    expect(stub.functions.invoke).not.toHaveBeenCalled();
    expect(stub.auth.signInWithOtp).not.toHaveBeenCalled();
  });

  it("checkPhone reports a returning customer and sends no SMS", async () => {
    const stub = makeStub({ session: null, onFile: true, hasPassword: true });
    setSupabase(stub);
    const { result } = renderHook(() => useCustomerAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let outcome;
    await act(async () => {
      outcome = await result.current.checkPhone("07700 900111");
    });
    expect(outcome).toMatchObject({ on_file: true, has_password: true });
    expect(stub.functions.invoke).toHaveBeenCalledOnce();
    expect(stub.auth.signInWithOtp).not.toHaveBeenCalled();
  });

  it("checkPhone reports a first-time customer (on file, no password)", async () => {
    const stub = makeStub({ session: null, onFile: true, hasPassword: false });
    setSupabase(stub);
    const { result } = renderHook(() => useCustomerAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let outcome;
    await act(async () => {
      outcome = await result.current.checkPhone("07700 900111");
    });
    expect(outcome).toMatchObject({ on_file: true, has_password: false });
  });

  it("checkPhone surfaces the not-on-file error when the lookup says false", async () => {
    const stub = makeStub({ session: null, onFile: false });
    setSupabase(stub);
    const { result } = renderHook(() => useCustomerAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let outcome;
    await act(async () => {
      outcome = await result.current.checkPhone("07700 900111");
    });
    expect(outcome.on_file).toBe(false);
    expect(result.current.error).toMatch(/don't have that number on file/i);
    expect(stub.auth.signInWithOtp).not.toHaveBeenCalled();
  });

  it("sendOtp texts the checked phone with the captcha token", async () => {
    const stub = makeStub({ session: null, onFile: true, hasPassword: false });
    setSupabase(stub);
    const { result } = renderHook(() => useCustomerAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.checkPhone("07700 900111");
    });
    await act(async () => {
      await result.current.sendOtp("captcha-token");
    });

    expect(stub.auth.signInWithOtp).toHaveBeenCalledWith({
      phone: "+447700900111",
      options: { captchaToken: "captcha-token" },
    });
    expect(result.current.otpSent).toBe(true);
  });

  it("signInWithPassword signs in with phone + password + captcha", async () => {
    const stub = makeStub({ session: null, onFile: true, hasPassword: true });
    setSupabase(stub);
    const { result } = renderHook(() => useCustomerAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.checkPhone("07700 900111");
    });
    let outcome;
    await act(async () => {
      outcome = await result.current.signInWithPassword("hunter2pw", "captcha-token");
    });

    expect(stub.auth.signInWithPassword).toHaveBeenCalledWith({
      phone: "+447700900111",
      password: "hunter2pw",
      options: { captchaToken: "captcha-token" },
    });
    expect(outcome.data?.user?.phone).toBe("+447700900111");
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
    // A plain (non-reset) OTP verify must not force a password reset.
    expect(result.current.mustSetPassword).toBe(false);
  });

  it("verifyOtp with { isReset } flags a required password reset", async () => {
    const stub = makeStub({ session: null, hasPassword: true });
    setSupabase(stub);
    const { result } = renderHook(() => useCustomerAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.checkPhone("07700 900111");
    });
    await act(async () => {
      await result.current.verifyOtp("123456", { isReset: true });
    });
    expect(result.current.mustSetPassword).toBe(true);

    // clearMustSetPassword resets it (called by the gate's onComplete).
    await act(async () => {
      result.current.clearMustSetPassword();
    });
    expect(result.current.mustSetPassword).toBe(false);
  });
});
