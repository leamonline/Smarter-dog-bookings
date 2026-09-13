import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the staff client's chainable query builder so we can assert the exact
// query shape the repo builds (the point of Debt #12: queries become testable
// instead of hand-built in JSX).
const mocks = vi.hoisted(() => {
  const eq = vi.fn().mockResolvedValue({ data: null, error: null });
  const update = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ update }));
  const updateUser = vi.fn().mockResolvedValue({ data: {}, error: null });
  return { eq, update, from, updateUser };
});
vi.mock("../client", () => ({
  supabase: { from: mocks.from, auth: { updateUser: mocks.updateUser } },
}));

import { isAccountBackendAvailable, updateStaffProfile, updateAccountEmail } from "./accountRepo";

describe("accountRepo", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reports the backend available when the client exists", () => {
    expect(isAccountBackendAvailable()).toBe(true);
  });

  it("updates staff_profiles with camelCase mapped to the DB columns", async () => {
    await updateStaffProfile("p1", { displayName: "Sarah", phone: "07700 900000" });
    expect(mocks.from).toHaveBeenCalledWith("staff_profiles");
    expect(mocks.update).toHaveBeenCalledWith({ display_name: "Sarah", phone: "07700 900000" });
    expect(mocks.eq).toHaveBeenCalledWith("id", "p1");
  });

  it("changes the login email via auth", async () => {
    await updateAccountEmail("new@example.com");
    expect(mocks.updateUser).toHaveBeenCalledWith({ email: "new@example.com" });
  });
});
