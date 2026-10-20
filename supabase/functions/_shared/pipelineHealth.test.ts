import { assert, assertEquals, assertMatch } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildPipelineHealthLine, parsePipelineHealthCounts, pipelineHealthIsClean } from "./pipelineHealth.ts";

Deno.test("a clean day renders green with every count", () => {
  const c = parsePipelineHealthCounts({
    pending_stuck: 0, failed_by_trigger: {}, whatsapp_events_failed: 0,
    cron_failed: 0, http_errors: 0, sms_sent: 12,
  });
  assert(pipelineHealthIsClean(c));
  assertEquals(
    buildPipelineHealthLine(c, 24),
    ":large_green_circle: Pipeline 24h: stuck 0 · failed 0 · WhatsApp events failed 0 · cron failed 0 · HTTP errors 0 · SMS sent 12",
  );
});

Deno.test("failures render red with the failing trigger types", () => {
  const line = buildPipelineHealthLine(parsePipelineHealthCounts({
    pending_stuck: 2, failed_by_trigger: { reminder: 3, confirmed: 1 }, whatsapp_events_failed: 1,
    cron_failed: null, http_errors: 4, sms_sent: 0,
  }), 24);
  assertMatch(line, /^:red_circle: /);
  assertMatch(line, /failed 4 \(confirmed 1, reminder 3\)/);
  assertMatch(line, /cron failed n\/a/);
});

Deno.test("nothing but counts and safe labels can reach the line", () => {
  // Whatever the RPC sends back, a name, phone number or message text must not
  // be rendered: unknown fields are ignored and unsafe labels collapse.
  const line = buildPipelineHealthLine(parsePipelineHealthCounts({
    pending_stuck: "07700 900123",
    failed_by_trigger: { "Jane Smith 07700900123": 2, "reminder": 1 },
    message_text: "Hi Jane, Bella is ready",
    name: "Jane Smith",
    whatsapp_events_failed: -5,
    sms_sent: 3.7,
  }), 24);
  for (const leak of ["Jane", "Smith", "07700", "Bella", "ready"]) {
    assert(!line.includes(leak), `line leaked "${leak}": ${line}`);
  }
  assertMatch(line, /failed 3 \(other 2, reminder 1\)/);
  assertMatch(line, /stuck 0/);
  assertMatch(line, /SMS sent 3$/);
});
