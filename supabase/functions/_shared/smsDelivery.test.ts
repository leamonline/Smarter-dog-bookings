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
  assertEquals(shouldApplyStatus("failed", "failed"), true); // a repeat may finish half-applied work
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

// ── applySmsStatus against a small STATEFUL in-memory database ─────────────
// Updates really change rows and honour their filters (eq / in / not / like), so
// tests assert what ends up STORED, not which arguments a writer was handed. That
// is what catches ordering races and half-applied retries.
type Row = Record<string, any>;
interface Fixture {
  message?: { id: string; status: string; content: string; conversation_id: string | null; error_message?: string | null } | null;
  logs?: Array<{ id: string; human_id: string | null; trigger_type: string | null; status: string; error_message?: string | null }>;
  conversationHuman?: string | null;
  humansOnNumber?: Array<{ id: string; phone: string | null }>;
  todos?: Row[];
  /** Fail the next UPDATE on this table (then behave normally), as a dropped connection would. */
  failNextUpdateOn?: string;
  /** Fail the next SELECT on this table (then behave normally). */
  failNextSelectOn?: string;
  /** Runs just before the first UPDATE on a table, to model a concurrent callback landing in between. */
  beforeFirstUpdate?: Record<string, (db: Record<string, Row[]>) => void>;
}

// Identity columns the fixtures don't model per-sid: every row is "SM1 and sms".
const IGNORED = new Set(["meta_message_id", "provider_message_id", "channel"]);

function fake(fx: Fixture) {
  const db: Record<string, Row[]> = {
    whatsapp_messages: fx.message ? [{ ...fx.message }] : [],
    notification_log: (fx.logs ?? []).map((l) => ({ ...l })),
    humans: (fx.humansOnNumber ?? []).map((h) => ({ ...h, sms_opted_out: false, name: "Wendy", surname: "Rowbottom" })),
    salon_todos: (fx.todos ?? []).map((t) => ({ ...t })),
    whatsapp_conversations: fx.conversationHuman !== undefined || fx.message ? [{ id: "c1", human_id: fx.conversationHuman ?? null }] : [],
  };
  const writes: Array<{ table: string; op: string; values?: Record<string, unknown>; ids?: unknown }> = [];
  const hooks = { ...(fx.beforeFirstUpdate ?? {}) };
  let failNext = fx.failNextUpdateOn;
  let failNextSelect = fx.failNextSelectOn;
  let nextId = 1;

  const client = {
    from(table: string) {
      const filters: Array<(r: Row) => boolean> = [];
      let op: "select" | "update" = "select";
      let patch: Record<string, unknown> = {};
      let limitN: number | undefined;
      const rows = () => {
        const m = db[table].filter((r) => filters.every((f) => f(r)));
        return limitN === undefined ? m : m.slice(0, limitN);
      };
      const run = () => {
        if (op === "update") {
          if (hooks[table]) { hooks[table](db); delete hooks[table]; }
          if (failNext === table) { failNext = undefined; return { data: null, error: { message: "connection dropped" } }; }
          const matched = rows();
          for (const r of matched) Object.assign(r, patch);
          if (matched.length > 0) writes.push({ table, op: "update", values: patch, ids: matched.map((r) => r.id) });
          return { data: matched.map((r) => ({ id: r.id })), error: null };
        }
        if (failNextSelect === table) { failNextSelect = undefined; return { data: null, error: { message: "connection dropped" } }; }
        return { data: rows(), error: null };
      };
      const q: any = {
        select() { return q; },
        eq(c: string, v: unknown) { if (!IGNORED.has(c)) filters.push((r) => r[c] === v); return q; },
        in(c: string, vs: unknown[]) { filters.push((r) => vs.includes(r[c])); return q; },
        not(c: string, op: string, v: unknown) {
          if (op === "is" && v === null) { filters.push((r) => r[c] !== null && r[c] !== undefined); return q; }
          const set = String(v).replace(/[()]/g, "").split(",");
          filters.push((r) => !set.includes(String(r[c])));
          return q;
        },
        like(c: string, pattern: string) {
          const re = new RegExp("^" + pattern.split("%").map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*") + "$");
          filters.push((r) => re.test(String(r[c] ?? "")));
          return q;
        },
        gte() { return q; }, order() { return q; }, filter() { return q; },
        limit(n: number) { limitN = n; return q; },
        update(values: Record<string, unknown>) { op = "update"; patch = values; return q; },
        insert(values: Record<string, unknown>) {
          db[table].push({ id: `new${nextId++}`, ...values });
          writes.push({ table, op: "insert", values });
          return Promise.resolve({ error: null });
        },
        maybeSingle() {
          const { data, error } = run();
          if (error) return Promise.resolve({ data: null, error });
          if (table === "humans") return Promise.resolve({ data: (data as Row[])[0] ?? { name: "Wendy", surname: "Rowbottom" }, error: null });
          if (table === "salon_todos") return Promise.resolve({ data: { sort_order: db.salon_todos.length }, error: null });
          return Promise.resolve({ data: (data as Row[])[0] ?? null, error: null });
        },
        then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
          return Promise.resolve(run()).then(resolve, reject);
        },
      };
      return q;
    },
  };
  return { client, db, writes, todos: () => writes.filter((w) => w.table === "salon_todos" && w.op === "insert") };
}

const SENT_MSG = { id: "m1", status: "sent", content: "[template:booking_confirmed] hello", conversation_id: "c1" };
const LOG = { id: "l1", human_id: "h1", trigger_type: "confirmed", status: "sent" };

Deno.test("delivered: the message is marked delivered, nothing else changes and nobody is alerted", async () => {
  const f = fake({ message: SENT_MSG, logs: [LOG] });
  const out = await applySmsStatus(f.client, { sid: "SM1", status: "delivered" });
  assertEquals(out.outcome, "delivered");
  assertEquals(out.updatedMessage, true);
  assertEquals(f.db.whatsapp_messages[0].status, "delivered");
  assertEquals(f.db.whatsapp_messages[0].error_message, null);
  assertEquals(f.db.notification_log[0], { ...LOG }); // untouched
  assertEquals(f.db.salon_todos.length, 0);
});

Deno.test("undelivered essential text: message and log fail with a reason, and staff get an actionable to-do", async () => {
  const f = fake({ message: SENT_MSG, logs: [LOG] });
  const out = await applySmsStatus(f.client, { sid: "SM1", status: "undelivered", errorCode: "30003", to: "+447700900123" });
  assertEquals(out.outcome, "undelivered");
  assertEquals(out.updatedMessage, true);
  assertEquals(out.updatedLog, 1);
  assertEquals(out.todo, "created");
  const msg = f.db.whatsapp_messages[0];
  assertEquals(msg.status, "failed");
  assertStringIncludes(String(msg.error_message), "Text not delivered");
  assertEquals(f.db.notification_log[0].status, "sent"); // the claim holds: the row is never freed
  assertStringIncludes(String(f.db.notification_log[0].error_message), "Text not delivered");
  assertEquals(f.db.salon_todos.length, 1);
  const todo = f.db.salon_todos[0];
  assertEquals(todo.human_id, "h1");
  assertEquals(todo.done, false);
  assertStringIncludes(String(todo.text), SMS_FAILURE_TODO_PREFIX);
  assertStringIncludes(String(todo.text), "booking confirmation text");
  assertStringIncludes(String(todo.text), "their phone was off");
  assertStringIncludes(String(todo.text), "Ring them");
  assertStringIncludes(String(todo.text), "(Ref SM1)"); // the per-text marker
  // never the message content or the number
  assertEquals(String(todo.text).includes("hello"), false);
  assertEquals(String(todo.text).includes("+4477"), false);
});

Deno.test("failed (Twilio couldn't send) is recorded as failed, not undelivered", async () => {
  const f = fake({ message: SENT_MSG, logs: [LOG] });
  await applySmsStatus(f.client, { sid: "SM1", status: "failed", errorCode: "21211" });
  assertStringIncludes(String(f.db.whatsapp_messages[0].error_message), "Text failed to send");
  assertEquals(f.db.whatsapp_messages[0].status, "failed");
});

Deno.test("a text STOP (21610) opts the number out and flags staff, without a delivery to-do", async () => {
  const f = fake({ message: SENT_MSG, logs: [LOG], humansOnNumber: [{ id: "h1", phone: "07700 900123" }] });
  const out = await applySmsStatus(f.client, { sid: "SM1", status: "undelivered", errorCode: "21610", to: "+447700900123" });
  assertEquals(out.stopRecorded, true);
  assertEquals(f.db.humans[0].sms_opted_out, true);
  assertEquals(f.db.humans[0].sms_opted_out_reason, "asked_on_sms");
  assertEquals(f.db.whatsapp_messages[0].status, "failed");
  assertEquals(f.db.notification_log[0].status, "sent");
  assertStringIncludes(String(f.db.notification_log[0].error_message), "STOP");
  assertEquals(f.db.salon_todos.length, 1);
  assertStringIncludes(String(f.db.salon_todos[0].text), STOP_TODO_PREFIX);
  assertEquals(String(f.db.salon_todos[0].text).includes(SMS_FAILURE_TODO_PREFIX), false);
  assertEquals(f.db.salon_todos[0].human_id, "h1");
});

Deno.test("a free-text message typed by staff that fails is marked failed but raises no to-do", async () => {
  const f = fake({ message: { id: "m2", status: "sent", content: "Hi, are you OK for Tuesday?", conversation_id: "c1" }, logs: [] });
  const out = await applySmsStatus(f.client, { sid: "SM2", status: "undelivered", errorCode: "30003" });
  assertEquals(out.updatedMessage, true);
  assertEquals(out.todo, "none");
  assertEquals(f.db.whatsapp_messages[0].status, "failed");
  assertEquals(f.db.salon_todos.length, 0);
});

Deno.test("a cancellation notice sent straight through Twilio (log row only) still alerts", async () => {
  const f = fake({ message: null, logs: [{ id: "l9", human_id: "h9", trigger_type: "cancelled", status: "sent" }] });
  const out = await applySmsStatus(f.client, { sid: "SM9", status: "undelivered", errorCode: "30006" });
  assertEquals(out.updatedLog, 1);
  assertEquals(f.db.notification_log[0].status, "sent");
  assertStringIncludes(String(f.db.notification_log[0].error_message), "Text not delivered");
  assertEquals(f.db.salon_todos.length, 1);
  assertStringIncludes(String(f.db.salon_todos[0].text), "cancellation notice text");
  assertEquals(f.db.salon_todos[0].human_id, "h9");
});

Deno.test("the human is found through the conversation when the log has none", async () => {
  const f = fake({ message: SENT_MSG, logs: [], conversationHuman: "h-conv" });
  await applySmsStatus(f.client, { sid: "SM1", status: "undelivered", errorCode: "30003" });
  assertEquals(f.db.salon_todos.length, 1);
  assertEquals(f.db.salon_todos[0].human_id, "h-conv");
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
  // the same failure again, with everything already applied: no log change, no second to-do
  f = fake({
    message: { ...SENT_MSG, status: "failed" },
    logs: [{ ...LOG, error_message: smsFailureLine("undelivered", "30003") }],
    todos: [{ id: "t1", human_id: "h1", done: false, text: `${SMS_FAILURE_TODO_PREFIX} Wendy's booking confirmation text didn't arrive. (Ref SM1)` }],
  });
  out = await applySmsStatus(f.client, { sid: "SM1", status: "undelivered", errorCode: "30003" });
  assertEquals(f.writes.filter((w) => w.table === "notification_log").length, 0);
  assertEquals(f.db.salon_todos.length, 1); // still just the one
  assertEquals(f.db.whatsapp_messages[0].status, "failed");
});

// ── Codex findings on the first version ────────────────────────────────────

Deno.test("a late failure cannot overwrite 'delivered' even when both callbacks read 'sent' (ordering is enforced in the database)", async () => {
  const f = fake({
    message: SENT_MSG,
    logs: [LOG],
    // the delivery callback lands between our read and our write
    beforeFirstUpdate: { whatsapp_messages: (db) => { db.whatsapp_messages[0].status = "delivered"; } },
  });
  const out = await applySmsStatus(f.client, { sid: "SM1", status: "undelivered", errorCode: "30003" });
  assertEquals(f.db.whatsapp_messages[0].status, "delivered");
  assertEquals(f.db.whatsapp_messages[0].error_message, undefined);
  assertEquals(f.db.notification_log[0].status, "sent"); // the log was not marked failed
  assertEquals(f.db.salon_todos.length, 0); // and nobody was alerted
  assertEquals(out.updatedMessage, false);
});

Deno.test("delivery after a recorded failure repairs the log row as well as the message", async () => {
  const f = fake({ message: SENT_MSG, logs: [LOG] });
  await applySmsStatus(f.client, { sid: "SM1", status: "undelivered", errorCode: "30003" });
  assertStringIncludes(String(f.db.notification_log[0].error_message), "Text not delivered");
  const out = await applySmsStatus(f.client, { sid: "SM1", status: "delivered" });
  assertEquals(f.db.whatsapp_messages[0].status, "delivered");
  assertEquals(f.db.whatsapp_messages[0].error_message, null);
  assertEquals(f.db.notification_log[0].status, "sent");
  assertEquals(f.db.notification_log[0].error_message, null);
  assertEquals(out.updatedLog, 1);
});

Deno.test("delivery repairs a failed log even when the message is already marked delivered", async () => {
  const f = fake({ message: { ...SENT_MSG, status: "delivered" }, logs: [{ ...LOG, error_message: "old" }] });
  await applySmsStatus(f.client, { sid: "SM1", status: "delivered" });
  assertEquals(f.db.notification_log[0].status, "sent");
});

Deno.test("a callback that died half way is finished by its retry (message marked, log not)", async () => {
  const f = fake({ message: SENT_MSG, logs: [LOG], failNextUpdateOn: "notification_log" });
  const event = { sid: "SM1", status: "undelivered", errorCode: "30003", to: "+447700900123" };
  let threw = false;
  try { await applySmsStatus(f.client, event); } catch { threw = true; }
  assertEquals(threw, true);
  // the half-applied state a crash leaves behind
  assertEquals(f.db.whatsapp_messages[0].status, "failed");
  assertEquals(f.db.notification_log[0].status, "sent");
  assertEquals(f.db.salon_todos.length, 0);
  // Twilio re-delivers: the retry completes the log and raises the alert
  const out = await applySmsStatus(f.client, event);
  assertEquals(f.db.notification_log[0].status, "sent");
  assertStringIncludes(String(f.db.notification_log[0].error_message), "Text not delivered");
  assertEquals(out.todo, "created");
  assertEquals(f.db.salon_todos.length, 1);
  // and a third delivery changes nothing more
  await applySmsStatus(f.client, event);
  assertEquals(f.db.salon_todos.length, 1);
});

Deno.test("a STOP whose log update failed is still recorded on retry", async () => {
  const f = fake({
    message: SENT_MSG,
    logs: [LOG],
    humansOnNumber: [{ id: "h1", phone: "07700 900123" }],
    failNextUpdateOn: "notification_log",
  });
  const event = { sid: "SM1", status: "undelivered", errorCode: "21610", to: "+447700900123" };
  let threw = false;
  try { await applySmsStatus(f.client, event); } catch { threw = true; }
  assertEquals(threw, true);
  assertEquals(f.db.humans[0].sms_opted_out, false);
  const out = await applySmsStatus(f.client, event);
  assertEquals(out.stopRecorded, true);
  assertEquals(f.db.humans[0].sms_opted_out, true);
  assertEquals(f.db.salon_todos.filter((t) => String(t.text).startsWith(STOP_TODO_PREFIX)).length, 1);
});

Deno.test("a STOP that could not be recorded is raised, not swallowed, so Twilio retries", async () => {
  const f = fake({ message: SENT_MSG, logs: [LOG], humansOnNumber: [{ id: "h1", phone: "07700 900123" }], failNextUpdateOn: "humans" });
  let threw = false;
  try { await applySmsStatus(f.client, { sid: "SM1", status: "undelivered", errorCode: "21610", to: "+447700900123" }); } catch { threw = true; }
  assertEquals(threw, true);
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

// ── Second round of review ─────────────────────────────────────────────────

Deno.test("a failed conversation lookup is raised, not mistaken for an unlinked conversation", async () => {
  const f = fake({ message: SENT_MSG, logs: [], conversationHuman: "h-conv", failNextSelectOn: "whatsapp_conversations" });
  const event = { sid: "SM1", status: "undelivered", errorCode: "30003" };
  let threw = false;
  try { await applySmsStatus(f.client, event); } catch { threw = true; }
  assertEquals(threw, true);
  assertEquals(f.db.salon_todos.length, 0);
  // the retry succeeds and links the right customer
  await applySmsStatus(f.client, event);
  assertEquals(f.db.salon_todos.length, 1);
  assertEquals(f.db.salon_todos[0].human_id, "h-conv");
});

Deno.test("a replayed failure never resurrects an alert staff already completed", async () => {
  const f = fake({ message: SENT_MSG, logs: [LOG] });
  const event = { sid: "SM1", status: "undelivered", errorCode: "30003" };
  await applySmsStatus(f.client, event);
  assertEquals(f.db.salon_todos.length, 1);
  f.db.salon_todos[0].done = true; // staff rang them and ticked it off
  const out = await applySmsStatus(f.client, event);
  assertEquals(out.todo, "duplicate");
  assertEquals(f.db.salon_todos.length, 1);
});

Deno.test("nor does an old alert stop mattering after the usual 12-hour window", async () => {
  const f = fake({
    message: { ...SENT_MSG, status: "failed" },
    logs: [{ ...LOG, error_message: smsFailureLine("undelivered", "30003") }],
    todos: [{ id: "old", human_id: "h1", done: false, created_at: "2000-01-01T00:00:00Z", text: `${SMS_FAILURE_TODO_PREFIX} Wendy's reminder text didn't arrive. (Ref SM1)` }],
  });
  const out = await applySmsStatus(f.client, { sid: "SM1", status: "undelivered", errorCode: "30003" });
  assertEquals(out.todo, "duplicate");
  assertEquals(f.db.salon_todos.length, 1);
});

Deno.test("a different text for the same customer still gets its own alert", async () => {
  const f = fake({ message: SENT_MSG, logs: [LOG] });
  await applySmsStatus(f.client, { sid: "SM1", status: "undelivered", errorCode: "30003" });
  f.db.salon_todos[0].done = true;
  f.db.whatsapp_messages.push({ ...SENT_MSG, id: "m2", status: "sent" });
  f.db.notification_log.push({ ...LOG, id: "l2" });
  // (the fake ignores per-sid rows, so reset both to 'sent' and replay with a new sid)
  f.db.whatsapp_messages[0].status = "sent";
  f.db.notification_log[0].status = "sent";
  await applySmsStatus(f.client, { sid: "SM2", status: "undelivered", errorCode: "30003" });
  assertEquals(f.db.salon_todos.filter((t) => String(t.text).includes("(Ref SM2)")).length, 1);
});

Deno.test("a delivery landing between our message update and our log update leaves no contradiction and no alert", async () => {
  const f = fake({
    message: SENT_MSG,
    logs: [LOG],
    // the delivery callback completes (and finds the log still 'sent': nothing to repair)
    // just before our log update goes through
    beforeFirstUpdate: { notification_log: (db) => { db.whatsapp_messages[0].status = "delivered"; } },
  });
  await applySmsStatus(f.client, { sid: "SM1", status: "undelivered", errorCode: "30003" });
  assertEquals(f.db.whatsapp_messages[0].status, "delivered");
  assertEquals(f.db.notification_log[0].status, "sent");
  assertEquals(f.db.notification_log[0].error_message, null);
  assertEquals(f.db.salon_todos.length, 0);
});

Deno.test("two different texts failing for one customer each get their own alert while the first is still open", async () => {
  const f = fake({ message: SENT_MSG, logs: [LOG] });
  await applySmsStatus(f.client, { sid: "SM1", status: "undelivered", errorCode: "30003" });
  assertEquals(f.db.salon_todos.length, 1);
  assertEquals(f.db.salon_todos[0].done, false);
  // a second text (a cancellation notice, say) fails; the first alert is still open
  f.db.whatsapp_messages[0].status = "sent";
  f.db.notification_log[0].status = "sent";
  f.db.notification_log[0].trigger_type = "cancelled";
  await applySmsStatus(f.client, { sid: "SM2", status: "undelivered", errorCode: "30003" });
  assertEquals(f.db.salon_todos.length, 2);
  assertStringIncludes(String(f.db.salon_todos[0].text), "(Ref SM1)");
  assertStringIncludes(String(f.db.salon_todos[1].text), "(Ref SM2)");
  assertStringIncludes(String(f.db.salon_todos[1].text), "cancellation notice");
});

Deno.test("a retried failure heals a log row left 'failed' by a crashed revert (the message is delivered, so it is the truth)", async () => {
  // the state a failed revert leaves behind: inbox delivered, booking record failed
  const f = fake({
    message: { ...SENT_MSG, status: "delivered" },
    logs: [{ ...LOG, error_message: "Text not delivered: ..." }],
  });
  const out = await applySmsStatus(f.client, { sid: "SM1", status: "undelivered", errorCode: "30003" });
  assertEquals(f.db.whatsapp_messages[0].status, "delivered");
  assertEquals(f.db.notification_log[0].status, "sent");
  assertEquals(f.db.notification_log[0].error_message, null);
  assertEquals(f.db.salon_todos.length, 0);
  assertEquals(out.updatedLog, 1);
});

Deno.test("a delivery failure never frees a send claim: the log row stays 'sent' for every sender, including the SMS fallback", async () => {
  for (const trigger of ["reminder", "confirmed", "cancelled", "reminder_sms_fallback", "cancelled_sms_fallback"]) {
    const f = fake({ message: SENT_MSG, logs: [{ ...LOG, trigger_type: trigger }] });
    await applySmsStatus(f.client, { sid: "SM1", status: "undelivered", errorCode: "30003" });
    // 'pending'/'sent' rows are what the unique index (booking, trigger, customer) checks;
    // a 'failed' row would let the next run text the same customer again.
    assertEquals(f.db.notification_log[0].status, "sent", trigger);
    assertStringIncludes(String(f.db.notification_log[0].error_message), "Text not delivered");
  }
});
