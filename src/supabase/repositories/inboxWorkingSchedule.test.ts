import { expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchInboxWorkingSchedule } from "./inboxWorkingSchedule";
function client(data: unknown[] | null = [], error: unknown = null, holidayError: unknown = null) {
  const builder = { select: vi.fn().mockReturnThis(), gte: vi.fn().mockReturnThis(), lte: vi.fn().mockReturnThis(), limit: vi.fn().mockResolvedValue({ data, error }) };
  return { from: vi.fn(() => builder), rpc: vi.fn().mockResolvedValue({ data: [{ closed_from: "2026-06-15", reopens_on: "2026-06-17", enabled: true }], error: holidayError }) } as unknown as SupabaseClient;
}
it("maps a bounded operational schedule and holiday RPC", async () => {
  const c = client([{ setting_date: "2026-06-18", is_open: true, closures: [{ from: "10:00", to: "11:00" }] }]);
  const result = await fetchInboxWorkingSchedule(c, "2026-06-01", "2026-06-30");
  expect(result.days["2026-06-18"]).toEqual({ isOpen: true, closures: [{ from: "10:00", to: "11:00" }] });
  expect(result.holidays[0]).toEqual({ closedFrom: "2026-06-15", reopensOn: "2026-06-17", enabled: true });
  expect(c.rpc).toHaveBeenCalledWith("get_staff_holidays");
});
it.each([
  [null, null, null], [[], { message: "denied" }, null], [[], null, { message: "denied" }],
  [Array(1000).fill({}), null, null], [[{ is_open: null }], null, null],
  [[{ is_open: true, closures: [{ from: "bad", to: "11:00" }] }], null, null],
  [[{ is_open: true, closures: [{ from: "99:00", to: "99:30" }] }], null, null],
  [[{ is_open: true, closures: [{ from: "10:00", to: "bad" }] }], null, null],
  [[{ is_open: true, closures: [{ from: "11:00", to: "10:00" }] }], null, null],
])("fails closed for failed, truncated or invalid reads", async (data, error, holidayError) => {
  await expect(fetchInboxWorkingSchedule(client(data, error, holidayError), "2026-06-01", "2026-06-30")).rejects.toThrow();
});
