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
  isSmsCapableNumber,
  operationalChannelAvailable,
  prefersSms,
  smsBeforeWhatsApp,
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

// ── A text must be able to reach the number ─────────────────────────────────
// Records hold landlines as contact numbers on purpose. A landline-only customer
// with an email must stay on email, not be sent to a channel that cannot deliver.

Deno.test("UK mobiles, however typed, and well-formed international numbers can receive texts", () => {
  for (const n of ["07123456789", "07123 456 789", "+447123456789", "447123456789", "+44 (0)7123 456789", "0044 7123 456789", "+33612345678", "0033612345678", "+14158675310"]) {
    assertEquals(isSmsCapableNumber(n), true, n);
  }
});

Deno.test("landlines, fragments and empty values cannot", () => {
  for (const n of ["0161 285 5218", "01612855218", "+441612855218", "07123", "12345", "", null, undefined]) {
    assertEquals(isSmsCapableNumber(n as string | null | undefined), false, String(n));
  }
});

Deno.test("a landline-only customer is not routed to SMS: it is blocked, so they stay on email", () => {
  const landline = customer({ phone: "0161 285 5218", whatsapp: false });
  assertEquals(blockReason(landline, "sms"), "not_textable");
  assertEquals(operationalChannelAvailable(landline, "sms"), false);
  assertEquals(operationalChannelAvailable(landline, "email"), true);
  assertEquals(blockText("sms", "not_textable").includes("landline"), true);
  // ...but a mobile with the same settings is textable.
  assertEquals(operationalChannelAvailable(customer({ phone: "07123456789", whatsapp: false }), "sms"), true);
  // And no number at all stays its own reason.
  assertEquals(blockReason(customer({ phone: null }), "sms"), "no_number");
});

Deno.test("marketing needs a textable number too", () => {
  assertEquals(canSendMarketing(customer({ marketing_sms_consent: true, phone: "0161 285 5218" }), "sms"), false);
});

Deno.test("a customer prefers SMS only when their reminder preferences name SMS and not WhatsApp", () => {
  assertEquals(prefersSms(customer({ reminder_channels: ["sms"] })), true);
  assertEquals(prefersSms(customer({ reminder_channels: ["sms", "email"] })), true);
  // WhatsApp is the default, and choosing both is not a preference for SMS.
  assertEquals(prefersSms(customer({ reminder_channels: ["whatsapp"] })), false);
  assertEquals(prefersSms(customer({ reminder_channels: ["whatsapp", "sms"] })), false);
  assertEquals(prefersSms(customer({ reminder_channels: ["email"] })), false);
  // Missing or malformed is not a preference.
  assertEquals(prefersSms(customer()), false);
  assertEquals(prefersSms(customer({ reminder_channels: null })), false);
  assertEquals(prefersSms(customer({ reminder_channels: "sms" })), false);
  // The optional tickbox is still not consulted, either way.
  assertEquals(prefersSms(customer({ sms: true, whatsapp: false })), false);
});

Deno.test("an SMS preference puts SMS first only when a text may actually go", () => {
  const prefers = { reminder_channels: ["sms"] };
  assertEquals(smsBeforeWhatsApp(customer(prefers)), true);
  // Even with WhatsApp set up: the preference is the point.
  assertEquals(smsBeforeWhatsApp(customer({ ...prefers, whatsapp: true })), true);
  // It never beats an SMS opt-out, a landline or a missing number.
  assertEquals(smsBeforeWhatsApp(customer({ ...prefers, sms_opted_out: true })), false);
  assertEquals(smsBeforeWhatsApp(customer({ ...prefers, phone: "0161 285 5218" })), false);
  assertEquals(smsBeforeWhatsApp(customer({ ...prefers, phone: null })), false);
  assertEquals(smsBeforeWhatsApp(customer()), false);
});
