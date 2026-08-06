// A customer who ANSWERS an appointment reminder in their own words — "see you
// then", "👍" — must be recorded as confirmed exactly like one who taps the
// Confirm button, i.e. `bookings.reminder_confirmed_at` gets stamped by
// whatsapp-agent via mark_reminder_confirmed.
//
// Two halves: the matcher's verdict on real reply phrasing, and the agent
// wiring that turns that verdict into the stamp. The wiring half is asserted
// against the source (the handler is a webhook loop that can't be unit-invoked)
// in the same style as src/security/aiWhatsappControls.test.ts.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { detectReplyConfirmation } from "../../../supabase/functions/_shared/reminderConfirmation.ts";

const handler = readFileSync(
  join(process.cwd(), "supabase/functions/whatsapp-agent/handler.ts"),
  "utf8",
);

describe("typed reminder confirmations", () => {
  it("records the replies customers actually send", () => {
    for (const reply of [
      "see you then",
      "See you then!",
      "See you Tuesday",
      "👍",
      "👍👍",
      "👍🏻",
      "Yes",
      "yes please",
      "Confirmed",
      "That's great, see you then x",
    ]) {
      expect(detectReplyConfirmation(reply), reply).toBe(true);
    }
  });

  it("does not record a reply that raises a change", () => {
    for (const reply of [
      "See you then — actually can we move it to another day?",
      "👍 but can we cancel Friday",
      "Sorry we can't make it",
      "No",
    ]) {
      expect(detectReplyConfirmation(reply), reply).toBe(false);
    }
  });
});

describe("whatsapp-agent wiring", () => {
  const start = handler.indexOf("detectReplyConfirmation(text)");
  const end = handler.indexOf("// Manage-booking (Flow C)");
  const block = handler.slice(start, end);

  it("stamps the confirmation through the same idempotent RPC as the button tap", () => {
    expect(handler).toContain(
      'import { detectReplyConfirmation } from "../_shared/reminderConfirmation.ts";',
    );
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    expect(block).toContain('.rpc("mark_reminder_confirmed"');
  });

  it("skips a staff re-generate so re-drafting stays side-effect free", () => {
    expect(handler).toContain("if (!forceDraft && conversation.human_id && detectReplyConfirmation(text))");
  });

  it("lets the message flow on to the normal draft path (no early continue)", () => {
    // The button-tap path deliberately `continue`s — a bare tap needs no reply.
    // A typed reply is a real message: it must stay in the inbox and reach the
    // usual risk/gate/draft machinery, so stamping must not short-circuit it.
    expect(block).not.toContain("continue;");
  });

  it("keeps the stamp best-effort so it can never cost us the message", () => {
    expect(block).toMatch(/try\s*\{[\s\S]*catch/);
  });
});
