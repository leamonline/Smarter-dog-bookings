// findHumanByPhone — who already holds a number, and whether they are an
// unapproved portal signup shell the Human card can link in one tap.
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { findHumanByPhone } from "./humansRepo";

function fakeQuery(result: unknown) {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "limit", "maybeSingle"]) {
    builder[method] = vi.fn((...args: unknown[]) => {
      calls.push({ method, args });
      return method === "maybeSingle" ? Promise.resolve(result) : builder;
    });
  }
  const from = vi.fn(() => builder);
  return { client: { from } as unknown as SupabaseClient, from, calls };
}

const shellRow = {
  id: "h-shell",
  name: "New member",
  surname: "Pending 7399567445",
  phone: "+447399567445",
  source: "self_signup",
  approved_at: null,
  customer_user_id: "user-1",
};

describe("findHumanByPhone", () => {
  it("looks the number up exactly, trimmed, on the humans table", async () => {
    const { client, from, calls } = fakeQuery({ data: shellRow, error: null });

    await findHumanByPhone(client, "  +447399567445 ");

    expect(from).toHaveBeenCalledWith("humans");
    expect(calls[0]).toEqual({
      method: "select",
      args: ["id, name, surname, phone, source, approved_at, customer_user_id"],
    });
    expect(calls[1]).toEqual({ method: "eq", args: ["phone", "+447399567445"] });
  });

  it("flags an unapproved self-signup with a portal login as a pending signup", async () => {
    const { client } = fakeQuery({ data: shellRow, error: null });
    const hit = await findHumanByPhone(client, "+447399567445");
    expect(hit).toEqual({
      id: "h-shell",
      name: "New member",
      surname: "Pending 7399567445",
      phone: "+447399567445",
      isPendingSignup: true,
    });
  });

  it("does not offer to link an approved, staff-created, or login-less record", async () => {
    for (const row of [
      { ...shellRow, approved_at: "2026-08-27T10:00:00Z" },
      { ...shellRow, source: null },
      { ...shellRow, customer_user_id: null },
    ]) {
      const { client } = fakeQuery({ data: row, error: null });
      const hit = await findHumanByPhone(client, "+447399567445");
      expect(hit?.isPendingSignup).toBe(false);
    }
  });

  it("returns null for a blank number, no match, or a read error", async () => {
    const blank = fakeQuery({ data: shellRow, error: null });
    expect(await findHumanByPhone(blank.client, "   ")).toBeNull();
    expect(blank.from).not.toHaveBeenCalled();

    const none = fakeQuery({ data: null, error: null });
    expect(await findHumanByPhone(none.client, "+447399567445")).toBeNull();

    const failed = fakeQuery({ data: null, error: { message: "rls" } });
    expect(await findHumanByPhone(failed.client, "+447399567445")).toBeNull();
  });
});
