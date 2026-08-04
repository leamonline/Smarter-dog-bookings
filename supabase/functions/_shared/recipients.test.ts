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
  reportStaffRescheduleReplacement,
  staffRescheduleReplacementWarning,
  type StaffRescheduleLookupResult,
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
  // The complete set of states booking_visit_deposits.state can hold
  // (20260726144002:302-305) minus the two the reschedule RPC itself treats
  // as transferable, plus null for a replacement with no deposit row at all.
  for (
    const depositState of [
      "awaiting_terms",
      "awaiting_payment",
      "received_liability",
      "not_received",
      "reconciliation_required",
      null,
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

// ── The operational invariant ────────────────────────────────────────────
//
// These are the tests that actually matter. Suppression of a staff-reschedule
// cancellation is unconditional; the diagnostic lookup is advisory. Every
// failure mode below must log and then resolve normally, because the caller
// returns `200 Skipped` immediately afterwards — if any of these could throw
// or signal failure, a diagnostic fault could turn a move into a
// customer-facing "your appointment has been cancelled".

function collectWarnings() {
  const seen: Array<{ message: string; detail: string }> = [];
  return {
    seen,
    warn: (message: string, detail: string) => seen.push({ message, detail }),
  };
}

Deno.test("reportStaffRescheduleReplacement: a returned PostgREST error logs and resolves", async () => {
  const { seen, warn } = collectWarnings();
  await reportStaffRescheduleReplacement({
    sourceVisitId: "v-source",
    bookingId: "b-1",
    lookup: () => Promise.resolve({ data: null, error: { code: "PGRST301", message: "boom" } }),
    warn,
  });
  assertEquals(seen.length, 1);
  assertEquals(
    seen[0].message,
    "notify-booking-cancelled: staff reschedule replacement lookup failed",
  );
  // "lookup failed" must stay distinct from "replacement missing".
  assertEquals(JSON.parse(seen[0].detail).code, "PGRST301");
});

Deno.test("reportStaffRescheduleReplacement: a thrown exception logs and resolves", async () => {
  const { seen, warn } = collectWarnings();
  await reportStaffRescheduleReplacement({
    sourceVisitId: "v-source",
    bookingId: "b-1",
    lookup: () => {
      throw new Error("client construction failed");
    },
    warn,
  });
  assertEquals(seen.length, 1);
  assertEquals(
    seen[0].message,
    "notify-booking-cancelled: staff reschedule replacement lookup threw",
  );
});

Deno.test("reportStaffRescheduleReplacement: a missing source visit id logs and never queries", async () => {
  const { seen, warn } = collectWarnings();
  let queried = false;
  await reportStaffRescheduleReplacement({
    sourceVisitId: null,
    bookingId: "b-1",
    lookup: () => {
      queried = true;
      return Promise.resolve({ data: null, error: null });
    },
    warn,
  });
  assertEquals(queried, false);
  assertEquals(seen.length, 1);
  assertEquals(
    seen[0].message,
    "notify-booking-cancelled: staff reschedule source visit id missing",
  );
  assertEquals(JSON.parse(seen[0].detail).bookingId, "b-1");
});

Deno.test("reportStaffRescheduleReplacement: a lookup that never settles times out and resolves", async () => {
  const { seen, warn } = collectWarnings();
  let aborted = false;

  await reportStaffRescheduleReplacement({
    sourceVisitId: "v-source",
    bookingId: "b-1",
    // Never resolves. Without a deadline this would hang the caller before
    // it could return its 200 Skipped.
    lookup: (_sourceVisitId, signal) => {
      signal.addEventListener("abort", () => {
        aborted = true;
      });
      return new Promise<never>(() => {});
    },
    warn,
    timeoutMs: 5,
  });

  assertEquals(seen.length, 1);
  assertEquals(
    seen[0].message,
    "notify-booking-cancelled: staff reschedule replacement lookup timed out",
  );
  assertEquals(JSON.parse(seen[0].detail).timeoutMs, 5);
  // The real PostgREST request is told to stop, not just abandoned.
  assertEquals(aborted, true);
});

Deno.test("reportStaffRescheduleReplacement: a lookup rejecting after the deadline stays silent", async () => {
  const { seen, warn } = collectWarnings();

  await reportStaffRescheduleReplacement({
    sourceVisitId: "v-source",
    bookingId: "b-1",
    // Rejects well after the deadline — the timeout must already have won,
    // and the late rejection must not surface as a second warning or as an
    // unhandled rejection.
    lookup: () =>
      new Promise<StaffRescheduleLookupResult>((_resolve, reject) => {
        setTimeout(() => reject(new Error("too late")), 15);
      }),
    warn,
    timeoutMs: 5,
  });

  assertEquals(seen.length, 1);
  assertEquals(
    seen[0].message,
    "notify-booking-cancelled: staff reschedule replacement lookup timed out",
  );
  // Let the late rejection land inside the test so a regression that leaves
  // it unhandled fails here rather than in some later test.
  await new Promise((resolve) => setTimeout(resolve, 25));
  assertEquals(seen.length, 1);
});

Deno.test("reportStaffRescheduleReplacement: a settled replacement logs nothing", async () => {
  const { seen, warn } = collectWarnings();
  await reportStaffRescheduleReplacement({
    sourceVisitId: "v-source",
    bookingId: "b-1",
    lookup: () =>
      Promise.resolve({
        data: {
          id: "v-new",
          bookings: [{ id: "b-2" }, { id: "b-3" }],
          booking_visit_deposits: [{ state: "received" }],
        },
        error: null,
      }),
    warn,
  });
  assertEquals(seen, []);
});

Deno.test("reportStaffRescheduleReplacement: normalises a to-one embed and reports the deposit state", async () => {
  const { seen, warn } = collectWarnings();
  await reportStaffRescheduleReplacement({
    sourceVisitId: "v-source",
    bookingId: "b-1",
    // supabase-js may resolve a to-one embed as a bare object rather than an
    // array depending on what it infers from FK metadata — both must work.
    lookup: () =>
      Promise.resolve({
        data: {
          id: "v-new",
          bookings: { id: "b-2" },
          booking_visit_deposits: { state: "awaiting_payment" },
        },
        error: null,
      }),
    warn,
  });
  assertEquals(seen.length, 1);
  const detail = JSON.parse(seen[0].detail);
  assertEquals(detail.depositState, "awaiting_payment");
  assertEquals(detail.replacementVisitId, "v-new");
  assertEquals(detail.bookingCount, 1);
});
