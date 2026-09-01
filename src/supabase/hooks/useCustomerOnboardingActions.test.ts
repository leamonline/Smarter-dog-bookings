import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../customerClient", () => ({
  get customerSupabase() {
    return (globalThis as { __onboardingClient?: unknown }).__onboardingClient ?? null;
  },
}));
vi.mock("../rpc", () => ({
  completeCustomerProfile: vi.fn(async () => ({ data: null, error: null })),
  submitCustomerSignup: vi.fn(async () => ({ data: null, error: null })),
}));

const {
  completeProfile,
  lookupPostcode,
  setPassword,
  submitSignup,
  useCustomerOnboardingActions,
} = await import("./useCustomerOnboardingActions");
const rpc = await import("../rpc");

const updateUser = vi.fn(async () => ({ data: { user: {} }, error: null }));
const invoke = vi.fn(async () => ({ data: { addresses: [] }, error: null }));
const client = { auth: { updateUser }, functions: { invoke } };

beforeEach(() => {
  (globalThis as { __onboardingClient?: unknown }).__onboardingClient = client;
  vi.clearAllMocks();
});

describe("useCustomerOnboardingActions", () => {
  it("reports connected only when a customer client exists, and is a stable singleton", () => {
    expect(useCustomerOnboardingActions().connected).toBe(true);
    expect(useCustomerOnboardingActions()).toBe(useCustomerOnboardingActions());
    (globalThis as { __onboardingClient?: unknown }).__onboardingClient = null;
    expect(useCustomerOnboardingActions().connected).toBe(false);
  });

  it("completes the profile through the RPC with the customer client", async () => {
    const input = { name: "Sarah", surname: "Jones", address: "1 Bark Lane", postcode: "SW1A 1AA", policiesVersion: "2026-07" };
    await completeProfile(input);
    expect(rpc.completeCustomerProfile).toHaveBeenCalledWith(client, input);
  });

  it("submits the signup through the RPC with the customer client", async () => {
    const input = { owner: { name: "Sarah" }, dogs: [] } as unknown as Parameters<typeof submitSignup>[0];
    await submitSignup(input);
    expect(rpc.submitCustomerSignup).toHaveBeenCalledWith(client, input);
  });

  it("sets the password through Supabase Auth", async () => {
    await setPassword("correct horse battery");
    expect(updateUser).toHaveBeenCalledWith({ password: "correct horse battery" });
  });

  it("looks a postcode up through the Edge Function and returns the raw result", async () => {
    const result = await lookupPostcode("SW1A 1AA");
    expect(invoke).toHaveBeenCalledWith("postcode-lookup", { body: { postcode: "SW1A 1AA" } });
    expect(result).toEqual({ data: { addresses: [] }, error: null });
  });

  it("rejects rather than calling anything when there is no client", async () => {
    (globalThis as { __onboardingClient?: unknown }).__onboardingClient = null;
    await expect(setPassword("x")).rejects.toThrow("Not connected");
    await expect(lookupPostcode("x")).rejects.toThrow("Not connected");
    await expect(completeProfile({} as never)).rejects.toThrow("Not connected");
    await expect(submitSignup({} as never)).rejects.toThrow("Not connected");
    expect(updateUser).not.toHaveBeenCalled();
    expect(rpc.completeCustomerProfile).not.toHaveBeenCalled();
  });
});
