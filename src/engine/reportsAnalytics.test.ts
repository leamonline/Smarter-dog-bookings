import { describe, it, expect } from "vitest";
import {
  computeSlotFill,
  computeSlotLevers,
  computeServiceValue,
  computeOutcomes,
  computeSourceMix,
  computeRetentionCandidates,
  actualGroomMinutes,
  OUTCOME_HISTORY_START,
  type AnalyticsBooking,
  type AnalyticsEvent,
} from "./reportsAnalytics";

// Mon–Wed open, everything else closed (the salon's real trading pattern).
const isOpen = (d: string): boolean => {
  const day = new Date(d + "T00:00:00").getDay();
  return day >= 1 && day <= 3;
};

const TODAY = new Date("2026-07-01T09:00:00Z"); // a Wednesday

function b(partial: Partial<AnalyticsBooking>): AnalyticsBooking {
  return {
    id: "x",
    booking_date: "2026-07-01",
    slot: "09:00",
    service: "full-groom",
    size: "small",
    status: "Completed",
    payment: "Paid in Full",
    addons: [],
    deposit_amount: null,
    dog_id: "d1",
    ...partial,
  };
}

describe("computeSlotFill (2A)", () => {
  const bookings = [
    b({ booking_date: "2026-06-29", slot: "09:00" }), // Mon
    b({ booking_date: "2026-06-30", slot: "09:00" }), // Tue
    b({ booking_date: "2026-06-30", slot: "10:00" }), // Tue
    b({ booking_date: "2026-07-01", slot: "09:00" }), // Wed
    b({ booking_date: "2026-07-01", slot: "09:00" }), // Wed
    b({ booking_date: "2026-07-01", slot: "11:00", status: "Cancelled" }), // excluded
    b({ booking_date: "2026-06-27", slot: "09:00" }), // Sat (closed) — excluded
    b({ booking_date: "2026-06-20", slot: "09:00" }), // out of 7d window
  ];
  const fill = computeSlotFill(bookings, 7, TODAY, isOpen);

  it("counts three open days in the window", () => {
    expect(fill.openDays).toBe(3);
  });

  it("computes per-slot fill against openDays x 2 seats", () => {
    const s9 = fill.bySlot.find((s) => s.slot === "09:00")!;
    const s10 = fill.bySlot.find((s) => s.slot === "10:00")!;
    expect(s9.n).toBe(4);
    expect(s9.fillPct).toBeCloseTo(66.67, 1); // 4 / (3*2)
    expect(s10.n).toBe(1);
    expect(s10.fillPct).toBeCloseTo(16.67, 1);
  });

  it("computes per-weekday fill against that weekday's open days x 14", () => {
    const mon = fill.byWeekday.find((d) => d.label === "Mon")!;
    const tue = fill.byWeekday.find((d) => d.label === "Tue")!;
    expect(mon.n).toBe(1);
    expect(mon.fillPct).toBeCloseTo(7.14, 1); // 1 / (1*14)
    expect(tue.n).toBe(2);
    expect(tue.fillPct).toBeCloseTo(14.29, 1);
  });

  it("surfaces the busiest and hardest-to-fill slots", () => {
    expect(fill.busiestSlot.slot).toBe("09:00");
    expect(fill.hardestSlot.fillPct).toBe(0); // an empty slot is hardest to fill
  });
});

describe("computeSlotLevers (2A — extra/immediate uptake)", () => {
  const daySettingsByDate = {
    "2026-07-01": { extra_slots: ["13:30"], immediate_slots: ["09:00"] },
  };
  const bookings = [
    b({ booking_date: "2026-07-01", slot: "09:00" }),
    b({ booking_date: "2026-07-01", slot: "09:00" }),
  ];
  const levers = computeSlotLevers(daySettingsByDate, bookings, 7, TODAY);

  it("counts extra slot-days opened vs booked", () => {
    expect(levers.extraOpened).toBe(1);
    expect(levers.extraBooked).toBe(0);
  });
  it("counts immediate slot-days flagged vs booked", () => {
    expect(levers.immediateFlagged).toBe(1);
    expect(levers.immediateBooked).toBe(1); // 09:00 has bookings
  });
});

describe("computeServiceValue (2B)", () => {
  const bookings = [
    b({ dog_id: "A", booking_date: "2026-06-01", service: "full-groom", status: "Completed" }),
    b({ dog_id: "A", booking_date: "2026-06-29", service: "full-groom", status: "Completed" }),
    b({ dog_id: "B", booking_date: "2026-06-02", service: "full-groom", status: "Completed" }),
    b({ dog_id: "C", booking_date: "2026-06-03", service: "full-groom", status: "Cancelled" }),
  ];
  const svc = computeServiceValue(bookings, {}, 90, TODAY, isOpen);
  const fg = svc.find((s) => s.id === "full-groom")!;

  it("values completed bookings per booked half-hour", () => {
    expect(fg.completedN).toBe(3);
    expect(fg.valuePerHour).toBeCloseTo(84, 0); // (3*£42) / (3*0.5h)
  });

  it("computes rebooking rate within 12 weeks", () => {
    expect(fg.rebookRatePct).toBeCloseTo(33.3, 1); // A@06-01 rebooked, others not
  });

  it("computes cancellation rate over all bookings for the service", () => {
    expect(fg.cancelRatePct).toBe(25); // 1 cancelled of 4
  });
});

describe("actualGroomMinutes + computeServiceValue real durations (improvement #1)", () => {
  it("measures a completed groom from checked_in_at to ready_at", () => {
    expect(actualGroomMinutes({ checked_in_at: "2026-06-01T09:00:00Z", ready_at: "2026-06-01T09:45:00Z" })).toBe(45);
  });

  it("returns null without both stamps or for nonsense durations", () => {
    expect(actualGroomMinutes({ checked_in_at: "2026-06-01T09:00:00Z", ready_at: null })).toBeNull();
    expect(actualGroomMinutes({})).toBeNull();
    expect(actualGroomMinutes({ checked_in_at: "2026-06-01T10:00:00Z", ready_at: "2026-06-01T09:00:00Z" })).toBeNull(); // ready before check-in
    expect(actualGroomMinutes({ checked_in_at: "2026-06-01T09:00:00Z", ready_at: "2026-06-02T09:00:00Z" })).toBeNull(); // absurdly long
  });

  it("reports actual avg duration + value/hour from the real timings only", () => {
    const rows = [
      b({ dog_id: "A", booking_date: "2026-06-01", service: "full-groom", status: "Completed", checked_in_at: "2026-06-01T09:00:00Z", ready_at: "2026-06-01T09:45:00Z" }), // 45 min
      b({ dog_id: "B", booking_date: "2026-06-02", service: "full-groom", status: "Completed", checked_in_at: "2026-06-02T10:00:00Z", ready_at: "2026-06-02T11:15:00Z" }), // 75 min
      b({ dog_id: "C", booking_date: "2026-06-03", service: "full-groom", status: "Completed" }), // untimed
    ];
    const fg = computeServiceValue(rows, {}, 90, TODAY, isOpen).find((s) => s.id === "full-groom")!;
    expect(fg.completedN).toBe(3);
    expect(fg.timedN).toBe(2);
    expect(fg.avgActualMinutes).toBe(60); // (45 + 75) / 2
    expect(fg.actualValuePerHour).toBeCloseTo(42, 0); // (£42 + £42) / ((45+75)/60 h)
  });

  it("has null actual fields when no completed groom is timed", () => {
    const rows = [b({ dog_id: "A", booking_date: "2026-06-01", service: "full-groom", status: "Completed" })];
    const fg = computeServiceValue(rows, {}, 90, TODAY, isOpen).find((s) => s.id === "full-groom")!;
    expect(fg.timedN).toBe(0);
    expect(fg.avgActualMinutes).toBeNull();
    expect(fg.actualValuePerHour).toBeNull();
  });
});

describe("computeOutcomes (2C)", () => {
  const events: AnalyticsEvent[] = [
    { event_type: "rescheduled", occurred_at: "2026-06-01T10:00:00Z", booking_date: "2026-06-08", slot: "09:00", service: "full-groom", cancel_reason: null, previous_booking_date: "2026-06-01", previous_slot: "09:00" },
    { event_type: "cancelled", occurred_at: "2026-06-02T13:00:00Z", booking_date: "2026-06-02", slot: "12:00", service: "full-groom", cancel_reason: "No-show", previous_booking_date: null, previous_slot: null }, // recorded after the missed slot => not a "late notice" cancel
    { event_type: "cancelled", occurred_at: "2026-06-03T08:00:00Z", booking_date: "2026-06-03", slot: "09:00", service: "bath-and-brush", cancel_reason: "Ill", previous_booking_date: null, previous_slot: null },
    // 23.5h before a 09:00 BST slot (= 08:00Z) => a genuine <24h late cancel,
    // but ONLY when the slot is read as Europe/London (not naive UTC).
    { event_type: "cancelled", occurred_at: "2026-06-09T08:30:00Z", booking_date: "2026-06-10", slot: "09:00", service: "full-groom", cancel_reason: "Holiday", previous_booking_date: null, previous_slot: null },
    { event_type: "created", occurred_at: "2026-06-04T10:00:00Z", booking_date: "2026-06-04", slot: "09:00", service: "full-groom", cancel_reason: null, previous_booking_date: null, previous_slot: null },
  ];
  const bookings = [
    b({ reminder_confirmed_at: "2026-05-30T10:00:00Z", status: "Completed", booking_date: "2026-06-01" }),
    b({ reminder_confirmed_at: "2026-05-31T10:00:00Z", status: "Completed", booking_date: "2026-06-02" }),
    b({ reminder_confirmed_at: null, status: "Cancelled", booking_date: "2026-06-03" }),
    b({ reminder_confirmed_at: null, status: "Completed", booking_date: "2026-06-08" }), // Mon (open)
  ];
  const out = computeOutcomes(bookings, events, 90, TODAY, isOpen);

  it("counts reschedules and cancellations from events in the window", () => {
    expect(out.rescheduleCount).toBe(1);
    expect(out.cancelCount).toBe(3);
  });

  it("counts confirmed no-shows and late cancellations (slot read as London time)", () => {
    expect(out.noShowConfirmedCount).toBe(1); // cancel_reason 'No-show'
    // 06-03 (at the slot) + 06-10 (23.5h before the BST slot); the No-show at
    // 06-02 was recorded after its slot, so it isn't a late-notice cancel.
    expect(out.lateCancelCount).toBe(2);
  });

  it("compares cancel rate for reminder-confirmed vs unconfirmed bookings", () => {
    expect(out.confirmedCancelRatePct).toBe(0); // 0 of 2 confirmed cancelled
    expect(out.unconfirmedCancelRatePct).toBe(50); // 1 of 2 unconfirmed cancelled
  });

  it("exposes the event-history-start caveat date", () => {
    expect(out.historyStart).toBe(OUTCOME_HISTORY_START);
  });
});

describe("computeSourceMix (2E)", () => {
  const bookings = [
    b({ created_by_role: "staff", status: "Completed" }),
    b({ created_by_role: "staff", status: "Completed" }),
    b({ created_by_role: "customer", status: "Completed" }),
    b({ created_by_role: "customer", status: "Cancelled" }),
    b({ created_by_role: null, status: "Completed" }),
  ];
  const mix = computeSourceMix(bookings, {}, 90, TODAY, isOpen);

  it("shares countable bookings by who booked them", () => {
    const staff = mix.bySource.find((s) => s.role === "staff")!;
    expect(staff.n).toBe(2);
    expect(staff.pct).toBe(50); // 2 of 4 countable
    expect(mix.selfServicePct).toBe(25); // customer share of countable
  });

  it("computes cancel rate per source over all bookings", () => {
    const customer = mix.bySource.find((s) => s.role === "customer")!;
    expect(customer.cancelRatePct).toBe(50); // 1 cancelled of 2 customer
  });
});

describe("computeRetentionCandidates (2D)", () => {
  const intervals = {
    A: { visitCount: 3, medianIntervalDays: 56, lastGroomedDate: "2026-04-01", lastService: "full-groom" },
    B: { visitCount: 1, medianIntervalDays: null, lastGroomedDate: "2026-06-25", lastService: "bath-and-brush" },
    C: { visitCount: 4, medianIntervalDays: 40, lastGroomedDate: "2026-05-01", lastService: "full-groom" },
    D: { visitCount: 3, medianIntervalDays: 50, lastGroomedDate: "2026-04-10", lastService: "full-groom" },
    E: { visitCount: 3, medianIntervalDays: 50, lastGroomedDate: "2026-04-10", lastService: "full-groom" },
  };
  const dogs = {
    A: { id: "A", name: "Alfie", size: "small", humanId: "hA", archivedAt: null },
    B: { id: "B", name: "Bess", size: "small", humanId: "hB", archivedAt: null },
    C: { id: "C", name: "Coco", size: "small", humanId: "hC", archivedAt: "2026-05-10T00:00:00Z" }, // archived dog
    D: { id: "D", name: "Duke", size: "large", humanId: "hD", archivedAt: null },
    E: { id: "E", name: "Ely", size: "small", humanId: "hE", archivedAt: null },
  };
  const humans = {
    hA: { id: "hA", name: "Amy", archivedAt: null, smsOptedOut: false, whatsappOptedOut: false, emailOptedOut: false },
    hB: { id: "hB", name: "Ben", archivedAt: null, smsOptedOut: false, whatsappOptedOut: false, emailOptedOut: false },
    hC: { id: "hC", name: "Cal", archivedAt: null, smsOptedOut: false, whatsappOptedOut: false, emailOptedOut: false },
    hD: { id: "hD", name: "Dee", archivedAt: null, smsOptedOut: true, whatsappOptedOut: true, emailOptedOut: true }, // opted out of everything
    hE: { id: "hE", name: "Eve", archivedAt: null, smsOptedOut: false, whatsappOptedOut: false, emailOptedOut: false },
  };
  const marks = [{ dog_id: "E", kind: "excluded" as const, until: null }];

  const res = computeRetentionCandidates({
    intervals,
    dogs,
    humans,
    marks,
    recentContactByDog: {},
    today: TODAY,
    defaultBandDays: 70,
  });

  it("includes only non-excluded dogs, with a due status", () => {
    const ids = res.candidates.map((c) => c.dogId).sort();
    expect(ids).toEqual(["A", "B"]);
    expect(res.excludedCount).toBe(3); // C archived, D opted-out, E excluded-mark
  });

  it("uses the median interval when there are >= 3 visits, default band otherwise", () => {
    const a = res.candidates.find((c) => c.dogId === "A")!;
    expect(a.typicalIntervalDays).toBe(56);
    expect(a.status).toBe("overdue");
    expect(a.overdueDays).toBe(35); // 91 days since - 56 typical

    const bDog = res.candidates.find((c) => c.dogId === "B")!;
    expect(bDog.typicalIntervalDays).toBe(70); // default band (1 visit)
    expect(bDog.status).toBe("not-due");
  });

  it("uses the most recently created mark when a dog has several (order-independent)", () => {
    const iv = { F: { visitCount: 3, medianIntervalDays: 50, lastGroomedDate: "2026-04-10", lastService: "full-groom" } };
    const dogsF = { F: { id: "F", name: "Fen", size: "small", humanId: "hF", archivedAt: null } };
    const humansF = { hF: { id: "hF", name: "Fay", archivedAt: null, smsOptedOut: false, whatsappOptedOut: false, emailOptedOut: false } };
    // Old (expired) snooze, then a newer exclude — the exclude must win.
    const twoMarks = [
      { dog_id: "F", kind: "snoozed" as const, until: "2020-01-01", createdAt: "2026-06-01T00:00:00Z" },
      { dog_id: "F", kind: "excluded" as const, until: null, createdAt: "2026-06-20T00:00:00Z" },
    ];
    const base = { intervals: iv, dogs: dogsF, humans: humansF, today: TODAY, defaultBandDays: 70 };
    const forward = computeRetentionCandidates({ ...base, marks: twoMarks });
    const reversed = computeRetentionCandidates({ ...base, marks: [...twoMarks].reverse() });
    expect(forward.candidates.length).toBe(0); // excluded (newer) wins
    expect(reversed.candidates.length).toBe(0); // same regardless of row order
    expect(forward.excludedCount).toBe(1);
  });
});
