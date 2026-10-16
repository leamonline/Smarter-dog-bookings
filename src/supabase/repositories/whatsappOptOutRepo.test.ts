import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getNumberOptOutScope,
  getSignedInUserId,
  getWhatsappOptOutNow,
  listNumberReenables,
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

describe("listNumberReenables", () => {
  const ME = "99999999-9999-4999-8999-999999999999";
  const auditRow = {
    id: AUDIT,
    human_ids: [SARAH, TOM],
    conversation_ids: [CONVERSATION],
    permission_note: "Rang the salon and asked for reminders again.",
    reenabled_by: ME,
    reenabled_at: "2026-10-14T13:00:00.000001+00:00",
  };

  /**
   * A query-builder stub that records every call and answers `result` (or,
   * one per query, each of `results` in turn).
   */
  function query(result: unknown | (() => Promise<unknown>), ...results: unknown[]) {
    const answers = [result, ...results];
    const reads: unknown[][][] = [];
    const from = vi.fn(() => {
      const calls: unknown[][] = [];
      reads.push(calls);
      const answer = answers.length > 1 ? answers.shift() : answers[0];
      const builder: Record<string, unknown> = {};
      for (const method of ["select", "eq", "overlaps", "gt", "order", "limit"]) {
        builder[method] = (...args: unknown[]) => {
          calls.push([method, ...args]);
          return builder;
        };
      }
      builder.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
        (typeof answer === "function" ? (answer as () => Promise<unknown>)() : Promise.resolve(answer)).then(resolve, reject);
      return builder;
    });
    return { client: { from } as unknown as SupabaseClient, from, reads };
  }

  it("reads the number's rows newest first, after the given time, and maps them to camelCase", async () => {
    const { client, from, reads } = query({ data: [auditRow], error: null });
    const result = await listNumberReenables(client, "7700900123", "2026-10-03T13:05:00.123456+00:00");
    expect(from).toHaveBeenCalledWith("whatsapp_opt_out_reenables");
    expect(reads).toHaveLength(1);
    expect(reads[0]).toEqual([
      ["select", "id, human_ids, conversation_ids, permission_note, reenabled_by, reenabled_at"],
      ["eq", "phone_key", "7700900123"],
      ["gt", "reenabled_at", "2026-10-03T13:05:00.123456+00:00"],
      ["order", "reenabled_at", { ascending: false }],
      ["limit", 50],
    ]);
    expect(result).toEqual({
      value: [
        {
          id: AUDIT,
          humanIds: [SARAH, TOM],
          conversationIds: [CONVERSATION],
          permissionNote: "Rang the salon and asked for reminders again.",
          reenabledBy: ME,
          reenabledAt: "2026-10-14T13:00:00.000001+00:00",
        },
      ],
      error: null,
    });
  });

  it("reads every row for the number when there is no time to start from", async () => {
    const { client, reads } = query({ data: [], error: null });
    const result = await listNumberReenables(client, "7700900123", null);
    expect(reads[0].map(([method]) => method)).toEqual(["select", "eq", "order", "limit"]);
    expect(result).toEqual({ value: [], error: null });
  });

  it("also reads the rows that switched any of the records back on, under whatever number they have now", async () => {
    // A record whose phone changed, switched back on under its new number,
    // has its row under that number's key: only its id finds it.
    const OTHER = "55555555-5555-4555-8555-555555555555";
    const newer = { ...auditRow, id: OTHER, reenabled_at: "2026-10-14T13:00:00.000002+00:00" };
    const older = { ...auditRow, reenabled_at: "2026-10-13T13:00:00+00:00", id: "66666666-6666-4666-8666-666666666666" };
    const { client, reads } = query({ data: [auditRow, older], error: null }, { data: [newer, auditRow], error: null });
    const result = await listNumberReenables(client, "7700900123", "2026-10-03T13:05:00.123456+00:00", [SARAH, TOM]);
    expect(reads).toEqual([
      [
        ["select", "id, human_ids, conversation_ids, permission_note, reenabled_by, reenabled_at"],
        ["eq", "phone_key", "7700900123"],
        ["gt", "reenabled_at", "2026-10-03T13:05:00.123456+00:00"],
        ["order", "reenabled_at", { ascending: false }],
        ["limit", 50],
      ],
      [
        ["select", "id, human_ids, conversation_ids, permission_note, reenabled_by, reenabled_at"],
        ["overlaps", "human_ids", [SARAH, TOM]],
        ["gt", "reenabled_at", "2026-10-03T13:05:00.123456+00:00"],
        ["order", "reenabled_at", { ascending: false }],
        ["limit", 50],
      ],
    ]);
    // Each row once, newest first to the microsecond.
    expect(result.value?.map((row) => row.id)).toEqual([OTHER, AUDIT, "66666666-6666-4666-8666-666666666666"]);
  });

  it("keeps rows recorded at the same instant", async () => {
    const twin = { ...auditRow, id: "77777777-7777-4777-8777-777777777777" };
    const { client } = query({ data: [auditRow, twin], error: null }, { data: [twin], error: null });
    const result = await listNumberReenables(client, "7700900123", null, [SARAH]);
    expect(result.value?.map((row) => row.id).sort()).toEqual([AUDIT, "77777777-7777-4777-8777-777777777777"].sort());
  });

  it("refuses the whole audit when the read by record fails or is unreadable", async () => {
    const refused = await listNumberReenables(
      query({ data: [auditRow], error: null }, { data: null, error: { code: "42501", message: "no", details: null } }).client,
      "7700900123",
      null,
      [SARAH],
    );
    expect(refused).toEqual({ value: null, error: { code: "42501", message: "no", details: null, thrown: false } });
    const garbled = await listNumberReenables(
      query({ data: [auditRow], error: null }, { data: [{ ...auditRow, id: "x" }], error: null }).client,
      "7700900123",
      null,
      [SARAH],
    );
    expect(garbled.error?.code).toBe("INVALID_REENABLE_AUDIT");
  });

  it.each([
    ["no list at all", null],
    ["a list that is an object", { 0: auditRow }],
    ["a row that is not an object", ["x"]],
    ["an id that is not a uuid", [{ ...auditRow, id: "a1" }]],
    ["a record id that is not a uuid", [{ ...auditRow, human_ids: [SARAH, "h1"] }]],
    ["conversation ids that are not a list", [{ ...auditRow, conversation_ids: null }]],
    ["a note that is not a string", [{ ...auditRow, permission_note: null }]],
    ["no member of staff", [{ ...auditRow, reenabled_by: null }]],
    ["an unreadable time", [{ ...auditRow, reenabled_at: "yesterday" }]],
    ["a missing time", [{ ...auditRow, reenabled_at: "" }]],
    ["one bad row among good ones", [auditRow, { ...auditRow, reenabled_at: 3 }]],
  ])("refuses %s rather than settle anything on a partial audit", async (_label, data) => {
    const { client } = query({ data, error: null });
    const result = await listNumberReenables(client, "7700900123", null);
    expect(result).toEqual({
      value: null,
      error: { code: "INVALID_REENABLE_AUDIT", message: "The response could not be verified.", details: null, thrown: false },
    });
  });

  it("keeps the code and details of a refusal", async () => {
    const { client } = query({ data: null, error: { code: "42501", message: "permission denied", details: "rls" } });
    const result = await listNumberReenables(client, "7700900123", null);
    expect(result.error).toEqual({ code: "42501", message: "permission denied", details: "rls", thrown: false });
  });

  it("reports a thrown transport error as thrown", async () => {
    const { client } = query(() => Promise.reject(new TypeError("Failed to fetch")));
    const result = await listNumberReenables(client, "7700900123", null);
    expect(result).toEqual({ value: null, error: { code: "", message: "Failed to fetch", details: null, thrown: true } });
  });
});

describe("getWhatsappOptOutNow", () => {
  /** A query-builder stub that records every call and answers `result`. */
  function query(result: unknown | (() => Promise<unknown>)) {
    const calls: unknown[][] = [];
    const builder: Record<string, unknown> = {};
    for (const method of ["select", "in"]) {
      builder[method] = (...args: unknown[]) => {
        calls.push([method, ...args]);
        return builder;
      };
    }
    builder.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
      (typeof result === "function" ? (result as () => Promise<unknown>)() : Promise.resolve(result)).then(resolve, reject);
    const from = vi.fn(() => builder);
    return { client: { from } as unknown as SupabaseClient, from, calls };
  }

  it("reads each record's switched-off flag as it is now, by id", async () => {
    const { client, from, calls } = query({
      data: [
        { id: SARAH, whatsapp_opted_out: true },
        { id: TOM, whatsapp_opted_out: false },
      ],
      error: null,
    });
    const result = await getWhatsappOptOutNow(client, [SARAH, TOM]);
    expect(from).toHaveBeenCalledWith("humans");
    expect(calls).toEqual([
      ["select", "id, whatsapp_opted_out"],
      ["in", "id", [SARAH, TOM]],
    ]);
    expect(result).toEqual({ value: { [SARAH]: true, [TOM]: false }, error: null });
  });

  it("leaves out a record it cannot see, and asks nothing for no records", async () => {
    expect(await getWhatsappOptOutNow(query({ data: [], error: null }).client, [SARAH])).toEqual({ value: {}, error: null });
    const { client, from } = query({ data: [], error: null });
    expect(await getWhatsappOptOutNow(client, [])).toEqual({ value: {}, error: null });
    expect(from).not.toHaveBeenCalled();
  });

  it.each([
    ["no list at all", null],
    ["a row that is not an object", ["x"]],
    ["an id that is not a uuid", [{ id: "h1", whatsapp_opted_out: true }]],
    ["a record it did not ask for", [{ id: CONVERSATION, whatsapp_opted_out: true }]],
    ["a flag that is not a boolean", [{ id: SARAH, whatsapp_opted_out: null }]],
  ])("refuses %s", async (_label, data) => {
    const result = await getWhatsappOptOutNow(query({ data, error: null }).client, [SARAH]);
    expect(result).toEqual({
      value: null,
      error: { code: "INVALID_OPT_OUT_STATE", message: "The response could not be verified.", details: null, thrown: false },
    });
  });

  it("keeps a refusal's code, and reports a thrown error as thrown", async () => {
    const refused = await getWhatsappOptOutNow(
      query({ data: null, error: { code: "42501", message: "permission denied", details: null } }).client,
      [SARAH],
    );
    expect(refused.error).toEqual({ code: "42501", message: "permission denied", details: null, thrown: false });
    const thrown = await getWhatsappOptOutNow(query(() => Promise.reject(new TypeError("Failed to fetch"))).client, [SARAH]);
    expect(thrown.error).toEqual({ code: "", message: "Failed to fetch", details: null, thrown: true });
  });
});

describe("getSignedInUserId", () => {
  const ME = "99999999-9999-4999-8999-999999999999";
  const session = (result: unknown) => {
    const getSession = vi.fn(async () => result);
    return { client: { auth: { getSession } } as unknown as SupabaseClient, getSession };
  };

  it("is the session's user id", async () => {
    const { client, getSession } = session({ data: { session: { user: { id: ME } } }, error: null });
    expect(await getSignedInUserId(client)).toEqual({ value: ME, error: null });
    expect(getSession).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["no session", { data: { session: null }, error: null }],
    ["no data", { data: null, error: null }],
    ["an id that is not a uuid", { data: { session: { user: { id: "staff-1" } } }, error: null }],
  ])("is an error with %s", async (_label, result) => {
    const outcome = await getSignedInUserId(session(result).client);
    expect(outcome).toEqual({
      value: null,
      error: { code: "NO_SIGNED_IN_USER", message: "The response could not be verified.", details: null, thrown: false },
    });
  });

  it("keeps an auth error's code", async () => {
    const outcome = await getSignedInUserId(
      session({ data: { session: null }, error: { code: "session_expired", message: "Session expired" } }).client,
    );
    expect(outcome.error).toEqual({ code: "session_expired", message: "Session expired", details: null, thrown: false });
  });

  it("reports a thrown error as thrown", async () => {
    const getSession = vi.fn(async () => {
      throw new Error("storage unavailable");
    });
    const outcome = await getSignedInUserId({ auth: { getSession } } as unknown as SupabaseClient);
    expect(outcome.error).toEqual({ code: "", message: "storage unavailable", details: null, thrown: true });
  });
});
