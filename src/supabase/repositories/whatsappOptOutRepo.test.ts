import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getNumberOptOutScope,
  reenableNumber,
  type NumberOptOutScope,
} from "./whatsappOptOutRepo";

const SARAH = "11111111-1111-4111-8111-111111111111";
const TOM = "22222222-2222-4222-8222-222222222222";
const CONVERSATION = "33333333-3333-4333-8333-333333333333";
const AUDIT = "44444444-4444-4444-8444-444444444444";
const LAST_STOP = "2026-10-14T10:30:00.123456+00:00";

function stub(result: unknown) {
  const rpc = vi.fn(async () => result);
  return { client: { rpc } as unknown as SupabaseClient, rpc };
}

function throwing(cause: unknown) {
  const rpc = vi.fn(async () => {
    throw cause;
  });
  return { client: { rpc } as unknown as SupabaseClient, rpc };
}

const scopeRow = {
  phone_key: "7700900123",
  number_stopped_at: "2026-10-03T13:05:00.000001+00:00",
  last_stop_at: LAST_STOP,
  records: [
    {
      id: SARAH,
      name: "Sarah Jones",
      phone: "07700 900123",
      reason: "asked_on_whatsapp",
      opted_out_at: "2026-10-03T13:05:00.000001+00:00",
    },
    { id: TOM, name: "", phone: "+447700900123", reason: "Asked by phone", opted_out_at: null },
  ],
};

function scope(overrides: Partial<NumberOptOutScope> = {}): NumberOptOutScope {
  return {
    phone: "07700 900123",
    phoneKey: "7700900123",
    numberStoppedAt: "2026-10-03T13:05:00.000001+00:00",
    lastStopAt: LAST_STOP,
    records: [
      { id: SARAH, name: "Sarah Jones", phone: "07700 900123", reason: "asked_on_whatsapp", optedOutAt: null },
      { id: TOM, name: "", phone: "+447700900123", reason: "Asked by phone", optedOutAt: null },
    ],
    ...overrides,
  };
}

describe("getNumberOptOutScope", () => {
  it("sends exactly the phone and maps the scope to camelCase", async () => {
    const { client, rpc } = stub({ data: scopeRow, error: null });
    const result = await getNumberOptOutScope(client, "07700 900123");
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("staff_whatsapp_number_opt_out_scope", { p_phone: "07700 900123" });
    expect(result).toEqual({
      value: {
        phone: "07700 900123",
        phoneKey: "7700900123",
        numberStoppedAt: "2026-10-03T13:05:00.000001+00:00",
        lastStopAt: LAST_STOP,
        records: [
          {
            id: SARAH,
            name: "Sarah Jones",
            phone: "07700 900123",
            reason: "asked_on_whatsapp",
            optedOutAt: "2026-10-03T13:05:00.000001+00:00",
          },
          { id: TOM, name: "", phone: "+447700900123", reason: "Asked by phone", optedOutAt: null },
        ],
      },
      error: null,
    });
  });

  it("keeps the latest STOP byte for byte", async () => {
    const { client } = stub({ data: scopeRow, error: null });
    const result = await getNumberOptOutScope(client, "+447700900123");
    expect(result.value?.lastStopAt).toBe("2026-10-14T10:30:00.123456+00:00");
  });

  it("accepts a number that never said STOP and has no record", async () => {
    const { client } = stub({
      data: { phone_key: "7700900123", number_stopped_at: null, last_stop_at: null, records: [] },
      error: null,
    });
    const result = await getNumberOptOutScope(client, "+447700900123");
    expect(result.value).toMatchObject({ numberStoppedAt: null, lastStopAt: null, records: [] });
  });

  it.each([
    ["a record id that is not a uuid", { ...scopeRow, records: [{ ...scopeRow.records[0], id: "h1" }] }],
    ["records that are not an array", { ...scopeRow, records: {} }],
    ["a missing phone key", { ...scopeRow, phone_key: undefined }],
    ["a null name", { ...scopeRow, records: [{ ...scopeRow.records[0], name: null }] }],
    ["a numeric reason", { ...scopeRow, records: [{ ...scopeRow.records[0], reason: 1 }] }],
    ["a record that is not an object", { ...scopeRow, records: ["x"] }],
    ["a stop time that is not a string", { ...scopeRow, last_stop_at: 1 }],
    ["no payload at all", null],
  ])("refuses %s rather than show a partial scope", async (_label, data) => {
    const { client } = stub({ data, error: null });
    const result = await getNumberOptOutScope(client, "+447700900123");
    expect(result.value).toBeNull();
    expect(result.error).toMatchObject({ code: "INVALID_OPT_OUT_SCOPE", details: null, thrown: false });
  });

  it("keeps the code and DETAIL of a refusal", async () => {
    const { client } = stub({
      data: null,
      error: { code: "P0001", message: "Not a phone number", details: "invalid_phone", hint: null },
    });
    const result = await getNumberOptOutScope(client, "abc");
    expect(result).toEqual({
      value: null,
      error: { code: "P0001", message: "Not a phone number", details: "invalid_phone", thrown: false },
    });
  });

  it("normalises an error with missing fields", async () => {
    const { client } = stub({ data: null, error: { message: "" } });
    const result = await getNumberOptOutScope(client, "+447700900123");
    expect(result.error).toEqual({ code: "", message: "The request failed.", details: null, thrown: false });
    const odd = await getNumberOptOutScope(stub({ data: null, error: "boom" }).client, "+447700900123");
    expect(odd.error).toEqual({ code: "", message: "The request failed.", details: null, thrown: false });
  });

  it("reports a thrown transport error as thrown", async () => {
    const result = await getNumberOptOutScope(throwing(new TypeError("Failed to fetch")).client, "x");
    expect(result).toEqual({
      value: null,
      error: { code: "", message: "Failed to fetch", details: null, thrown: true },
    });
    const bare = await getNumberOptOutScope(throwing("nope").client, "x");
    expect(bare.error).toMatchObject({ message: "The request failed.", thrown: true });
  });
});

describe("reenableNumber", () => {
  const ok = {
    data: {
      phone_key: "7700900123",
      human_ids: [SARAH, TOM],
      conversation_ids: [CONVERSATION],
      audit_id: AUDIT,
    },
    error: null,
  };

  it("sends exactly the scope: every record whatever its reason, the verbatim STOP and the trimmed note", async () => {
    const { client, rpc } = stub(ok);
    await reenableNumber(client, scope(), "  Rang the salon and asked for reminders again.\n");
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("staff_reenable_whatsapp_number", {
      p_phone: "07700 900123",
      p_human_ids: [SARAH, TOM],
      p_last_stop_at: "2026-10-14T10:30:00.123456+00:00",
      p_permission_note: "Rang the salon and asked for reminders again.",
    });
  });

  it("sends a null STOP for a number that never said STOP", async () => {
    const { client, rpc } = stub(ok);
    await reenableNumber(client, scope({ numberStoppedAt: null, lastStopAt: null }), "Asked in person today");
    expect(rpc.mock.calls[0]).toEqual([
      "staff_reenable_whatsapp_number",
      expect.objectContaining({ p_last_stop_at: null, p_human_ids: [SARAH, TOM] }),
    ]);
  });

  it("sends no records for a stopped number with no customer record", async () => {
    const { client, rpc } = stub({ ...ok, data: { ...ok.data, human_ids: [] } });
    await reenableNumber(client, scope({ records: [] }), "Asked in person today");
    expect(rpc.mock.calls[0]).toEqual([
      "staff_reenable_whatsapp_number",
      expect.objectContaining({ p_human_ids: [], p_last_stop_at: LAST_STOP }),
    ]);
  });

  it("refuses an empty scope without a request", async () => {
    const { client, rpc } = stub(ok);
    const result = await reenableNumber(
      client,
      scope({ records: [], numberStoppedAt: null, lastStopAt: null }),
      "Asked in person today",
    );
    expect(rpc).not.toHaveBeenCalled();
    expect(result.value).toBeNull();
    expect(result.error).toMatchObject({ details: "nothing_to_reenable", thrown: false });
  });

  it("maps what the server switched back on", async () => {
    const { client } = stub(ok);
    const result = await reenableNumber(client, scope(), "Asked in person today");
    expect(result).toEqual({
      value: { phoneKey: "7700900123", humanIds: [SARAH, TOM], conversationIds: [CONVERSATION], auditId: AUDIT },
      error: null,
    });
  });

  it("keeps the code and DETAIL of a refusal", async () => {
    const { client } = stub({
      data: null,
      error: {
        code: "P0001",
        message: "This number's opt-outs have changed.",
        details: "reenable_scope_changed",
        hint: null,
      },
    });
    const result = await reenableNumber(client, scope(), "Asked in person today");
    expect(result.error).toEqual({
      code: "P0001",
      message: "This number's opt-outs have changed.",
      details: "reenable_scope_changed",
      thrown: false,
    });
  });

  it("treats an unreadable answer as an unknown outcome, never a failure", async () => {
    const { client } = stub({ data: { ...ok.data, audit_id: "nope" }, error: null });
    const result = await reenableNumber(client, scope(), "Asked in person today");
    expect(result.value).toBeNull();
    expect(result.error).toMatchObject({ code: "", thrown: false });
    const noIds = await reenableNumber(stub({ data: { ...ok.data, human_ids: ["x"] }, error: null }).client, scope(), "Asked in person today");
    expect(noIds.error?.code).toBe("");
  });

  it("reports a thrown transport error as thrown", async () => {
    const result = await reenableNumber(throwing(new Error("socket hang up")).client, scope(), "Asked in person today");
    expect(result.error).toEqual({ code: "", message: "socket hang up", details: null, thrown: true });
  });
});
