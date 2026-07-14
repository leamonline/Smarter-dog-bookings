import { describe, it, expect } from "vitest";
import { mergeSalonSettings } from "./salonSettings";

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
