import { describe, expect, it } from "vitest";
import {
  buildReportSourceFromSalon,
  computeReportStats,
} from "./useReportsData";
import {
  SAMPLE_BOOKINGS_BY_DAY,
  SAMPLE_DOGS,
  SAMPLE_HUMANS,
} from "../data/sample.js";
import { BOOKING_STATUS } from "../constants/salon";

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

describe("open-days-only analytics", () => {
  // 2026-06-01 is a Monday (salon open Mon–Wed). The trailing-7-day window from
  // it covers Tue 05-26, Wed 05-27, Thu 05-28 … Mon 06-01.
  const today = new Date("2026-06-01T12:00:00");
  const dogMap = {
    d1: { humanId: "h1", customPrice: null },
    d2: { humanId: "h2", customPrice: null },
  };
  const humanMap = { h1: "Owner One", h2: "Owner Two" };

  function row(
    bookingDate: string,
    over: Record<string, unknown> = {},
  ): never {
    return {
      id: `${bookingDate}-${over.dog_id ?? "d1"}-${over.slot ?? "08:30"}`,
      booking_date: bookingDate,
      service: "full-groom",
      size: "small",
      status: BOOKING_STATUS.BOOKED,
      payment: "Due at Pick-up",
      slot: "08:30",
      dog_id: "d1",
      ...over,
    } as never;
  }

  it("excludes closed weekdays from day-of-week stats and the busiest-day pick", () => {
    const bookings = [
      row("2026-06-01", { dog_id: "d1" }), // Mon — open
      row("2026-06-01", { dog_id: "d2", slot: "09:00" }), // Mon — open
      row("2026-05-28", { dog_id: "d2", slot: "09:30" }), // Thu — closed
    ];
    const stats = computeReportStats(7, bookings, dogMap, humanMap, today);

    // The Thursday booking never enters the totals.
    expect(stats.curN).toBe(2);

    const thu = stats.dow.find((d) => d.label === "Thu");
    expect(thu?.open).toBe(false);
    expect(thu?.n).toBe(0);
    // Closed weekdays can never be "busiest".
    expect(stats.busiestDay.label).toBe("Mon");
    expect(stats.dow.filter((d) => d.open).map((d) => d.label)).toEqual([
      "Mon",
      "Tue",
      "Wed",
    ]);
  });

  it("uses open calendar days (not days-with-bookings) as the fill denominator", () => {
    const bookings = [
      row("2026-06-01", {}), // Mon
      row("2026-06-03", { slot: "09:00" }), // Wed (next week, still open + in window? no — future)
    ];
    const stats = computeReportStats(7, bookings, dogMap, humanMap, today);

    // Open days in the trailing window are Tue 05-26, Wed 05-27, Mon 06-01 = 3,
    // regardless of how many actually had a booking.
    expect(stats.openDays).toBe(3);
  });

  it("drops bookings on an explicitly closed date and lowers the open-day count", () => {
    const bookings = [
      row("2026-06-01", {}), // Mon
      row("2026-05-27", { slot: "09:00" }), // Wed — in window, open by default
    ];

    const dflt = computeReportStats(7, bookings, dogMap, humanMap, today);
    expect(dflt.curN).toBe(2);
    expect(dflt.openDays).toBe(3);

    // Mirror the weekday default (Mon–Wed) but close this one Wednesday — as a
    // day_settings row would. The Wednesday's booking drops out and the open-day
    // denominator falls from 3 to 2.
    const closedWed = computeReportStats(
      7,
      bookings,
      dogMap,
      humanMap,
      today,
      (d) => {
        if (d === "2026-05-27") return false;
        const day = new Date(d + "T00:00:00").getDay(); // 0 = Sun
        return day >= 1 && day <= 3; // Mon–Wed
      },
    );
    expect(closedWed.curN).toBe(1);
    expect(closedWed.openDays).toBe(2);
  });
});
