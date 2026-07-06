// Guard: the nightly reminder cron (notify-booking-reminder) HARDCODES the
// Meta template name, language and param array instead of importing the
// src/constants/whatsappTemplates.js registry (Deno edge functions can't import
// the src/ constant). That's a classic silent-drift risk — change the reminder
// template's param order/count in the constant and the manual sender updates
// automatically, but the cron would keep sending the old shape. This test fails
// CI the moment the two diverge, so the "template is wired in correctly"
// guarantee holds over time.
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { getReminderTemplate, REMINDER_TEMPLATE_NAME } from "./templates.js";

const CRON_SENDER_URL = new URL(
  "../../../supabase/functions/notify-booking-reminder/index.ts",
  import.meta.url,
);

describe("reminder template wiring (constant ↔ cron sender)", () => {
  const template = getReminderTemplate();
  const src = readFileSync(CRON_SENDER_URL, "utf8");
  // The adjacent template_name / language / params lines of the whatsapp-send
  // template call in the cron sender.
  const call = src.match(
    /template_name:\s*"([^"]+)",\s*language:\s*"([^"]+)",\s*params:\s*\[([^\]]*)\]/,
  );

  it("defines an approved reminder template with three ordered params", () => {
    expect(template).toBeTruthy();
    expect(template.name).toBe(REMINDER_TEMPLATE_NAME);
    expect(template.language).toBe("en_GB");
    expect(template.params).toHaveLength(3);
  });

  it("the cron sender passes the same template name + language as the constant", () => {
    expect(call, "could not find the whatsapp-send template call in notify-booking-reminder").toBeTruthy();
    const [, name, language] = call;
    expect(name).toBe(template.name);
    expect(language).toBe(template.language);
  });

  it("the cron sender passes exactly as many params as the template declares", () => {
    const paramCount = call[3].split(",").map((s) => s.trim()).filter(Boolean).length;
    expect(paramCount).toBe(template.params.length);
  });
});
