import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { sendableDeviceTokens, type DeviceTokenRow } from "./deviceTokens.ts";

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
    ["t1", "prod"],
  );
});
