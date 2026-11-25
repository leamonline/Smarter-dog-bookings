import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { CALENDAR_ENTRY_PARAM, landsOnToday } from "./todayLanding";

const root = join(__dirname, "..", "..");

describe("the staff app's once-per-tab landing on Today", () => {
  it("moves the bare staff root to Today", () => {
    expect(landsOnToday("/", "")).toBe(true);
    expect(landsOnToday("/", "?week=2026-11-23")).toBe(true);
  });

  it("keeps the calendar when the link asks for it", () => {
    expect(landsOnToday("/", "?calendar")).toBe(false);
    expect(landsOnToday("/", "?calendar=1")).toBe(false);
    expect(landsOnToday("/", "?x=1&calendar")).toBe(false);
  });

  it("leaves every other page alone", () => {
    for (const path of ["/today", "/inbox", "/dogs/abc", "/settings"]) {
      expect(landsOnToday(path, ""), path).toBe(false);
    }
  });

  it("App.jsx asks this helper, so the rule lives in one place", () => {
    const app = readFileSync(join(root, "src/App.jsx"), "utf8");
    expect(app).toContain("landsOnToday(location.pathname, location.search)");
  });

  it("the iPhone app's Calendar link carries the flag", () => {
    // ios/SmarterDog/StaffDayModels.swift, StaffLinks.calendar. Without the flag a
    // fresh Safari tab opened from the phone lands on Today instead (#1294 review).
    const swift = readFileSync(join(root, "ios/SmarterDog/StaffDayModels.swift"), "utf8");
    expect(swift).toContain(`static let calendar = URL(string: "\\(base)?${CALENDAR_ENTRY_PARAM}")!`);
  });
});
