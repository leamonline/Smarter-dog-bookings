// The automatic SMS for a failed "ready for collection" WhatsApp notice.
// Run locally:  deno test --node-modules-dir=none supabase/functions/_shared/collectionFallback.test.ts
import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  chaseFailedCollectionNotice,
  collectionSmsText,
  planCollectionFallback,
} from "./collectionFallback.ts";

const NOW = new Date("2026-11-13T10:10:00Z");
const FRESH = "2026-11-13T10:03:00Z";
const CONTENT = "[template:ready_for_collection_v2] Busby · 5";

Deno.test("a fresh failed collection notice is texted with the same dogs and minutes", () => {
  assertEquals(planCollectionFallback({ content: CONTENT, sentAt: FRESH }, NOW), {
    send: true,
    text: "Hi! We've finished pampering Busby and they're ready to head home in 5 mins. See you soon! X - Smarter Dog Grooming",
  });
  const two = planCollectionFallback(
    { content: "[template:ready_for_collection_v2] Bella and Max · 15", sentAt: FRESH },
    NOW,
  );
  assertEquals(two.send && two.text.includes("Bella and Max and they're ready to head home in 15 mins"), true);
});

Deno.test("only the collection template is chased", () => {
  for (const content of [
    "[template:appointment_reminder_v2] Stephanie · Busby · Fri, 13 Nov · 1:00pm",
    "[template:ready_for_collection_v1] Busby · 5", // retired wording, never sent
    "See you soon!",
    null,
  ]) {
    assertEquals(planCollectionFallback({ content, sentAt: FRESH }, NOW), {
      send: false,
      reason: "not_collection_notice",
    } as const);
  }
});

Deno.test("a notice older than half an hour is not texted: 'ready in 5 mins' would mislead", () => {
  const stale = { send: false, reason: "stale" } as const;
  assertEquals(planCollectionFallback({ content: CONTENT, sentAt: "2026-11-13T09:39:59Z" }, NOW), stale);
  assertEquals(planCollectionFallback({ content: CONTENT, sentAt: null }, NOW), stale);
  // Exactly on the boundary still goes.
  assertEquals(planCollectionFallback({ content: CONTENT, sentAt: "2026-11-13T09:40:00Z" }, NOW).send, true);
});

Deno.test("content that does not parse cleanly is left alone, never texted with a gap", () => {
  const unreadable = { send: false, reason: "unreadable" } as const;
  for (const rest of ["Busby", "Busby · soon", " · 5", "Busby · 5 · extra", ""]) {
    assertEquals(
      planCollectionFallback({ content: `[template:ready_for_collection_v2] ${rest}`, sentAt: FRESH }, NOW),
      unreadable,
    );
  }
});

Deno.test("the wording falls back to 'your dog' when no name is given", () => {
  assertEquals(collectionSmsText("", "10").includes("pampering your dog and"), true);
});

// ── the IO path, against a small in-memory database ─────────
//
// A write path is judged by the ROW it leaves, not by the arguments handed to
// the writer (AGENTS.md). So this is a stateful fake, not a script: it holds
// whatsapp_messages and whatsapp_conversations rows, applies every filter the
// code chains, and really performs the update. A claim that matched no row, or
// one that failed to store the provider's errors, fails these tests.

type Row = Record<string, any>;

function memoryDb(tables: Record<string, Row[]>, failOn: (table: string, op: string) => string | null = () => null) {
  return {
    tables,
    from(table: string) {
      const preds: Array<(r: Row) => boolean> = [];
      let patch: Row | null = null;
      let max = Infinity;
      const run = () => {
        const failure = failOn(table, patch ? "update" : "select");
        if (failure) return { data: null, error: { message: failure } };
        const hits = (tables[table] ?? []).filter((r) => preds.every((p) => p(r)));
        if (patch) for (const r of hits) Object.assign(r, patch);
        return { data: hits.slice(0, max).map((r) => ({ ...r })), error: null };
      };
      const b: Record<string, any> = {
        update: (p: Row) => ((patch = p), b),
        select: () => b,
        eq: (c: string, v: unknown) => (preds.push((r) => r[c] === v), b),
        neq: (c: string, v: unknown) => (preds.push((r) => r[c] !== v), b),
        gte: (c: string, v: string) => (preds.push((r) => r[c] >= v), b),
        lt: (c: string, v: string) => (preds.push((r) => r[c] < v), b),
        like: (c: string, pattern: string) => {
          const prefix = pattern.replace(/%$/, "");
          preds.push((r) => typeof r[c] === "string" && r[c].startsWith(prefix));
          return b;
        },
        limit: (n: number) => ((max = n), b),
        maybeSingle: () => {
          const res = run();
          return Promise.resolve({ data: res.data ? res.data[0] ?? null : null, error: res.error });
        },
        then: (resolve: (v: unknown) => void) => resolve(run()),
      };
      return b;
    },
  };
}

const PHONE = "+447700900111";
const ERRORS = JSON.stringify([{ code: 131026, title: "Message undeliverable" }]);

function waMessage(over: Row = {}): Row {
  return {
    id: "m1",
    conversation_id: "wa-1",
    channel: "whatsapp",
    direction: "outbound",
    meta_message_id: "wamid.1",
    content: CONTENT,
    status: "sent",
    error_message: null,
    sent_at: FRESH,
    ...over,
  };
}

function seed(over: { messages?: Row[]; conversations?: Row[] } = {}) {
  return {
    whatsapp_conversations: over.conversations ?? [
      { id: "wa-1", phone_e164: PHONE, channel: "whatsapp", human_id: "h1" },
    ],
    whatsapp_messages: over.messages ?? [waMessage()],
  };
}

async function chase(
  tables: Record<string, Row[]>,
  opts: {
    send?: { ok: boolean; detail?: string };
    failOn?: (table: string, op: string) => string | null;
    wamid?: string;
  } = {},
) {
  const sent: Row[] = [];
  const outcome = await chaseFailedCollectionNotice(opts.wamid ?? "wamid.1", ERRORS, {
    supabase: memoryDb(tables, opts.failOn),
    sendSms: (body) => {
      sent.push(body);
      return Promise.resolve(opts.send ?? { ok: true });
    },
    now: () => NOW,
    log: () => {},
  });
  return { outcome, sent };
}

const stored = (tables: Record<string, Row[]>, id: string) => tables.whatsapp_messages.find((r) => r.id === id)!;

Deno.test("the first failure sends one SMS and leaves the message stored as failed with the provider's errors", async () => {
  const tables = seed();
  const { outcome, sent } = await chase(tables);
  assertEquals(outcome, "sent");
  assertEquals(sent, [{
    mode: "template",
    to: PHONE,
    text: "Hi! We've finished pampering Busby and they're ready to head home in 5 mins. See you soon! X - Smarter Dog Grooming",
    template_name: "ready_for_collection_sms",
    human_id: "h1",
  }]);
  // The row, not the call: status and the real reason are both on it, which is
  // what the notification_log trigger reads on this first transition.
  assertEquals(stored(tables, "m1").status, "failed");
  assertEquals(stored(tables, "m1").error_message, ERRORS);
});

Deno.test("a status Meta delivers twice texts once: the row is already failed, so nothing is claimed", async () => {
  const tables = seed();
  assertEquals((await chase(tables)).outcome, "sent");
  const again = await chase(tables);
  assertEquals(again.outcome, "not_first_failure");
  assertEquals(again.sent.length, 0);
});

Deno.test("the claim touches only the outbound message with that id", async () => {
  const tables = seed({
    messages: [
      waMessage(),
      waMessage({ id: "in", direction: "inbound" }), // Meta reuses ids across directions
      waMessage({ id: "other", meta_message_id: "wamid.2" }),
    ],
  });
  await chase(tables);
  assertEquals(stored(tables, "m1").status, "failed");
  assertEquals(stored(tables, "in").status, "sent");
  assertEquals(stored(tables, "other").status, "sent");
  // An id that matches no message claims nothing and texts nobody.
  const none = await chase(seed(), { wamid: "wamid.unknown" });
  assertEquals([none.outcome, none.sent.length], ["not_first_failure", 0]);
});

Deno.test("another template's failure is stored as failed with its reason, but never texted", async () => {
  const tables = seed({ messages: [waMessage({ content: "[template:appointment_reminder_v2] x" })] });
  const { outcome, sent } = await chase(tables);
  assertEquals(outcome, "not_collection_notice");
  assertEquals(sent.length, 0);
  assertEquals(stored(tables, "m1").status, "failed");
  assertEquals(stored(tables, "m1").error_message, ERRORS);
});

Deno.test("no second text when a collection SMS is already in that number's SMS thread", async () => {
  // sms-send records texts in the number's own conversation (channel 'sms'),
  // never in the WhatsApp one.
  const smsRow = {
    id: "s1",
    conversation_id: "sms-1",
    channel: "sms",
    direction: "outbound",
    content: "[template:ready_for_collection_sms] Hi! ...",
    status: "sent",
    sent_at: "2026-11-13T10:01:00Z",
  };
  const conversations = [
    { id: "wa-1", phone_e164: PHONE, channel: "whatsapp", human_id: "h1" },
    { id: "sms-1", phone_e164: PHONE, channel: "sms", human_id: "h1" },
  ];
  const blocked = await chase(seed({ conversations, messages: [waMessage(), smsRow] }));
  assertEquals([blocked.outcome, blocked.sent.length], ["already_texted", 0]);

  // An old one, another template, or another number's thread does not block.
  for (const other of [
    { ...smsRow, sent_at: "2026-11-13T09:00:00Z" },
    { ...smsRow, content: "[template:appointment_reminder] Hi" },
    { ...smsRow, conversation_id: "sms-other" },
  ]) {
    const ok = await chase(seed({ conversations, messages: [waMessage(), other] }));
    assertEquals(ok.outcome, "sent");
  }
});

Deno.test("one automatic attempt per number per window: an earlier failed notice blocks a second text", async () => {
  // The first chase may have reached the phone with no record (sms-send
  // "outcome unknown" records nothing), so the failed notice is the evidence.
  const earlier = waMessage({
    id: "m0",
    meta_message_id: "wamid.0",
    status: "failed",
    sent_at: "2026-11-13T09:58:00Z",
  });
  const tables = seed({ messages: [earlier, waMessage()] });
  const { outcome, sent } = await chase(tables);
  assertEquals([outcome, sent.length], ["already_chased", 0]);
  assertEquals(stored(tables, "m1").status, "failed");

  // Outside the window, or not a collection notice, it does not block.
  for (const over of [{ sent_at: "2026-11-13T09:00:00Z" }, { content: "[template:appointment_reminder_v2] x" }]) {
    const ok = await chase(seed({ messages: [{ ...earlier, ...over }, waMessage()] }));
    assertEquals(ok.outcome, "sent");
  }
});

Deno.test("failures arriving in reverse send order still text once, even when the first outcome is unknown", async () => {
  // The NEWER notice fails first and its SMS outcome is unknown (no SMS row).
  // The older notice's failure arrives afterwards and must not text again.
  const older = waMessage();
  const newer = waMessage({ id: "m2", meta_message_id: "wamid.2", sent_at: "2026-11-13T10:05:00Z" });
  const tables = seed({ messages: [older, newer] });
  const first = await chase(tables, { wamid: "wamid.2", send: { ok: false, detail: "outcome unknown" } });
  assertEquals([first.outcome, first.sent.length], ["send_failed", 1]);
  const second = await chase(tables, { wamid: "wamid.1" });
  assertEquals([second.outcome, second.sent.length], ["already_chased", 0]);
  // And in send order, for completeness: one text, then none.
  const inOrder = seed({ messages: [waMessage(), waMessage({ id: "m2", meta_message_id: "wamid.2", sent_at: "2026-11-13T10:05:00Z" })] });
  assertEquals((await chase(inOrder, { wamid: "wamid.1" })).outcome, "sent");
  assertEquals((await chase(inOrder, { wamid: "wamid.2" })).outcome, "already_chased");
});

Deno.test("two failures handled at the same moment can both stand down, never both text", async () => {
  // Both notices are already marked failed when either handler looks: each
  // sees the other. No text is the safe outcome; two texts is impossible.
  const other = waMessage({ id: "m2", meta_message_id: "wamid.2", status: "failed", sent_at: "2026-11-13T10:05:00Z" });
  const { outcome, sent } = await chase(seed({ messages: [waMessage(), other] }));
  assertEquals([outcome, sent.length], ["already_chased", 0]);
});

Deno.test("an unconfirmed send is reported, and a later failed notice does not text again", async () => {
  const tables = seed();
  const first = await chase(tables, { send: { ok: false, detail: "sms-send 502: outcome unknown" } });
  assertEquals([first.outcome, first.sent.length], ["send_failed", 1]);
  // Staff press Retry; that WhatsApp fails too. No SMS row exists for the
  // first attempt, yet no second text goes.
  tables.whatsapp_messages.push(waMessage({ id: "m2", meta_message_id: "wamid.2", sent_at: "2026-11-13T10:06:00Z" }));
  const second = await chase(tables, { wamid: "wamid.2" });
  assertEquals([second.outcome, second.sent.length], ["already_chased", 0]);
});

Deno.test("when a check cannot be made it sends nothing, and never throws", async () => {
  // The claim itself failing: nothing is known, nothing is sent.
  const claim = await chase(seed(), { failOn: (t, op) => (t === "whatsapp_messages" && op === "update" ? "boom" : null) });
  assertEquals([claim.outcome, claim.sent.length], ["not_first_failure", 0]);
  // The duplicate checks failing after a good claim.
  const dup = await chase(seed(), { failOn: (t, op) => (t === "whatsapp_messages" && op === "select" ? "boom" : null) });
  assertEquals([dup.outcome, dup.sent.length], ["already_chased", 0]);
});

Deno.test("no number on the conversation means no text", async () => {
  const { outcome, sent } = await chase(seed({ conversations: [] }));
  assertEquals([outcome, sent.length], ["no_number", 0]);
});
