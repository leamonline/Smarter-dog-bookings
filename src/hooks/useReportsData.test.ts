import { describe, expect, it } from "vitest";
import {
  buildReportSourceFromSalon,
  computeReportStats,
} from "./useReportsData.js";
import {
  SAMPLE_BOOKINGS_BY_DAY,
  SAMPLE_DOGS,
  SAMPLE_HUMANS,
} from "../data/sample.js";

function sampleReportSource() {
  return buildReportSourceFromSalon({
    bookingsByDate: {
      "2026-05-11": SAMPLE_BOOKINGS_BY_DAY.mon as any,
      "2026-05-12": SAMPLE_BOOKINGS_BY_DAY.tue as any,
    },
    dogs: SAMPLE_DOGS as any,
    humans: SAMPLE_HUMANS as any,
  });
}

describe("offline report data", () => {
  it("builds non-empty stats from sample bookings", () => {
    const source = sampleReportSource();
    const stats = computeReportStats(
      7,
      source.bookings,
      source.dogMap,
      source.humanMap,
      new Date("2026-05-11T12:00:00"),
    );

    expect(stats.curN).toBe(10);
    expect(stats.curRev).toBe(433);
  });

  it("computes service and size splits from sample data", () => {
    const source = sampleReportSource();
    const stats = computeReportStats(
      7,
      source.bookings,
      source.dogMap,
      source.humanMap,
      new Date("2026-05-11T12:00:00"),
    );

    expect(stats.svcs[0]).toMatchObject({
      id: "full-groom",
      n: 5,
      rev: 214,
    });
    expect(stats.sizes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ size: "small", n: 5 }),
        expect.objectContaining({ size: "medium", n: 4 }),
        expect.objectContaining({ size: "large", n: 1 }),
      ]),
    );
  });

  it("keeps unmatched sample bookings in customer stats with fallback ids", () => {
    const source = sampleReportSource();
    const coco = source.bookings.find((booking) => booking.id === "101");
    const stats = computeReportStats(
      7,
      source.bookings,
      source.dogMap,
      source.humanMap,
      new Date("2026-05-11T12:00:00"),
    );

    expect(coco?.dog_id).toMatch(/^dog:/);
    expect(Object.values(source.humanMap)).toContain("Amy Clarke");
    expect(stats.uniqueCusts).toBe(10);
  });
});
