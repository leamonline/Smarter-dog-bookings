import {
  assertEquals,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { decideAiMessagingSend } from "./aiMessagingGate.ts";

Deno.test("manual staff messages bypass the AI messaging controls", () => {
  assertEquals(
    decideAiMessagingSend({
      aiInitiated: false,
      globalRead: { ok: false },
      customerReadRequired: true,
      customerRead: { ok: false },
    }),
    { allowed: true, reason: "manual_staff_message" },
  );
});

Deno.test("AI sends require an explicitly enabled global setting", () => {
  assertEquals(
    decideAiMessagingSend({
      aiInitiated: true,
      globalRead: { ok: true, value: false },
      customerReadRequired: false,
    }),
    { allowed: false, reason: "global_disabled" },
  );
  assertEquals(
    decideAiMessagingSend({
      aiInitiated: true,
      globalRead: { ok: false },
      customerReadRequired: false,
    }),
    { allowed: false, reason: "global_lookup_failed" },
  );
});

Deno.test("a known customer's opt-out overrides the enabled global setting", () => {
  assertEquals(
    decideAiMessagingSend({
      aiInitiated: true,
      globalRead: { ok: true, value: true },
      customerReadRequired: true,
      customerRead: { ok: true, value: false },
    }),
    { allowed: false, reason: "customer_disabled" },
  );
});

Deno.test("a failed known-customer preference lookup fails closed", () => {
  assertEquals(
    decideAiMessagingSend({
      aiInitiated: true,
      globalRead: { ok: true, value: true },
      customerReadRequired: true,
      customerRead: { ok: false },
    }),
    { allowed: false, reason: "customer_lookup_failed" },
  );
});

Deno.test("AI sends proceed only when every required read is explicitly true", () => {
  assertEquals(
    decideAiMessagingSend({
      aiInitiated: true,
      globalRead: { ok: true, value: true },
      customerReadRequired: true,
      customerRead: { ok: true, value: true },
    }),
    { allowed: true, reason: "enabled" },
  );
  assertEquals(
    decideAiMessagingSend({
      aiInitiated: true,
      globalRead: { ok: true, value: true },
      customerReadRequired: false,
    }),
    { allowed: true, reason: "enabled" },
  );
});
