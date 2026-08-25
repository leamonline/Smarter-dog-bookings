import { describe, expect, it } from "vitest";
import { BOOKING_STATUS } from "../constants/index";
import { buildDailyBriefBoard } from "./dailyBrief";
import type { Booking } from "../types/index";
import {
  ACTIVE_BOARD_ZONES,
  buildAttentionSummary,
  buildBoardTokens,
  buildZoneCounts,
  canDragToken,
  dropZoneFor,
  moveForDrag,
  reverseStatusFor,
  tokenActions,
  zoneForStatus,
  type BoardToken,
} from "./salonBoard";

// 2026-07-14 is a Tuesday. 10:00 London = 09:00Z (BST).
const NOW = new Date("2026-07-14T09:00:00Z");
const TODAY = "2026-07-14";

function booking(overrides: Partial<Booking> & { id: string }): Booking {
  return {
    dogName: "Dog",
    breed: "Cockapoo",
    size: "small",
    service: "full-groom",
    owner: "An Owner",
    status: BOOKING_STATUS.BOOKED,
    slot: "10:30",
    addons: [],
    pickupBy: "",
    payment: "Due at Pick-up",
    confirmed: false,
    dogNameSnapshot: null,
    breedSnapshot: null,
    ownerNameSnapshot: null,
    whatsappConversationId: null,
    whatsappMessageId: null,
    staffCapacityOverride: false,
    staffCapacityOverrideBy: null,
    staffCapacityOverrideAt: null,
    _dogId: `dog-${overrides.id}`,
    _ownerId: `owner-${overrides.id}`,
    _pickupById: null,
    _bookingDate: TODAY,
    _groupId: null,
    ...overrides,
  } as Booking;
}

function tokensFor(bookings: Booking[], options: { isToday?: boolean; flagged?: string[] } = {}) {
  const board = buildDailyBriefBoard(bookings, TODAY, NOW);
  return buildBoardTokens({
    board,
    now: NOW,
    isToday: options.isToday ?? true,
    flaggedBookingIds: new Set(options.flagged ?? []),
  });
}

const names = (list: BoardToken[]) => list.map((token) => token.booking.dogName);

describe("zone mapping", () => {
  it("puts each booking status in the zone that says where the dog physically is", () => {
    expect(zoneForStatus(BOOKING_STATUS.BOOKED)).toBe("due");
    expect(zoneForStatus(BOOKING_STATUS.CHECKED_IN)).toBe("withUs");
    expect(zoneForStatus(BOOKING_STATUS.IN_BATH)).toBe("withUs");
    expect(zoneForStatus(BOOKING_STATUS.READY_FOR_PICKUP)).toBe("ready");
    expect(zoneForStatus(BOOKING_STATUS.COMPLETED)).toBe("home");
  });

  it("gives a cancelled or unknown status no zone at all — it never lands on the board", () => {
    expect(zoneForStatus(BOOKING_STATUS.CANCELLED)).toBeNull();
    expect(zoneForStatus("Rescheduled")).toBeNull();
    expect(zoneForStatus(null)).toBeNull();
  });

  it("routes a day's bookings into the four zones", () => {
    const tokens = tokensFor([
      booking({ id: "a", dogName: "Oscar", status: BOOKING_STATUS.BOOKED }),
      booking({ id: "b", dogName: "Milo", status: BOOKING_STATUS.CHECKED_IN, checkedInAt: "2026-07-14T08:30:00Z" }),
      booking({ id: "c", dogName: "Poppy", status: BOOKING_STATUS.IN_BATH, checkedInAt: "2026-07-14T08:00:00Z" }),
      booking({ id: "d", dogName: "Teddy", status: BOOKING_STATUS.READY_FOR_PICKUP, readyAt: "2026-07-14T08:45:00Z" }),
      booking({ id: "e", dogName: "Daisy", status: BOOKING_STATUS.COMPLETED, completedAt: "2026-07-14T08:10:00Z" }),
      booking({ id: "f", dogName: "Gone", status: BOOKING_STATUS.CANCELLED }),
    ]);

    expect(names(tokens.due)).toEqual(["Oscar"]);
    expect(names(tokens.withUs)).toEqual(["Poppy", "Milo"]);
    expect(names(tokens.ready)).toEqual(["Teddy"]);
    expect(names(tokens.home)).toEqual(["Daisy"]);
  });
});

describe("priority gravity", () => {
  it("Arriving: late dogs first, most overdue leading, then the soonest slot", () => {
    const tokens = tokensFor([
      booking({ id: "a", dogName: "Later", slot: "12:00" }),
      booking({ id: "b", dogName: "Soon", slot: "10:30" }),
      booking({ id: "c", dogName: "Late", slot: "09:30" }),
      booking({ id: "d", dogName: "Latest", slot: "08:30" }),
    ]);
    expect(names(tokens.due)).toEqual(["Latest", "Late", "Soon", "Later"]);
  });

  it("Ready: the longest wait leads, and an unknown ready time surfaces first rather than hiding", () => {
    const tokens = tokensFor([
      booking({ id: "a", dogName: "Fresh", status: BOOKING_STATUS.READY_FOR_PICKUP, readyAt: "2026-07-14T08:58:00Z" }),
      booking({ id: "b", dogName: "Waiting", status: BOOKING_STATUS.READY_FOR_PICKUP, readyAt: "2026-07-14T08:00:00Z" }),
      booking({ id: "c", dogName: "Unstamped", status: BOOKING_STATUS.READY_FOR_PICKUP, readyAt: null }),
    ]);
    expect(names(tokens.ready)).toEqual(["Unstamped", "Waiting", "Fresh"]);
  });

  it("With us: longest on site first; a dog with no check-in stamp has no claim and sorts last", () => {
    const tokens = tokensFor([
      booking({ id: "a", dogName: "Recent", status: BOOKING_STATUS.CHECKED_IN, checkedInAt: "2026-07-14T08:50:00Z" }),
      booking({ id: "b", dogName: "Longest", status: BOOKING_STATUS.IN_BATH, checkedInAt: "2026-07-14T06:00:00Z" }),
      booking({ id: "c", dogName: "Unstamped", status: BOOKING_STATUS.CHECKED_IN, checkedInAt: null }),
    ]);
    expect(names(tokens.withUs)).toEqual(["Longest", "Recent", "Unstamped"]);
  });

  it("Gone home: most recently collected first", () => {
    const tokens = tokensFor([
      booking({ id: "a", dogName: "Earlier", status: BOOKING_STATUS.COMPLETED, completedAt: "2026-07-14T07:00:00Z" }),
      booking({ id: "b", dogName: "Latest", status: BOOKING_STATUS.COMPLETED, completedAt: "2026-07-14T08:40:00Z" }),
    ]);
    expect(names(tokens.home)).toEqual(["Latest", "Earlier"]);
  });

  it("is a total order — identical bookings keep a stable, repeatable position", () => {
    const twins = [
      booking({ id: "b-2", dogName: "Twin B", slot: "11:00" }),
      booking({ id: "b-1", dogName: "Twin A", slot: "11:00" }),
    ];
    expect(names(tokensFor(twins).due)).toEqual(names(tokensFor(twins).due));
  });
});

describe("visual tiers", () => {
  it("marks a late arrival urgent and a calm future arrival calm", () => {
    const tokens = tokensFor([
      booking({ id: "a", dogName: "Late", slot: "08:30" }),
      booking({ id: "b", dogName: "Calm", slot: "12:30" }),
    ]);
    expect(tokens.due.find((t) => t.booking.dogName === "Late")?.tier).toBe("urgent");
    expect(tokens.due.find((t) => t.booking.dogName === "Calm")?.tier).toBe("calm");
  });

  it("warms up an arrival that is nearly due, without calling it urgent", () => {
    const tokens = tokensFor([booking({ id: "a", slot: "10:10" })]);
    expect(tokens.due[0].tier).toBe("watch");
  });

  it("escalates a collection wait: calm, then watch at 15 minutes, then urgent at an hour", () => {
    const at = (minutesAgo: number) => new Date(NOW.getTime() - minutesAgo * 60_000).toISOString();
    const tokens = tokensFor([
      booking({ id: "a", dogName: "Fresh", status: BOOKING_STATUS.READY_FOR_PICKUP, readyAt: at(4), payment: "Paid in Full" }),
      booking({ id: "b", dogName: "Chasing", status: BOOKING_STATUS.READY_FOR_PICKUP, readyAt: at(20), payment: "Paid in Full" }),
      booking({ id: "c", dogName: "Too long", status: BOOKING_STATUS.READY_FOR_PICKUP, readyAt: at(75), payment: "Paid in Full" }),
    ]);
    const tier = (name: string) => tokens.ready.find((t) => t.booking.dogName === name)?.tier;
    expect(tier("Fresh")).toBe("calm");
    expect(tier("Chasing")).toBe("watch");
    expect(tier("Too long")).toBe("urgent");
  });

  it("warms a freshly-ready dog that still owes — the money is what blocks the handover", () => {
    const at = (minutesAgo: number) => new Date(NOW.getTime() - minutesAgo * 60_000).toISOString();
    const tokens = tokensFor([
      booking({ id: "a", status: BOOKING_STATUS.READY_FOR_PICKUP, readyAt: at(4), payment: "Due at Pick-up" }),
    ]);
    expect(tokens.ready[0].tier).toBe("watch");
  });

  it("keeps a mid-groom dog calm even when it still owes money", () => {
    const tokens = tokensFor([
      booking({
        id: "a",
        status: BOOKING_STATUS.IN_BATH,
        checkedInAt: "2026-07-14T08:50:00Z",
        payment: "Due at Pick-up",
      }),
    ]);
    expect(tokens.withUs[0].tier).toBe("calm");
  });

  it("moves a welfare-flagged dog up its zone without also lighting a ring", () => {
    // The token already carries a coral safety mark and the note itself; a
    // third signal for the same fact would make "watch" mean two things.
    const tokens = tokensFor(
      [
        booking({ id: "a", dogName: "Longest", status: BOOKING_STATUS.IN_BATH, checkedInAt: "2026-07-14T06:00:00Z" }),
        booking({ id: "b", dogName: "Flagged", status: BOOKING_STATUS.CHECKED_IN, checkedInAt: "2026-07-14T08:50:00Z" }),
      ],
      { flagged: ["b"] },
    );
    expect(names(tokens.withUs)).toEqual(["Flagged", "Longest"]);
    expect(tokens.withUs[0].tier).toBe("calm");
  });

  it("keeps a browsed date calm — nothing on it is happening now", () => {
    const board = buildDailyBriefBoard(
      [
        booking({ id: "a", slot: "08:00", _bookingDate: "2026-07-21" }),
        booking({ id: "b", status: BOOKING_STATUS.READY_FOR_PICKUP, readyAt: null, _bookingDate: "2026-07-21" }),
      ],
      "2026-07-21",
      NOW,
    );
    const tokens = buildBoardTokens({ board, now: NOW, isToday: false });
    expect(tokens.due[0].tier).toBe("calm");
    expect(tokens.ready[0].tier).toBe("calm");
  });

  it("still flags money left owing on a browsed date — that is true on any day", () => {
    const board = buildDailyBriefBoard(
      [booking({
        id: "a",
        status: BOOKING_STATUS.COMPLETED,
        completedAt: "2026-07-21T12:00:00Z",
        payment: "Due at Pick-up",
        _bookingDate: "2026-07-21",
      })],
      "2026-07-21",
      NOW,
    );
    expect(buildBoardTokens({ board, now: NOW, isToday: false }).home[0].tier).toBe("urgent");
  });

  it("treats a collected dog that still owes money as urgent — money can still walk out", () => {
    const tokens = tokensFor([
      booking({
        id: "a",
        status: BOOKING_STATUS.COMPLETED,
        completedAt: "2026-07-14T08:00:00Z",
        payment: "Due at Pick-up",
      }),
    ]);
    expect(tokens.home[0].tier).toBe("urgent");
  });
});

describe("token text", () => {
  it("shows the appointment time while arriving and the elapsed time once here", () => {
    const tokens = tokensFor([
      booking({ id: "a", slot: "11:00" }),
      booking({ id: "b", status: BOOKING_STATUS.CHECKED_IN, checkedInAt: "2026-07-14T08:30:00Z" }),
      booking({ id: "c", status: BOOKING_STATUS.READY_FOR_PICKUP, readyAt: "2026-07-14T08:42:00Z" }),
    ]);
    expect(tokens.due[0].meta).toBe("11:00");
    expect(tokens.withUs[0].meta).toBe("30 min");
    expect(tokens.ready[0].meta).toBe("18 min");
  });

  it("says how late a dog is instead of when it was due", () => {
    const tokens = tokensFor([booking({ id: "a", slot: "09:30" })]);
    expect(tokens.due[0].meta).toBe("30 min late");
  });

  it("never repeats the zone's own word on the token, but does spell it out for a screen reader", () => {
    const tokens = tokensFor([
      booking({ id: "a", status: BOOKING_STATUS.READY_FOR_PICKUP, readyAt: "2026-07-14T08:42:00Z" }),
    ]);
    expect(tokens.ready[0].meta).not.toMatch(/ready/i);
    expect(tokens.ready[0].statusText).toBe("Ready, waiting 18 min");
  });

  it("fabricates no live timing on a browsed non-today date", () => {
    const board = buildDailyBriefBoard(
      [booking({ id: "a", slot: "09:30", _bookingDate: "2026-07-21" })],
      "2026-07-21",
      NOW,
    );
    const tokens = buildBoardTokens({ board, now: NOW, isToday: false });
    expect(tokens.due[0].meta).toBe("09:30");
    expect(tokens.due[0].statusText).toBe("Arriving 09:30");
    expect(tokens.due[0].tier).toBe("calm");
  });
});

describe("needs attention", () => {
  it("reassures when nothing is outstanding today", () => {
    const summary = buildAttentionSummary(tokensFor([booking({ id: "a", slot: "12:00" })]), true);
    expect(summary).toMatchObject({ count: 0, headline: "Everything's on track", ids: [] });
  });

  it("counts the dogs, not the reasons — one dog late AND unconfirmed is one thing", () => {
    const tokens = tokensFor([
      booking({ id: "a", slot: "08:30", reminderState: "sent", confirmationChannel: "whatsapp" }),
    ]);
    const summary = buildAttentionSummary(tokens, true);
    expect(summary.count).toBe(1);
    expect(summary.headline).toBe("1 thing needs you");
    expect(summary.ids).toEqual(["a"]);
  });

  it("pluralises and lists every id needing attention", () => {
    const tokens = tokensFor([
      booking({ id: "a", slot: "08:30" }),
      booking({ id: "b", slot: "09:00" }),
      booking({ id: "c", slot: "12:00" }),
    ]);
    const summary = buildAttentionSummary(tokens, true);
    expect(summary.headline).toBe("2 things need you");
    expect(summary.ids.sort()).toEqual(["a", "b"]);
  });

  it("does not claim a browsed date is on track — nothing on it is happening now", () => {
    const summary = buildAttentionSummary(tokensFor([booking({ id: "a", slot: "12:00" })]), false);
    expect(summary.headline).toBe("Nothing outstanding");
  });

  it("shapes the day for the header, naming only the zones that hold dogs", () => {
    const counts = buildZoneCounts(tokensFor([
      booking({ id: "a", slot: "12:00" }),
      booking({ id: "b", status: BOOKING_STATUS.CHECKED_IN, checkedInAt: "2026-07-14T08:50:00Z" }),
    ]));
    expect(counts).toEqual([
      { zone: "due", label: "arriving", count: 1 },
      { zone: "withUs", label: "with us", count: 1 },
      { zone: "ready", label: "ready", count: 0 },
    ]);
    expect(ACTIVE_BOARD_ZONES).toEqual(["due", "withUs", "ready"]);
  });
});

describe("actions available by state", () => {
  const actionIds = (token: BoardToken, context = {}) => tokenActions(token, context).map((a) => a.id);

  it("offers Check in — and nothing further along — to an arriving dog", () => {
    const [token] = tokensFor([booking({ id: "a", slot: "12:00" })]).due;
    const ids = actionIds(token);
    expect(ids).toContain("checkIn");
    expect(ids).not.toContain("startGroom");
    expect(ids).not.toContain("collected");
  });

  it("offers Start groom to a checked-in dog and Ready to one in the bath", () => {
    const tokens = tokensFor([
      booking({ id: "a", status: BOOKING_STATUS.CHECKED_IN, checkedInAt: "2026-07-14T08:50:00Z" }),
      booking({ id: "b", status: BOOKING_STATUS.IN_BATH, checkedInAt: "2026-07-14T08:40:00Z" }),
    ]);
    const checkedIn = tokens.withUs.find((t) => t.booking.id === "a")!;
    const inBath = tokens.withUs.find((t) => t.booking.id === "b")!;
    expect(actionIds(checkedIn)).toContain("startGroom");
    expect(actionIds(checkedIn)).not.toContain("ready");
    expect(actionIds(inBath)).toContain("ready");
    expect(actionIds(inBath)).not.toContain("startGroom");
  });

  it("never offers Mark collected to a dog that has already gone home", () => {
    const [token] = tokensFor([
      booking({ id: "a", status: BOOKING_STATUS.COMPLETED, completedAt: "2026-07-14T08:00:00Z" }),
    ]).home;
    expect(actionIds(token)).not.toContain("collected");
  });

  it("promotes taking the money on a Ready dog that owes, keeping Mark collected beside it", () => {
    const [token] = tokensFor([
      booking({ id: "a", status: BOOKING_STATUS.READY_FOR_PICKUP, readyAt: "2026-07-14T08:40:00Z" }),
    ]).ready;
    const actions = tokenActions(token, { amountDue: 52 });
    expect(actions[0]).toMatchObject({ id: "payment", label: "Take £52 payment", kind: "primary" });
    expect(actions[1]).toMatchObject({ id: "collected", kind: "default" });
  });

  it("makes Mark collected the primary once a Ready dog has paid", () => {
    const [token] = tokensFor([
      booking({ id: "a", status: BOOKING_STATUS.READY_FOR_PICKUP, readyAt: "2026-07-14T08:40:00Z", payment: "Paid in Full" }),
    ]).ready;
    const actions = tokenActions(token, { amountDue: 0, paid: true });
    expect(actions[0]).toMatchObject({ id: "collected", kind: "primary" });
  });

  it("offers Confirm only while a booking is genuinely unconfirmed", () => {
    const unconfirmed = tokensFor([
      booking({ id: "a", slot: "12:00", reminderState: "sent", confirmationChannel: "whatsapp" }),
    ]).due[0];
    const quiet = tokensFor([booking({ id: "b", slot: "12:00" })]).due[0];
    expect(actionIds(unconfirmed)).toContain("confirm");
    expect(actionIds(quiet)).not.toContain("confirm");
  });

  it("offers Unconfirm only for a staff-recorded confirmation — a customer's word is never removable", () => {
    const staff = tokensFor([
      booking({ id: "a", slot: "12:00", reminderConfirmedAt: "2026-07-14T07:00:00Z", reminderConfirmedBy: "staff" }),
    ]).due[0];
    const customer = tokensFor([
      booking({ id: "b", slot: "12:00", reminderConfirmedAt: "2026-07-14T07:00:00Z", reminderConfirmedBy: "customer" }),
    ]).due[0];
    expect(actionIds(staff)).toContain("unconfirm");
    expect(actionIds(customer)).not.toContain("unconfirm");
  });

  it("offers Call only when there is a number to call, and Didn't show only before arrival", () => {
    const arriving = tokensFor([booking({ id: "a", slot: "12:00" })]).due[0];
    const inSalon = tokensFor([
      booking({ id: "b", status: BOOKING_STATUS.CHECKED_IN, checkedInAt: "2026-07-14T08:50:00Z" }),
    ]).withUs[0];
    expect(actionIds(arriving)).not.toContain("call");
    expect(actionIds(arriving, { telHref: "tel:07700900000" })).toContain("call");
    expect(actionIds(arriving)).toContain("didntShow");
    expect(actionIds(inSalon)).not.toContain("didntShow");
  });

  it("drops the file shortcuts a booking cannot open", () => {
    const [token] = tokensFor([booking({ id: "a", slot: "12:00" })]).due;
    const ids = actionIds(token, { hasDog: false, hasOwner: false });
    expect(ids).not.toContain("dogFile");
    expect(ids).not.toContain("humanFile");
    expect(ids).not.toContain("message");
    expect(ids).toContain("booking");
  });
});

describe("drag legality", () => {
  it("allows exactly one forward step per zone, and names the action it performs", () => {
    expect(moveForDrag("due", "withUs")).toMatchObject({ action: "checkIn" });
    expect(moveForDrag("withUs", "ready")).toMatchObject({ action: "ready" });
    expect(moveForDrag("ready", "home")).toMatchObject({ action: "collected" });
  });

  it("refuses to skip a zone — a skipped care step is a decision, not a flick of the wrist", () => {
    expect(moveForDrag("due", "ready")).toBeNull();
    expect(moveForDrag("due", "home")).toBeNull();
    expect(moveForDrag("withUs", "home")).toBeNull();
  });

  it("refuses to go backwards — a correction belongs in the menu where it can be read", () => {
    expect(moveForDrag("withUs", "due")).toBeNull();
    expect(moveForDrag("ready", "withUs")).toBeNull();
    expect(moveForDrag("home", "ready")).toBeNull();
  });

  it("refuses a drop onto the zone the dog is already in", () => {
    expect(moveForDrag("ready", "ready")).toBeNull();
  });

  it("does not let a dog that has gone home be dragged at all", () => {
    const [home] = tokensFor([
      booking({ id: "a", status: BOOKING_STATUS.COMPLETED, completedAt: "2026-07-14T08:00:00Z" }),
    ]).home;
    const [due] = tokensFor([booking({ id: "b", slot: "12:00" })]).due;
    expect(canDragToken(home)).toBe(false);
    expect(dropZoneFor(home)).toBeNull();
    expect(canDragToken(due)).toBe(true);
    expect(dropZoneFor(due)).toBe("withUs");
  });
});

describe("undo", () => {
  it("knows the status each ordinary workflow move came from", () => {
    expect(reverseStatusFor("checkIn", BOOKING_STATUS.BOOKED)).toBe(BOOKING_STATUS.BOOKED);
    expect(reverseStatusFor("startGroom", BOOKING_STATUS.CHECKED_IN)).toBe(BOOKING_STATUS.CHECKED_IN);
    expect(reverseStatusFor("ready", BOOKING_STATUS.IN_BATH)).toBe(BOOKING_STATUS.IN_BATH);
    expect(reverseStatusFor("ready", BOOKING_STATUS.CHECKED_IN)).toBe(BOOKING_STATUS.CHECKED_IN);
    expect(reverseStatusFor("collected", BOOKING_STATUS.READY_FOR_PICKUP)).toBe(BOOKING_STATUS.READY_FOR_PICKUP);
  });

  it("offers no undo for a cancellation — that is confirmed, not quietly reversed", () => {
    expect(reverseStatusFor("didntShow", BOOKING_STATUS.BOOKED)).toBeNull();
    expect(reverseStatusFor("payment", BOOKING_STATUS.COMPLETED)).toBeNull();
  });

  it("offers no undo when the dog was not where the move claims it came from", () => {
    expect(reverseStatusFor("collected", BOOKING_STATUS.BOOKED)).toBeNull();
    expect(reverseStatusFor("checkIn", null)).toBeNull();
  });
});

describe("a busy day", () => {
  it("ranks twenty dogs across the zones without losing one", () => {
    const many: Booking[] = [];
    for (let index = 0; index < 22; index += 1) {
      const bucket = index % 4;
      many.push(booking({
        id: `b-${index}`,
        dogName: `Dog ${index}`,
        slot: `${String(8 + (index % 5)).padStart(2, "0")}:30`,
        status: bucket === 0
          ? BOOKING_STATUS.BOOKED
          : bucket === 1
            ? BOOKING_STATUS.CHECKED_IN
            : bucket === 2
              ? BOOKING_STATUS.READY_FOR_PICKUP
              : BOOKING_STATUS.COMPLETED,
        checkedInAt: "2026-07-14T08:00:00Z",
        readyAt: "2026-07-14T08:20:00Z",
        completedAt: "2026-07-14T08:40:00Z",
      }));
    }
    const tokens = tokensFor(many);
    const total = tokens.due.length + tokens.withUs.length + tokens.ready.length + tokens.home.length;
    expect(total).toBe(22);
  });

  it("returns an empty zone for every zone on an empty day, never a missing one", () => {
    const tokens = tokensFor([]);
    expect(tokens).toEqual({ due: [], withUs: [], ready: [], home: [] });
  });
});
