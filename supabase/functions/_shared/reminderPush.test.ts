import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { interpretApnsSend, reminderPushBody } from "./reminderPush.ts";

Deno.test("interpretApnsSend treats a delivered push as final", () => {
  assertEquals(interpretApnsSend({ networkError: false, body: { sent: 1, apns_id: "apple-1", fallback: false, outcome_unknown: false } }), {
    sent: true,
    providerId: "apple-1",
    outcomeUnknown: false,
    fallback: false,
  });
});

Deno.test("interpretApnsSend falls back only when the sender says the push never left", () => {
  assertEquals(interpretApnsSend({ networkError: false, body: { sent: 0, fallback: true, outcome_unknown: false } }), {
    sent: false,
    providerId: null,
    outcomeUnknown: false,
    fallback: true,
  });
});

Deno.test("interpretApnsSend does not double-send when the outcome is unknown or the reply is unreadable", () => {
  assertEquals(interpretApnsSend({ networkError: false, body: { sent: 0, outcome_unknown: true, fallback: true } }).fallback, false);
  assertEquals(interpretApnsSend({ networkError: true, body: null }).outcomeUnknown, true);
  assertEquals(interpretApnsSend({ networkError: false, body: null }).fallback, false);
  assertEquals(interpretApnsSend({ networkError: false, body: { error: "nope" } }).fallback, false);
});

Deno.test("reminderPushBody uses an explicit body, then the reminder text, then template params", () => {
  assertEquals(reminderPushBody({ explicit: "  Hello  ", message: "ignored", whatsappParams: ["A", "B", "C"] }), "Hello");
  assertEquals(reminderPushBody({ message: "See you tomorrow" }), "See you tomorrow");
  assertEquals(
    reminderPushBody({ whatsappParams: ["Sam", "Pip", "Tue 9:00"] }),
    "Hi Sam, a reminder that Pip is booked in at Tue 9:00. See you at Smarter Dog Grooming.",
  );
  assertEquals(reminderPushBody({ whatsappParams: ["Sam"] }), null);
  assertEquals(reminderPushBody({}), null);
});
