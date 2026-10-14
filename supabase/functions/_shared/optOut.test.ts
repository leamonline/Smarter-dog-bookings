import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  decideOptOutSend,
  isOptOutRequest,
  phoneMatchKey,
  phoneMatchPattern,
  ukNationalDigits,
  ukPhoneMatchPattern,
} from "./optOut.ts";

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
    // Codex review on #1016: common wordings the first patterns missed
    "Please stop sending these messages",
    "stop sending me these texts",
    "Don\u2019t message me again",
    "Don\u2019t text me.",
    "Please don\u2019t contact me any more",
    // Codex re-review on #1016: "send" wordings and unsubscribe sentences
    "Please don't send me any more messages",
    "Please don\u2019t send me any more messages",
    "Do not send me texts again",
    "never send us these reminders.",
    "don't send me messages anymore",
    "Don't send me messages please",
    "How do I unsubscribe?",
    "Please unsubscribe me.",
    "unsubscribe me from these messages",
    "Can you unsubscribe me from your mailing list",
    "Opt me out.",
    "please opt me out of these messages",
    "Opt us out of your mailing list",
    "I don't want any more messages",
    "I don\u2019t want any more messages from you",
    "I no longer want to receive messages",
    "I do not wish to receive any further texts",
    "I don't want your messages.",
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
    "Don\u2019t message me before 9 please",
    "Please stop sending the reminder to my old email",
    // A negated stop is the opposite request (#1016 review)
    "Please don't stop messaging me",
    "Please don\u2019t stop sending me reminders, they help!",
    "I don't want you to stop texting me about Bella",
    "Never stop messaging me about his grooms",
    // Codex re-review on #1016: shares the words, means something else
    "Can you unsubscribe me from the waiting list?",
    "Unsubscribe me from the waitlist please, we found a slot",
    "Don't send me the reminder until Tuesday",
    "Don't send me the reminders until he's back",
    "Please don't send the invoice to my old email",
    "Please opt me out of the nail clip this time",
    "Can you opt us out of the waiting list?",
    "I don't want the reminder moved, Tuesday is fine",
    "I don't want messages before 9 please, I'm on nights",
    "I no longer want the 10am slot",
    "I don't want you to stop sending messages",
    "",
    null,
    undefined,
  ]) {
    assert(!isOptOutRequest(text), `unexpected opt-out: ${text}`);
  }
});

Deno.test("a UK number is recognised however it was stored", () => {
  for (const stored of [
    "+447700900123", "447700900123", "07700900123", "07700 900123", "07700 900 123",
    "+44 7700 900123", "+44 (0)7700 900123", "0044 7700-900123", "(07700) 900.123",
  ]) {
    assertEquals(ukNationalDigits(stored), "7700900123", stored);
    const pattern = new RegExp(ukPhoneMatchPattern("+447700900123")!);
    assert(pattern.test(stored), `pattern matches ${stored}`);
  }
});

Deno.test("the phone pattern does not match a different number", () => {
  const pattern = new RegExp(ukPhoneMatchPattern("+447700900123")!);
  for (const other of ["07700900124", "+447700900123 0", "07700 900 1234", "7700900123", "+33 7700900123"]) {
    assert(!pattern.test(other), `no match: ${other}`);
  }
  assertEquals(ukPhoneMatchPattern("+33123456789"), null);
  assertEquals(ukNationalDigits(""), null);
});

Deno.test("an international number is matched however it was stored", () => {
  const pattern = new RegExp(phoneMatchPattern("+33612345678")!);
  for (const stored of ["+33612345678", "33612345678", "+33 6 12 34 56 78", "0033 6 12-34-56-78", "+33 (6) 12 34 56 78"]) {
    assert(pattern.test(stored), `pattern matches ${stored}`);
    assertEquals(phoneMatchKey(stored), "33612345678", stored);
  }
  for (const other of ["+33612345679", "+33 6 12 34 56 78 9", "+44612345678", "612345678"]) {
    assert(!pattern.test(other), `no match: ${other}`);
  }
  // UK numbers keep the UK rules (national digits, trunk 0, "(0)").
  assertEquals(phoneMatchPattern("+447700900123"), ukPhoneMatchPattern("+447700900123"));
  assertEquals(phoneMatchKey("07700 900123"), "7700900123");
  assertEquals(phoneMatchKey(""), null);
  assertEquals(phoneMatchKey("12345"), null);
  assertEquals(phoneMatchPattern(null), null);
});
