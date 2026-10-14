import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  notificationLogPatchForTwilioWhatsApp,
  TWILIO_WHATSAPP_UNCONFIRMED,
} from "./twilioDelivery.ts";

Deno.test("a Twilio accept is 'pending' with the SID, never 'sent'", () => {
  assertEquals(
    notificationLogPatchForTwilioWhatsApp({ ok: true, status: 201, sid: "SM123" }),
    {
      status: "pending",
      provider_message_id: "SM123",
      sent_at: null,
      error_message: TWILIO_WHATSAPP_UNCONFIRMED,
    },
  );
  assertEquals(
    notificationLogPatchForTwilioWhatsApp({ ok: true, status: 201 }).provider_message_id,
    null,
  );
});

Deno.test("a Twilio rejection is 'failed' with Twilio's reason and code", () => {
  const patch = notificationLogPatchForTwilioWhatsApp({
    ok: false,
    status: 400,
    errorCode: "63016",
    errorMessage: "Failed to send freeform message because you are outside the allowed window.",
  });
  assertEquals(patch.status, "failed");
  assertEquals(patch.provider_message_id, null);
  assertStringIncludes(patch.error_message, "outside the allowed window");
  assertStringIncludes(patch.error_message, "Twilio 63016");
});

Deno.test("a rejection with no body still says what happened", () => {
  const patch = notificationLogPatchForTwilioWhatsApp({ ok: false, status: 502 });
  assertEquals(patch.status, "failed");
  assertStringIncludes(patch.error_message, "HTTP 502");
});
