import { describe, it, expect } from "vitest";
import {
  BOOKING_DEPOSIT_HOLD_HOURS,
  createDefaultBookingRules,
  mergeSalonSettings,
} from "./salonSettings";

describe("deposit settings defaults", () => {
  it("defaults releaseHours 12 and empty bank", () => {
    const s = mergeSalonSettings(null);
    expect(s.depositReleaseHours).toBe(12);
    expect(s.depositBank).toEqual({ accountName: "", sortCode: "", accountNumber: "" });
  });

  it("keeps persisted values and fills gaps", () => {
    const s = mergeSalonSettings({ depositBank: { accountName: "Smarter Dog" } });
    expect(s.depositBank.accountName).toBe("Smarter Dog");
    expect(s.depositBank.sortCode).toBe("");
  });

  it("rejects a nonsense release window", () => {
    expect(mergeSalonSettings({ depositReleaseHours: 0 }).depositReleaseHours).toBe(12);
    expect(mergeSalonSettings({ depositReleaseHours: 48 }).depositReleaseHours).toBe(48);
  });
});

describe("authoritative booking rules defaults", () => {
  it("uses the signed v1 defaults and only the server-supported hold windows", () => {
    expect(BOOKING_DEPOSIT_HOLD_HOURS).toEqual([6, 12, 24, 36, 48]);
    expect(createDefaultBookingRules()).toEqual({
      bookingHorizonDays: 180,
      autoConfirm: true,
      depositHoldHours: 12,
      depositBank: {
        accountName: "",
        sortCode: "",
        accountNumber: "",
      },
      termsUrl: "https://smarterdog.co.uk/terms",
      depositTermsVersion: null,
      depositTermsContentHash: null,
      customerPortal: {
        allowCancellations: true,
        allowRescheduling: true,
        allowRepeatBooking: false,
        showHistory: true,
      },
    });
  });

  it("returns a fresh nested value for each caller", () => {
    const first = createDefaultBookingRules();
    first.depositBank.accountName = "Changed";

    expect(createDefaultBookingRules().depositBank.accountName).toBe("");
  });
});
