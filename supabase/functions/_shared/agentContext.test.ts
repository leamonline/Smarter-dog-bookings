import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { agentCalendar, addCalendarDays, contextHorizon, bookEntryOutcome } from "./agentContext.ts";
Deno.test("London relative dates cross BST midnight together", () => {
  assertEquals(agentCalendar(new Date("2026-06-14T23:30:00Z")), { today: "2026-06-15", tomorrow: "2026-06-16", weekday: "Monday" });
  assertEquals(agentCalendar(new Date("2026-10-25T23:30:00Z")), { today: "2026-10-25", tomorrow: "2026-10-26", weekday: "Sunday" });
  assertEquals(addCalendarDays("2026-03-28", 2), "2026-03-30");
});
Deno.test("context horizon mirrors supported configuration bounds", () => {
  for (const value of [undefined, null, "180", 0, 731, 1.5]) assertEquals(contextHorizon(value), 180);
  for (const value of [1, 180, 365, 730]) assertEquals(contextHorizon(value), value);
});
Deno.test("book-entry outcomes preserve acceptance versus refusal versus uncertainty", async () => {
  for (const reason of ["global_disabled", "global_lookup_failed", "customer_disabled", "customer_lookup_failed"]) {
    assertEquals(await bookEntryOutcome(Response.json({ reason }, { status: 409 })), { kind: "refused", reason });
  }
  assertEquals(await bookEntryOutcome(Response.json({ ok: true, meta_message_id: "synthetic" })), { kind: "accepted", reason: "endpoint_accepted" });
  for (const status of [400, 401, 409, 500, 502]) {
    assertEquals(await bookEntryOutcome(Response.json({ error: "unspecified" }, { status })), { kind: "uncertain", reason: `http_${status}` });
  }
  assertEquals(await bookEntryOutcome(Response.json({ ok: false })), { kind: "uncertain", reason: "http_200" });
  for (const response of [new Response("not json"), Response.json(null)]) {
    assertEquals(await bookEntryOutcome(response), { kind: "uncertain", reason: "invalid_response" });
  }
});
