import { describe, expect, it } from "vitest";
import {
  buildReportInsights,
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
      new Date("2026-05-12T12:00:00"),
    );

    // 11 sample bookings, not 10, since Ziggy was added to the Monday fixture
    // as the collected-but-unpaid case (#878). Revenue counts what the
    // appointment is worth, not what was collected, so Ziggy's bath & brush
    // is in the figure even though the money never arrived.
    expect(stats.curN).toBe(11);
    expect(stats.curRev).toBe(471);
  });

  it("computes service and size splits from sample data", () => {
    const source = sampleReportSource();
    const stats = computeReportStats(
      7,
      source.bookings,
      source.dogMap,
      source.humanMap,
      new Date("2026-05-12T12:00:00"),
    );

    expect(stats.svcs[0]).toMatchObject({
      id: "full-groom",
      n: 5,
      rev: 214,
    });
    expect(stats.sizes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ size: "small", n: 6 }),
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
      new Date("2026-05-12T12:00:00"),
    );

    expect(coco?.dog_id).toMatch(/^dog:/);
    expect(Object.values(source.humanMap)).toContain("Amy Clarke");
    expect(stats.uniqueCusts).toBe(11);
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

describe("single pricing source, cancelled and period windows", () => {
  // 2026-06-01 is a Monday; the salon opens Mon–Wed. Trailing-7-day window is
  // cur (05-25, 06-01]; the symmetric previous period is prev (05-18, 05-25].
  const today = new Date("2026-06-01T12:00:00");
  const dogMap = { d1: { humanId: "h1", customPrice: null } };
  const humanMap = { h1: "Owner One" };

  function row(
    bookingDate: string,
    over: Record<string, unknown> = {},
  ): never {
    return {
      id: `${bookingDate}-${over.slot ?? "08:30"}-${String(over.status ?? "b")}`,
      booking_date: bookingDate,
      service: "full-groom",
      size: "small",
      status: BOOKING_STATUS.BOOKED,
      payment: "Due at Pick-up",
      slot: "08:30",
      dog_id: "d1",
      addons: [],
      deposit_amount: null,
      ...over,
    } as never;
  }

  it("counts add-ons in revenue (single pricing source, incl. add-ons)", () => {
    const stats = computeReportStats(
      7,
      [row("2026-06-01", { addons: ["Flea Bath"] })],
      dogMap,
      humanMap,
      today,
    );
    expect(stats.curN).toBe(1);
    expect(stats.curRev).toBe(52); // £42 full-groom small + £10 Flea Bath
  });

  it("excludes cancelled bookings from counts and revenue", () => {
    const stats = computeReportStats(
      7,
      [
        row("2026-06-01", { slot: "08:30" }),
        row("2026-06-01", { slot: "09:00", status: BOOKING_STATUS.CANCELLED }),
      ],
      dogMap,
      humanMap,
      today,
    );
    expect(stats.curN).toBe(1);
    expect(stats.curRev).toBe(42); // only the live booking
  });

  it("excludes future-dated bookings from the current window", () => {
    // 2026-06-02 (Tue) is an OPEN day but after `today` — it must not inflate
    // the KPIs, since the revenue-trend chart stops at today.
    const stats = computeReportStats(
      7,
      [
        row("2026-06-01", { slot: "08:30" }), // today
        row("2026-06-02", { slot: "09:00" }), // future, open
      ],
      dogMap,
      humanMap,
      today,
    );
    expect(stats.curN).toBe(1);
    expect(stats.curRev).toBe(42);
  });

  it("splits expected from still-to-collect (curDue = amount due)", () => {
    const stats = computeReportStats(
      7,
      [
        row("2026-06-01", { slot: "08:30", payment: "Due at Pick-up" }),
        row("2026-06-01", { slot: "09:00", payment: "Paid in Full" }),
      ],
      dogMap,
      humanMap,
      today,
    );
    expect(stats.curRev).toBe(84); // expected: 2 × £42
    expect(stats.curDue).toBe(42); // only the unpaid one is still to collect
  });

  it("compares against the symmetric previous period, not all prior history", () => {
    const stats = computeReportStats(
      7,
      [
        row("2026-06-01", { slot: "08:30" }), // current period
        row("2026-05-20", { slot: "09:00" }), // previous period (Wed)
        row("2026-05-04", { slot: "09:30" }), // older than the prev window
      ],
      dogMap,
      humanMap,
      today,
    );
    expect(stats.curN).toBe(1);
    // 05-20 only — 05-04 is excluded by the new prev lower bound.
    expect(stats.prevN).toBe(1);
    expect(stats.prevRev).toBe(42);
  });
});

describe("no-show truth: confirmed no-shows vs unclassified past bookings", () => {
  // 2026-06-03 is a Wednesday; the salon opens Mon–Wed. The trailing-7-day
  // window is cur (05-27, 06-03]. Every row below sits on an open day strictly
  // before `today`, so it lands in the "past" cohort the health widget reports.
  const today = new Date("2026-06-03T12:00:00");
  const dogMap = { d1: { humanId: "h1", customPrice: null } };
  const humanMap = { h1: "Owner One" };

  function row(
    bookingDate: string,
    over: Record<string, unknown> = {},
  ): never {
    return {
      id: `${bookingDate}-${over.slot ?? "08:30"}-${String(over.status ?? "b")}`,
      booking_date: bookingDate,
      service: "full-groom",
      size: "small",
      status: BOOKING_STATUS.BOOKED,
      payment: "Due at Pick-up",
      slot: "08:30",
      dog_id: "d1",
      addons: [],
      deposit_amount: null,
      cancel_reason: null,
      ...over,
    } as never;
  }

  function statsFor(rows: never[]) {
    return computeReportStats(7, rows, dogMap, humanMap, today);
  }

  it("does not count a past booking left as Booked as a no-show", () => {
    // The regression this suite exists for: admin never closed the booking off.
    // That is unfinished paperwork, not a customer who failed to turn up.
    const stats = statsFor([row("2026-06-01", { slot: "08:30" })]);

    expect(stats.noShowN).toBe(0);
    expect(stats.noShowRate).toBe(0);
    expect(stats.needsClassificationN).toBe(1);
  });

  it("counts a cancelled booking with a No-show reason as a no-show", () => {
    const stats = statsFor([
      row("2026-06-01", {
        slot: "08:30",
        status: BOOKING_STATUS.CANCELLED,
        cancel_reason: "No-show",
      }),
    ]);

    expect(stats.noShowN).toBe(1);
    expect(stats.noShowRate).toBe(100); // 1 of 1 appointment that reached its slot
    expect(stats.needsClassificationN).toBe(0);
  });

  it("normalises the no-show reason's case and surrounding whitespace", () => {
    const stats = statsFor([
      row("2026-06-01", {
        slot: "08:30",
        status: BOOKING_STATUS.CANCELLED,
        cancel_reason: "  NO-SHOW ",
      }),
    ]);

    expect(stats.noShowN).toBe(1);
  });

  it("does not count a cancellation made for any other reason", () => {
    const stats = statsFor([
      row("2026-06-01", {
        slot: "08:30",
        status: BOOKING_STATUS.CANCELLED,
        cancel_reason: "Rescheduled to 8 Jun 2026 at 9:30am",
      }),
      row("2026-06-01", {
        slot: "09:00",
        status: BOOKING_STATUS.CANCELLED,
        cancel_reason: null,
      }),
    ]);

    expect(stats.noShowN).toBe(0);
    expect(stats.noShowRate).toBe(0);
  });

  it("computes the rate over appointments that reached their slot, not every row", () => {
    // 2 attended + 1 unclassified + 1 confirmed no-show = 4 appointments that
    // reached their slot. The two advance cancellations never did, so they are
    // not in the denominator.
    const stats = statsFor([
      row("2026-06-01", { slot: "08:30", status: BOOKING_STATUS.READY_FOR_COLLECTION }),
      row("2026-06-01", { slot: "09:00", status: BOOKING_STATUS.READY_FOR_COLLECTION }),
      row("2026-06-01", { slot: "09:30" }), // left as Booked — unclassified
      row("2026-06-02", {
        slot: "08:30",
        status: BOOKING_STATUS.CANCELLED,
        cancel_reason: "No-show",
      }),
      row("2026-06-02", {
        slot: "09:00",
        status: BOOKING_STATUS.CANCELLED,
        cancel_reason: "Customer cancelled via WhatsApp",
      }),
      row("2026-06-02", {
        slot: "09:30",
        status: BOOKING_STATUS.CANCELLED,
        cancel_reason: "Rescheduled via WhatsApp",
      }),
    ]);

    expect(stats.noShowN).toBe(1);
    expect(stats.needsClassificationN).toBe(1);
    expect(stats.noShowRate).toBe(25); // 1 of 4
  });

  it("excludes today's and future bookings from the unclassified count", () => {
    // Today's bookings are still live work — the Daily Brief owns those.
    const stats = statsFor([
      row("2026-06-03", { slot: "08:30" }), // today
      row("2026-06-01", { slot: "09:00" }), // past, genuinely unclassified
    ]);

    expect(stats.needsClassificationN).toBe(1);
  });

  it("reports the previous period's no-show rate on the same confirmed basis", () => {
    const stats = statsFor([
      // previous window (05-20, 05-27]: one attended, one confirmed no-show
      row("2026-05-25", { slot: "08:30", status: BOOKING_STATUS.READY_FOR_COLLECTION }),
      row("2026-05-26", {
        slot: "09:00",
        status: BOOKING_STATUS.CANCELLED,
        cancel_reason: "No-show",
      }),
      // a past Booked row in the previous window must not inflate it either
      row("2026-05-27", { slot: "09:30" }),
    ]);

    expect(stats.prevNoShowRate).toBe(50); // 1 confirmed of 2 that reached a slot
  });
});

describe("attendance insight does not outrun the evidence", () => {
  const today = new Date("2026-06-03T12:00:00");
  const dogMap = { d1: { humanId: "h1", customPrice: null } };
  const humanMap = { h1: "Owner One" };

  function row(
    bookingDate: string,
    over: Record<string, unknown> = {},
  ): never {
    return {
      id: `${bookingDate}-${over.slot ?? "08:30"}-${String(over.status ?? "b")}`,
      booking_date: bookingDate,
      service: "full-groom",
      size: "small",
      status: BOOKING_STATUS.READY_FOR_COLLECTION,
      payment: "Paid in Full",
      slot: "08:30",
      dog_id: "d1",
      addons: [],
      deposit_amount: null,
      cancel_reason: null,
      ...over,
    } as never;
  }

  const SLOTS = ["08:30", "09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "12:00", "12:30", "13:00"];

  function insightsFor(rows: never[]) {
    return buildReportInsights(
      computeReportStats(7, rows, dogMap, humanMap, today),
    );
  }

  it("claims strong attendance only when the past days are actually closed off", () => {
    const rows = SLOTS.map((slot) => row("2026-06-01", { slot })) as never[];

    expect(insightsFor(rows).health).toMatch(/strong attendance/i);
  });

  it("does not claim strong attendance while past bookings are unclassified", () => {
    // Eight closed off, two never closed. The no-show rate reads 0%, but that
    // is ignorance, not evidence — the old copy would have called it "strong".
    const rows = [
      ...SLOTS.slice(0, 8).map((slot) => row("2026-06-01", { slot })),
      ...SLOTS.slice(8).map((slot) => row("2026-06-01", { slot, status: BOOKING_STATUS.BOOKED })),
    ] as never[];

    const health = insightsFor(rows).health;
    expect(health).not.toMatch(/strong attendance/i);
    expect(health).toMatch(/2 past bookings/i);
  });

  it("still flags a genuinely high confirmed no-show rate", () => {
    const rows = [
      ...SLOTS.slice(0, 6).map((slot) => row("2026-06-01", { slot })),
      ...SLOTS.slice(6).map((slot) =>
        row("2026-06-01", {
          slot,
          status: BOOKING_STATUS.CANCELLED,
          cancel_reason: "No-show",
        }),
      ),
    ] as never[];

    expect(insightsFor(rows).health).toMatch(/no-show rate is high/i);
  });
});
