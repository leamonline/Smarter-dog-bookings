import { describe, expect, it } from "vitest";

import {
  buildRescheduleInitialState,
  groupUpcomingBookings,
  isInsideManageCutoff,
  joinNames,
  type ManageBookingRow,
  manageRowId,
  parseManageRowId,
  summariseVisit,
  visitStartInstant,
} from "../../../supabase/functions/_shared/manageBooking.ts";

const ROWS: ManageBookingRow[] = [
  { id: "b1", group_id: "g1", booking_date: "2026-06-24", slot: "08:30", service: "bath-and-deshed", dog_id: "d1", dog_name: "Alfie", size: "small" },
  { id: "b2", group_id: "g1", booking_date: "2026-06-24", slot: "08:30", service: "full-groom", dog_id: "d2", dog_name: "Tipi", size: "small" },
  { id: "b3", group_id: null, booking_date: "2026-07-01", slot: "10:00", service: "full-groom", dog_id: "d1", dog_name: "Alfie", size: "small" },
];

describe("groupUpcomingBookings", () => {
  it("groups multi-dog rows by group_id into one visit, soonest first", () => {
    const visits = groupUpcomingBookings(ROWS);
    expect(visits).toHaveLength(2);
    // soonest first (24 Jun before 1 Jul)
    expect(visits[0].date).toBe("2026-06-24");
    expect(visits[0].groupId).toBe("g1");
    expect(visits[0].bookingIds.sort()).toEqual(["b1", "b2"]);
    expect(visits[0].dogs.map((d) => d.name).sort()).toEqual(["Alfie", "Tipi"]);
    expect(visits[0].label).toContain("Alfie");
    expect(visits[0].label).toContain("Tipi");
  });

  it("treats a single booking without group_id as a visit of one (solo key)", () => {
    const visits = groupUpcomingBookings(ROWS);
    const solo = visits[1];
    expect(solo.groupId).toBeNull();
    expect(solo.key).toBe("solo:b3");
    expect(solo.bookingIds).toEqual(["b3"]);
    expect(solo.dogs).toEqual([{ id: "d1", name: "Alfie" }]);
  });

  it("returns [] for no rows", () => {
    expect(groupUpcomingBookings([])).toEqual([]);
  });
});

describe("isInsideManageCutoff (24h, blocked = inside)", () => {
  const now = new Date("2026-06-23T09:00:00.000Z");
  it("24h + 1 minute away is allowed (not inside)", () => {
    expect(isInsideManageCutoff(new Date(now.getTime() + 24 * 3600_000 + 60_000), now)).toBe(false);
  });
  it("exactly 24h away is allowed (not inside)", () => {
    expect(isInsideManageCutoff(new Date(now.getTime() + 24 * 3600_000), now)).toBe(false);
  });
  it("23h 59m away is blocked (inside)", () => {
    expect(isInsideManageCutoff(new Date(now.getTime() + 24 * 3600_000 - 60_000), now)).toBe(true);
  });
  it("already past is blocked (inside)", () => {
    expect(isInsideManageCutoff(new Date(now.getTime() - 3600_000), now)).toBe(true);
  });
});

describe("visitStartInstant (salon-local → UTC)", () => {
  it("summer (BST, UTC+1): 08:30 London is 07:30Z", () => {
    expect(visitStartInstant("2026-06-24", "08:30").toISOString()).toBe("2026-06-24T07:30:00.000Z");
  });
  it("winter (GMT, UTC+0): 09:00 London is 09:00Z", () => {
    expect(visitStartInstant("2026-01-14", "09:00").toISOString()).toBe("2026-01-14T09:00:00.000Z");
  });
});

describe("manage list-row id", () => {
  it("round-trips nonce + visit key", () => {
    const id = manageRowId("nonce-123", "g1");
    expect(id).toBe("manage:nonce-123:g1");
    expect(parseManageRowId(id)).toEqual({ nonce: "nonce-123", visitKey: "g1" });
  });
  it("handles a solo visit key containing a colon", () => {
    const id = manageRowId("abc", "solo:b3");
    expect(parseManageRowId(id)).toEqual({ nonce: "abc", visitKey: "solo:b3" });
  });
  it("rejects non-manage ids", () => {
    expect(parseManageRowId("bookentry:start")).toBeNull();
    expect(parseManageRowId("uuid:yes")).toBeNull();
    expect(parseManageRowId(null)).toBeNull();
  });
});

describe("buildRescheduleInitialState", () => {
  it("pins the same dogs + services and snapshots the old visit", () => {
    const visit = groupUpcomingBookings(ROWS)[0]; // the g1 group
    const state = buildRescheduleInitialState(visit, { d1: "small", d2: "small" });
    expect(state.flow_mode).toBe("reschedule");
    expect(state.dog_ids.sort()).toEqual(["d1", "d2"]);
    expect(state.reschedule_group_id).toBe("g1");
    expect(state.old_booking_ids.sort()).toEqual(["b1", "b2"]);
    expect(state.services).toEqual({ d1: "bath-and-deshed", d2: "full-groom" });
    expect(state.service_snapshot).toEqual({ d1: "bath-and-deshed", d2: "full-groom" });
    expect(state.dog_snapshot).toEqual(["d1", "d2"]);
    expect(state.dog_meta.d1).toEqual({ name: "Alfie", size: "small" });
  });
});

describe("summaries", () => {
  it("joins dog names naturally", () => {
    expect(joinNames(["Alfie"])).toBe("Alfie");
    expect(joinNames(["Alfie", "Tipi"])).toBe("Alfie & Tipi");
    expect(joinNames(["Alfie", "Tipi", "Bella"])).toBe("Alfie, Tipi & Bella");
  });
  it("summarises a visit", () => {
    const s = summariseVisit([{ id: "d1", name: "Alfie" }, { id: "d2", name: "Tipi" }], "2026-06-24", "09:30");
    expect(s).toBe("Alfie & Tipi's groom on Wed 24 Jun at 9:30");
  });
});
