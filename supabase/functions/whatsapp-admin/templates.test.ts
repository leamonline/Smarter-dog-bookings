// Unit tests for the pure template-management helpers.
// Run locally:  deno test --node-modules-dir=none supabase/functions/whatsapp-admin/templates.test.ts
import {
  assertEquals,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { mapMetaStatus, normaliseCategory } from "./templates.ts";

Deno.test("mapMetaStatus maps the happy-path statuses", () => {
  assertEquals(mapMetaStatus("APPROVED"), "approved");
  assertEquals(mapMetaStatus("PENDING"), "pending");
  assertEquals(mapMetaStatus("REJECTED"), "rejected");
});

Deno.test("mapMetaStatus is case-insensitive", () => {
  assertEquals(mapMetaStatus("approved"), "approved");
  assertEquals(mapMetaStatus("Pending"), "pending");
});

Deno.test("mapMetaStatus groups paused-like statuses", () => {
  assertEquals(mapMetaStatus("PAUSED"), "paused");
  assertEquals(mapMetaStatus("LIMIT_EXCEEDED"), "paused");
  assertEquals(mapMetaStatus("FLAGGED"), "paused");
  assertEquals(mapMetaStatus("IN_APPEAL"), "paused");
});

Deno.test("mapMetaStatus groups disabled-like statuses", () => {
  assertEquals(mapMetaStatus("DISABLED"), "disabled");
  assertEquals(mapMetaStatus("DELETED"), "disabled");
  assertEquals(mapMetaStatus("PENDING_DELETION"), "disabled");
});

Deno.test("mapMetaStatus fails CLOSED on unknown/empty input", () => {
  assertEquals(mapMetaStatus("SOMETHING_NEW"), "pending");
  assertEquals(mapMetaStatus(""), "pending");
  assertEquals(mapMetaStatus(null), "pending");
  assertEquals(mapMetaStatus(undefined), "pending");
});

Deno.test("normaliseCategory keeps allowed values and rejects others", () => {
  assertEquals(normaliseCategory("UTILITY"), "UTILITY");
  assertEquals(normaliseCategory("marketing"), "MARKETING");
  assertEquals(normaliseCategory("AUTHENTICATION"), "AUTHENTICATION");
  assertEquals(normaliseCategory("OTP"), null);
  assertEquals(normaliseCategory(null), null);
});
