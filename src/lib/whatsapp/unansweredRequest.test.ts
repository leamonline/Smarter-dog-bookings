import { describe, expect, it } from "vitest";
import { isRequestText, unansweredRequestSince } from "./unansweredRequest";
describe("synthetic request classifier", () => {
  it.each(["Can I book my dog on Wednesday?", "I'd like an appointment", "Could you send the payment link", "How much is a tidy?", "Please cancel my appointment", "Can we reschedule", "Any availability next week", "I'd like to rebook", "Do you offer this service?", "Thanks, can you send the link?"])("keeps requests: %s", (text) => expect(isRequestText(text)).toBe(true));
  it.each(["Thanks", "Thank you!", "yes", "Confirm", "on my way", "👍", "[book_entry]", "Reacted ❤️", "", null, "A supplier introduction"])("excludes closers and system replies: %s", (text) => expect(isRequestText(text)).toBe(false));
});
const inbound = "2026-06-15T09:00:00Z";
const tail = { last_inbound_at: inbound, last_customer_text: "Can I book?", last_message_direction: "inbound" };
it("keeps a pending draft unanswered, in either conversation mode", () => {
  expect(unansweredRequestSince({ ...tail })).toBe(inbound);
});
it("respects explicit completion and later successful replies", () => {
  expect(unansweredRequestSince({ ...tail, closed_at: inbound })).toBeNull();
  expect(unansweredRequestSince({ ...tail, last_outbound_at: "2026-06-15T10:00:00Z" })).toBeNull();
  expect(unansweredRequestSince({ ...tail, last_message_direction: "outbound" })).toBeNull();
});
it("does not count a failed send as an answer", () => {
  expect(unansweredRequestSince({ ...tail, last_message_direction: "outbound", last_outbound_at: "2026-06-15T10:00:00Z", has_failed_message: true })).toBe(inbound);
});
it("ignores invalid timestamps and non-requests", () => {
  expect(unansweredRequestSince({ ...tail, last_inbound_at: "bad" })).toBeNull();
  expect(unansweredRequestSince({ ...tail, last_customer_text: "thanks" })).toBeNull();
  expect(unansweredRequestSince({})).toBeNull();
});
