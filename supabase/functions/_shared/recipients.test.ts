// Unit tests for the recipient channel-resolution helpers.
// Run locally:  deno test --node-modules-dir=none supabase/functions/_shared/recipients.test.ts
import {
  assertEquals,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  bookingCancellationSkipReason,
  bookingConfirmationSkipReason,
  channelAvailableFor,
  pickChannel,
  resolveConfirmationChannel,
  staffRescheduleReplacementWarning,
  type RecipientHuman,
} from "./recipients.ts";

function human(overrides: Partial<RecipientHuman> = {}): RecipientHuman {
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

Deno.test("channelAvailableFor honours setup flag, contact detail and opt-out", () => {
  assertEquals(channelAvailableFor(human(), "whatsapp"), true);
  // not set up
  assertEquals(channelAvailableFor(human({ whatsapp: false }), "whatsapp"), false);
  // opted out
  assertEquals(channelAvailableFor(human({ whatsapp_opted_out: true }), "whatsapp"), false);
  // no phone -> no whatsapp/sms
  assertEquals(channelAvailableFor(human({ phone: null }), "whatsapp"), false);
  assertEquals(channelAvailableFor(human({ phone: null }), "sms"), false);
  // email needs only an address + not opted out
  assertEquals(channelAvailableFor(human({ phone: null }), "email"), true);
  assertEquals(channelAvailableFor(human({ email: null }), "email"), false);
  assertEquals(channelAvailableFor(human({ email_opted_out: true }), "email"), false);
});

Deno.test("pickChannel prefers WhatsApp, then SMS, then email", () => {
  assertEquals(pickChannel(human()), "whatsapp");
  assertEquals(pickChannel(human({ whatsapp: false })), "sms");
  assertEquals(pickChannel(human({ whatsapp: false, sms: false })), "email");
  assertEquals(
    pickChannel(human({ whatsapp: false, sms: false, email: null })),
    null,
  );
});

Deno.test("resolveConfirmationChannel: 'auto' uses the preference order", () => {
  assertEquals(resolveConfirmationChannel("auto", human()), { channel: "whatsapp" });
  assertEquals(
    resolveConfirmationChannel("auto", human({ whatsapp: false })),
    { channel: "sms" },
  );
  // unknown values fall back to auto behaviour too
  assertEquals(resolveConfirmationChannel("weird", human()), { channel: "whatsapp" });
});

Deno.test("resolveConfirmationChannel: a forced channel is used when reachable", () => {
  assertEquals(resolveConfirmationChannel("sms", human()), { channel: "sms" });
  assertEquals(resolveConfirmationChannel("email", human()), { channel: "email" });
});

Deno.test("resolveConfirmationChannel: forced channel that's unreachable skips (no fallback)", () => {
  // WhatsApp forced but opted out -> skip, do NOT fall back to SMS/email
  assertEquals(
    resolveConfirmationChannel("whatsapp", human({ whatsapp_opted_out: true })),
    { channel: null, skip: "cannot reach on whatsapp" },
  );
  // SMS forced but no phone -> skip
  assertEquals(
    resolveConfirmationChannel("sms", human({ phone: null })),
    { channel: null, skip: "cannot reach on sms" },
  );
});

Deno.test("resolveConfirmationChannel: 'none' resolves to a skip", () => {
  assertEquals(
    resolveConfirmationChannel("none", human()),
    { channel: null, skip: "confirmation suppressed" },
  );
});

Deno.test("resolveConfirmationChannel: 'auto' with no usable channel skips", () => {
  assertEquals(
    resolveConfirmationChannel("auto", human({ whatsapp: false, sms: false, email: null })),
    { channel: null, skip: "no contact method" },
  );
});

Deno.test("pending deposits suppress the ordinary booking confirmation until matched", () => {
  assertEquals(
    bookingConfirmationSkipReason({
      confirmation_channel: "auto",
      deposit_required: true,
      deposit_received_at: null,
      payment: "Due at Pick-up",
    }),
    "booking is awaiting deposit",
  );
  assertEquals(
    bookingConfirmationSkipReason({
      confirmation_channel: "auto",
      deposit_required: true,
      deposit_received_at: null,
      payment: "Deposit Paid",
    }),
    null,
  );
  assertEquals(
    bookingConfirmationSkipReason({
      confirmation_channel: "auto",
      deposit_required: false,
      deposit_received_at: null,
      payment: "Due at Pick-up",
    }),
    null,
  );
});

Deno.test("bookingCancellationSkipReason: skips a WhatsApp Flow reschedule cancellation", () => {
  assertEquals(
    bookingCancellationSkipReason({ cancel_reason: "Rescheduled via WhatsApp" }),
    "cancellation is a WhatsApp reschedule",
  );
  // Surrounding whitespace still matches — the trigger stamps the literal
  // exactly, but trim() protects against incidental padding.
  assertEquals(
    bookingCancellationSkipReason({ cancel_reason: "  Rescheduled via WhatsApp  " }),
    "cancellation is a WhatsApp reschedule",
  );
});

Deno.test("bookingCancellationSkipReason: skips a staff visit reschedule cancellation", () => {
  assertEquals(
    bookingCancellationSkipReason({ cancel_reason: "Rescheduled by staff" }),
    "cancellation is a staff reschedule",
  );
  // Surrounding whitespace still matches — the trigger stamps the literal
  // exactly, but trim() protects against incidental padding.
  assertEquals(
    bookingCancellationSkipReason({ cancel_reason: "  Rescheduled by staff  " }),
    "cancellation is a staff reschedule",
  );
});

Deno.test("bookingCancellationSkipReason: exact match only, no prefix/case matching", () => {
  // Trailing punctuation or a case difference must not match — exact
  // equality only, same as the WhatsApp reason.
  assertEquals(
    bookingCancellationSkipReason({ cancel_reason: "Rescheduled by staff!" }),
    null,
  );
  assertEquals(
    bookingCancellationSkipReason({ cancel_reason: "rescheduled by staff" }),
    null,
  );
  assertEquals(
    bookingCancellationSkipReason({ cancel_reason: "Customer cancelled via WhatsApp" }),
    null,
  );
  assertEquals(
    bookingCancellationSkipReason({ cancel_reason: "Deposit not received" }),
    null,
  );
  assertEquals(bookingCancellationSkipReason({ cancel_reason: null }), null);
  assertEquals(bookingCancellationSkipReason({ cancel_reason: undefined }), null);
  assertEquals(bookingCancellationSkipReason({ cancel_reason: "" }), null);
  assertEquals(bookingCancellationSkipReason({ cancel_reason: 42 }), null);
});

Deno.test("staffRescheduleReplacementWarning: settled deposit states return null", () => {
  assertEquals(
    staffRescheduleReplacementWarning({
      sourceVisitId: "v-source",
      replacement: { id: "v-new", depositState: "not_required", bookingCount: 2 },
    }),
    null,
  );
  assertEquals(
    staffRescheduleReplacementWarning({
      sourceVisitId: "v-source",
      replacement: { id: "v-new", depositState: "received", bookingCount: 1 },
    }),
    null,
  );
});

Deno.test("staffRescheduleReplacementWarning: unsettled deposit states warn", () => {
  for (
    const depositState of [
      "awaiting_payment",
      "reconciliation_required",
      "received_liability",
    ]
  ) {
    const warning = staffRescheduleReplacementWarning({
      sourceVisitId: "v-source",
      replacement: { id: "v-new", depositState, bookingCount: 1 },
    });
    assertEquals(warning?.sourceVisitId, "v-source");
    assertEquals(warning?.replacementVisitId, "v-new");
    assertEquals(warning?.depositState, depositState);
  }
});

Deno.test("staffRescheduleReplacementWarning: missing replacement warns", () => {
  const warning = staffRescheduleReplacementWarning({
    sourceVisitId: "v-source",
    replacement: null,
  });
  assertEquals(warning?.sourceVisitId, "v-source");
  assertEquals(warning?.reason, "staff reschedule replacement visit not found");
});
