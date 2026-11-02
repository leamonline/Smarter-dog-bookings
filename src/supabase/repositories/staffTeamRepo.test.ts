import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { listStaffTeam, toStaffMember } from "./staffTeamRepo";

describe("toStaffMember", () => {
  it("maps snake_case to camelCase and trims the name", () => {
    expect(
      toStaffMember({ id: "p1", user_id: "u1", role: "owner", display_name: "  Leam ", created_at: "2026-01-01" }),
    ).toEqual({ id: "p1", userId: "u1", role: "owner", displayName: "Leam", createdAt: "2026-01-01" });
  });

  it("treats anything but 'owner' as plain staff, and tolerates null columns", () => {
    expect(toStaffMember({ id: "p", user_id: "u", role: "admin", display_name: null, created_at: null })).toEqual({
      id: "p",
      userId: "u",
      role: "staff",
      displayName: "",
      createdAt: null,
    });
  });
});

describe("listStaffTeam", () => {
  it("reads staff_profiles oldest first and returns mapped members", async () => {
    const order = vi.fn().mockResolvedValue({
      data: [{ id: "p1", user_id: "u1", role: "staff", display_name: "Sam", created_at: "2026-02-01" }],
      error: null,
    });
    const select = vi.fn(() => ({ order }));
    const from = vi.fn(() => ({ select }));
    const client = { from } as unknown as SupabaseClient;

    const result = await listStaffTeam(client);

    expect(from).toHaveBeenCalledWith("staff_profiles");
    expect(select).toHaveBeenCalledWith("id, user_id, role, display_name, created_at");
    expect(order).toHaveBeenCalledWith("created_at", { ascending: true });
    expect(result.error).toBeNull();
    expect(result.data).toEqual([
      { id: "p1", userId: "u1", role: "staff", displayName: "Sam", createdAt: "2026-02-01" },
    ]);
  });

  it("passes a query error through and returns no members", async () => {
    const error = { message: "boom" };
    const client = {
      from: () => ({ select: () => ({ order: () => Promise.resolve({ data: null, error }) }) }),
    } as unknown as SupabaseClient;

    const result = await listStaffTeam(client);
    expect(result.error).toBe(error);
    expect(result.data).toEqual([]);
  });
});
