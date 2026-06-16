import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { webcrypto } from "node:crypto";
import { isPasswordPwned } from "./pwnedPassword";

// SHA-1("password") = 5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8
const PW = "password";
const PREFIX = "5BAA6";
const SUFFIX = "1E4C9B93F3F0682250B6CF8331B7EE68FD8";

function mockFetch(body: string, ok = true) {
  return vi.fn(async (url: unknown) => {
    expect(String(url)).toContain(`/range/${PREFIX}`);
    return { ok, text: async () => body } as unknown as Response;
  });
}

describe("isPasswordPwned", () => {
  beforeEach(() => {
    // Guarantee Web Crypto SHA-1 is available regardless of the test env.
    if (!globalThis.crypto?.subtle) {
      vi.stubGlobal("crypto", webcrypto);
    }
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("returns true when the hash suffix is present with a non-zero count", async () => {
    vi.stubGlobal("fetch", mockFetch(`${SUFFIX}:42\r\nFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF:3`));
    expect(await isPasswordPwned(PW)).toBe(true);
  });

  it("returns false when the suffix isn't in the range", async () => {
    vi.stubGlobal("fetch", mockFetch("0000000000000000000000000000000000000:5"));
    expect(await isPasswordPwned(PW)).toBe(false);
  });

  it("ignores padded decoy entries with count 0", async () => {
    vi.stubGlobal("fetch", mockFetch(`${SUFFIX}:0`));
    expect(await isPasswordPwned(PW)).toBe(false);
  });

  it("fails open (false) on a non-OK response", async () => {
    vi.stubGlobal("fetch", mockFetch("", false));
    expect(await isPasswordPwned(PW)).toBe(false);
  });

  it("fails open (false) when fetch throws", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network down"); }));
    expect(await isPasswordPwned(PW)).toBe(false);
  });

  it("returns false for an empty password without calling fetch", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    expect(await isPasswordPwned("")).toBe(false);
    expect(f).not.toHaveBeenCalled();
  });
});
