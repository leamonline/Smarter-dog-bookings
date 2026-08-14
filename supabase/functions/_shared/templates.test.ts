// Unit tests for the pure template-management helpers.
// Run locally:  deno test --node-modules-dir=none supabase/functions/_shared/templates.test.ts
import {
  assertEquals,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  mapMetaStatus,
  mapTemplateStatusEvent,
  normaliseCategory,
  normaliseTemplateLanguage,
  parseTemplateStatusEvent,
} from "./templates.ts";

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

// ── mapTemplateStatusEvent ───────────────────────────────────────────────────

Deno.test("mapTemplateStatusEvent maps the review outcomes", () => {
  assertEquals(mapTemplateStatusEvent("APPROVED"), "approved");
  assertEquals(mapTemplateStatusEvent("REJECTED"), "rejected");
  assertEquals(mapTemplateStatusEvent("PENDING"), "pending");
});

Deno.test("mapTemplateStatusEvent treats REINSTATED as sendable again", () => {
  assertEquals(mapTemplateStatusEvent("REINSTATED"), "approved");
});

Deno.test("mapTemplateStatusEvent groups paused-like and disabled-like events", () => {
  for (const e of ["PAUSED", "FLAGGED", "LIMIT_EXCEEDED", "IN_APPEAL"]) {
    assertEquals(mapTemplateStatusEvent(e), "paused");
  }
  for (const e of ["DISABLED", "DELETED", "PENDING_DELETION", "ARCHIVED"]) {
    assertEquals(mapTemplateStatusEvent(e), "disabled");
  }
});

Deno.test("mapTemplateStatusEvent is case-insensitive", () => {
  assertEquals(mapTemplateStatusEvent("approved"), "approved");
  assertEquals(mapTemplateStatusEvent("Rejected"), "rejected");
});

// The critical difference from mapMetaStatus: a delta must not invent a status.
Deno.test("mapTemplateStatusEvent returns null rather than downgrading on unknown events", () => {
  assertEquals(mapTemplateStatusEvent("LOCKED"), null);
  assertEquals(mapTemplateStatusEvent("SOMETHING_META_ADDS_IN_2027"), null);
  assertEquals(mapTemplateStatusEvent(""), null);
  assertEquals(mapTemplateStatusEvent(null), null);
  assertEquals(mapTemplateStatusEvent(undefined), null);
  // …whereas the list-reconciliation mapper deliberately fails closed.
  assertEquals(mapMetaStatus("SOMETHING_META_ADDS_IN_2027"), "pending");
});

// ── normaliseTemplateLanguage ────────────────────────────────────────────────

Deno.test("normaliseTemplateLanguage converts Meta's hyphenated locales", () => {
  assertEquals(normaliseTemplateLanguage("en-US"), "en_US");
  assertEquals(normaliseTemplateLanguage("en_GB"), "en_GB");
  assertEquals(normaliseTemplateLanguage("  en-GB  "), "en_GB");
  assertEquals(normaliseTemplateLanguage("en"), "en");
});

// ── parseTemplateStatusEvent ─────────────────────────────────────────────────

// Payload copied from Meta's message_template_status_update webhook reference.
Deno.test("parseTemplateStatusEvent reads an approval", () => {
  const parsed = parseTemplateStatusEvent({
    event: "APPROVED",
    message_template_id: 1689556908129832,
    message_template_name: "day_closure_v1",
    message_template_language: "en-US",
    reason: "NONE",
    message_template_category: "UTILITY",
  });
  assertEquals(parsed, {
    name: "day_closure_v1",
    language: "en_US",
    status: "approved",
    metaId: "1689556908129832",
    category: "UTILITY",
    rejectionReason: null,
  });
});

Deno.test("parseTemplateStatusEvent prefers rejection_info over the reason code", () => {
  const parsed = parseTemplateStatusEvent({
    event: "REJECTED",
    message_template_id: 1689556908129835,
    message_template_name: "day_closure_v1",
    message_template_language: "en_GB",
    reason: "INVALID_FORMAT",
    message_template_category: "MARKETING",
    rejection_info: {
      reason: "Your template has parameters placed next to each other.",
      recommendation: "Separate parameters with descriptive text.",
    },
  });
  assertEquals(parsed?.status, "rejected");
  assertEquals(parsed?.rejectionReason, "Your template has parameters placed next to each other.");
});

Deno.test("parseTemplateStatusEvent falls back to the reason code, ignoring NONE", () => {
  const base = {
    event: "REJECTED",
    message_template_name: "day_closure_v1",
    message_template_language: "en_GB",
  };
  assertEquals(
    parseTemplateStatusEvent({ ...base, reason: "ABUSIVE_CONTENT" })?.rejectionReason,
    "ABUSIVE_CONTENT",
  );
  assertEquals(parseTemplateStatusEvent({ ...base, reason: "NONE" })?.rejectionReason, null);
  assertEquals(parseTemplateStatusEvent({ ...base, reason: null })?.rejectionReason, null);
});

// A stale rejection reason outliving an approval would mislead staff reading
// the row, so every non-rejection transition clears it.
Deno.test("parseTemplateStatusEvent clears the rejection reason on non-rejections", () => {
  const parsed = parseTemplateStatusEvent({
    event: "APPROVED",
    message_template_name: "day_closure_v1",
    message_template_language: "en_GB",
    reason: "INVALID_FORMAT",
  });
  assertEquals(parsed?.rejectionReason, null);
});

Deno.test("parseTemplateStatusEvent drops out-of-domain categories", () => {
  const parsed = parseTemplateStatusEvent({
    event: "APPROVED",
    message_template_name: "day_closure_v1",
    message_template_language: "en_GB",
    message_template_category: "OTP",
  });
  assertEquals(parsed?.category, null);
});

Deno.test("parseTemplateStatusEvent accepts a string template id and tolerates a missing one", () => {
  const base = {
    event: "APPROVED",
    message_template_name: "day_closure_v1",
    message_template_language: "en_GB",
  };
  assertEquals(parseTemplateStatusEvent({ ...base, message_template_id: "168955" })?.metaId, "168955");
  assertEquals(parseTemplateStatusEvent(base)?.metaId, null);
});

Deno.test("parseTemplateStatusEvent returns null on unusable payloads", () => {
  // No status meaning — leave the row alone.
  assertEquals(
    parseTemplateStatusEvent({
      event: "LOCKED",
      message_template_name: "day_closure_v1",
      message_template_language: "en_GB",
    }),
    null,
  );
  // Nothing to match the row on.
  assertEquals(parseTemplateStatusEvent({ event: "APPROVED", message_template_language: "en_GB" }), null);
  assertEquals(parseTemplateStatusEvent({ event: "APPROVED", message_template_name: "x" }), null);
  assertEquals(parseTemplateStatusEvent({ event: "APPROVED", message_template_name: "  " }), null);
  // Not an object at all.
  assertEquals(parseTemplateStatusEvent(null), null);
  assertEquals(parseTemplateStatusEvent("APPROVED"), null);
});
