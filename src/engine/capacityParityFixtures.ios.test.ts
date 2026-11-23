// The iPhone app's capacity engine (ios/SmarterDog/CapacityEngine.swift) is the fourth
// copy of the capacity rules. This is the guard that stops it drifting from the
// browser engine, which is the reference.
//
// It turns the one governed scenario list (capacityParityFixtures.ts) into
// ios/AuthCoreTests/capacity-parity.json, together with the answers the REAL website
// engine gives: the verdict for every single scenario, and the slots the website
// would offer one dog of each size on every scenario's day. The Swift tests run the
// Swift engine against that file. This test fails if the file is out of date, so a
// capacity rule cannot change here without the Swift side being re-measured.
//
// To refresh the file after a deliberate rule change:
//   UPDATE_IOS_CAPACITY_FIXTURES=1 npx vitest run src/engine/capacityParityFixtures.ios.test.ts
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { DAILY_DOG_CAP, LARGE_DOG_SLOTS, SALON_SLOTS } from "../constants/salon";
import { canBookSlot, findGroupedSlots } from "./capacity";
import { CAPACITY_PARITY_FIXTURES, capFor, type CapacityParityFixture } from "./capacityParityFixtures";
import { buildSlotGrid } from "./slotGrid";

const root = join(__dirname, "..", "..");
const JSON_PATH = join(root, "ios/AuthCoreTests/capacity-parity.json");
const SIZES = ["small", "medium", "large"] as const;

function existingBookings(fixture: CapacityParityFixture) {
  return fixture.existing.map((b, i) => ({
    id: `existing-${i}`,
    dog_id: `existing-dog-${i}`,
    slot: b.slot,
    size: b.size,
  })) as never[];
}

function scenarioFor(fixture: CapacityParityFixture) {
  const activeSlots = buildSlotGrid(fixture.extraSlots ?? []);
  const existing = existingBookings(fixture);
  const overrides = fixture.overrides ?? {};
  const offers: Record<string, string[]> = {};
  for (const size of SIZES) {
    offers[size] = findGroupedSlots([{ id: "one-dog", size }], existing, activeSlots, capFor(fixture), overrides).map(
      (allocation) => allocation.dropOffTime,
    );
  }
  const base = {
    id: fixture.id,
    kind: fixture.kind,
    rule: fixture.rule,
    activeSlots,
    dailyCap: capFor(fixture),
    existing: fixture.existing,
    overrides,
    offers,
  };
  if (fixture.kind === "single") {
    const verdict = canBookSlot(existing, fixture.candidate.slot, fixture.candidate.size, activeSlots, {
      overrides: overrides[fixture.candidate.slot],
    });
    return {
      ...base,
      candidate: fixture.candidate,
      verdict: {
        allowed: verdict.allowed,
        reason: verdict.reason ?? null,
        needsApproval: verdict.needsApproval ?? false,
      },
    };
  }
  return { ...base, dogs: fixture.dogs };
}

// The governed list asks about the daily cap only with pairs of dogs, so the edge for ONE
// dog (the iPhone's first version) is never tested by it. These three add that edge. They
// are not in the governed list because that list is also encoded as pgTAP assertions that
// need the database to regenerate; they only combine rules the list already covers, and
// their answers are still measured from the real website engine like every other one.
const IOS_ONE_DOG_CAP_EDGES: CapacityParityFixture[] = [
  { cap: 4, id: "ios-one-dog-takes-the-last-place", description: "one dog when exactly one place is left under the cap" },
  { cap: 3, id: "ios-one-dog-at-the-cap", description: "one dog when the day is already at the cap" },
  { cap: 2, id: "ios-one-dog-above-the-cap", description: "one dog when the day is already over the cap" },
].map(({ cap, id, description }) => ({
  kind: "group" as const,
  id,
  rule: "daily-cap" as const,
  description,
  existing: [
    { slot: "09:00", size: "small" as const },
    { slot: "09:00", size: "small" as const },
    { slot: "10:00", size: "small" as const },
  ],
  dailyCap: cap,
  dogs: ["small" as const],
}));

// The 2-2-1 rule has three windows: the two slots before, the slots either side, and the two
// slots AFTER. The governed list covers the first two. Removing the third from the Swift
// engine passed every governed scenario, found by breaking the engine on purpose, so it is
// added here: a slot holding one dog, with two full slots straight after it, may not take
// a second dog. Answers are measured from the real website engine.
const IOS_221_WINDOW_AFTER: CapacityParityFixture[] = [
  {
    kind: "single" as const,
    id: "ios-221-two-full-slots-after-refuse",
    rule: "2-2-1" as const,
    description: "second dog into a slot that has two full slots straight after it",
    existing: [
      { slot: "09:00", size: "small" as const },
      { slot: "09:30", size: "small" as const },
      { slot: "09:30", size: "small" as const },
      { slot: "10:00", size: "small" as const },
      { slot: "10:00", size: "small" as const },
    ],
    candidate: { slot: "09:00", size: "small" as const },
  },
  {
    kind: "single" as const,
    id: "ios-221-one-full-slot-after-allows",
    rule: "2-2-1" as const,
    description: "second dog into a slot that has only one full slot after it",
    existing: [
      { slot: "09:00", size: "small" as const },
      { slot: "09:30", size: "small" as const },
      { slot: "09:30", size: "small" as const },
    ],
    candidate: { slot: "09:00", size: "small" as const },
  },
];

function build() {
  return {
    note: "Generated from src/engine/capacityParityFixtures.ts by src/engine/capacityParityFixtures.ios.test.ts. Do not edit by hand.",
    scenarios: [...CAPACITY_PARITY_FIXTURES, ...IOS_ONE_DOG_CAP_EDGES, ...IOS_221_WINDOW_AFTER].map(scenarioFor),
  };
}

describe("iPhone capacity parity file", () => {
  it("is up to date with the website engine", () => {
    const expected = build();
    if (process.env.UPDATE_IOS_CAPACITY_FIXTURES === "1") {
      writeFileSync(JSON_PATH, `${JSON.stringify(expected, null, 1)}\n`);
    }
    const onDisk = JSON.parse(readFileSync(JSON_PATH, "utf8"));
    expect(onDisk, "run with UPDATE_IOS_CAPACITY_FIXTURES=1 to regenerate").toEqual(expected);
  });

  it("keeps scenarios that allow and scenarios that refuse, and offers that differ by size", () => {
    const data = build().scenarios;
    const singles = data.filter((s) => s.kind === "single");
    expect(singles.some((s) => "verdict" in s && s.verdict.allowed)).toBe(true);
    expect(singles.some((s) => "verdict" in s && !s.verdict.allowed)).toBe(true);
    // A large dog is offered fewer times than a small one on at least one day, so a
    // Swift engine that ignored size could not pass.
    expect(data.some((s) => s.offers.large.length < s.offers.small.length)).toBe(true);
    // Some days offer nothing at all (a full day, the daily cap).
    expect(data.some((s) => s.offers.small.length === 0)).toBe(true);
  });
});

describe("iPhone capacity constants match the website", () => {
  const swift = readFileSync(join(root, "ios/SmarterDog/CapacityEngine.swift"), "utf8");
  const models = readFileSync(join(root, "ios/SmarterDog/BookingModels.swift"), "utf8");

  it("uses the website's large-dog slot rules", () => {
    const rows = [
      ...swift.matchAll(
        /^\s+"(\d\d:\d\d)": LargeRule\(seats: (\d), canShare: (true|false), conditional: (true|false)\),$/gm,
      ),
    ];
    const swiftRules = Object.fromEntries(
      rows.map((m) => [m[1], { seats: Number(m[2]), canShare: m[3] === "true", conditional: m[4] === "true" }]),
    );
    const websiteRules = Object.fromEntries(
      Object.entries(LARGE_DOG_SLOTS).map(([slot, rule]) => [
        slot,
        {
          seats: rule.seats,
          canShare: rule.canShare,
          conditional: "conditional" in rule ? Boolean((rule as { conditional?: boolean }).conditional) : false,
        },
      ]),
    );
    expect(swiftRules).toEqual(websiteRules);
  });

  it("uses the website's daily cap", () => {
    expect(Number(swift.match(/static let dailyDogCap = (\d+)/)?.[1])).toBe(DAILY_DOG_CAP);
  });

  it("uses the website's standard slot grid", () => {
    const start = models.indexOf("static let canonical: [String] = [");
    expect(start).toBeGreaterThan(-1);
    const block = models.slice(start + "static let canonical: [String] = [".length);
    const grid = [...block.slice(0, block.indexOf("]")).matchAll(/"(\d\d:\d\d)"/g)].map((m) => m[1]);
    expect(grid).toEqual(SALON_SLOTS);
  });
});
