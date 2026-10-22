// WhatsApp tells the endpoint when a screen we returned failed on the
// customer's phone. Those reports used to be acknowledged and dropped, so a
// customer stuck on the time screen (October 2026) left no trace at all.
import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { clientErrorNotice } from "./clientError.ts";

const TOKEN = "4fd87474-0000-4000-8000-000000000000";

Deno.test("a client error report becomes one log line naming the screen and the error", () => {
  const line = clientErrorNotice({
    version: "3.0",
    action: "data_exchange",
    screen: "SELECT_TIME",
    flow_token: TOKEN,
    data: { error: "INVALID_SCREEN_DATA", error_message: "time_slots[2].title is too long" },
  });
  assert(line !== null);
  assertStringIncludes(line, "SELECT_TIME");
  assertStringIncludes(line, "data_exchange");
  assertStringIncludes(line, "INVALID_SCREEN_DATA");
  assertStringIncludes(line, "time_slots[2].title is too long");
});

Deno.test("only enough of the flow token to find the session is logged", () => {
  const line = clientErrorNotice({ version: "3.0", action: "data_exchange", flow_token: TOKEN, data: { error_message: "x" } });
  assert(line !== null);
  assertStringIncludes(line, "4fd87474");
  assert(!line.includes(TOKEN), "the full token stays out of the logs");
});

Deno.test("a very long message is cut short", () => {
  const line = clientErrorNotice({ version: "3.0", action: "INIT", data: { error_message: "e".repeat(5000) } });
  assert(line !== null);
  assert(line.length < 700, `line was ${line.length} characters`);
});

Deno.test("a report missing its details still logs, with placeholders", () => {
  const line = clientErrorNotice({ version: "3.0", action: "data_exchange", data: { error_message: "" } });
  assert(line !== null);
  assertStringIncludes(line, "screen=unknown");
  assertStringIncludes(line, "token=none");
});

Deno.test("ordinary requests are not error reports", () => {
  assertEquals(clientErrorNotice({ version: "3.0", action: "ping" }), null);
  assertEquals(clientErrorNotice({ version: "3.0", action: "data_exchange", screen: "SELECT_TIME", data: { slot: "11:00" } }), null);
  assertEquals(clientErrorNotice({ version: "3.0", action: "data_exchange", data: { error_message: 42 } }), null);
});
