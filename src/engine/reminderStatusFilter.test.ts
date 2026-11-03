import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  BOOKING_STATUS,
  bookedOrNullStatusOr,
  keepingNullStatusOr,
  occupyingStatusOr,
} from "../constants/index";
import {
  bookedOrNullStatusOr as denoBookedOrNullStatusOr,
  keepingNullStatusOr as denoKeepingNullStatusOr,
  occupyingStatusOr as denoOccupyingStatusOr,
} from "../../supabase/functions/_shared/salonConstants.ts";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("keepingNullStatusOr", () => {
  it("keeps a NULL status and excludes only the statuses the caller names", () => {
    expect(keepingNullStatusOr([BOOKING_STATUS.CANCELLED, BOOKING_STATUS.COMPLETED])).toBe(
      'status.is.null,status.not.in.("Cancelled","Completed")',
    );
    expect(keepingNullStatusOr([BOOKING_STATUS.CANCELLED])).toBe(
      'status.is.null,status.not.in.("Cancelled")',
    );
    expect(
      denoKeepingNullStatusOr([BOOKING_STATUS.CANCELLED, BOOKING_STATUS.COMPLETED]),
    ).toBe(keepingNullStatusOr([BOOKING_STATUS.CANCELLED, BOOKING_STATUS.COMPLETED]));
    expect(denoKeepingNullStatusOr([BOOKING_STATUS.CANCELLED])).toBe(
      keepingNullStatusOr([BOOKING_STATUS.CANCELLED]),
    );
  });

  it("is the predicate occupyingStatusOr already uses for the two terminal statuses", () => {
    expect(occupyingStatusOr()).toBe(
      keepingNullStatusOr([BOOKING_STATUS.CANCELLED, BOOKING_STATUS.NO_SHOW]),
    );
    expect(denoOccupyingStatusOr()).toBe(occupyingStatusOr());
    expect(denoKeepingNullStatusOr([BOOKING_STATUS.CANCELLED, BOOKING_STATUS.NO_SHOW])).toBe(
      occupyingStatusOr(),
    );
  });
});

describe("bookedOrNullStatusOr", () => {
  it("matches Booked and a NULL status, which the database treats as Booked", () => {
    expect(bookedOrNullStatusOr()).toBe('status.eq."Booked",status.is.null');
    expect(denoBookedOrNullStatusOr()).toBe(bookedOrNullStatusOr());
  });
});

describe("reminder and collection-notice queries", () => {
  it("tomorrow's reminders still exclude Cancelled and Completed, and keep NULL", () => {
    const text = read("src/supabase/hooks/useTomorrowReminders.ts");
    expect(text).toContain(
      ".or(keepingNullStatusOr([BOOKING_STATUS.CANCELLED, BOOKING_STATUS.COMPLETED]))",
    );
    expect(text).not.toMatch(/\.not\(\s*"status"/);
  });

  it("the manual reminder gather excludes Cancelled and No-show, and keeps NULL", () => {
    const text = read("supabase/functions/reminder-send/index.ts");
    expect(text).toContain(".or(occupyingStatusOr())");
    expect(text).not.toMatch(/\.not\(\s*"status"/);
  });

  it("the nightly reminder matches Booked or NULL, and the staff gather excludes only the terminal statuses", () => {
    const text = read("supabase/functions/notify-booking-reminder/index.ts");
    expect(text).toContain(".or(occupyingStatusOr())");
    expect(text).toContain(".or(bookedOrNullStatusOr())");
    expect(text).not.toMatch(/\.not\(\s*"status"/);
    expect(text).not.toMatch(/\.eq\(\s*"status"/);
  });

  it("the collection-notice day read excludes only Cancelled, and keeps NULL", () => {
    const text = read("src/supabase/repositories/bookingsRepo.ts");
    expect(text).toContain(".or(keepingNullStatusOr([BOOKING_STATUS.CANCELLED]))");
    expect(text).not.toMatch(/\.neq\(\s*"status"/);
  });
});
