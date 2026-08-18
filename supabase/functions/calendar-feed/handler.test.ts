// Runtime auth-gate tests for calendar-feed.
//
// Second of the shortlist (after apply-customer-confirm): a calendar feed is
// authenticated by an opaque token in the URL, and a staff token unlocks every
// customer's bookings with owner names — a URL-borne credential guarding PII.
//
// What is provable WITHOUT a database, and why that is the point:
//
//   - the method and missing/empty-token refusals happen before any query;
//   - with a token present but the token store unreachable (no --allow-net
//     here, so the lookup cannot succeed), the handler must refuse — 401 from
//     validateFeedToken's fail-closed `if (error || !data) return null`, or
//     500 from the outer catch — and must NEVER emit calendar data. A database
//     outage degrading this endpoint to an open feed is the failure mode these
//     assertions exist to rule out.
//
// The positive path (valid token → ICS) requires a real token row and is
// deliberately out of scope here: the static verdict-flow guard proves the
// validator's verdict gates the response, and the data-exposure audit
// (docs/research/2026-08-18-edge-function-data-exposure-audit.md) covers what
// each feed type may contain.
import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";

Deno.env.set("SUPABASE_URL", "http://localhost:54321");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");

const { handleCalendarFeed } = await import("./handler.ts");

function feedRequest(query: string, method = "GET"): Request {
  return new Request(`http://localhost/calendar-feed${query}`, { method });
}

Deno.test("a non-GET method is refused", async () => {
  const res = await handleCalendarFeed(feedRequest("?token=whatever", "POST"));
  assertEquals(res.status, 405);
});

Deno.test("a missing token gets 400 before any lookup", async () => {
  const res = await handleCalendarFeed(feedRequest(""));
  assertEquals(res.status, 400);
  assertEquals(await res.text(), "Missing token");
});

Deno.test("an empty token gets 400 before any lookup", async () => {
  const res = await handleCalendarFeed(feedRequest("?token="));
  assertEquals(res.status, 400);
});

Deno.test("an unvalidatable token never yields calendar data", async () => {
  // The token store is unreachable in this sandbox. Whichever way the
  // supabase client surfaces that (error object → 401, or a throw → the
  // handler's catch → 500), the response must be a refusal with a safe body.
  const res = await handleCalendarFeed(feedRequest("?token=some-guessed-token"));
  assert(
    res.status === 401 || res.status === 500,
    `expected 401 or 500, got ${res.status}`,
  );
  const body = await res.text();
  assert(!body.includes("BEGIN:VCALENDAR"), "refusal must not contain feed data");
  assert(!body.includes("SUMMARY"), "refusal must not contain event fields");
});
