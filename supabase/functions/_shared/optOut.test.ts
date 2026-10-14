import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { decideOptOutSend, isOptOutRequest, phoneLookupCandidates } from "./optOut.ts";

Deno.test("an opted-out customer is refused whoever is sending", () => {
  const recipient = { whatsapp_opted_out: true };
  assertEquals(
    decideOptOutSend({ recipient, overrideOptOut: false, callerIsStaff: true, aiInitiated: false }),
    { allowed: false, reason: "whatsapp_opted_out" },
  );
  assertEquals(
    decideOptOutSend({ recipient, overrideOptOut: false, callerIsStaff: false, aiInitiated: false }),
    { allowed: false, reason: "whatsapp_opted_out" },
  );
  assertEquals(
    decideOptOutSend({ recipient, overrideOptOut: false, callerIsStaff: false, aiInitiated: true }),
    { allowed: false, reason: "whatsapp_opted_out" },
  );
});

Deno.test("only a member of staff can override, and never for an AI-initiated send", () => {
  const recipient = { whatsapp_opted_out: true };
  assertEquals(
    decideOptOutSend({ recipient, overrideOptOut: true, callerIsStaff: true, aiInitiated: false }),
    { allowed: true, reason: "staff_override" },
  );
  // The internal secret alone is not a person deciding.
  assertEquals(
    decideOptOutSend({ recipient, overrideOptOut: true, callerIsStaff: false, aiInitiated: false }),
    { allowed: false, reason: "whatsapp_opted_out" },
  );
  assertEquals(
    decideOptOutSend({ recipient, overrideOptOut: true, callerIsStaff: true, aiInitiated: true }),
    { allowed: false, reason: "whatsapp_opted_out" },
  );
});

Deno.test("a customer who has not opted out, or an unknown number, is allowed", () => {
  assertEquals(
    decideOptOutSend({ recipient: { whatsapp_opted_out: false }, overrideOptOut: false, callerIsStaff: false, aiInitiated: true }),
    { allowed: true, reason: "not_opted_out" },
  );
  assertEquals(
    decideOptOutSend({ recipient: { whatsapp_opted_out: null }, overrideOptOut: false, callerIsStaff: true, aiInitiated: false }),
    { allowed: true, reason: "not_opted_out" },
  );
  assertEquals(
    decideOptOutSend({ recipient: null, overrideOptOut: false, callerIsStaff: false, aiInitiated: false }),
    { allowed: true, reason: "unknown_recipient" },
  );
});

Deno.test("phone candidates cover the three stored formats", () => {
  assertEquals(phoneLookupCandidates("+447700900123"), ["+447700900123", "447700900123", "07700900123"]);
  assertEquals(phoneLookupCandidates("447700900123"), ["+447700900123", "447700900123", "07700900123"]);
  assertEquals(phoneLookupCandidates("+33123456789"), ["+33123456789", "33123456789"]);
  assertEquals(phoneLookupCandidates(""), []);
});

Deno.test("recognises the ways customers ask us to stop", () => {
  for (const text of [
    "STOP",
    "stop.",
    "Stop!",
    "unsubscribe",
    "Opt out",
    "please stop",
    "Please stop messaging me",
    "stop texting me",
    "Don't message me again",
    "do not contact me",
    "Never text me again please",
    "no more messages thanks",
    "Take me off your list",
    "remove my number from your list",
    "Please remove me from this chat",
    "I'd like to opt out of these messages",
    "opt me out please",
    "Can you unsubscribe me",
    "Don't text me.",
  ]) {
    assert(isOptOutRequest(text), `expected opt-out: ${text}`);
  }
});

Deno.test("does not mistake ordinary salon chat for an opt-out", () => {
  for (const text of [
    "Can I stop by at 10?",
    "I'll stop in on Tuesday to pick him up",
    "Please stop the clippers short on his ears",
    "message me when he's ready",
    "Don't book Max in the afternoon please",
    "Can you text me the price?",
    "Could you contact me about Bella's groom",
    "No more than £50 please",
    "I need to stop his medication before the groom",
    // Phrases that share the words but ask for something else (#1016 review)
    "Can we opt out of the nail clip this time?",
    "Please take me off the waiting list",
    "Take me off the waitlist, we found a slot",
    "Remove my old number and use this one",
    "Don't message me before 9 please",
    "Don't text me until he's ready, I'll be in a meeting",
    "",
    null,
    undefined,
  ]) {
    assert(!isOptOutRequest(text), `unexpected opt-out: ${text}`);
  }
});
