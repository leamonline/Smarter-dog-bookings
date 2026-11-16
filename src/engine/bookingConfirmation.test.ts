import { describe, expect, it } from "vitest";
import { confirmationChoiceAvailable, confirmationOutcome, preferredConfirmationService } from "./bookingConfirmation";
import { resolveConfirmationChannel } from "../../supabase/functions/_shared/recipients";
import type { ConfirmationContact, ConfirmationLog, ConfirmationSnapshot } from "../supabase/repositories/bookingConfirmationRepo";

const row = (patch: Partial<ConfirmationLog> = {}): ConfirmationLog => ({
  bookingId: "saved-1", groupId: null, humanId: "owner", trigger: "confirmed",
  channel: "whatsapp", status: "sent", error: null, createdAt: "2026-11-11T10:00:00Z", providerId: "provider-1", ...patch,
});
const snapshot = (logs: ConfirmationLog[], status?: string): ConfirmationSnapshot => ({
  logs, deliveries: status ? [{ providerId: "provider-1", channel: "whatsapp", status }] : [],
});
const outcome = (value: ConfirmationSnapshot, ids = ["saved-1"], humans = ["owner"]) => confirmationOutcome(value, ids, humans);

describe("booking confirmation outcomes", () => {
  it("does not infer delivery or a safe retry from an absent log", () => {
    expect(outcome(snapshot([]))).toEqual({ state: "pending", retryBookingIds: [] });
  });
  it("distinguishes provider acceptance from verified delivery", () => {
    expect(outcome(snapshot([row()])).state).toBe("accepted");
    expect(outcome(snapshot([row()], "delivered")).state).toBe("delivered");
    expect(outcome(snapshot([row()], "read")).state).toBe("delivered");
  });
  it("requires a receipt for the same provider ID and channel", () => {
    const value = snapshot([row()], "delivered");
    value.deliveries[0].channel = "sms";
    expect(outcome(value).state).toBe("accepted");
  });
  it("reports an asynchronous provider failure even if the log still says sent", () => {
    expect(outcome(snapshot([row()], "failed"))).toEqual({ state: "failed", retryBookingIds: [] });
  });
  it.each(["outcome unknown: timeout", "Delivery unconfirmed: queued"])("blocks retry for %s", (error) => {
    expect(outcome(snapshot([row({ status: "failed", error })]))).toEqual({ state: "unknown", retryBookingIds: [] });
  });
  it("does not clear an unknown send merely because another send delivered", () => {
    expect(outcome(snapshot([
      row({ status: "failed", error: "outcome unknown: timeout", providerId: null }),
      row({ trigger: "confirmed_sms_fallback", channel: "sms", providerId: "sms-1" }),
    ], "delivered"))).toEqual({ state: "unknown", retryBookingIds: [] });
  });
  it("waits for all selected recipients and booking rows", () => {
    expect(outcome(snapshot([row()], "delivered"), ["saved-1"], ["owner", "trusted"])).toEqual({ state: "pending", retryBookingIds: [] });
    expect(outcome(snapshot([row()], "delivered"), ["saved-1", "saved-2"])).toEqual({ state: "pending", retryBookingIds: [] });
  });
  it("uses the latest attempt and groups safe retries once per appointment", () => {
    const old = row({ status: "failed", createdAt: "2026-11-10T10:00:00Z" });
    expect(outcome(snapshot([old, row()], "delivered")).state).toBe("delivered");
    const failed = [row({ groupId: "group", status: "failed" }), row({ groupId: "group", bookingId: "saved-2", status: "failed" })];
    expect(outcome(snapshot(failed), ["saved-1", "saved-2"]).retryBookingIds).toHaveLength(1);
  });
  it("keeps recurring appointment retries separate", () => {
    const failed = [row({ groupId: "first-date", status: "failed" }), row({ groupId: "next-date", bookingId: "saved-2", status: "failed" })];
    expect(outcome(snapshot(failed), ["saved-1", "saved-2"]).retryBookingIds).toEqual(["saved-1", "saved-2"]);
  });
  it("does not resend while a safety-net message may still arrive", () => {
    const value = snapshot([row({ status: "failed" }), row({ trigger: "confirmed_sms_fallback", channel: "sms" })]);
    expect(outcome(value)).toEqual({ state: "accepted", retryBookingIds: [] });
  });
  it("keeps a newer confirmation retry ahead of an older failed SMS fallback", () => {
    const fallback = row({
      trigger: "confirmed_sms_fallback", channel: "sms", status: "failed",
      createdAt: "2026-11-11T09:00:00Z", providerId: null, error: "SMS failed",
    });
    expect(outcome(snapshot([
      fallback,
      row({ status: "sent", createdAt: "2026-11-11T12:00:00Z", providerId: "SM-new" }),
    ]))).toEqual({ state: "accepted", retryBookingIds: [] });
    expect(outcome(snapshot([
      fallback,
      row({ status: "pending", createdAt: "2026-11-11T12:00:00Z", providerId: null, error: null }),
    ]))).toEqual({ state: "pending", retryBookingIds: [] });
    expect(outcome(snapshot([
      fallback,
      row({ status: "failed", createdAt: "2026-11-11T12:00:00Z", providerId: null, error: "Provider refused" }),
    ])).retryBookingIds).toEqual(["saved-1"]);
  });
  it("does not retry a newer failure while an older safety-net send is still accepted", () => {
    const value = snapshot([
      row({ trigger: "confirmed_sms_fallback", channel: "sms", status: "sent", createdAt: "2026-11-11T09:00:00Z", providerId: "SM-old" }),
      row({ status: "failed", createdAt: "2026-11-11T12:00:00Z", providerId: null, error: "Provider refused" }),
    ]);
    expect(outcome(value)).toEqual({ state: "accepted", retryBookingIds: [] });
  });
  it("a definite failure can coexist with a delivered recipient without resending the booking", () => {
    const value = snapshot([row(), row({ humanId: "trusted", status: "failed", providerId: null })], "delivered");
    expect(outcome(value, ["saved-1"], ["owner", "trusted"])).toEqual({ state: "failed", retryBookingIds: ["saved-1"] });
  });
});

describe("preferred service follows the profile's preferred method of contact", () => {
  const contact: ConfirmationContact = { phone: "+447700900123", whatsapp: true, email: "sample@example.test", whatsappOptedOut: false, smsOptedOut: false, emailOptedOut: false };
  it("is WhatsApp when the profile says WhatsApp, SMS when it says SMS", () => {
    expect(preferredConfirmationService(contact)).toBe("whatsapp");
    expect(preferredConfirmationService({ ...contact, whatsapp: false })).toBe("sms");
  });
  it("honours a STOP and an unreachable number instead of showing the profile blindly", () => {
    expect(preferredConfirmationService({ ...contact, whatsappOptedOut: true })).toBe("sms");
    expect(preferredConfirmationService({ ...contact, whatsapp: false, smsOptedOut: true })).toBe("email");
    expect(preferredConfirmationService({ ...contact, whatsapp: false, phone: "01632 960123" })).toBe("email");
  });
  it("is null when nothing can reach the customer", () => {
    expect(preferredConfirmationService({ ...contact, phone: null, email: null })).toBeNull();
  });
  it("matches the channel the server sends an automatic confirmation on", () => {
    const variants: ConfirmationContact[] = [
      contact, { ...contact, whatsapp: false }, { ...contact, whatsappOptedOut: true },
      { ...contact, phone: null }, { ...contact, phone: "01632 960123", whatsapp: false },
      { ...contact, smsOptedOut: true, whatsapp: false }, { ...contact, phone: null, email: null },
      { ...contact, emailOptedOut: true, phone: null },
    ];
    for (const variant of variants) {
      const server = resolveConfirmationChannel("auto", {
        id: "owner", name: "Owner", sms: null, phone: variant.phone, whatsapp: variant.whatsapp, email: variant.email,
        whatsapp_opted_out: variant.whatsappOptedOut, sms_opted_out: variant.smsOptedOut, email_opted_out: variant.emailOptedOut,
      });
      expect(preferredConfirmationService(variant)).toBe(server.channel);
    }
  });
  it("blocks an explicit channel the saved contact cannot use", () => {
    expect(confirmationChoiceAvailable(contact, "auto")).toBe(true);
    expect(confirmationChoiceAvailable(contact, "none")).toBe(true);
    expect(confirmationChoiceAvailable(null, "whatsapp")).toBe(true);
    expect(confirmationChoiceAvailable({ ...contact, whatsappOptedOut: true }, "whatsapp")).toBe(false);
    expect(confirmationChoiceAvailable({ ...contact, email: null }, "email")).toBe(false);
    expect(confirmationChoiceAvailable(contact, "sms")).toBe(true);
  });
});
