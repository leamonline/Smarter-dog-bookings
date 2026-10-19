import { describe, it, expect } from "vitest";
import { parseSupabaseFunctionError, SESSION_EXPIRED_MESSAGE } from "./helpers";

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
