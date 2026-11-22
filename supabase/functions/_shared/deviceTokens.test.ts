import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { MAX_PUSH_TOKENS, sendableDeviceTokens, type DeviceTokenRow } from "./deviceTokens.ts";

const NOW = new Date("2026-11-22T12:00:00.000Z");

function row(overrides: Partial<DeviceTokenRow> = {}): DeviceTokenRow {
  return {
    id: "t1",
    apns_token: "ab".repeat(32),
    environment: "sandbox",
    bundle_id: "uk.co.smarterdog.app",
    last_seen_at: NOW.toISOString(),
    notifications_enabled: true,
    ...overrides,
  };
}

Deno.test("sendableDeviceTokens keeps a fresh sandbox or production token and drops the rest", () => {
  const fresh = row();
  const production = row({ id: "prod", environment: "production" });
  const stale = row({
    id: "stale",
    last_seen_at: new Date(NOW.getTime() - 15 * 24 * 60 * 60 * 1000).toISOString(),
  });
  const off = row({ id: "off", notifications_enabled: false });
  const unknown = row({ id: "unknown", environment: "development" });
  assertEquals(
    sendableDeviceTokens([stale, off, unknown, fresh, production], NOW).map((item) => item.id),
    ["prod", "t1"],
  );
});

Deno.test("sendableDeviceTokens keeps only the newest phones when there are more than the send allows", () => {
  const rows = Array.from({ length: MAX_PUSH_TOKENS + 5 }, (_, index) =>
    row({
      id: `t${String(index).padStart(2, "0")}`,
      last_seen_at: new Date(NOW.getTime() - index * 60_000).toISOString(),
    })
  );
  const chosen = sendableDeviceTokens(rows, NOW);
  assertEquals(chosen.length, MAX_PUSH_TOKENS);
  assertEquals(chosen[0].id, "t00");
  assertEquals(chosen[MAX_PUSH_TOKENS - 1].id, `t${String(MAX_PUSH_TOKENS - 1).padStart(2, "0")}`);
  assertEquals(chosen.some((item) => item.id === "t20"), false);
});
