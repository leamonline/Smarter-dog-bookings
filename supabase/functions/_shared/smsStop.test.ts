// What happens when a number STOPs our texts (Twilio error 21610).
// Run locally:  deno test --node-modules-dir=none --allow-env supabase/functions/_shared/smsStop.test.ts

import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { isRecipientUnsubscribed, recordSmsStop, SMS_STOP_REASON } from "./smsStop.ts";
import { followUpTodoText, isStopReason, STOP_TODO_PREFIX } from "./staffFollowUp.ts";

interface Recorded {
  updates: Array<{ table: string; values: Record<string, unknown>; ids: string[]; guard: unknown }>;
  todos: Array<Record<string, unknown>>;
}

// A thin fake of the supabase-js calls recordSmsStop and raiseFollowUpTodo make.
function fakeClient(humans: Array<{ id: string; phone: string | null; name?: string }>, opts: { openTodo?: boolean; failUpdate?: boolean } = {}) {
  const rec: Recorded = { updates: [], todos: [] };
  const client = {
    from(table: string) {
      return {
        select(_cols: string) {
          const q: any = {
            _table: table,
            filter() { return q; },
            eq() { return q; },
            like() { return q; },
            gte() { return q; },
            order() { return q; },
            limit() { return q; },
            maybeSingle() {
              if (table === "humans") return Promise.resolve({ data: { name: "Wendy", surname: "Rowbottom" }, error: null });
              return Promise.resolve({ data: { sort_order: 2 }, error: null });
            },
            then(resolve: (v: unknown) => unknown) {
              if (table === "humans") return resolve({ data: humans, error: null });
              return resolve({ data: opts.openTodo ? [{ id: "todo-1" }] : [], error: null });
            },
          };
          return q;
        },
        insert(row: Record<string, unknown>) {
          rec.todos.push(row);
          return Promise.resolve({ error: null });
        },
        update(values: Record<string, unknown>) {
          const u: any = {
            in(_c: string, ids: string[]) { u._ids = ids; return u; },
            eq(_c: string, guard: unknown) {
              rec.updates.push({ table, values, ids: u._ids, guard });
              return Promise.resolve({ error: opts.failUpdate ? { message: "boom" } : null });
            },
          };
          return u;
        },
      };
    },
  };
  return { client, rec };
}

Deno.test("only Twilio's unsubscribed-recipient code counts as a text STOP", () => {
  assertEquals(isRecipientUnsubscribed("21610"), true);
  for (const other of ["21211", "21614", "30003", "", null, undefined]) {
    assertEquals(isRecipientUnsubscribed(other as string | null | undefined), false, String(other));
  }
});

Deno.test("a text STOP opts out every customer record on that number and flags each for staff", async () => {
  const { client, rec } = fakeClient([
    { id: "h1", phone: "07700 900123" },
    { id: "h2", phone: "+447700900123" },
    { id: "h3", phone: "07700 900999" }, // different number: must be left alone
  ]);
  const out = await recordSmsStop(client, "+447700900123");
  assertEquals(out.onNumber, 2);
  assertEquals(rec.updates.length, 1);
  assertEquals(rec.updates[0].ids, ["h1", "h2"]);
  assertEquals(rec.updates[0].values.sms_opted_out, true);
  assertEquals(rec.updates[0].values.sms_opted_out_reason, SMS_STOP_REASON);
  assertEquals(rec.updates[0].guard, false); // only flips records not already opted out
  assertEquals(rec.todos.length, 2);
  for (const todo of rec.todos) {
    assertEquals((todo.text as string).startsWith(STOP_TODO_PREFIX), true);
    assertEquals(todo.kind, "general");
  }
});

Deno.test("an unknown number records nothing and raises nothing, and does not throw", async () => {
  const { client, rec } = fakeClient([]);
  assertEquals((await recordSmsStop(client, "+447700900123")).onNumber, 0);
  assertEquals(rec.updates.length, 0);
  assertEquals(rec.todos.length, 0);
});

Deno.test("a repeat STOP does not add a second to-do while one is open", async () => {
  const { client, rec } = fakeClient([{ id: "h1", phone: "07700 900123" }], { openTodo: true });
  await recordSmsStop(client, "+447700900123");
  assertEquals(rec.todos.length, 0);
});

Deno.test("bookkeeping failures are swallowed: a refused text never becomes a crash", async () => {
  const { client } = fakeClient([{ id: "h1", phone: "07700 900123" }], { failUpdate: true });
  assertEquals((await recordSmsStop(client, "+447700900123")).onNumber, 0);
  assertEquals((await recordSmsStop(null, "+447700900123")).onNumber, 0);
});

Deno.test("the STOP to-do says what is off and what staff do next, and never quotes a message", () => {
  for (const reason of ["stopped_whatsapp", "stopped_sms"] as const) {
    assertEquals(isStopReason(reason), true);
    const text = followUpTodoText("Wendy Rowbottom", reason, "none");
    assertEquals(text.startsWith(`${STOP_TODO_PREFIX} Wendy Rowbottom `), true);
    assertEquals(text.includes("Ring them"), true);
    assertEquals(text.includes("paused"), false);
    assertEquals(text.includes("Ring them"), true);
  }
  assertEquals(isStopReason("chasing_reply"), false);
  assertEquals(followUpTodoText(null, "stopped_whatsapp").startsWith(`${STOP_TODO_PREFIX} A customer `), true);
});
