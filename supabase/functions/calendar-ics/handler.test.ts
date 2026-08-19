// Runtime gate tests for calendar-ics.
//
// The sibling of calendar-feed, and the last feed-token function without
// runtime coverage. Where calendar-feed serves a whole subscribable feed,
// this one serves a single booking as an .ics download — and it carries an
// extra gate calendar-feed has no need for: a customer token may only read a
// booking belonging to that customer (staff tokens may read any).
//
// What is provable WITHOUT a database, and what is not:
//
//   - the method gate and the missing-parameter gate reject before any
//     lookup, including when a token is supplied, so neither can be reached
//     by a caller who guesses a booking_id;
//   - a token that cannot be validated never yields an .ics. The token store
//     is unreachable here, so validateFeedToken either fails closed
//     (`if (error || !data) return null` → 401) or throws into the handler's
//     catch (→ 500). Both are refusals; neither may carry calendar data.
//
//   - the 403 ownership check is NOT provable here. Reaching it requires a
//     valid token row, a real booking and a real dog, i.e. a database. It is
//     the same class of gap as issue #605's remaining criterion (an
//     authenticated non-staff user being refused) and wants a
//     staging-authenticated test, not a static substitute.
import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";

Deno.env.set("SUPABASE_URL", "http://localhost:54321");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");

const { handleCalendarIcs } = await import("./handler.ts");

function icsRequest(query: string, method = "GET"): Request {
  return new Request(`http://localhost/calendar-ics${query}`, { method });
}

Deno.test("a non-GET method is refused before anything is read", async () => {
  const res = await handleCalendarIcs(
    icsRequest("?booking_id=some-booking&token=some-token", "POST"),
  );
  assertEquals(res.status, 405);
});

Deno.test("a missing token gets 400, even with a booking_id", async () => {
  const res = await handleCalendarIcs(icsRequest("?booking_id=some-booking"));
  assertEquals(res.status, 400);
  assertEquals(await res.text(), "Missing booking_id or token");
});

Deno.test("a missing booking_id gets 400, even with a token", async () => {
  const res = await handleCalendarIcs(icsRequest("?token=some-token"));
  assertEquals(res.status, 400);
});

Deno.test("an empty token is not treated as a token", async () => {
  // The guard is `!token`, so an empty string must fall to 400 rather than
  // reaching validateFeedToken and being refused later for the wrong reason.
  const res = await handleCalendarIcs(icsRequest("?booking_id=some-booking&token="));
  assertEquals(res.status, 400);
});

Deno.test("an unvalidatable token never yields an .ics", async () => {
  const res = await handleCalendarIcs(
    icsRequest("?booking_id=some-booking&token=some-guessed-token"),
  );
  assert(
    res.status === 401 || res.status === 500,
    `expected 401 or 500, got ${res.status}`,
  );
  const body = await res.text();
  assert(!body.includes("BEGIN:VCALENDAR"), "refusal must not contain calendar data");
  assert(!body.includes("SUMMARY"), "refusal must not contain event fields");
  assert(
    !res.headers.get("Content-Type")?.includes("text/calendar"),
    "a refusal must not be served as a calendar download",
  );
});
