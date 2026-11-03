import { describe, expect, it } from "vitest";
import { computeAvailability } from "./channelAvailability.js";

// The staff reminder modal's channel pills. The rules are the shared messaging
// policy (supabase/functions/_shared/channelPolicy.ts), so these scenarios are
// the same ones the server enforces in reminder-send.
const customer = (overrides = {}) => ({
  phone: "07123456789",
  email: "sarah@example.test",
  whatsapp: true,
  sms: false, // the optional tickbox, deliberately off: it is the default
  whatsapp_opted_out: false,
  sms_opted_out: false,
  email_opted_out: false,
  ...overrides,
});

describe("reminder modal channel availability", () => {
  it("offers SMS to a customer who never ticked the optional SMS box", () => {
    expect(computeAvailability(customer({ sms: false })).sms).toEqual({ ok: true, reason: "" });
  });

  it("offers every channel to a fully contactable customer", () => {
    const a = computeAvailability(customer());
    expect([a.whatsapp.ok, a.sms.ok, a.email.ok]).toEqual([true, true, true]);
  });

  it("says why SMS is unavailable for each blocking reason", () => {
    expect(computeAvailability(customer({ phone: "" })).sms.reason).toBe("No mobile number on file");
    expect(computeAvailability(customer({ phone: "01632 960123" })).sms.reason).toBe("No mobile number on file");
    expect(computeAvailability(customer({ sms_opted_out: true })).sms.reason).toBe("Customer opted out of SMS");
  });

  it("after a WhatsApp STOP, WhatsApp is off and SMS stays available, whatever the optional tickbox says", () => {
    for (const sms of [true, false]) {
      const a = computeAvailability(customer({ whatsapp_opted_out: true, sms }));
      expect(a.sms).toEqual({ ok: true, reason: "" });
      expect(a.whatsapp).toEqual({ ok: false, reason: "Customer opted out of WhatsApp" });
    }
  });

  it("an SMS opt-out always blocks SMS, including after a WhatsApp STOP", () => {
    const a = computeAvailability(customer({ whatsapp_opted_out: true, sms_opted_out: true }));
    expect(a.sms).toEqual({ ok: false, reason: "Customer opted out of SMS" });
  });

  it("explains a booking with no customer linked", () => {
    const a = computeAvailability(null);
    expect(a.sms).toEqual({ ok: false, reason: "No customer linked to this booking" });
  });
});
