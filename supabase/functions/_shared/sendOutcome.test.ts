import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  classifyProviderResponse,
  isUnknownOutcomeBody,
  isUnknownOutcomeLogMessage,
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
