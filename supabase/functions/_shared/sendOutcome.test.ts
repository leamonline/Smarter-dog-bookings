import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  classifyProviderResponse,
  isUnknownOutcomeBody,
  isUnknownOutcomeLogMessage,
  sendCallMayHaveGone,
  UNKNOWN_OUTCOME_PREFIX,
  unknownOutcomeLogMessage,
} from "./sendOutcome.ts";

const facts = (over: Partial<Parameters<typeof classifyProviderResponse>[0]>) => ({
  ok: false,
  status: 500,
  jsonParsed: true,
  hasMessageId: false,
  ...over,
});

Deno.test("only a 2xx that names a message is accepted", () => {
  assertEquals(classifyProviderResponse(facts({ ok: true, status: 201, hasMessageId: true })), "accepted");
  assertEquals(classifyProviderResponse(facts({ ok: true, status: 200, hasMessageId: false })), "unknown");
  assertEquals(classifyProviderResponse(facts({ ok: true, status: 200, jsonParsed: false })), "unknown");
});

Deno.test("a 4xx with a readable JSON error is a rejection", () => {
  assertEquals(classifyProviderResponse(facts({ status: 400 })), "rejected");
  assertEquals(classifyProviderResponse(facts({ status: 401 })), "rejected");
  assertEquals(classifyProviderResponse(facts({ status: 404 })), "rejected");
});

Deno.test("a 4xx we could not read proves nothing", () => {
  assertEquals(classifyProviderResponse(facts({ status: 400, jsonParsed: false })), "unknown");
});

Deno.test("429 is a rejection (assumption pinned: refused before a message was created)", () => {
  assertEquals(classifyProviderResponse(facts({ status: 429 })), "rejected");
  assertEquals(classifyProviderResponse(facts({ status: 429, jsonParsed: false })), "rejected");
});

Deno.test("5xx and anything odd is unknown, even with a JSON error body", () => {
  assertEquals(classifyProviderResponse(facts({ status: 500 })), "unknown");
  assertEquals(classifyProviderResponse(facts({ status: 503, jsonParsed: false })), "unknown");
  assertEquals(classifyProviderResponse(facts({ status: 302 })), "unknown");
  assertEquals(classifyProviderResponse(facts({ status: 0 })), "unknown");
});

Deno.test("unknown outcomes are recognised in bodies and log messages", () => {
  assertEquals(isUnknownOutcomeBody({ ok: false, outcome: "unknown" }), true);
  assertEquals(isUnknownOutcomeBody({ ok: false, outcome: "not_sent" }), false);
  assertEquals(isUnknownOutcomeBody(null), false);
  assertEquals(isUnknownOutcomeBody("unknown"), false);
  assertEquals(unknownOutcomeLogMessage().startsWith(UNKNOWN_OUTCOME_PREFIX), true);
  assertEquals(unknownOutcomeLogMessage("two notices"), `${UNKNOWN_OUTCOME_PREFIX} two notices`);
  assertEquals(isUnknownOutcomeLogMessage(unknownOutcomeLogMessage()), true);
  assertEquals(isUnknownOutcomeLogMessage("Delivery failed — check provider logs"), false);
  assertEquals(isUnknownOutcomeLogMessage(null), false);
});



const call = (status: number, body: Record<string, unknown> = {}) => ({ ok: status >= 200 && status < 300, status, body });

Deno.test("a call may have gone out unless something proves it did not", () => {
  // Proves nothing was sent.
  assertEquals(sendCallMayHaveGone(call(502, { ok: false, outcome: "not_sent" })), false);
  assertEquals(sendCallMayHaveGone(call(503, { ok: false, outcome: "not_sent", reason: "opt_out_check_failed" })), false);
  assertEquals(sendCallMayHaveGone(call(409, { error: "opted out" })), false);
  assertEquals(sendCallMayHaveGone(call(422, { error: "24h window closed" })), false);
  assertEquals(sendCallMayHaveGone(call(401, { error: "invalid token" })), false);
  // A clean success is handled as a success.
  assertEquals(sendCallMayHaveGone(call(200, { ok: true })), false);
  // May have gone.
  assertEquals(sendCallMayHaveGone(call(502, { ok: false, outcome: "unknown" })), true);
  assertEquals(sendCallMayHaveGone(call(500, {})), true, "a 5xx with no body");
  assertEquals(sendCallMayHaveGone(call(0, {})), true, "the call itself timed out");
  assertEquals(sendCallMayHaveGone(call(200, {})), true, "a 2xx that is not ok:true");
  assertEquals(sendCallMayHaveGone(call(500, { error: "internal error" })), true);
});

import { failedSendMayHaveGone } from "./sendOutcome.ts";

Deno.test("failedSendMayHaveGone also covers an ok:true that named no message", () => {
  // Reached only by a caller that needs a message id and did not get one.
  assertEquals(failedSendMayHaveGone(call(200, { ok: true, meta_message_id: null })), true);
  assertEquals(failedSendMayHaveGone(call(200, { ok: true })), true);
  // Unchanged for everything sendCallMayHaveGone already decides.
  assertEquals(failedSendMayHaveGone(call(502, { ok: false, outcome: "not_sent" })), false);
  assertEquals(failedSendMayHaveGone(call(409, { error: "opted out" })), false);
  assertEquals(failedSendMayHaveGone(call(502, { ok: false, outcome: "unknown" })), true);
  assertEquals(failedSendMayHaveGone(call(0, {})), true);
});
