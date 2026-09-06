import { describe, expect, it } from "vitest";
import { holidayCopy, isHolidayDate, londonDate, scheduleHolidayNotices } from "./holidayNotice";

const base = { id: "h1", notice_from: "2026-09-01", closed_from: "2026-09-14", reopens_on: "2026-09-22" };

describe("holiday notice scheduling", () => {
  it("uses the London calendar date across the BST midnight boundary", () => {
    expect(londonDate(new Date("2026-09-05T23:30:00Z"))).toBe("2026-09-06");
    expect(londonDate(new Date("2026-12-05T23:30:00Z"))).toBe("2026-12-05");
  });

  it("is hidden before the notice start, upcoming until closure, away until reopening, hidden from reopening", () => {
    expect(scheduleHolidayNotices([base], "2026-08-31")).toEqual([]);
    expect(scheduleHolidayNotices([base], "2026-09-01")[0].phase).toBe("upcoming");
    expect(scheduleHolidayNotices([base], "2026-09-13")[0].phase).toBe("upcoming");
    expect(scheduleHolidayNotices([base], "2026-09-14")[0].phase).toBe("away");
    expect(scheduleHolidayNotices([base], "2026-09-21")[0].phase).toBe("away");
    expect(scheduleHolidayNotices([base], "2026-09-22")).toEqual([]);
  });

  it("keeps several holidays independent", () => {
    const later = { ...base, id: "h2", notice_from: "2026-11-01", closed_from: "2026-12-24", reopens_on: "2027-01-04" };
    expect(scheduleHolidayNotices([base, later], "2026-09-15").map((n) => n.id)).toEqual(["h1"]);
    expect(scheduleHolidayNotices([base, later], "2026-12-01").map((n) => n.phase)).toEqual(["upcoming"]);
  });

  it("treats the reopening day as bookable and every closed day as a holiday date", () => {
    expect(isHolidayDate([base], "2026-09-13")).toBe(false);
    expect(isHolidayDate([base], "2026-09-14")).toBe(true);
    expect(isHolidayDate([base], "2026-09-21")).toBe(true);
    expect(isHolidayDate([base], "2026-09-22")).toBe(false);
  });

  it("writes the agreed public wording for each phase", () => {
    expect(holidayCopy({ ...base, phase: "upcoming" })).toEqual({
      title: "Upcoming holiday",
      text: "We’ll be closed from Monday, 14 September 2026. We reopen on Tuesday, 22 September 2026. Online booking is still open — book your dog’s next groom for when we’re back.",
    });
    expect(holidayCopy({ ...base, phase: "away" }).title).toBe("We’re taking a little break");
    expect(holidayCopy({ ...base, phase: "away" }).text).not.toContain("closed from");
  });
});
