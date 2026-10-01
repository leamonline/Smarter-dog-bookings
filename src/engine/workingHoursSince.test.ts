import { describe, expect, it } from "vitest";
import { workingHoursSince, type WorkingSchedule } from "./workingHoursSince";
const schedule: WorkingSchedule = { from: "2026-01-01", to: "2026-12-31", days: {}, holidays: [] };
const hours = (start: string, end: string, overrides: Partial<WorkingSchedule> = {}) => workingHoursSince(start, { ...schedule, ...overrides }, new Date(end));
describe("workingHoursSince", () => {
  it("counts London opening hours across the weekend, not elapsed time", () => {
    expect(hours("2026-06-17T13:00:00Z", "2026-06-22T09:00:00Z")).toBe(2.5);
  });
  it("includes an explicitly open Thursday", () => {
    expect(hours("2026-06-18T07:30:00Z", "2026-06-18T14:00:00Z", { days: { "2026-06-18": { isOpen: true, closures: [] } } })).toBe(6.5);
  });
  it("excludes explicit October closures and includes the open Monday", () => {
    expect(hours("2026-10-26T08:30:00Z", "2026-10-28T15:00:00Z", { days: { "2026-10-27": { isOpen: false, closures: [] }, "2026-10-28": { isOpen: false, closures: [] } } })).toBe(6.5);
  });
  it("excludes enabled holiday ranges, reopening date exclusive", () => {
    expect(hours("2026-06-15T07:30:00Z", "2026-06-17T14:00:00Z", { holidays: [{ closedFrom: "2026-06-15", reopensOn: "2026-06-17", enabled: true }] })).toBe(6.5);
  });
  it("ignores disabled holidays", () => {
    expect(hours("2026-06-15T07:30:00Z", "2026-06-15T14:00:00Z", { holidays: [{ closedFrom: "2026-06-15", reopensOn: "2026-06-17", enabled: false }] })).toBe(6.5);
  });
  it("unions overlapping partial-day closures and clips outside hours", () => {
    expect(hours("2026-06-15T07:30:00Z", "2026-06-15T14:00:00Z", { days: { "2026-06-15": { isOpen: true, closures: [{ from: "09:00", to: "10:00" }, { from: "09:30", to: "11:00" }, { from: "16:00", to: "17:00" }] } } })).toBe(4.5);
  });
  it("uses GMT after the autumn clock change", () => {
    expect(hours("2026-10-26T08:30:00Z", "2026-10-26T09:30:00Z")).toBe(1);
  });
  it("clips partial opening periods", () => {
    expect(hours("2026-06-15T08:00:00Z", "2026-06-15T08:30:00Z")).toBe(0.5);
    expect(hours("2026-06-15T16:00:00Z", "2026-06-15T17:00:00Z")).toBe(0);
  });
  it("reports unavailable for invalid or incomplete evidence", () => {
    expect(workingHoursSince("2026-06-15", null)).toBeNull();
    expect(hours("invalid", "2026-06-15")).toBeNull();
    expect(hours("2025-01-01", "2026-06-15")).toBeNull();
    expect(hours("2026-06-15", "2027-01-01")).toBeNull();
    expect(hours("2026-06-15", "invalid")).toBeNull();
  });
  it("counts no waiting for future timestamps", () => {
    expect(hours("2026-06-16", "2026-06-15")).toBe(0);
  });
});
