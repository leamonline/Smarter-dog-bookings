import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getCancellationHistory } from "./cancellationHistoryRepo";
vi.mock("../client", () => ({ supabase: null }));
const client = (data: unknown, error: unknown = null) => ({ rpc: vi.fn().mockResolvedValue({ data, error }) }) as unknown as SupabaseClient;
describe("staff cancellation history projection", () => {
  it("maps the server count and incident without changing the deposit decision", async () => {
    expect(await getCancellationHistory("human", client({ count: 3, reviewRequired: true, windowMonths: 12, items: [{ id: "incident", booking_date: "2026-10-02", requested_at: "2026-10-01T12:00:00Z", reason: "Cannot attend", actor_scope: "customer", waived_at: null, waiver_reason: null }] }))).toEqual({ count: 3, reviewRequired: true, items: [{ id: "incident", bookingDate: "2026-10-02", requestedAt: "2026-10-01T12:00:00Z", reason: "Cannot attend", actorScope: "customer", waivedAt: null, waiverReason: null }] });
  });
  it("rejects unreadable or malformed history rather than showing zero", async () => {
    for (const data of [null, {}, { count: -1, reviewRequired: false, windowMonths: 12, items: [] }, { count: 0, reviewRequired: false, windowMonths: 12, items: [null] }]) {
      await expect(getCancellationHistory("human", client(data))).rejects.toThrow();
    }
    await expect(getCancellationHistory("human", client(null, new Error("staff_only")))).rejects.toThrow("staff_only");
  });
});
