// Consent scenarios for the one messaging policy (channelPolicy.ts).
// Run locally:  deno test --node-modules-dir=none supabase/functions/_shared/channelPolicy.test.ts
//
// The policy, as the salon stated it:
//   - SMS is a required operational channel. Customers give a mobile number and
//     agree to essential service messages as a condition of booking, so the
//     optional humans.sms tickbox is NOT a precondition.
//   - WhatsApp is preferred; SMS is the fallback.
//   - A STOP is honoured for the channel it was sent on, and never overridden:
//     a WhatsApp STOP switches WhatsApp off and essential messages go by SMS;
//     an SMS opt-out always blocks SMS.
//   - Marketing is separate, with its own consent, and stays disabled.

import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  blockReason,
  blockText,
  canSendMarketing,
  operationalChannelAvailable,
  type PolicyContact,
} from "./channelPolicy.ts";

function customer(overrides: Partial<PolicyContact> = {}): PolicyContact {
  return {
    phone: "+447700900111",
    email: "sarah@example.com",
    whatsapp: true,
    sms: false, // the optional tickbox, deliberately OFF: it is the default
    whatsapp_opted_out: false,
    sms_opted_out: false,
    email_opted_out: false,
    ...overrides,
  };
}

Deno.test("every customer with a mobile has a usable SMS channel, whatever their optional tickbox says", () => {
  for (const sms of [true, false, null, undefined]) {
    assertEquals(operationalChannelAvailable(customer({ sms }), "sms"), true, `sms=${String(sms)}`);
  }
});

Deno.test("SMS needs a number; a customer with no number has none", () => {
  assertEquals(blockReason(customer({ phone: null }), "sms"), "no_number");
  assertEquals(blockReason(customer({ phone: "" }), "sms"), "no_number");
});

Deno.test("an SMS opt-out always blocks SMS, whatever else is true", () => {
  assertEquals(blockReason(customer({ sms_opted_out: true }), "sms"), "opted_out");
  assertEquals(blockReason(customer({ sms_opted_out: true, sms: true }), "sms"), "opted_out");
  assertEquals(blockReason(customer({ sms_opted_out: true, whatsapp_opted_out: true }), "sms"), "opted_out");
});

Deno.test("WhatsApp is still governed by its own setup flag and opt-out", () => {
  assertEquals(blockReason(customer(), "whatsapp"), null);
  assertEquals(blockReason(customer({ whatsapp: false }), "whatsapp"), "not_set_up");
  assertEquals(blockReason(customer({ whatsapp_opted_out: true }), "whatsapp"), "opted_out");
  assertEquals(blockReason(customer({ phone: null }), "whatsapp"), "no_number");
});

Deno.test("email is unchanged: needs an address and no opt-out", () => {
  assertEquals(blockReason(customer(), "email"), null);
  assertEquals(blockReason(customer({ email: null }), "email"), "no_email");
  assertEquals(blockReason(customer({ email_opted_out: true }), "email"), "opted_out");
});

Deno.test("a WhatsApp STOP switches WhatsApp off and essential messages go by SMS instead", () => {
  const stopped = customer({ whatsapp_opted_out: true });
  assertEquals(operationalChannelAvailable(stopped, "whatsapp"), false);
  assertEquals(operationalChannelAvailable(stopped, "sms"), true);
  // Whatever the optional tickbox says.
  assertEquals(operationalChannelAvailable(customer({ whatsapp_opted_out: true, sms: true }), "sms"), true);
  assertEquals(operationalChannelAvailable(customer({ whatsapp_opted_out: true, sms: false }), "sms"), true);
});

Deno.test("a customer who stopped both channels has only email left", () => {
  const both = customer({ whatsapp_opted_out: true, sms_opted_out: true });
  assertEquals(operationalChannelAvailable(both, "whatsapp"), false);
  assertEquals(operationalChannelAvailable(both, "sms"), false);
  assertEquals(operationalChannelAvailable(both, "email"), true);
});

// ── Marketing: a separate class, never implied, and disabled ────────────────

Deno.test("marketing SMS fails closed: no consent flag means no promotional text", () => {
  assertEquals(canSendMarketing(customer(), "sms"), false);
  assertEquals(canSendMarketing(customer({ marketing_sms_consent: null }), "sms"), false);
  assertEquals(canSendMarketing(customer({ marketing_sms_consent: false }), "sms"), false);
});

Deno.test("nothing operational stands in for marketing consent", () => {
  // Not the SMS tickbox, not a booking, not a number.
  assertEquals(canSendMarketing(customer({ sms: true }), "sms"), false);
  assertEquals(operationalChannelAvailable(customer(), "sms"), true); // yet operational SMS is available
});

Deno.test("marketing needs its own consent AND respects a STOP on either channel", () => {
  assertEquals(canSendMarketing(customer({ marketing_sms_consent: true }), "sms"), true);
  assertEquals(canSendMarketing(customer({ marketing_sms_consent: true, sms_opted_out: true }), "sms"), false);
  assertEquals(canSendMarketing(customer({ marketing_sms_consent: true, whatsapp_opted_out: true }), "sms"), false);
  assertEquals(canSendMarketing(customer({ marketing_sms_consent: true, phone: null }), "sms"), false);
  assertEquals(canSendMarketing(customer({ marketing_sms_consent: true }), "email" as never), false);
});

// ── Staff wording ───────────────────────────────────────────────────────────

Deno.test("staff-facing wording says why", () => {
  assertEquals(blockText("sms", "no_number"), "No mobile number on file");
  assertEquals(blockText("sms", "opted_out"), "Customer opted out of SMS");
  assertEquals(blockText("whatsapp", "not_set_up"), "Customer isn't set up for WhatsApp");
  assertEquals(blockText("whatsapp", "opted_out"), "Customer opted out of WhatsApp");
  assertEquals(blockText("email", "no_email"), "No email on file");
});
