// What a Twilio status callback does to a text we sent.
// Run locally:  deno test --node-modules-dir=none --allow-env supabase/functions/_shared/smsDelivery.test.ts

import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  applySmsStatus,
  classifyTwilioStatus,
  describeTwilioError,
  essentialKind,
  shouldApplyStatus,
  smsFailureLine,
} from "./smsDelivery.ts";
import { SMS_FAILURE_TODO_PREFIX, STOP_TODO_PREFIX } from "./staffFollowUp.ts";

Deno.test("Twilio statuses map to the four outcomes, and anything unknown is ignored", () => {
  for (const s of ["queued", "accepted", "scheduled", "sending", "sent", "SENT"]) assertEquals(classifyTwilioStatus(s), "accepted", s);
  for (const s of ["delivered", "read", "Delivered"]) assertEquals(classifyTwilioStatus(s), "delivered", s);
  assertEquals(classifyTwilioStatus("undelivered"), "undelivered");
  assertEquals(classifyTwilioStatus("failed"), "failed");
  for (const s of ["receiving", "received", "canceled", "something-new", "", null, undefined]) {
    assertEquals(classifyTwilioStatus(s as string | null | undefined), "ignored", String(s));
  }
});

Deno.test("failures are readable, and 'undelivered' stays distinguishable from 'failed'", () => {
  assertEquals(describeTwilioError("30003"), "their phone was off or out of signal");
  assertEquals(describeTwilioError("99999"), "Twilio error 99999");
  assertEquals(describeTwilioError(""), "no reason was given");
  assertStringIncludes(smsFailureLine("undelivered", "30003"), "Text not delivered");
  assertStringIncludes(smsFailureLine("failed", "21211"), "Text failed to send");
  assertEquals(smsFailureLine("undelivered", "30003") === smsFailureLine("failed", "30003"), false);
});

Deno.test("a status never moves backwards, and delivered may replace a failure", () => {
  assertEquals(shouldApplyStatus("sent", "delivered"), true);
  assertEquals(shouldApplyStatus("sent", "undelivered"), true);
  assertEquals(shouldApplyStatus("sent", "failed"), true);
  assertEquals(shouldApplyStatus("delivered", "accepted"), false); // a late "sent"
  assertEquals(shouldApplyStatus("delivered", "failed"), false);
  assertEquals(shouldApplyStatus("delivered", "undelivered"), false);
  assertEquals(shouldApplyStatus("delivered", "delivered"), false);
  assertEquals(shouldApplyStatus("failed", "failed"), false); // a repeat
  assertEquals(shouldApplyStatus("failed", "delivered"), true); // positive evidence wins
  assertEquals(shouldApplyStatus("sent", "accepted"), false);
  assertEquals(shouldApplyStatus("sent", "ignored"), false);
});

Deno.test("only essential texts are described, and never by their content", () => {
  assertEquals(essentialKind("reminder", null), "reminder");
  assertEquals(essentialKind("confirmed_sms_fallback", null), "booking confirmation");
  assertEquals(essentialKind("cancelled", null), "cancellation notice");
  assertEquals(essentialKind("welcome", null), "booking notification");
  assertEquals(essentialKind(null, "[template:ready_for_collection_sms] Hi! We've finished pampering Toby"), "collection notice");
  assertEquals(essentialKind(null, "[template:something_else] hello"), "notification");
  assertEquals(essentialKind(null, "Hi, just checking you're OK for Tuesday"), null); // staff-typed: they're in the inbox
  assertEquals(essentialKind(undefined, undefined), null);
});

// ── applySmsStatus against a recording fake ─────────────────────────────────
interface Fixture {
  message?: { id: string; status: string; content: string; conversation_id: string | null } | null;
  logs?: Array<{ id: string; human_id: string | null; trigger_type: string | null; status: string }>;
  conversationHuman?: string | null;
  humansOnNumber?: Array<{ id: string; phone: string | null }>;
  openTodo?: boolean;
}

function fake(fx: Fixture) {
  const writes: Array<{ table: string; op: string; values?: Record<string, unknown>; ids?: unknown }> = [];
  const client = {
    from(table: string) {
      const q: any = {
        select() { return q; }, eq() { return q; }, like() { return q; }, gte() { return q; },
        order() { return q; }, limit() { return q; }, filter() { return q; },
        maybeSingle() {
          if (table === "whatsapp_messages") return Promise.resolve({ data: fx.message ?? null, error: null });
          if (table === "whatsapp_conversations") return Promise.resolve({ data: { human_id: fx.conversationHuman ?? null }, error: null });
          if (table === "humans") return Promise.resolve({ data: { name: "Wendy", surname: "Rowbottom" }, error: null });
          return Promise.resolve({ data: { sort_order: 1 }, error: null }); // salon_todos sort_order
        },
        then(resolve: (v: unknown) => unknown) {
          if (table === "notification_log") return resolve({ data: fx.logs ?? [], error: null });
          if (table === "humans") return resolve({ data: fx.humansOnNumber ?? [], error: null });
          if (table === "salon_todos") return resolve({ data: fx.openTodo ? [{ id: "t" }] : [], error: null });
          return resolve({ data: [], error: null });
        },
        insert(values: Record<string, unknown>) { writes.push({ table, op: "insert", values }); return Promise.resolve({ error: null }); },
        update(values: Record<string, unknown>) {
          const u: any = {
            eq(_c: string, ids: unknown) { writes.push({ table, op: "update", values, ids }); return Promise.resolve({ error: null }); },
            in(_c: string, ids: unknown) { u._ids = ids; return u; },
          };
          u.eq = (_c: string, v: unknown) => {
            if (u._ids !== undefined) { writes.push({ table, op: "update", values, ids: u._ids }); return Promise.resolve({ error: null }); }
            writes.push({ table, op: "update", values, ids: v });
            return Promise.resolve({ error: null });
          };
          const inFn = u.in;
          u.in = (c: string, ids: unknown) => {
            u._ids = ids; inFn(c, ids);
            const t: any = { eq: u.eq, then(r: (v: unknown) => unknown) { writes.push({ table, op: "update", values, ids }); return r({ error: null }); } };
            return t;
          };
          return u;
        },
      };
      return q;
    },
  };
  return { client, writes, todos: () => writes.filter((w) => w.table === "salon_todos" && w.op === "insert") };
}

const SENT_MSG = { id: "m1", status: "sent", content: "[template:booking_confirmed] hello", conversation_id: "c1" };
const LOG = { id: "l1", human_id: "h1", trigger_type: "confirmed", status: "sent" };

Deno.test("delivered: the message is marked delivered, nothing else changes and nobody is alerted", async () => {
  const { client, writes } = fake({ message: SENT_MSG, logs: [LOG] });
  const out = await applySmsStatus(client, { sid: "SM1", status: "delivered" });
  assertEquals(out.outcome, "delivered");
  assertEquals(out.updatedMessage, true);
  assertEquals(writes.filter((w) => w.table === "whatsapp_messages")[0].values, { status: "delivered", error_message: null });
  assertEquals(writes.filter((w) => w.table === "notification_log").length, 0);
  assertEquals(writes.filter((w) => w.table === "salon_todos").length, 0);
});

Deno.test("undelivered essential text: message and log fail with a reason, and staff get an actionable to-do", async () => {
  const f = fake({ message: SENT_MSG, logs: [LOG] });
  const out = await applySmsStatus(f.client, { sid: "SM1", status: "undelivered", errorCode: "30003", to: "+447700900123" });
  assertEquals(out.outcome, "undelivered");
  assertEquals(out.updatedMessage, true);
  assertEquals(out.updatedLog, 1);
  assertEquals(out.todo, "created");
  const msg = f.writes.find((w) => w.table === "whatsapp_messages")!;
  assertEquals(msg.values?.status, "failed");
  assertStringIncludes(String(msg.values?.error_message), "Text not delivered");
  const log = f.writes.find((w) => w.table === "notification_log")!;
  assertEquals(log.values?.status, "failed");
  const todo = f.todos()[0];
  assertEquals(todo.values?.human_id, "h1");
  assertStringIncludes(String(todo.values?.text), SMS_FAILURE_TODO_PREFIX);
  assertStringIncludes(String(todo.values?.text), "booking confirmation text");
  assertStringIncludes(String(todo.values?.text), "their phone was off");
  assertStringIncludes(String(todo.values?.text), "Ring them");
  // never the message content or the number
  assertEquals(String(todo.values?.text).includes("hello"), false);
  assertEquals(String(todo.values?.text).includes("+4477"), false);
});

Deno.test("failed (Twilio couldn't send) is recorded as failed, not undelivered", async () => {
  const f = fake({ message: SENT_MSG, logs: [LOG] });
  await applySmsStatus(f.client, { sid: "SM1", status: "failed", errorCode: "21211" });
  assertStringIncludes(String(f.writes.find((w) => w.table === "whatsapp_messages")!.values?.error_message), "Text failed to send");
});

Deno.test("a text STOP (21610) opts the number out and flags staff, without a delivery to-do", async () => {
  const f = fake({ message: SENT_MSG, logs: [LOG], humansOnNumber: [{ id: "h1", phone: "07700 900123" }] });
  const out = await applySmsStatus(f.client, { sid: "SM1", status: "undelivered", errorCode: "21610", to: "+447700900123" });
  assertEquals(out.stopRecorded, true);
  assertEquals(f.writes.some((w) => w.table === "humans" && w.values?.sms_opted_out === true), true);
  const todos = f.todos();
  assertEquals(todos.length, 1);
  assertStringIncludes(String(todos[0].values?.text), STOP_TODO_PREFIX);
  assertEquals(String(todos[0].values?.text).includes(SMS_FAILURE_TODO_PREFIX), false);
});

Deno.test("a free-text message typed by staff that fails is marked failed but raises no to-do", async () => {
  const f = fake({ message: { id: "m2", status: "sent", content: "Hi, are you OK for Tuesday?", conversation_id: "c1" }, logs: [] });
  const out = await applySmsStatus(f.client, { sid: "SM2", status: "undelivered", errorCode: "30003" });
  assertEquals(out.updatedMessage, true);
  assertEquals(out.todo, "none");
  assertEquals(f.todos().length, 0);
});

Deno.test("a cancellation notice sent straight through Twilio (log row only) still alerts", async () => {
  const f = fake({ message: null, logs: [{ id: "l9", human_id: "h9", trigger_type: "cancelled", status: "sent" }] });
  const out = await applySmsStatus(f.client, { sid: "SM9", status: "undelivered", errorCode: "30006" });
  assertEquals(out.updatedLog, 1);
  assertStringIncludes(String(f.todos()[0].values?.text), "cancellation notice text");
});

Deno.test("the human is found through the conversation when the log has none", async () => {
  const f = fake({ message: SENT_MSG, logs: [], conversationHuman: "h-conv" });
  await applySmsStatus(f.client, { sid: "SM1", status: "undelivered", errorCode: "30003" });
  assertEquals(f.todos()[0].values?.human_id, "h-conv");
});

Deno.test("out-of-order and repeated callbacks change nothing", async () => {
  // a late 'sent' after delivered
  let f = fake({ message: { ...SENT_MSG, status: "delivered" }, logs: [LOG] });
  let out = await applySmsStatus(f.client, { sid: "SM1", status: "sent" });
  assertEquals(f.writes.length, 0);
  assertEquals(out.matched, false); // accepted outcomes return before any lookup
  // a failure after delivered
  f = fake({ message: { ...SENT_MSG, status: "delivered" }, logs: [LOG] });
  out = await applySmsStatus(f.client, { sid: "SM1", status: "undelivered", errorCode: "30003" });
  assertEquals(f.writes.length, 0);
  // the same failure again
  f = fake({ message: { ...SENT_MSG, status: "failed" }, logs: [{ ...LOG, status: "failed" }] });
  out = await applySmsStatus(f.client, { sid: "SM1", status: "undelivered", errorCode: "30003" });
  assertEquals(f.writes.length, 0);
});

Deno.test("an unknown message id is a no-op, not an error", async () => {
  const f = fake({ message: null, logs: [] });
  const out = await applySmsStatus(f.client, { sid: "SM-unknown", status: "undelivered", errorCode: "30003" });
  assertEquals(out.matched, false);
  assertEquals(f.writes.length, 0);
});

Deno.test("a database error is raised, never swallowed", async () => {
  const client = { from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: { message: "boom" } }) }) }) }) }) };
  let threw = false;
  try { await applySmsStatus(client, { sid: "SM1", status: "undelivered" }); } catch { threw = true; }
  assertEquals(threw, true);
});
