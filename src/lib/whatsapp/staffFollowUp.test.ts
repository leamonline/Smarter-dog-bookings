// Every WhatsApp dead end must leave a task on the staff to-do list, once.
import { describe, expect, it } from "vitest";
import {
  FOLLOW_UP_DEDUPE_HOURS,
  FOLLOW_UP_TODO_PREFIX,
  customerDisplayName,
  followUpTodoText,
  raiseFollowUpTodo,
  type FollowUpReason,
} from "../../../supabase/functions/_shared/staffFollowUp";

type Row = Record<string, unknown>;

/**
 * A tiny stand-in for the Supabase query builder: records every call and
 * answers the three reads raiseFollowUpTodo makes. Enough to assert what is
 * written without a database.
 */
function fakeClient(opts: { openFollowUps?: Row[]; human?: Row | null; maxSort?: number | null; failInsert?: boolean; throwOnRead?: boolean }) {
  const inserts: Row[] = [];
  const filters: Array<[string, string, unknown]> = [];
  const client = {
    from(table: string) {
      const q: Record<string, unknown> = {};
      let mode: "select" | "insert" = "select";
      let ordered = false;
      const chain = new Proxy(q, {
        get(_t, prop: string) {
          if (prop === "then") {
            // Awaiting the open-follow-ups query (no maybeSingle).
            return (resolve: (v: unknown) => void) => {
              if (opts.throwOnRead) return resolve({ data: null, error: { message: "boom" } });
              resolve({ data: opts.openFollowUps ?? [], error: null });
            };
          }
          if (prop === "maybeSingle") {
            return async () => {
              if (table === "humans") return { data: opts.human ?? null, error: null };
              if (ordered) return { data: opts.maxSort == null ? null : { sort_order: opts.maxSort }, error: null };
              return { data: null, error: null };
            };
          }
          if (prop === "insert") {
            return async (row: Row) => {
              mode = "insert";
              inserts.push({ table, ...row });
              return { error: opts.failInsert ? { message: "insert failed" } : null };
            };
          }
          if (prop === "order") {
            return () => {
              ordered = true;
              return chain;
            };
          }
          return (...args: unknown[]) => {
            if (["eq", "like", "gte"].includes(prop)) filters.push([prop, String(args[0]), args[1]]);
            void mode;
            return chain;
          };
        },
      });
      return chain;
    },
  };
  return { client: client as never, inserts, filters };
}

const NOW = new Date("2026-10-07T13:00:00Z");

describe("followUpTodoText", () => {
  it("names the customer, says what happened and where to answer", () => {
    expect(followUpTodoText("Alex Example", "manage_deadline_reschedule")).toBe(
      `${FOLLOW_UP_TODO_PREFIX} Alex Example wants to move a groom that is within 24 hours. They've been told the team will sort it — reply in the WhatsApp inbox.`,
    );
  });

  it("still reads properly without a name", () => {
    expect(followUpTodoText("  ", "confirm_expired")).toMatch(/^WhatsApp follow-up: A customer didn't confirm/);
  });

  it("has wording for every reason", () => {
    const reasons: FollowUpReason[] = [
      "manage_deadline_cancel",
      "manage_deadline_reschedule",
      "manage_selection_expired",
      "manage_booking_gone",
      "confirm_expired",
      "flow_reschedule_cutoff",
      "flow_booking_changed",
    ];
    for (const r of reasons) expect(followUpTodoText("X", r)).not.toMatch(/undefined/);
  });

  it("builds the display name from the humans row", () => {
    expect(customerDisplayName({ name: "Alex", surname: "Example" })).toBe("Alex Example");
    expect(customerDisplayName({ name: "Alex", surname: null })).toBe("Alex");
    expect(customerDisplayName(null)).toBeNull();
  });
});

describe("raiseFollowUpTodo", () => {
  it("adds an ordinary, tickable to-do linked to the customer at the bottom of the list", async () => {
    const { client, inserts } = fakeClient({ human: { name: "Alex", surname: "Example" }, maxSort: 7 });
    await expect(raiseFollowUpTodo(client, "h1", "manage_selection_expired", NOW)).resolves.toBe("created");
    expect(inserts).toEqual([
      expect.objectContaining({
        table: "salon_todos",
        human_id: "h1",
        kind: "general",
        done: false,
        sort_order: 8,
        text: expect.stringContaining("Alex Example tried to cancel or move a groom, but the menu had timed out"),
      }),
    ]);
  });

  // A customer who taps three expired buttons should leave one task, not three.
  it("does not add a second open follow-up for the same customer inside the window", async () => {
    const { client, inserts, filters } = fakeClient({ openFollowUps: [{ id: "t1" }] });
    await expect(raiseFollowUpTodo(client, "h1", "confirm_expired", NOW)).resolves.toBe("duplicate");
    expect(inserts).toHaveLength(0);
    expect(filters).toEqual(
      expect.arrayContaining([
        ["eq", "human_id", "h1"],
        ["eq", "done", false],
        ["like", "text", `${FOLLOW_UP_TODO_PREFIX}%`],
        ["gte", "created_at", new Date(NOW.getTime() - FOLLOW_UP_DEDUPE_HOURS * 3600_000).toISOString()],
      ]),
    );
  });

  it("skips quietly when the conversation has no linked customer", async () => {
    const { client, inserts } = fakeClient({});
    await expect(raiseFollowUpTodo(client, null, "flow_booking_changed", NOW)).resolves.toBe("skipped");
    expect(inserts).toHaveLength(0);
  });

  // The customer's reply has already gone; a to-do failure must not surface.
  it.each([
    ["the insert fails", { failInsert: true }],
    ["the duplicate check fails", { throwOnRead: true }],
  ])("never throws when %s", async (_label, opts) => {
    const { client } = fakeClient(opts);
    await expect(raiseFollowUpTodo(client, "h1", "manage_deadline_cancel", NOW)).resolves.toBe("failed");
  });
});
