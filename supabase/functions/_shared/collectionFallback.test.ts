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

// ── the IO path, with a scripted Supabase ───────────────────
interface Script {
  claimed?: unknown[];
  claimError?: { message: string };
  conversation?: { phone_e164: string | null; human_id: string | null } | null;
  /** The number's SMS conversation, where sms-send records texts. */
  smsThread?: { id: string } | null;
  smsThreadError?: { message: string };
  earlier?: unknown[];
  earlierError?: { message: string };
}

interface Recorded {
  calls: string[];
  claimPatch?: Record<string, unknown>;
  earlierConversationId?: unknown;
}

// A scripted Supabase that keeps the real channel separation: the WhatsApp
// conversation is read by id, the SMS conversation by phone + channel 'sms',
// and the earlier-text query records WHICH conversation it searched.
function fakeSupabase(script: Script, rec: Recorded) {
  return {
    from(table: string) {
      const eqs: Record<string, unknown> = {};
      let updating = false;
      const builder: Record<string, any> = {};
      for (const m of ["neq", "like", "gte"]) builder[m] = () => builder;
      builder.update = (patch: Record<string, unknown>) => {
        updating = true;
        rec.claimPatch = patch;
        return builder;
      };
      builder.eq = (col: string, value: unknown) => {
        eqs[col] = value;
        return builder;
      };
      builder.select = () => {
        if (updating) {
          rec.calls.push(`claim:${table}`);
          return Promise.resolve({ data: script.claimed ?? [], error: script.claimError ?? null });
        }
        return builder;
      };
      builder.maybeSingle = () => {
        if (eqs.channel === "sms") {
          rec.calls.push(`smsThread:${eqs.phone_e164}`);
          return Promise.resolve({ data: script.smsThread ?? null, error: script.smsThreadError ?? null });
        }
        rec.calls.push(`conversation:${eqs.id}`);
        return Promise.resolve({ data: script.conversation ?? null, error: null });
      };
      builder.limit = () => {
        rec.calls.push("earlier");
        rec.earlierConversationId = eqs.conversation_id;
        return Promise.resolve({ data: script.earlier ?? [], error: script.earlierError ?? null });
      };
      return builder;
    },
  };
}

const MESSAGE = { id: "m1", content: CONTENT, sent_at: FRESH, conversation_id: "c1" };
const CONVERSATION = { phone_e164: "+447700900111", human_id: "h1" };

const ERRORS = JSON.stringify([{ code: 131026, title: "Message undeliverable" }]);

async function run(script: Script, send = { ok: true } as { ok: boolean; detail?: string }) {
  const rec: Recorded = { calls: [] };
  const sent: Record<string, unknown>[] = [];
  const outcome = await chaseFailedCollectionNotice("wamid.1", ERRORS, {
    supabase: fakeSupabase(script, rec),
    sendSms: (body) => {
      sent.push(body);
      return Promise.resolve(send);
    },
    now: () => NOW,
    log: () => {},
  });
  return { outcome, sent, calls: rec.calls, rec };
}

Deno.test("the first failure of a fresh collection notice sends one SMS through sms-send", async () => {
  const { outcome, sent } = await run({ claimed: [MESSAGE], conversation: CONVERSATION });
  assertEquals(outcome, "sent");
  assertEquals(sent, [{
    mode: "template",
    to: "+447700900111",
    text: "Hi! We've finished pampering Busby and they're ready to head home in 5 mins. See you soon! X - Smarter Dog Grooming",
    template_name: "ready_for_collection_sms",
    human_id: "h1",
  }]);
});

Deno.test("a status Meta delivers twice texts once: the second claim returns nothing", async () => {
  const { outcome, sent, calls } = await run({ claimed: [] });
  assertEquals(outcome, "not_first_failure");
  assertEquals(sent.length, 0);
  assertEquals(calls, ["claim:whatsapp_messages"]);
});

Deno.test("another template's failure is claimed but never texted", async () => {
  const { outcome, sent } = await run({
    claimed: [{ ...MESSAGE, content: "[template:appointment_reminder_v2] x" }],
    conversation: CONVERSATION,
  });
  assertEquals(outcome, "not_collection_notice");
  assertEquals(sent.length, 0);
});

Deno.test("the claim writes the provider's errors with the status, so the log trigger sees the real reason", async () => {
  const { rec } = await run({ claimed: [MESSAGE], conversation: CONVERSATION });
  assertEquals(rec.claimPatch, { status: "failed", error_message: ERRORS });
});

Deno.test("no second text when a collection SMS already went to that number's SMS thread", async () => {
  const { outcome, sent, rec, calls } = await run({
    claimed: [MESSAGE],
    conversation: CONVERSATION,
    smsThread: { id: "sms-1" },
    earlier: [{ id: "s1" }],
  });
  assertEquals(outcome, "already_texted");
  assertEquals(sent.length, 0);
  // It looked in the SMS conversation for that number, not the WhatsApp one.
  assertEquals(calls.includes("smsThread:+447700900111"), true);
  assertEquals(rec.earlierConversationId, "sms-1");
});

Deno.test("an SMS thread with no recent collection text does not block the fallback", async () => {
  const { outcome, sent } = await run({
    claimed: [MESSAGE],
    conversation: CONVERSATION,
    smsThread: { id: "sms-1" },
    earlier: [],
  });
  assertEquals(outcome, "sent");
  assertEquals(sent.length, 1);
});

Deno.test("a number never texted before has no SMS thread to search, and is texted", async () => {
  const { outcome, calls } = await run({ claimed: [MESSAGE], conversation: CONVERSATION, smsThread: null });
  assertEquals(outcome, "sent");
  assertEquals(calls.includes("earlier"), false);
});

Deno.test("if either duplicate check cannot be made, it does not risk a second text", async () => {
  const a = await run({
    claimed: [MESSAGE],
    conversation: CONVERSATION,
    smsThread: { id: "sms-1" },
    earlierError: { message: "boom" },
  });
  assertEquals([a.outcome, a.sent.length], ["already_texted", 0]);
  const b = await run({ claimed: [MESSAGE], conversation: CONVERSATION, smsThreadError: { message: "boom" } });
  assertEquals([b.outcome, b.sent.length], ["already_texted", 0]);
});

Deno.test("no number, a failed claim or a refused send never throw", async () => {
  assertEquals((await run({ claimed: [MESSAGE], conversation: null })).outcome, "no_number");
  assertEquals((await run({ claimError: { message: "boom" } })).outcome, "not_first_failure");
  // sms-send refusing (opted out, untextable, Twilio down) is reported, not retried.
  assertEquals(
    (await run({ claimed: [MESSAGE], conversation: CONVERSATION }, { ok: false, detail: "409" })).outcome,
    "send_failed",
  );
});
