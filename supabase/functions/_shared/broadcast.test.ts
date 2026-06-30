// Unit tests for the pure broadcast-message logic.
// Run locally:  deno test --node-modules-dir=none supabase/functions/_shared/broadcast.test.ts
import {
  assertEquals,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  pickChannelWaSms,
  renderMessage,
  buildRepByHuman,
  type BroadcastBookingRow,
} from "./broadcast.ts";
import type { RecipientHuman } from "./recipients.ts";

function human(overrides: Partial<RecipientHuman>): RecipientHuman {
  return {
    id: "h1",
    name: "Sarah Jones",
    phone: "+447700900111",
    whatsapp: true,
    sms: true,
    email: "sarah@example.com",
    whatsapp_opted_out: false,
    sms_opted_out: false,
    email_opted_out: false,
    ...overrides,
  };
}

Deno.test("pickChannelWaSms prefers WhatsApp when usable", () => {
  assertEquals(pickChannelWaSms(human({})), "whatsapp");
});

Deno.test("pickChannelWaSms falls back to SMS when WhatsApp is opted out", () => {
  assertEquals(pickChannelWaSms(human({ whatsapp_opted_out: true })), "sms");
});

Deno.test("pickChannelWaSms skips SMS when SMS is opted out", () => {
  assertEquals(
    pickChannelWaSms(human({ whatsapp: false, sms_opted_out: true })),
    null,
  );
});

Deno.test("pickChannelWaSms returns null when opted out of both", () => {
  assertEquals(
    pickChannelWaSms(human({ whatsapp_opted_out: true, sms_opted_out: true })),
    null,
  );
});

Deno.test("pickChannelWaSms never picks email (no number = null)", () => {
  assertEquals(
    pickChannelWaSms(human({ phone: null, whatsapp: false, sms: false })),
    null,
  );
});

Deno.test("renderMessage embeds the name and reason", () => {
  assertEquals(
    renderMessage("Sarah", "we're closed Monday for a burst pipe"),
    "Hi Sarah, an important update about your grooming appointment at Smarter Dog Grooming Salon: we're closed Monday for a burst pipe. Please reply to this message and we'll help with whatever you need.",
  );
});

Deno.test("buildRepByHuman dedupes to one stable representative per recipient", () => {
  const rows: BroadcastBookingRow[] = [
    { id: "b-2", notify_human_ids: null, dogs: { human_id: "owner-1", name: "Bella" } },
    { id: "b-1", notify_human_ids: null, dogs: { human_id: "owner-1", name: "Max" } },
    { id: "b-3", notify_human_ids: ["owner-2", "trusted-9"], dogs: { human_id: "owner-2", name: "Luna" } },
  ];
  const rep = buildRepByHuman(rows);
  // owner-1 appears in b-2 and b-1 → smallest id wins (b-1).
  assertEquals(rep.get("owner-1"), "b-1");
  // explicit notify list adds the trusted human too.
  assertEquals(rep.get("owner-2"), "b-3");
  assertEquals(rep.get("trusted-9"), "b-3");
  assertEquals(rep.size, 3);
});

Deno.test("buildRepByHuman skips bookings whose dog has no owner", () => {
  const rows: BroadcastBookingRow[] = [
    { id: "b-1", notify_human_ids: null, dogs: null },
  ];
  assertEquals(buildRepByHuman(rows).size, 0);
});
