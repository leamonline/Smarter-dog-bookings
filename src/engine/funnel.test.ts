import { describe, it, expect } from "vitest";
import { FUNNEL_STEPS, computeFunnelStats, type FunnelEventRow } from "./funnel";

const TODAY = new Date("2026-07-04T09:00:00Z");

function ev(session_id: string, step: string, created_at = "2026-07-01T10:00:00Z"): FunnelEventRow {
  return { session_id, step, created_at };
}

describe("computeFunnelStats", () => {
  const rows: FunnelEventRow[] = [
    // S1 — a full run to booked
    ...["started", "select_dogs", "select_service", "select_date", "select_slot", "confirm", "booked"].map((s) => ev("s1", s)),
    // S2 — dropped after choosing a service
    ...["started", "select_dogs", "select_service"].map((s) => ev("s2", s)),
    // S3 — dropped after choosing dogs
    ...["started", "select_dogs"].map((s) => ev("s3", s)),
    // S4 — outside the 30-day window
    ev("s4", "started", "2026-05-01T10:00:00Z"),
    ev("s4", "booked", "2026-05-01T10:05:00Z"),
  ];
  const stats = computeFunnelStats(rows, 30, TODAY);
  const at = (step: string) => stats.steps.find((s) => s.step === step)!;

  it("counts distinct sessions in the window", () => {
    expect(stats.totalSessions).toBe(3); // s1, s2, s3
  });

  it("builds a monotonic funnel of sessions reaching each step", () => {
    expect(at("started").sessions).toBe(3);
    expect(at("select_dogs").sessions).toBe(3);
    expect(at("select_service").sessions).toBe(2);
    expect(at("select_date").sessions).toBe(1);
    expect(at("booked").sessions).toBe(1);
  });

  it("reports completion rate and per-step drop-off", () => {
    expect(stats.completed).toBe(1);
    expect(stats.completionPct).toBeCloseTo(33.3, 1);
    expect(at("select_service").dropFromPrev).toBe(1); // 3 chose dogs, 2 chose a service
    expect(at("select_service").pctOfStarted).toBeCloseTo(66.7, 1);
  });

  it("is robust to a dropped intermediate log (counts by furthest step reached)", () => {
    // A session that only logged 'started' + 'confirm' still counts as having
    // reached every step up to confirm.
    const partial = [ev("p1", "started"), ev("p1", "confirm")];
    const s = computeFunnelStats(partial, 30, TODAY);
    expect(s.totalSessions).toBe(1);
    expect(s.steps.find((x) => x.step === "select_date")!.sessions).toBe(1);
    expect(s.steps.find((x) => x.step === "booked")!.sessions).toBe(0);
  });

  it("is empty and safe with no events", () => {
    const s = computeFunnelStats([], 30, TODAY);
    expect(s.totalSessions).toBe(0);
    expect(s.completionPct).toBe(0);
    expect(s.steps).toHaveLength(FUNNEL_STEPS.length);
  });
});
