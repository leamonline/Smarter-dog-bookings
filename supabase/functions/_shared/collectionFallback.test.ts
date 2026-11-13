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
  earlier?: unknown[];
  earlierError?: { message: string };
}

function fakeSupabase(script: Script, calls: string[]) {
  return {
    from(table: string) {
      const state: { op?: string } = {};
      const builder: Record<string, unknown> = {};
      const chain = (name: string) => (..._args: unknown[]) => {
        if (name === "update" || name === "select") state.op ??= name;
        return builder;
      };
      for (const m of ["update", "eq", "neq", "like", "gte"]) builder[m] = chain(m);
      builder.select = (..._a: unknown[]) => {
        if (state.op === "update") {
          calls.push(`claim:${table}`);
          return Promise.resolve({ data: script.claimed ?? [], error: script.claimError ?? null });
        }
        state.op = "select";
        return builder;
      };
      builder.maybeSingle = () => {
        calls.push(`conversation:${table}`);
        return Promise.resolve({ data: script.conversation ?? null, error: null });
      };
      builder.limit = () => {
        calls.push(`earlier:${table}`);
        return Promise.resolve({ data: script.earlier ?? [], error: script.earlierError ?? null });
      };
      return builder;
    },
  };
}

const MESSAGE = { id: "m1", content: CONTENT, sent_at: FRESH, conversation_id: "c1" };
const CONVERSATION = { phone_e164: "+447700900111", human_id: "h1" };

async function run(script: Script, send = { ok: true } as { ok: boolean; detail?: string }) {
  const calls: string[] = [];
  const sent: Record<string, unknown>[] = [];
  const outcome = await chaseFailedCollectionNotice("wamid.1", {
    supabase: fakeSupabase(script, calls),
    sendSms: (body) => {
      sent.push(body);
      return Promise.resolve(send);
    },
    now: () => NOW,
    log: () => {},
  });
  return { outcome, sent, calls };
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

Deno.test("no second text when a collection SMS already went to that thread", async () => {
  const { outcome, sent } = await run({ claimed: [MESSAGE], conversation: CONVERSATION, earlier: [{ id: "s1" }] });
  assertEquals(outcome, "already_texted");
  assertEquals(sent.length, 0);
});

Deno.test("if the earlier-text check cannot be made, it does not risk a duplicate", async () => {
  const { outcome, sent } = await run({
    claimed: [MESSAGE],
    conversation: CONVERSATION,
    earlierError: { message: "boom" },
  });
  assertEquals(outcome, "already_texted");
  assertEquals(sent.length, 0);
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
