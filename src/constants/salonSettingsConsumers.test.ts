import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createDefaultSalonSettings, mergeSalonSettings, RETIRED_SETTINGS_KEYS } from "./salonSettings";

// #1000 ratchet: a setting nobody reads is a switch that lies to staff. Every
// key in createDefaultSalonSettings must be read somewhere other than the
// settings plumbing itself (the settings views, types, transforms and this
// module). A new key without a consumer fails here.
const root = join(__dirname, "..", "..");
const PLUMBING = /(^|\/)(components\/views\/settings\/|types\/|supabase\/transforms|constants\/salonSettings)/;

function consumers(key: string): string[] {
  let out: string;
  try {
    out = execFileSync("git", ["grep", "-l", "-w", key, "--", "src", "supabase/functions", "supabase/migrations"], {
      cwd: root,
      encoding: "utf8",
    });
  } catch {
    return [];
  }
  return out
    .split("\n")
    .filter(Boolean)
    .filter((path) => !PLUMBING.test(path.replace(/^src\//, "")))
    .filter((path) => !/\.test\.|\.component\.test\./.test(path));
}

describe("salon settings keys", () => {
  for (const key of Object.keys(createDefaultSalonSettings())) {
    it(`"${key}" has a consumer outside the settings plumbing`, () => {
      expect(consumers(key), `${key} is saved but nothing reads it`).not.toEqual([]);
    });
  }

  it("does not re-assert retired keys left in stored settings", () => {
    const merged = mergeSalonSettings({
      businessName: "Fixture",
      advanceBookingWeeks: 12,
      autoConfirm: false,
      largeDogSlots: { "12:00": { seats: 2, canShare: true } },
      notifications: { followUp: { enabled: true, channels: ["email"] } },
      services: [],
      customerPortal: { showUpcoming: true, allowRebooking: true, showHistory: false },
    } as never);
    for (const key of RETIRED_SETTINGS_KEYS) expect(merged).not.toHaveProperty(key);
    expect(merged.customerPortal).toEqual({ showHistory: false, allowCancellations: true });
    expect(merged.businessName).toBe("Fixture");
  });
});
