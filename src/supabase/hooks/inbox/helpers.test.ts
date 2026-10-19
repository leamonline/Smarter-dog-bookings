import { describe, it, expect, vi } from "vitest";
import { invokeWithSessionRetry, parseSupabaseFunctionError, SESSION_EXPIRED_MESSAGE } from "./helpers";

describe("parseSupabaseFunctionError", () => {
  it("turns any 401 into the plain sign-in-again message", async () => {
    const error = { message: "non-2xx", context: { status: 401, json: async () => ({ error: "invalid token" }) } };
    expect(await parseSupabaseFunctionError(error, "fallback")).toBe(SESSION_EXPIRED_MESSAGE);
  });

  it("still surfaces the function's own reason for other failures", async () => {
    const error = { message: "non-2xx", context: { status: 400, json: async () => ({ error: "bad", detail: "why" }) } };
    expect(await parseSupabaseFunctionError(error, "fallback")).toBe("bad: why");
  });
});

describe("invokeWithSessionRetry", () => {
  const unauthorised = { data: null, error: { context: { status: 401 } } };
  const ok = { data: { ok: true }, error: null };
  function fake(results: unknown[], refresh = { data: { session: {} }, error: null }) {
    const invoke = vi.fn();
    for (const r of results) invoke.mockResolvedValueOnce(r);
    const refreshSession = vi.fn(async () => refresh);
    return { client: { functions: { invoke }, auth: { refreshSession } } as never, invoke, refreshSession };
  }

  it("passes a success straight through without touching the session", async () => {
    const { client, invoke, refreshSession } = fake([ok]);
    expect(await invokeWithSessionRetry(client, "whatsapp-send", { body: { a: 1 } })).toBe(ok);
    expect(invoke).toHaveBeenCalledWith("whatsapp-send", { body: { a: 1 } });
    expect(refreshSession).not.toHaveBeenCalled();
  });

  it("refreshes and retries the same call once after a 401", async () => {
    const { client, invoke, refreshSession } = fake([unauthorised, ok]);
    expect(await invokeWithSessionRetry(client, "whatsapp-send", { body: { a: 1 } })).toBe(ok);
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenNthCalledWith(2, "whatsapp-send", { body: { a: 1 } });
  });

  it("retries only once even if the second call is also a 401", async () => {
    const { client, invoke } = fake([unauthorised, unauthorised]);
    await invokeWithSessionRetry(client, "whatsapp-send", { body: {} });
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it("returns the original 401 without retrying when the refresh fails", async () => {
    const { client, invoke } = fake([unauthorised], { data: { session: null }, error: { message: "revoked" } } as never);
    expect(await invokeWithSessionRetry(client, "whatsapp-send", { body: {} })).toBe(unauthorised);
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("never refreshes on a non-401 failure", async () => {
    const failed = { data: null, error: { context: { status: 500 } } };
    const { client, refreshSession } = fake([failed]);
    expect(await invokeWithSessionRetry(client, "whatsapp-send", { body: {} })).toBe(failed);
    expect(refreshSession).not.toHaveBeenCalled();
  });
});
