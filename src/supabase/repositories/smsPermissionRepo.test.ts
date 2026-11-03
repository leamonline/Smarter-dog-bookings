import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { confirmSms, listSmsPermissionHistory, withdrawSms } from "./smsPermissionRepo";

const client = (over: Record<string, unknown>) => over as unknown as SupabaseClient;

describe("smsPermissionRepo writes", () => {
  it("calls the audited confirm RPC with the reason, and returns the audit id", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { audit_id: "audit-1" }, error: null });
    await expect(confirmSms(client({ rpc }), "h1", "Rang her: texts fine")).resolves.toEqual({ ok: true, auditId: "audit-1" });
    expect(rpc).toHaveBeenCalledWith("staff_confirm_sms_permission", { p_human_id: "h1", p_reason: "Rang her: texts fine" });
  });

  it("calls the withdraw RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { audit_id: "audit-2" }, error: null });
    await withdrawSms(client({ rpc }), "h1", "She asked us to stop");
    expect(rpc).toHaveBeenCalledWith("staff_withdraw_sms_permission", { p_human_id: "h1", p_reason: "She asked us to stop" });
  });

  it("returns the database's refusal, with its detail code, instead of throwing", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: "P0001", message: "Texts are not paused", details: "nothing_to_confirm" } });
    await expect(confirmSms(client({ rpc }), "h1", "Rang her: texts fine")).resolves.toEqual({
      ok: false,
      error: { code: "P0001", message: "Texts are not paused", details: "nothing_to_confirm" },
    });
  });

  it("treats a transport failure as a failure, never as success", async () => {
    const rpc = vi.fn().mockRejectedValue(new Error("network down"));
    const out = await confirmSms(client({ rpc }), "h1", "Rang her: texts fine");
    expect(out).toMatchObject({ ok: false, error: { message: "network down" } });
  });
});

describe("listSmsPermissionHistory", () => {
  const chain = (result: unknown) => {
    const q: Record<string, unknown> = {};
    q.select = vi.fn(() => q);
    q.eq = vi.fn(() => q);
    q.order = vi.fn(() => q);
    q.limit = vi.fn(() => Promise.resolve(result));
    return q;
  };

  it("reads this customer's audit rows newest first and narrows them", async () => {
    const q = chain({
      data: [{ id: "a", action: "confirmed", reason: "Rang her: texts fine", confirmed_by: "u", confirmed_by_name: "Sam", created_at: "2026-11-03T10:00:00Z" }, { id: "bad" }],
      error: null,
    });
    const from = vi.fn(() => q);
    const out = await listSmsPermissionHistory(client({ from }), "h1");
    expect(from).toHaveBeenCalledWith("sms_permission_confirmations");
    expect(q.eq).toHaveBeenCalledWith("human_id", "h1");
    expect(q.order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(out).toMatchObject({ ok: true, rows: [{ id: "a", confirmedByName: "Sam" }] });
  });

  it("reports a failed read as an error, not an empty history", async () => {
    const q = chain({ data: null, error: { code: "42501", message: "denied" } });
    const out = await listSmsPermissionHistory(client({ from: () => q }), "h1");
    expect(out).toMatchObject({ ok: false, error: { code: "42501" } });
  });
});
