// Repository reads introduced when the inbox side-panel hooks stopped using
// the Supabase client directly (Tier 1.1f). Each test pins the table, the
// selected columns and the filters, and that an AbortSignal is threaded
// through, so the query bodies can't drift from what the hooks assumed.
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { BOOKING_STATUS, keepingNullStatusOr, occupyingStatusOr } from "../../constants/salon";
import { listOwnerBookingsOnDate, listRecentPastForOwner, listSeatsOnDate, listUpcomingForOwner } from "./bookingsRepo";
import { listCustomerContextDogs } from "./dogsRepo";
import { getCustomerContextProfile, listTrustedContactsWithNames } from "./humansRepo";
import { escapeLike, searchMessageConversationIds } from "./whatsappRepo";

const HUMAN = "41000000-0000-4000-8000-000000000001";

type Call = { method: string; args: unknown[] };

/**
 * A chainable PostgREST stand-in: every builder method records its call and
 * returns the same object; awaiting it resolves to `result`.
 */
function fakeQuery(result: unknown) {
  const calls: Call[] = [];
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "lt", "gte", "or", "not", "neq", "order", "limit", "ilike", "abortSignal", "maybeSingle"]) {
    builder[method] = vi.fn((...args: unknown[]) => {
      calls.push({ method, args });
      return builder;
    });
  }
  builder.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve);
  const from = vi.fn(() => builder);
  return { client: { from } as unknown as SupabaseClient, from, calls };
}

const argsOf = (calls: Call[], method: string) => calls.filter((c) => c.method === method).map((c) => c.args);

describe("getCustomerContextProfile", () => {
  it("reads the context columns for one human as a maybeSingle, with the signal", async () => {
    const { client, from, calls } = fakeQuery({ data: { id: HUMAN }, error: null });
    const signal = new AbortController().signal;

    await getCustomerContextProfile(client, HUMAN, signal);

    expect(from).toHaveBeenCalledWith("humans");
    expect(argsOf(calls, "select")[0][0]).toContain("history_flag");
    expect(argsOf(calls, "eq")).toEqual([["id", HUMAN]]);
    expect(argsOf(calls, "abortSignal")).toEqual([[signal]]);
    expect(argsOf(calls, "maybeSingle")).toHaveLength(1);
  });
});

describe("listTrustedContactsWithNames", () => {
  it("joins the contact's own name through the trusted_id relationship", async () => {
    const { client, from, calls } = fakeQuery({ data: [], error: null });

    await listTrustedContactsWithNames(client, HUMAN);

    expect(from).toHaveBeenCalledWith("human_trusted_contacts");
    expect(argsOf(calls, "select")[0][0]).toContain("trusted:humans!trusted_id(id, name, surname)");
    expect(argsOf(calls, "eq")).toEqual([["human_id", HUMAN]]);
    expect(argsOf(calls, "abortSignal")).toHaveLength(0);
  });
});

describe("listCustomerContextDogs", () => {
  it("reads the owner's dogs ordered by name", async () => {
    const { client, from, calls } = fakeQuery({ data: [], error: null });

    await listCustomerContextDogs(client, HUMAN);

    expect(from).toHaveBeenCalledWith("dogs");
    expect(argsOf(calls, "select")[0][0]).toContain("groom_notes");
    expect(argsOf(calls, "eq")).toEqual([["human_id", HUMAN]]);
    expect(argsOf(calls, "order")).toEqual([["name"]]);
  });
});

describe("listRecentPastForOwner", () => {
  it("filters through the dogs join, before the given date, newest first, bounded", async () => {
    const { client, from, calls } = fakeQuery({ data: [], error: null });
    const signal = new AbortController().signal;

    await listRecentPastForOwner(client, { humanId: HUMAN, before: "2026-09-02" }, signal);

    expect(from).toHaveBeenCalledWith("bookings");
    expect(argsOf(calls, "select")[0][0]).toContain("dogs!inner(name, human_id)");
    expect(argsOf(calls, "eq")).toEqual([["dogs.human_id", HUMAN]]);
    expect(argsOf(calls, "lt")).toEqual([["booking_date", "2026-09-02"]]);
    expect(argsOf(calls, "order")).toEqual([
      ["booking_date", { ascending: false }],
      ["slot", { ascending: false }],
    ]);
    expect(argsOf(calls, "limit")).toEqual([[40]]);
    expect(argsOf(calls, "abortSignal")).toEqual([[signal]]);
  });

  it("honours a caller-supplied limit", async () => {
    const { client, calls } = fakeQuery({ data: [], error: null });

    await listRecentPastForOwner(client, { humanId: HUMAN, before: "2026-09-02", limit: 5 });

    expect(argsOf(calls, "limit")).toEqual([[5]]);
  });
});

describe("listUpcomingForOwner", () => {
  it("keeps a NULL status, drops ended visits, and lists soonest first", async () => {
    const { client, calls } = fakeQuery({ data: [], error: null });
    const signal = new AbortController().signal;

    await listUpcomingForOwner(client, { humanId: HUMAN, from: "2026-11-14" }, signal);

    expect(argsOf(calls, "gte")).toEqual([["booking_date", "2026-11-14"]]);
    expect(argsOf(calls, "or")).toEqual([[keepingNullStatusOr([
      BOOKING_STATUS.CANCELLED,
      BOOKING_STATUS.NO_SHOW,
      BOOKING_STATUS.COMPLETED,
    ])]]);
    expect(argsOf(calls, "order")).toEqual([
      ["booking_date", { ascending: true }],
      ["slot", { ascending: true }],
    ]);
    expect(argsOf(calls, "abortSignal")).toEqual([[signal]]);
  });
});

describe("listOwnerBookingsOnDate", () => {
  it("keeps a NULL status, which is treated as Booked, and still drops Cancelled", async () => {
    const { client, from, calls } = fakeQuery({ data: [], error: null });

    await listOwnerBookingsOnDate(client, "2026-09-02", HUMAN);

    expect(from).toHaveBeenCalledWith("bookings");
    expect(argsOf(calls, "eq")).toEqual([
      ["booking_date", "2026-09-02"],
      ["dogs.human_id", HUMAN],
    ]);
    expect(keepingNullStatusOr([BOOKING_STATUS.CANCELLED])).toBe(
      'status.is.null,status.not.in.("Cancelled")',
    );
    expect(argsOf(calls, "or")).toEqual([[keepingNullStatusOr([BOOKING_STATUS.CANCELLED])]]);
    expect(argsOf(calls, "neq")).toEqual([]);
  });
});

describe("listSeatsOnDate", () => {
  it("keeps a NULL status, which still occupies a seat", async () => {
    // booking_occupies_seat() treats NULL as Booked. A bare not.in drops
    // those rows, because SQL NOT IN is not true for NULL.
    const rows = [{ id: "b1", slot: "09:00", size: "small", dog_id: "d1" }];
    const { client, from, calls } = fakeQuery({ data: rows, error: null });

    const result = await listSeatsOnDate(client, "2026-09-02");

    expect(from).toHaveBeenCalledWith("bookings");
    expect(argsOf(calls, "select")).toEqual([["id, slot, size, dog_id"]]);
    expect(argsOf(calls, "eq")).toEqual([["booking_date", "2026-09-02"]]);
    expect(occupyingStatusOr()).toBe(
      'status.is.null,status.not.in.("Cancelled","No-show")',
    );
    expect(argsOf(calls, "or")).toEqual([[occupyingStatusOr()]]);
    expect(argsOf(calls, "not")).toEqual([]);
    expect(result).toEqual({ rows, error: null });
  });

  it("returns an empty list with the error when the read fails", async () => {
    const error = new Error("boom");
    const { client } = fakeQuery({ data: null, error });

    expect(await listSeatsOnDate(client, "2026-09-02")).toEqual({ rows: [], error });
  });
});

describe("escapeLike", () => {
  it("escapes the LIKE wildcards and the escape character itself", () => {
    expect(escapeLike("50% off_now\\")).toBe("50\\% off\\_now\\\\");
    expect(escapeLike("plain")).toBe("plain");
  });
});

describe("searchMessageConversationIds", () => {
  it("searches message content case-insensitively with the escaped query, bounded", async () => {
    const { client, from, calls } = fakeQuery({
      data: [{ conversation_id: "c1" }, { conversation_id: null }, { conversation_id: "c2" }],
      error: null,
    });

    const result = await searchMessageConversationIds(client, "100%", 2000);

    expect(from).toHaveBeenCalledWith("whatsapp_messages");
    expect(argsOf(calls, "select")).toEqual([["conversation_id"]]);
    expect(argsOf(calls, "ilike")).toEqual([["content", "%100\\%%"]]);
    expect(argsOf(calls, "limit")).toEqual([[2000]]);
    expect(result).toEqual({ conversationIds: ["c1", "c2"], error: null });
  });

  it("returns no ids with the error when the read fails", async () => {
    const error = new Error("boom");
    const { client } = fakeQuery({ data: null, error });

    expect(await searchMessageConversationIds(client, "x", 10)).toEqual({ conversationIds: [], error });
  });
});
