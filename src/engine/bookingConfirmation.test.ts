import { describe, expect, it } from "vitest";
import { confirmationOutcome, preferredServiceAvailable } from "./bookingConfirmation";
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
  it("a definite failure can coexist with a delivered recipient without resending the booking", () => {
    const value = snapshot([row(), row({ humanId: "trusted", status: "failed", providerId: null })], "delivered");
    expect(outcome(value, ["saved-1"], ["owner", "trusted"])).toEqual({ state: "failed", retryBookingIds: ["saved-1"] });
  });
});

describe("saved preferred service", () => {
  const contact: ConfirmationContact = { preferredService: "sms", phone: "+447700900123", whatsapp: true, email: "sample@example.test", whatsappOptedOut: false, smsOptedOut: false, emailOptedOut: false };
  it("keeps a saved SMS preference valid even when WhatsApp is available", () => {
    expect(preferredServiceAvailable(contact)).toBe(true);
    expect(contact.preferredService).toBe("sms");
  });
  it("honours channel opt-outs and reachability", () => {
    expect(preferredServiceAvailable({ ...contact, smsOptedOut: true })).toBe(false);
    expect(preferredServiceAvailable({ ...contact, phone: null })).toBe(false);
    expect(preferredServiceAvailable({ ...contact, preferredService: "whatsapp", whatsappOptedOut: true })).toBe(false);
  });
});
