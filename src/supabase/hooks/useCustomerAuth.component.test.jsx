import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

function setSupabase(value) {
  globalThis.__customerSupabaseMock = value;
}

vi.mock("../customerClient", () => ({
  get customerSupabase() {
    return globalThis.__customerSupabaseMock;
  },
}));

// The hook reports failures through the shared logger (which forwards to
// Sentry in prod). Stub it out so deliberately-triggered error paths don't
// spam the test output or touch the Sentry wiring.
vi.mock("../../lib/logger.js", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

// The sign-in leaked-password check is a network call to HaveIBeenPwned;
// stub it and drive the verdict from globalThis so each test can pick one.
vi.mock("../../utils/pwnedPassword", () => ({
  isPasswordPwned: vi.fn(async () => globalThis.__pwnedVerdict === true),
}));

const { useCustomerAuth } = await import("./useCustomerAuth.js");
const { isPasswordPwned } = await import("../../utils/pwnedPassword");

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
    globalThis.__pwnedVerdict = false;
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

  it("checkPhone reports not-on-file without an error (the self-signup entry point)", async () => {
    const stub = makeStub({ session: null, onFile: false });
    setSupabase(stub);
    const { result } = renderHook(() => useCustomerAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let outcome;
    await act(async () => {
      outcome = await result.current.checkPhone("07700 900111");
    });
    // An unknown number is no longer a dead-end — it routes into Join the Pack,
    // so checkPhone returns on_file:false without setting a user-facing error.
    expect(outcome.on_file).toBe(false);
    expect(result.current.error).toBeNull();
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

  // ── Session bootstrap ────────────────────────────────────────────────

  it("clears loading when getSession returns an error", async () => {
    const stub = makeStub({ session: null });
    stub.auth.getSession = vi.fn(() =>
      Promise.resolve({ data: null, error: { message: "auth down" } }),
    );
    setSupabase(stub);
    const { result } = renderHook(() => useCustomerAuth());
    // A broken auth endpoint must never leave the customer on a spinner.
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toBeNull();
  });

  it("clears loading when getSession rejects unexpectedly", async () => {
    const stub = makeStub({ session: null });
    stub.auth.getSession = vi.fn(() => Promise.reject(new Error("network")));
    setSupabase(stub);
    const { result } = renderHook(() => useCustomerAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toBeNull();
  });

  it("falls back to loading=false via the 5s startup safety net", async () => {
    vi.useFakeTimers();
    try {
      const stub = makeStub({ session: null });
      // A getSession that never settles simulates a hung auth endpoint —
      // the safety-net timeout is the only thing that unblocks the UI.
      stub.auth.getSession = vi.fn(() => new Promise(() => {}));
      setSupabase(stub);
      const { result } = renderHook(() => useCustomerAuth());
      expect(result.current.loading).toBe(true);

      act(() => {
        vi.advanceTimersByTime(5000);
      });
      expect(result.current.loading).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("skips the human-record lookup when the session user has no phone", async () => {
    // E.g. a stale email-based session — there is no phone to link by, so
    // the RPC must not even be attempted.
    const stub = makeStub({ session: { user: { id: "u1" } } });
    setSupabase(stub);
    const { result } = renderHook(() => useCustomerAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user?.id).toBe("u1");
    expect(result.current.humanRecord).toBeNull();
    expect(stub.rpc).not.toHaveBeenCalled();
  });

  it("applies a session from onAuthStateChange and clears it on sign-out", async () => {
    const stub = makeStub({ session: null });
    setSupabase(stub);
    const { result } = renderHook(() => useCustomerAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      stub._trigger("SIGNED_IN", { user: { id: "u1", phone: "+447700900111" } });
    });
    await waitFor(() => expect(result.current.humanRecord?.id).toBe("h1"));

    act(() => {
      stub._trigger("SIGNED_OUT", null);
    });
    expect(result.current.user).toBeNull();
    expect(result.current.humanRecord).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it("ignores a stale link result when a newer session change has run", async () => {
    const stub = makeStub({ session: null });
    // First lookup hangs until we release it; second resolves straight away.
    // If the stale-run guard fails, the late first result would overwrite
    // the newer session's record.
    let releaseFirst;
    const firstLookup = new Promise((resolve) => {
      releaseFirst = resolve;
    });
    let calls = 0;
    stub.rpc = vi.fn(() => {
      calls += 1;
      if (calls === 1) return firstLookup;
      return Promise.resolve({ data: [{ id: "h2", name: "Newer" }], error: null });
    });
    setSupabase(stub);
    const { result } = renderHook(() => useCustomerAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      stub._trigger("SIGNED_IN", { user: { id: "u1", phone: "+447700900111" } });
      stub._trigger("SIGNED_IN", { user: { id: "u2", phone: "+447700900222" } });
    });
    await waitFor(() => expect(result.current.humanRecord?.id).toBe("h2"));

    await act(async () => {
      releaseFirst({ data: [{ id: "h1", name: "Older" }], error: null });
    });
    // The newer session's record must survive the older lookup landing late.
    expect(result.current.humanRecord?.id).toBe("h2");
  });

  // ── linkHumanRecord failure modes (exercised via session bootstrap) ──

  it("leaves humanRecord null when the link RPC errors", async () => {
    const session = { user: { id: "u1", phone: "+447700900111" } };
    setSupabase(
      makeStub({
        session,
        linkRpcResult: { data: null, error: { message: "rpc boom" } },
      }),
    );
    const { result } = renderHook(() => useCustomerAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));
    // The customer stays signed in; only the salon record is missing.
    expect(result.current.user).toEqual(session.user);
    expect(result.current.humanRecord).toBeNull();
  });

  it("leaves humanRecord null when no human row matches or it is already claimed", async () => {
    const session = { user: { id: "u1", phone: "+447700900111" } };
    setSupabase(makeStub({ session, linkRpcResult: { data: [], error: null } }));
    const { result } = renderHook(() => useCustomerAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.humanRecord).toBeNull();
  });

  it("still clears loading when the link RPC throws during bootstrap", async () => {
    const session = { user: { id: "u1", phone: "+447700900111" } };
    const stub = makeStub({ session });
    stub.rpc = vi.fn(() => Promise.reject(new Error("rpc crashed")));
    setSupabase(stub);
    const { result } = renderHook(() => useCustomerAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.humanRecord).toBeNull();
  });

  // ── checkPhone failure modes ─────────────────────────────────────────

  it("checkPhone surfaces the rate-limit message from the Edge Function", async () => {
    const stub = makeStub({ session: null });
    stub.functions.invoke = vi.fn(() =>
      Promise.resolve({
        data: null,
        error: {
          name: "FunctionsHttpError",
          context: { status: 429, json: async () => ({ error: "rate_limited" }) },
        },
      }),
    );
    setSupabase(stub);
    const { result } = renderHook(() => useCustomerAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let outcome;
    await act(async () => {
      outcome = await result.current.checkPhone("07700 900111");
    });
    expect(outcome.error.message).toBe("Rate limited");
    expect(result.current.error).toBe(
      "Too many attempts. Please wait a minute and try again.",
    );
  });

  it("checkPhone reports the login service unavailable on FunctionsRelayError", async () => {
    const stub = makeStub({ session: null });
    // No context at all — the relay never reached the function.
    stub.functions.invoke = vi.fn(() =>
      Promise.resolve({ data: null, error: { name: "FunctionsRelayError" } }),
    );
    setSupabase(stub);
    const { result } = renderHook(() => useCustomerAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let outcome;
    await act(async () => {
      outcome = await result.current.checkPhone("07700 900111");
    });
    expect(outcome.error).toBeTruthy();
    expect(result.current.error).toMatch(/Login service isn't available/);
  });

  it("checkPhone treats a 404 with an unreadable body as a missing function", async () => {
    const stub = makeStub({ session: null });
    // json() throwing exercises the swallow-and-fall-through branch before
    // the status check picks the 404 up as an undeployed Edge Function.
    stub.functions.invoke = vi.fn(() =>
      Promise.resolve({
        data: null,
        error: {
          name: "FunctionsHttpError",
          context: {
            status: 404,
            json: async () => {
              throw new Error("no body");
            },
          },
        },
      }),
    );
    setSupabase(stub);
    const { result } = renderHook(() => useCustomerAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.checkPhone("07700 900111");
    });
    expect(result.current.error).toMatch(/Login service isn't available/);
  });

  it("checkPhone falls back to the generic message on other function errors", async () => {
    const stub = makeStub({ session: null });
    stub.functions.invoke = vi.fn(() =>
      Promise.resolve({
        data: null,
        error: {
          name: "FunctionsHttpError",
          context: { status: 500, json: async () => ({ error: "server_error" }) },
        },
      }),
    );
    setSupabase(stub);
    const { result } = renderHook(() => useCustomerAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let outcome;
    await act(async () => {
      outcome = await result.current.checkPhone("07700 900111");
    });
    expect(outcome.error).toBeTruthy();
    expect(result.current.error).toBe(
      "Could not send your login code. Please check your number and try again.",
    );
  });

  it("checkPhone treats a missing has_password as false (older Edge Function build)", async () => {
    const stub = makeStub({ session: null });
    stub.functions.invoke = vi.fn(() =>
      Promise.resolve({ data: { on_file: true }, error: null }),
    );
    setSupabase(stub);
    const { result } = renderHook(() => useCustomerAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let outcome;
    await act(async () => {
      outcome = await result.current.checkPhone("07700 900111");
    });
    // The safe default routes the customer down the code path, which works
    // regardless of whether their account actually has a password.
    expect(outcome).toEqual({ on_file: true, has_password: false });
  });

  // ── sendOtp ──────────────────────────────────────────────────────────

  it("sendOtp refuses to send before a phone has been checked", async () => {
    const stub = makeStub({ session: null });
    setSupabase(stub);
    const { result } = renderHook(() => useCustomerAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let outcome;
    await act(async () => {
      outcome = await result.current.sendOtp("captcha-token");
    });
    expect(outcome.error.message).toBe("No phone");
    expect(stub.auth.signInWithOtp).not.toHaveBeenCalled();
  });

  it("sendOtp surfaces a send failure without marking the code as sent", async () => {
    const stub = makeStub({ session: null });
    stub.auth.signInWithOtp = vi.fn(() =>
      Promise.resolve({ error: { message: "twilio down" } }),
    );
    setSupabase(stub);
    const { result } = renderHook(() => useCustomerAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.checkPhone("07700 900111");
    });
    let outcome;
    await act(async () => {
      outcome = await result.current.sendOtp("captcha-token");
    });
    expect(outcome.error).toBeTruthy();
    expect(result.current.otpSent).toBe(false);
    expect(result.current.error).toBe(
      "Could not send your login code. Please check your number and try again.",
    );
  });

  it("sendOtp omits captcha options when no token is supplied", async () => {
    const stub = makeStub({ session: null });
    setSupabase(stub);
    const { result } = renderHook(() => useCustomerAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.checkPhone("07700 900111");
    });
    await act(async () => {
      await result.current.sendOtp();
    });
    // Supabase rejects an explicit undefined captchaToken, so the options
    // object must be absent entirely.
    expect(stub.auth.signInWithOtp).toHaveBeenCalledWith({
      phone: "+447700900111",
    });
  });

  // ── signInWithPassword ───────────────────────────────────────────────

  it("signInWithPassword refuses to run before a phone has been checked", async () => {
    const stub = makeStub({ session: null });
    setSupabase(stub);
    const { result } = renderHook(() => useCustomerAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let outcome;
    await act(async () => {
      outcome = await result.current.signInWithPassword("pw", "captcha-token");
    });
    expect(outcome.error.message).toBe("No phone");
    expect(stub.auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it("signInWithPassword shows only the generic error on failure", async () => {
    const stub = makeStub({
      session: null,
      hasPassword: true,
      passwordSignInResult: {
        data: null,
        error: { message: "Invalid login credentials" },
      },
    });
    setSupabase(stub);
    const { result } = renderHook(() => useCustomerAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.checkPhone("07700 900111");
    });
    let outcome;
    await act(async () => {
      outcome = await result.current.signInWithPassword("wrong-pw", "captcha-token");
    });
    expect(outcome.error).toBeTruthy();
    // Deliberately generic: the message must not reveal whether the number
    // exists or has a password — only offer the code fallback.
    expect(result.current.error).toBe(
      "That number and password don't match. Try again, or get a code by text.",
    );
    expect(result.current.user).toBeNull();
  });

  // ── verifyOtp ────────────────────────────────────────────────────────

  it("signInWithPassword leaves the gate closed when the password is not known-breached", async () => {
    const stub = makeStub({ session: null, onFile: true, hasPassword: true });
    setSupabase(stub);
    const { result } = renderHook(() => useCustomerAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.checkPhone("07700 900111");
    });
    let outcome;
    await act(async () => {
      outcome = await result.current.signInWithPassword("a-fine-password", "captcha-token");
    });
    expect(isPasswordPwned).toHaveBeenCalledWith("a-fine-password");
    expect(outcome.passwordCompromised).toBe(false);
    expect(result.current.mustSetPassword).toBe(false);
    expect(result.current.passwordCompromised).toBe(false);
  });

  it("signInWithPassword forces a new password when HaveIBeenPwned knows the one just used", async () => {
    globalThis.__pwnedVerdict = true;
    const stub = makeStub({ session: null, onFile: true, hasPassword: true });
    setSupabase(stub);
    const { result } = renderHook(() => useCustomerAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.checkPhone("07700 900111");
    });
    let outcome;
    await act(async () => {
      outcome = await result.current.signInWithPassword("password", "captcha-token");
    });
    // The sign-in itself still succeeds — the gate, not a refusal, does the work.
    expect(outcome.data?.user?.phone).toBe("+447700900111");
    expect(outcome.passwordCompromised).toBe(true);
    expect(result.current.mustSetPassword).toBe(true);
    expect(result.current.passwordCompromised).toBe(true);

    // Completing the gate clears both flags together.
    await act(async () => {
      result.current.clearMustSetPassword();
    });
    expect(result.current.mustSetPassword).toBe(false);
    expect(result.current.passwordCompromised).toBe(false);
  });

  it("signInWithPassword also honours the server's own weakPassword warning", async () => {
    const stub = makeStub({
      session: null,
      onFile: true,
      hasPassword: true,
      passwordSignInResult: {
        data: { user: { phone: "+447700900111" }, weakPassword: { reasons: ["pwned"] } },
        error: null,
      },
    });
    setSupabase(stub);
    const { result } = renderHook(() => useCustomerAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.checkPhone("07700 900111");
    });
    await act(async () => {
      await result.current.signInWithPassword("server-says-weak", "captcha-token");
    });
    expect(result.current.mustSetPassword).toBe(true);
    expect(result.current.passwordCompromised).toBe(true);
  });

  it("signInWithPassword does not consult HaveIBeenPwned when the sign-in itself fails", async () => {
    globalThis.__pwnedVerdict = true;
    const stub = makeStub({
      session: null,
      onFile: true,
      hasPassword: true,
      passwordSignInResult: { data: null, error: { message: "Invalid login credentials" } },
    });
    setSupabase(stub);
    const { result } = renderHook(() => useCustomerAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await result.current.checkPhone("07700 900111");
    });
    await act(async () => {
      await result.current.signInWithPassword("wrong-pw", "captcha-token");
    });
    expect(isPasswordPwned).not.toHaveBeenCalledWith("wrong-pw");
    expect(result.current.mustSetPassword).toBe(false);
  });

  it("verifyOtp surfaces a bad code without opening the set-password gate", async () => {
    const stub = makeStub({
      session: null,
      otpVerifyResult: { data: null, error: { message: "Token has expired" } },
    });
    setSupabase(stub);
    const { result } = renderHook(() => useCustomerAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.checkPhone("07700 900111");
    });
    let outcome;
    await act(async () => {
      outcome = await result.current.verifyOtp("000000", { isReset: true });
    });
    expect(outcome.error).toBeTruthy();
    expect(result.current.error).toBe(
      "That code did not work. Please check it and try again.",
    );
    // A failed reset code must NOT force a password change.
    expect(result.current.mustSetPassword).toBe(false);
    expect(result.current.user).toBeNull();
  });

  it("verifyOtp skips linking when the verified user has no phone", async () => {
    const stub = makeStub({
      session: null,
      otpVerifyResult: { data: { user: { id: "u-no-phone" } }, error: null },
    });
    setSupabase(stub);
    const { result } = renderHook(() => useCustomerAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let outcome;
    await act(async () => {
      outcome = await result.current.verifyOtp("123456");
    });
    expect(outcome.data?.user?.id).toBe("u-no-phone");
    expect(stub.rpc).not.toHaveBeenCalled();
  });

  // ── createPendingHuman / refreshHumanRecord ──────────────────────────

  it("createPendingHuman returns null when the RPC errors", async () => {
    const stub = makeStub({ session: null });
    stub.rpc = vi.fn((fn) =>
      fn === "create_pending_customer"
        ? Promise.resolve({ data: null, error: { message: "rpc boom" } })
        : Promise.resolve({ data: [{ id: "h1" }], error: null }),
    );
    setSupabase(stub);
    const { result } = renderHook(() => useCustomerAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let outcome;
    await act(async () => {
      outcome = await result.current.createPendingHuman();
    });
    expect(outcome).toBeNull();
    // A failed shell-row insert must not attempt the follow-up link.
    expect(stub.rpc).toHaveBeenCalledTimes(1);
  });

  it("createPendingHuman creates the shell row then refreshes the linked record", async () => {
    const stub = makeStub({ session: null });
    setSupabase(stub);
    const { result } = renderHook(() => useCustomerAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let outcome;
    await act(async () => {
      outcome = await result.current.createPendingHuman();
    });
    expect(stub.rpc).toHaveBeenCalledWith("create_pending_customer");
    expect(stub.rpc).toHaveBeenCalledWith("link_customer_to_human");
    expect(outcome?.id).toBe("h1");
    expect(result.current.humanRecord?.id).toBe("h1");
  });

  it("refreshHumanRecord re-fetches and stores the linked record", async () => {
    const stub = makeStub({ session: null });
    setSupabase(stub);
    const { result } = renderHook(() => useCustomerAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let outcome;
    await act(async () => {
      outcome = await result.current.refreshHumanRecord();
    });
    expect(outcome?.id).toBe("h1");
    expect(result.current.humanRecord?.id).toBe("h1");
  });

  // ── signOut / resetOtp ───────────────────────────────────────────────

  it("signOut clears user, record, OTP state and the reset flag", async () => {
    const stub = makeStub({ session: null });
    setSupabase(stub);
    const { result } = renderHook(() => useCustomerAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));

    // Build up a full signed-in state first so the wipe is meaningful.
    await act(async () => {
      await result.current.checkPhone("07700 900111");
      await result.current.sendOtp("captcha-token");
      await result.current.verifyOtp("123456", { isReset: true });
    });
    expect(result.current.user).toBeTruthy();
    expect(result.current.otpSent).toBe(true);
    expect(result.current.mustSetPassword).toBe(true);

    await act(async () => {
      await result.current.signOut();
    });
    expect(stub.auth.signOut).toHaveBeenCalledOnce();
    expect(result.current.user).toBeNull();
    expect(result.current.humanRecord).toBeNull();
    expect(result.current.otpSent).toBe(false);
    expect(result.current.phone).toBe("");
    expect(result.current.mustSetPassword).toBe(false);
  });

  it("resetOtp returns to the phone-entry step and clears any error", async () => {
    const stub = makeStub({ session: null });
    stub.auth.signInWithOtp = vi.fn(() =>
      Promise.resolve({ error: { message: "twilio down" } }),
    );
    setSupabase(stub);
    const { result } = renderHook(() => useCustomerAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.checkPhone("07700 900111");
      await result.current.sendOtp("captcha-token");
    });
    expect(result.current.error).toBeTruthy();

    act(() => {
      result.current.resetOtp();
    });
    expect(result.current.otpSent).toBe(false);
    expect(result.current.phone).toBe("");
    expect(result.current.error).toBeNull();
    expect(result.current.mustSetPassword).toBe(false);
  });

  // ── Offline guards ───────────────────────────────────────────────────

  it("every entry point short-circuits with the Offline error when no client exists", async () => {
    setSupabase(null);
    const { result } = renderHook(() => useCustomerAuth());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const offline = { error: { message: "Offline" } };
    await act(async () => {
      expect(await result.current.checkPhone("07700 900111")).toEqual(offline);
      expect(await result.current.sendOtp("captcha-token")).toEqual(offline);
      expect(await result.current.signInWithPassword("pw", "tok")).toEqual(offline);
      expect(await result.current.verifyOtp("123456")).toEqual(offline);
      expect(await result.current.createPendingHuman()).toBeNull();
      // refreshHumanRecord rides on linkHumanRecord, whose own guard
      // returns null rather than an error shape.
      expect(await result.current.refreshHumanRecord()).toBeNull();
      // signOut is a no-op offline — it must not throw.
      await result.current.signOut();
    });
    expect(result.current.error).toBe("Not connected.");
  });
});
