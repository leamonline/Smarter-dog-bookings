// Synthetic REST responses exercise the full token → query → ICS path offline.
import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.168.0/testing/asserts.ts";

Deno.env.set("SUPABASE_URL", "http://localhost:54321");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");

const { handleCalendarFeed } = await import("./handler.ts");

async function readFeed(feedType: "staff" | "customer") {
  const originalFetch = globalThis.fetch;
  const requests: URL[] = [];
  const tables: Record<string, Record<string, unknown>[]> = {
    calendar_feed_tokens: [{
      id: "sample-token", human_id: feedType === "customer" ? "sample-owner" : null,
      staff_user_id: feedType === "staff" ? "sample-staff" : null,
      feed_type: feedType, expires_at: null,
    }],
    salon_config: [{ default_pickup_offset: 90 }],
    bookings: [{
      id: "sample-booking", booking_date: "2026-11-16", slot: "08:30:00",
      dog_id: "sample-dog", service: "full-groom", status: "Booked",
      updated_at: "2026-11-15T12:00:00.000Z",
    }],
    dogs: [{ id: "sample-dog", name: "Milo", breed: "Shih Tzu", human_id: "sample-owner" }],
    humans: [{ id: "sample-owner", name: "Alex", surname: "Sample" }],
  };

  globalThis.fetch = (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    assertEquals(url.origin, "http://localhost:54321");
    requests.push(url);
    const table = url.pathname.split("/").at(-1)!;
    assert(table in tables, `unexpected table: ${table}`);
    if (init?.method === "PATCH") return Promise.resolve(new Response(null, { status: 204 }));

    // Project only requested fields, like PostgREST, so a missing breed in the
    // query cannot be hidden by an over-generous fixture.
    const fields = url.searchParams.get("select")!.split(",");
    const rows = tables[table].map((row) =>
      Object.fromEntries(fields.map((field) => [field, row[field]]))
    );
    return Promise.resolve(Response.json(rows));
  };

  try {
    const response = await handleCalendarFeed(new Request("http://localhost/calendar-feed?token=synthetic-token"));
    const content = (await response.text()).replace(/\r\n /g, "");
    return { response, content, requests };
  } finally {
    globalThis.fetch = originalFetch;
  }
}

Deno.test("staff subscription emits the detailed event format using the stored breed and owner", async () => {
  const { response, content } = await readFeed("staff");

  assertEquals(response.status, 200);
  assertEquals(response.headers.get("Content-Type"), "text/calendar; charset=utf-8");
  assertStringIncludes(content, "SUMMARY:Milo | Shih Tzu | Full Groom - Alex Sample\r\n");
  assertStringIncludes(content, "DESCRIPTION:Owner: Alex Sample\\nhttps://smarterdog.co.uk\r\n");
  assertStringIncludes(content, "LOCATION:Smarter Dog Grooming Salon\\n183 Kings Road\\, Ashton-under-Lyne\\, OL6 8HD\\, England\r\n");
  assertStringIncludes(content, "URL:https://smarterdog.co.uk\r\n");
  assertStringIncludes(content, "UID:sample-booking@smarterdog.grooming\r\n");
  assertStringIncludes(content, "DTEND;TZID=Europe/London:20261116T100000\r\n");
  assertStringIncludes(content, "REFRESH-INTERVAL;VALUE=DURATION:PT15M\r\n");
});

Deno.test("customer subscription keeps its presentation and scopes queries to the token owner's dogs", async () => {
  const { response, content, requests } = await readFeed("customer");

  assertEquals(response.status, 200);
  assertStringIncludes(content, "SUMMARY:Dog Grooming - Milo (Full Groom)\r\n");
  assert(!/Alex Sample|Shih Tzu|Owner:|LOCATION:|GEO:|URL:/.test(content));
  const dogLookup = requests.find((url) => url.pathname.endsWith("/dogs"));
  assertEquals(dogLookup?.searchParams.get("human_id"), "eq.sample-owner");
  const bookingLookup = requests.find((url) => url.pathname.endsWith("/bookings"));
  assertEquals(bookingLookup?.searchParams.get("dog_id"), "in.(sample-dog)");
  assert(!requests.some((url) => url.pathname.endsWith("/humans")));
});
