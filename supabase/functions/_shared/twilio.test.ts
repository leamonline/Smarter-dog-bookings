// Run locally:  deno test --node-modules-dir=none supabase/functions/_shared/twilio.test.ts
import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { normaliseUkPhone } from "./twilio.ts";

Deno.test("a UK number typed with the (0) trunk zero is sent in valid E.164", () => {
  assertEquals(normaliseUkPhone("+44 (0)7123 456789"), "+447123456789");
  assertEquals(normaliseUkPhone("0044 (0)7123 456789"), "+447123456789");
});

Deno.test("ordinary forms are unchanged", () => {
  assertEquals(normaliseUkPhone("07123 456789"), "+447123456789");
  assertEquals(normaliseUkPhone("447123456789"), "+447123456789");
  assertEquals(normaliseUkPhone("+33612345678"), "+33612345678");
});
