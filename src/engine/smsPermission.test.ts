import { describe, expect, it } from "vitest";
import {
  SMS_REASON_MIN_LENGTH,
  checkReason,
  currentConfirmation,
  describeSmsPermissionRow,
  parseSmsPermissionRows,
  smsPermissionErrorMessage,
  smsPermissionState,
} from "./smsPermission";

describe("smsPermissionState", () => {
  it("shows nothing for a customer who never stopped", () => {
    expect(smsPermissionState({})).toBe("not_applicable");
    expect(smsPermissionState({ whatsappOptedOut: false, preferredChannel: "sms" })).toBe("not_applicable");
    expect(smsPermissionState(null)).toBe("not_applicable");
  });

  it("is paused after a WhatsApp STOP until staff confirm, whatever else is set", () => {
    expect(smsPermissionState({ whatsappOptedOut: true })).toBe("paused");
    expect(smsPermissionState({ whatsappOptedOut: true, preferredChannel: "email" })).toBe("paused");
    expect(smsPermissionState({ whatsappOptedOut: true, preferredChannel: null })).toBe("paused");
  });

  it("is confirmed once preferred_channel is sms", () => {
    expect(smsPermissionState({ whatsappOptedOut: true, preferredChannel: "sms" })).toBe("confirmed");
  });

  it("an SMS opt-out beats everything and cannot be confirmed away", () => {
    expect(smsPermissionState({ smsOptedOut: true })).toBe("opted_out");
    expect(smsPermissionState({ smsOptedOut: true, whatsappOptedOut: true, preferredChannel: "sms" })).toBe("opted_out");
  });
});

describe("checkReason", () => {
  it("trims, and accepts a real reason", () => {
    expect(checkReason("  Rang her: texts are fine  ", "confirm")).toEqual({ ok: true, reason: "Rang her: texts are fine" });
  });

  it("refuses empty, whitespace and too-short reasons, with wording for each action", () => {
    for (const input of ["", "   ", "short", null, undefined, "x".repeat(SMS_REASON_MIN_LENGTH - 1)]) {
      expect(checkReason(input, "confirm").ok).toBe(false);
    }
    expect(checkReason("", "confirm")).toMatchObject({ error: expect.stringMatching(/how they told you/i) });
    expect(checkReason("", "withdraw")).toMatchObject({ error: expect.stringMatching(/why texts are being paused/i) });
    expect(checkReason("x".repeat(SMS_REASON_MIN_LENGTH), "confirm").ok).toBe(true);
  });
});

describe("smsPermissionErrorMessage", () => {
  it("turns each refusal into something staff can act on", () => {
    expect(smsPermissionErrorMessage({ code: "42501" })).toMatch(/only staff/i);
    expect(smsPermissionErrorMessage({ details: "sms_opted_out" })).toMatch(/opted out of texts/i);
    expect(smsPermissionErrorMessage({ details: "nothing_to_confirm" })).toMatch(/aren.t paused/i);
    expect(smsPermissionErrorMessage({ details: "already_confirmed" })).toMatch(/already confirmed/i);
    expect(smsPermissionErrorMessage({ details: "no_phone" })).toMatch(/no mobile number/i);
    expect(smsPermissionErrorMessage({ details: "nothing_to_withdraw" })).toMatch(/no confirmation/i);
  });

  it("says nothing changed for anything unexpected, without leaking the raw error", () => {
    const text = smsPermissionErrorMessage({ message: "relation \"x\" does not exist" });
    expect(text).toMatch(/nothing was changed/i);
    expect(text).not.toMatch(/relation/);
    expect(smsPermissionErrorMessage(null)).toMatch(/nothing was changed/i);
  });
});

describe("audit rows", () => {
  const raw = [
    { id: "a", action: "confirmed", reason: "Rang her: texts fine", confirmed_by: "u1", confirmed_by_name: "Sam", created_at: "2026-11-03T10:00:00Z" },
    { id: "b", action: "superseded_by_stop", reason: "A new STOP cleared it", confirmed_by: null, confirmed_by_name: null, created_at: "2026-11-02T10:00:00Z" },
  ];

  it("keeps well-formed rows and drops unreadable ones rather than half-showing them", () => {
    expect(parseSmsPermissionRows([...raw, { id: "c", action: "bogus", reason: "x", created_at: "2026" }, null, "x", { action: "confirmed" }])).toHaveLength(2);
    expect(parseSmsPermissionRows(null)).toEqual([]);
  });

  it("names the person, or the system for a clearing STOP", () => {
    const [confirmed, cleared] = parseSmsPermissionRows(raw);
    expect(describeSmsPermissionRow(confirmed)).toEqual({ label: "Texts confirmed", by: "Sam", reason: "Rang her: texts fine" });
    expect(describeSmsPermissionRow(cleared)).toMatchObject({ label: "Cleared by a new STOP", by: "the system" });
    expect(describeSmsPermissionRow({ ...confirmed, confirmedByName: null }).by).toBe("a member of staff");
  });

  it("only the newest decision counts as the current confirmation", () => {
    const [confirmed, cleared] = parseSmsPermissionRows(raw);
    expect(currentConfirmation([confirmed, cleared])?.id).toBe("a");
    expect(currentConfirmation([cleared, confirmed])).toBeNull(); // a STOP since cleared it
    expect(currentConfirmation([])).toBeNull();
  });
});
