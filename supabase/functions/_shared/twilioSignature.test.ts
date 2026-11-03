// Verifying Twilio's X-Twilio-Signature.
// Run locally:  deno test --node-modules-dir=none --allow-env supabase/functions/_shared/twilioSignature.test.ts

import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { computeTwilioSignature, isValidTwilioSignature } from "./twilioSignature.ts";

// The worked example from Twilio's request-validation documentation. Also
// reproduced with an independent HMAC-SHA1 implementation (Python), so this is not
// the code agreeing with itself.
const TOKEN = "12345";
const URL_ = "https://mycompany.com/myapp.php?foo=1&bar=2";
const PARAMS = {
  Digits: "1234",
  To: "+18005551212",
  From: "+14158675310",
  Caller: "+14158675310",
  CallSid: "CA1234567890ABCDE",
};
const SIGNATURE = "GvWf1cFY/Q7PnoempGyD5oXAezc=";

Deno.test("matches Twilio's published signature for the documented example", async () => {
  assertEquals(await computeTwilioSignature(TOKEN, URL_, PARAMS), SIGNATURE);
});

Deno.test("accepts a correctly signed request, whatever order the parameters arrive in", async () => {
  assertEquals(await isValidTwilioSignature(TOKEN, URL_, PARAMS, SIGNATURE), true);
  const shuffled = { CallSid: PARAMS.CallSid, To: PARAMS.To, Digits: PARAMS.Digits, Caller: PARAMS.Caller, From: PARAMS.From };
  assertEquals(await isValidTwilioSignature(TOKEN, URL_, shuffled, SIGNATURE), true);
});

Deno.test("rejects a signature made with the wrong token, URL or body", async () => {
  assertEquals(await isValidTwilioSignature("wrong-token", URL_, PARAMS, SIGNATURE), false);
  assertEquals(await isValidTwilioSignature(TOKEN, "https://evil.example/myapp.php?foo=1&bar=2", PARAMS, SIGNATURE), false);
  assertEquals(await isValidTwilioSignature(TOKEN, URL_, { ...PARAMS, To: "+447700900123" }, SIGNATURE), false);
  assertEquals(await isValidTwilioSignature(TOKEN, URL_, { ...PARAMS, Extra: "1" }, SIGNATURE), false);
});

Deno.test("fails closed: nothing to compare is never valid", async () => {
  assertEquals(await isValidTwilioSignature("", URL_, PARAMS, SIGNATURE), false);
  assertEquals(await isValidTwilioSignature(null, URL_, PARAMS, SIGNATURE), false);
  assertEquals(await isValidTwilioSignature(undefined, URL_, PARAMS, SIGNATURE), false);
  assertEquals(await isValidTwilioSignature(TOKEN, "", PARAMS, SIGNATURE), false);
  assertEquals(await isValidTwilioSignature(TOKEN, URL_, PARAMS, ""), false);
  assertEquals(await isValidTwilioSignature(TOKEN, URL_, PARAMS, null), false);
  // An empty token must not validate a signature computed with an empty token.
  const emptyKeySignature = await computeTwilioSignature("x", URL_, PARAMS);
  assertEquals(await isValidTwilioSignature("", URL_, PARAMS, emptyKeySignature), false);
});

Deno.test("an almost-right signature is rejected", async () => {
  assertEquals(await isValidTwilioSignature(TOKEN, URL_, PARAMS, SIGNATURE.slice(0, -2) + "A="), false);
  assertEquals(await isValidTwilioSignature(TOKEN, URL_, PARAMS, SIGNATURE + "x"), false);
});
