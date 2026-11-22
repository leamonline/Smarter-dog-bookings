import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  APNS_MAX_AGE_MS,
  apnsTokenIsFresh,
  freshApnsTokens,
  iosPushEnabled,
} from "./apnsChannel.ts";

const NOW = new Date("2026-11-22T12:00:00.000Z");

Deno.test("iosPushEnabled is off unless the value is an explicit on-switch", () => {
  for (const off of [undefined, null, "", "false", "FALSE", "0", "no", "off", "yes please"]) {
    assertEquals(iosPushEnabled(off), false, JSON.stringify(off));
  }
  for (const on of ["true", "TRUE", " True ", "1", "yes", "YES", "on"]) {
    assertEquals(iosPushEnabled(on), true, on);
  }
});

Deno.test("a token is fresh for 14 days, and stale a millisecond after that", () => {
  assertEquals(
    apnsTokenIsFresh({ notificationsEnabled: true, lastSeenAt: new Date(NOW.getTime() - APNS_MAX_AGE_MS).toISOString() }, NOW),
    true,
  );
  assertEquals(
    apnsTokenIsFresh({ notificationsEnabled: true, lastSeenAt: new Date(NOW.getTime() - APNS_MAX_AGE_MS - 1).toISOString() }, NOW),
    false,
  );
});

Deno.test("notifications off, a missing timestamp, or a bad timestamp is not fresh", () => {
  assertEquals(apnsTokenIsFresh({ notificationsEnabled: false, lastSeenAt: NOW.toISOString() }, NOW), false);
  assertEquals(apnsTokenIsFresh({ notificationsEnabled: true, lastSeenAt: null }, NOW), false);
  assertEquals(apnsTokenIsFresh({ notificationsEnabled: true, lastSeenAt: "not-a-date" }, NOW), false);
});

Deno.test("a last_seen_at slightly in the future still counts as fresh", () => {
  const ahead = new Date(NOW.getTime() + 60_000).toISOString();
  assertEquals(apnsTokenIsFresh({ notificationsEnabled: true, lastSeenAt: ahead }, NOW), true);
});

Deno.test("freshApnsTokens keeps only the usable rows", () => {
  const fresh = { notificationsEnabled: true, lastSeenAt: NOW.toISOString(), id: "fresh" };
  const stale = {
    notificationsEnabled: true,
    lastSeenAt: new Date(NOW.getTime() - APNS_MAX_AGE_MS - 1).toISOString(),
    id: "stale",
  };
  const off = { notificationsEnabled: false, lastSeenAt: NOW.toISOString(), id: "off" };
  assertEquals(freshApnsTokens([stale, off, fresh], NOW).map((row) => row.id), ["fresh"]);
});
