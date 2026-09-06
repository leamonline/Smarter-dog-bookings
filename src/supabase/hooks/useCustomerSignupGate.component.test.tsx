// useCustomerSignupGate — where a linked customer sits in the Join the Pack
// lifecycle, and whether a pending signup is a CLAIM on an existing record.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

vi.mock("../customerClient", () => ({
  get customerSupabase() {
    return (globalThis as { __customerSupabaseMockGate?: unknown }).__customerSupabaseMockGate;
  },
}));
vi.mock("../../lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

const { useCustomerSignupGate } = await import("./useCustomerSignupGate");

type Row = {
  approved_at: string | null;
  signup_submitted_at: string | null;
  claims_human_id: string | null;
};

function setClient(result: { data: Row | null; error: { message: string } | null }) {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq"]) {
    builder[method] = vi.fn((...args: unknown[]) => {
      calls.push({ method, args });
      return builder;
    });
  }
  builder.single = vi.fn(() => Promise.resolve(result));
  const from = vi.fn(() => builder);
  (globalThis as { __customerSupabaseMockGate?: unknown }).__customerSupabaseMockGate = { from };
  return { from, calls };
}

beforeEach(() => {
  (globalThis as { __customerSupabaseMockGate?: unknown }).__customerSupabaseMockGate = undefined;
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("useCustomerSignupGate", () => {
  it("reads the claim column alongside the two lifecycle columns", async () => {
    const { from, calls } = setClient({
      data: { approved_at: "2026-01-01T00:00:00Z", signup_submitted_at: null, claims_human_id: null },
      error: null,
    });
    const { result } = renderHook(() => useCustomerSignupGate({ id: "h1" }));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(from).toHaveBeenCalledWith("humans");
    expect(calls[0]).toEqual({
      method: "select",
      args: ["approved_at, signup_submitted_at, claims_human_id"],
    });
    expect(result.current.status).toBe("approved");
    expect(result.current.claimsExisting).toBe(false);
  });

  it("is 'onboarding' before submit and 'pending' after, with no claim by default", async () => {
    setClient({ data: { approved_at: null, signup_submitted_at: null, claims_human_id: null }, error: null });
    const first = renderHook(() => useCustomerSignupGate({ id: "h1" }));
    await waitFor(() => expect(first.result.current.loading).toBe(false));
    expect(first.result.current.status).toBe("onboarding");

    setClient({
      data: { approved_at: null, signup_submitted_at: "2026-09-02T10:00:00Z", claims_human_id: null },
      error: null,
    });
    const second = renderHook(() => useCustomerSignupGate({ id: "h2" }));
    await waitFor(() => expect(second.result.current.loading).toBe(false));
    expect(second.result.current.status).toBe("pending");
    expect(second.result.current.claimsExisting).toBe(false);
  });

  it("flags a pending signup that claims an existing customer", async () => {
    setClient({
      data: { approved_at: null, signup_submitted_at: "2026-09-02T10:00:00Z", claims_human_id: "h-existing" },
      error: null,
    });
    const { result } = renderHook(() => useCustomerSignupGate({ id: "h-shell" }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.status).toBe("pending");
    expect(result.current.claimsExisting).toBe(true);
  });

  it("never reports a claim once the record is approved (the shell is gone by then)", async () => {
    setClient({
      data: { approved_at: "2026-09-02T11:00:00Z", signup_submitted_at: "2026-09-02T10:00:00Z", claims_human_id: "h-existing" },
      error: null,
    });
    const { result } = renderHook(() => useCustomerSignupGate({ id: "h1" }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.status).toBe("approved");
    expect(result.current.claimsExisting).toBe(false);
  });

  it("fails open to 'approved' on a read error", async () => {
    setClient({ data: null, error: { message: "rls" } });
    const { result } = renderHook(() => useCustomerSignupGate({ id: "h1" }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.status).toBe("approved");
    expect(result.current.claimsExisting).toBe(false);
  });
});
