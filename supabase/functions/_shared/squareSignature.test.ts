import { assert, assertFalse } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isValidSquareSignature } from "./squareSignature.ts";

// Computed independently with Node crypto.createHmac('sha256', key)
// .update(url + body).digest('base64') and pinned here so this test is not
// comparing the function to itself.
const KEY = "square-webhook-test-key";
const URL = "https://example.test/functions/v1/square-deposit-webhook";
const BODY = '{"type":"payment.updated","data":{"id":"pay_1"}}';
const SIGNATURE = "Cjcjbe71qMoZ0NZeP61Th2k+heZaTuMnL7arcFXd6Nw=";

Deno.test("a Square signature matches the documented HMAC over url + body", async () => {
  assert(await isValidSquareSignature(KEY, URL, BODY, SIGNATURE));
});

Deno.test("a Square signature fails closed", async () => {
  assertFalse(await isValidSquareSignature("", URL, BODY, SIGNATURE));
  assertFalse(await isValidSquareSignature(KEY, "", BODY, SIGNATURE));
  assertFalse(await isValidSquareSignature(KEY, URL, BODY, ""));
  assertFalse(await isValidSquareSignature(KEY, URL, BODY, null));
  assertFalse(await isValidSquareSignature(null, null, BODY, null));
  assertFalse(await isValidSquareSignature(KEY, URL, BODY + " ", SIGNATURE));
  assertFalse(await isValidSquareSignature(KEY, URL + "/", BODY, SIGNATURE));
  assertFalse(await isValidSquareSignature(KEY, URL, BODY, SIGNATURE.slice(0, -1) + "A"));
});
