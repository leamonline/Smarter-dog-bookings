// The booking lifecycle itself: the canonical set, the progression, the two
// terminal exits, and the mappings the migration performs.
//
// This file is the one place that states the lifecycle as a whole. Everything
// else tests a surface that consumes it; this tests the contract those
// surfaces share, including the contract with the database — the migration's
// CHECK constraint and status conversions are asserted against the SQL text,
// so a migration edited to disagree with the application fails here rather
// than at 08:30 on a Monday.
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  ALL_BOOKING_STATUSES,
  BOOKING_STATUS,
  ACTIVE_STACK_STATUSES,
  STATUS_RANK,
  TERMINAL_STATUSES,
  isActiveBooking,
  isStackVisibleStatus,
  isTerminalStatus,
  nextStatus,
} from "../constants/index";

const MIGRATIONS = join(process.cwd(), "supabase", "migrations");
const migrationSql = (needle: string): string => {
  const file = readdirSync(MIGRATIONS).filter((f) => f.includes(needle)).sort().at(-1);
  expect(file, `no migration matching ${needle}`).toBeTruthy();
  return readFileSync(join(MIGRATIONS, file!), "utf8");
};

describe("the canonical seven", () => {
  it("is exactly these seven values, in lifecycle order", () => {
    expect(ALL_BOOKING_STATUSES).toEqual([
      "Booked",
      "Reconfirmed",
      "Arrived",
      "Ready for collection",
      "Completed",
      "Cancelled",
      "No-show",
    ]);
  });

  it("no longer contains the statuses this lifecycle replaced", () => {
    const values = ALL_BOOKING_STATUSES as readonly string[];
    expect(values).not.toContain("Checked in");
    expect(values).not.toContain("In bath");
    expect(values).not.toContain("Ready for pick-up");
  });

  it("is permitted in full by the constraint the database currently enforces", () => {
    // The database is the authority. If these disagree, a write the app
    // considers legal is rejected at the gate. The EXPAND migration is what is
    // live while this change deploys: it permits all seven canonical values
    // plus the three retired ones. The final, narrowed constraint arrives with
    // the contract migration, which ships separately — see
    // bookingLifecycleContract.test.ts.
    const sql = migrationSql("expand_booking_statuses");
    for (const status of ALL_BOOKING_STATUSES) {
      expect(sql, `constraint is missing ${status}`).toContain(`'${status}'`);
    }
    expect(sql).toMatch(/check\s*\(\s*status\s+in\s*\(/i);
  });
});

// The rollout is expand -> deploy -> contract, because the rename is not
// backward-compatible in either direction: whichever constraint is installed
// rejects the other frontend's writes. These assert the property that makes the
// middle step safe — that during the transition the database accepts both.
describe("the expand phase", () => {
  const expand = () => migrationSql("expand_booking_statuses");

  it("accepts BOTH vocabularies, so neither frontend is rejected mid-deploy", () => {
    const sql = expand();
    for (const status of ALL_BOOKING_STATUSES) {
      expect(sql, `expand must permit ${status}`).toContain(`'${status}'`);
    }
    for (const retired of ["Checked in", "In bath", "Ready for pick-up"]) {
      expect(sql, `expand must still permit ${retired}`).toContain(`'${retired}'`);
    }
  });

  it("does NOT convert any row — that is the contract phase's job", () => {
    // Converting during expand would put values on screen that the deployed
    // frontend cannot render. The point of this phase is that nothing visible
    // changes.
    expect(expand()).not.toMatch(/update\s+public\.bookings\s+set\s+status/i);
  });

  it("keeps ranking the retired words, so arrivals are still stamped", () => {
    // If the ranking switched to the new vocabulary while the old frontend was
    // live, 'Checked in' would resolve to NULL, the function would return
    // early, and checking a dog in would silently stop recording
    // checked_in_at.
    const sql = expand();
    expect(sql).toMatch(/when\s+'Checked in'\s+then\s+2/i);
    expect(sql).toMatch(/when\s+'In bath'\s+then\s+2/i);
    expect(sql).toMatch(/when\s+'Ready for pick-up'\s+then\s+3/i);
  });

  it("says in the file itself which phase comes next and when", () => {
    // The contract migration is not in this pull request — it cannot be, since
    // it must not run until this frontend is live. The expand migration is
    // therefore the only place a reader of this repository at this commit will
    // find the rest of the plan, so it has to carry it.
    const sql = expand();
    expect(sql).toMatch(/CONTRACT \(20260919120000\)/);
    expect(sql).toMatch(/20260919120000 once the new frontend is live/);
  });
});

describe("the progression", () => {
  it("ranks the five active steps and no others", () => {
    expect(STATUS_RANK[BOOKING_STATUS.BOOKED]).toBe(0);
    expect(STATUS_RANK[BOOKING_STATUS.RECONFIRMED]).toBe(1);
    expect(STATUS_RANK[BOOKING_STATUS.ARRIVED]).toBe(2);
    expect(STATUS_RANK[BOOKING_STATUS.READY_FOR_COLLECTION]).toBe(3);
    expect(STATUS_RANK[BOOKING_STATUS.COMPLETED]).toBe(4);
    // Terminal statuses are exits, not steps.
    expect(STATUS_RANK[BOOKING_STATUS.CANCELLED]).toBeUndefined();
    expect(STATUS_RANK[BOOKING_STATUS.NO_SHOW]).toBeUndefined();
  });

  it("walks Booked → Reconfirmed → Arrived → Ready → Completed and stops", () => {
    expect(nextStatus(BOOKING_STATUS.BOOKED)).toBe(BOOKING_STATUS.RECONFIRMED);
    expect(nextStatus(BOOKING_STATUS.RECONFIRMED)).toBe(BOOKING_STATUS.ARRIVED);
    expect(nextStatus(BOOKING_STATUS.ARRIVED)).toBe(BOOKING_STATUS.READY_FOR_COLLECTION);
    expect(nextStatus(BOOKING_STATUS.READY_FOR_COLLECTION)).toBe(BOOKING_STATUS.COMPLETED);
    expect(nextStatus(BOOKING_STATUS.COMPLETED)).toBeNull();
  });

  it("offers no next step out of a terminal status", () => {
    expect(nextStatus(BOOKING_STATUS.CANCELLED)).toBeNull();
    expect(nextStatus(BOOKING_STATUS.NO_SHOW)).toBeNull();
    expect(nextStatus("Awaiting deposit")).toBeNull();
    expect(nextStatus(null)).toBeNull();
  });

  it("agrees with the trigger's ranking in the database", () => {
    // Asserted against the expand migration, which is the trigger definition
    // that is live while this frontend runs. It ranks the canonical values at
    // these positions and additionally maps each retired word onto its
    // successor's position; the contract migration later drops the retired
    // rankings without moving any of these.
    const sql = migrationSql("expand_booking_statuses");
    for (const [status, rank] of Object.entries(STATUS_RANK)) {
      expect(sql).toMatch(new RegExp(`when\\s+'${status}'\\s+then\\s+${rank}`, "i"));
    }
  });
});

describe("the two terminal exits", () => {
  it("is Cancelled and No-show, and nothing else", () => {
    expect(TERMINAL_STATUSES).toEqual(["Cancelled", "No-show"]);
  });

  it.each(TERMINAL_STATUSES)("%s does not occupy its seat", (status) => {
    // The whole risk of making No-show a status of its own. Before the split a
    // no-show WAS a Cancelled row, so every capacity rule already treated it
    // as free. If this ever flips, no-shows start consuming capacity and
    // blocking real bookings.
    expect(isActiveBooking(status)).toBe(false);
    expect(isTerminalStatus(status)).toBe(true);
  });

  it.each(ACTIVE_STACK_STATUSES)("%s does occupy its seat", (status) => {
    expect(isActiveBooking(status)).toBe(true);
    expect(isTerminalStatus(status)).toBe(false);
  });

  it("treats Completed as occupying — it happened, it is not an early exit", () => {
    expect(isActiveBooking(BOOKING_STATUS.COMPLETED)).toBe(true);
  });

  it("treats an absent status as active, matching the database default", () => {
    expect(isActiveBooking(null)).toBe(true);
    expect(isActiveBooking(undefined)).toBe(true);
  });

  it("is mirrored by booking_occupies_seat() in SQL", () => {
    const sql = migrationSql("no_show_frees_its_seat");
    expect(sql).toMatch(/create\s+or\s+replace\s+function\s+public\.booking_occupies_seat/i);
    expect(sql).toMatch(/'Cancelled'/);
    expect(sql).toMatch(/'No-show'/);
    // And the occupancy readers must all go through it, or one of them will
    // quietly keep counting no-shows.
    for (const fn of ["get_seats_used", "get_slot_occupancy", "has_large_dog", "get_occupancy_range"]) {
      expect(sql, `${fn} must use the shared predicate`).toMatch(
        new RegExp(`function public\\.${fn}[\\s\\S]*?booking_occupies_seat`, "i"),
      );
    }
  });
});

describe("the active stack", () => {
  it("shows exactly the four statuses that are still work", () => {
    expect(ACTIVE_STACK_STATUSES).toEqual([
      "Booked",
      "Reconfirmed",
      "Arrived",
      "Ready for collection",
    ]);
  });

  it.each([
    [BOOKING_STATUS.COMPLETED, "it has gone home — the summary has it"],
    [BOOKING_STATUS.CANCELLED, "it is not happening"],
    [BOOKING_STATUS.NO_SHOW, "it did not happen"],
  ] as Array<[string, string]>)("excludes %s, because %s", (status, _why) => {
    expect(isStackVisibleStatus(status)).toBe(false);
  });

  it("fails closed on a status it has not been taught", () => {
    expect(isStackVisibleStatus("Awaiting deposit")).toBe(false);
    expect(isStackVisibleStatus(null)).toBe(false);
  });
});

describe("the seat-freeing indexes", () => {
  it("rebuilds both unique indexes so a no-show frees its slot", () => {
    // Otherwise rebooking a dog that no-showed into the same slot raises a
    // unique violation. These live in the EXPAND migration: no row carries
    // 'No-show' until the contract phase, so installing them early behaves
    // exactly as the indexes they replace and keeps the contract step short.
    const text = migrationSql("expand_booking_statuses");
    for (const index of ["bookings_one_active_per_dog_slot", "bookings_no_duplicate_dog_per_slot"]) {
      expect(text).toMatch(new RegExp(`create unique index ${index}[\\s\\S]*?'No-show'`, "i"));
    }
  });
});
