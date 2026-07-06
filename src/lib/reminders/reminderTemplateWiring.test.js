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
const SALON_CONSTANTS_URL = new URL(
  "../../../supabase/functions/_shared/salonConstants.ts",
  import.meta.url,
);
const WHATSAPP_SEND_URL = new URL(
  "../../../supabase/functions/whatsapp-send/index.ts",
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

// The updated Meta template has a LOCATION header, which WhatsApp requires to be
// supplied at SEND time — so whatsapp-send must attach a location header for it,
// or every reminder fails at Meta. Guard that wiring stays in place.
describe("reminder template location header", () => {
  const salonConstants = readFileSync(SALON_CONSTANTS_URL, "utf8");
  const whatsappSend = readFileSync(WHATSAPP_SEND_URL, "utf8");

  it("registers appointment_reminder_v1 as carrying a location header", () => {
    const set = salonConstants.match(/TEMPLATES_WITH_LOCATION_HEADER[^[]*\[([^\]]*)\]/s);
    expect(set, "TEMPLATES_WITH_LOCATION_HEADER not found").toBeTruthy();
    expect(set[1]).toContain("appointment_reminder_v1");
  });

  it("defines the salon location with the fields Meta's location header needs", () => {
    for (const field of ["latitude", "longitude", "name", "address"]) {
      expect(salonConstants).toMatch(new RegExp(`SALON_LOCATION[\\s\\S]*${field}`));
    }
  });

  it("whatsapp-send attaches a location header for those templates", () => {
    expect(whatsappSend).toContain("TEMPLATES_WITH_LOCATION_HEADER.has");
    expect(whatsappSend).toMatch(/type:\s*"location",\s*location:\s*SALON_LOCATION/);
  });
});
