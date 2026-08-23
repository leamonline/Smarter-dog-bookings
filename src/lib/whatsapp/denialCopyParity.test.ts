// The customer-facing wording rule, made executable (ADR 008, issue #665).
//
// WHY THIS EXISTS
//
// Two runtimes turn a booking-gate rejection into words a customer reads: the
// portal wizard through src/engine/denials.ts, and the WhatsApp Flow through
// supabase/functions/_shared/denialCopy.ts (a hand-mirror, because the Flow
// runs in Deno and cannot import the frontend engine).
//
// Issue #665 recorded that the browser engine and the PostgreSQL trigger
// describe the SAME refusal in different words — a 12-hour clock against a
// 24-hour one, and some phrasings that differ outright. Measuring where those
// strings actually surface showed the divergence is real but almost entirely
// INTERNAL: the portal has always translated them, and staff surfaces read the
// engine's text deliberately, because staff need the rule name. The one place
// raw text reached a customer was the Flow, which passed the gate message
// straight to its BOOKING_FAILED / SELECT_TIME_RETRY screens.
//
// So the wording decision is not "pick 12- or 24-hour for customers". It is:
// a customer is never shown a clock, a rule name or a capacity number at all,
// which makes the clock question moot on every customer surface. This file
// asserts that property directly, rather than pinning exact sentences — copy
// should be free to improve, the rule should not.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  DENIAL_REASON_LABELS,
  friendlyDenialMessage as portalCopy,
  mapDenialReason as portalMapper,
} from "../../engine/denials";
import {
  friendlyDenialMessage as flowCopy,
  mapDenialReason as flowMapper,
} from "../../../supabase/functions/_shared/denialCopy.ts";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

/**
 * A real gate message per reason code, so every branch of both copy tables is
 * exercised by something the database or an engine actually emits.
 *
 * The PostgreSQL entries are the deployed text, read from production
 * (`nlzhllhkigmsvrzduefz`) on 23 August 2026 — not from migration source,
 * because 20260820090000 repaired the deployed strings in place, so the file
 * text and the live text are not identical.
 */
const SAMPLE_MESSAGES: Record<string, string[]> = {
  capacity_2_2_1: ["Not enough capacity (2-2-1 rule)", "Capped at 1 (2-2-1 rule)"],
  daily_cap: ["Day is fully booked: 2026-08-25 already has 14 dog(s) (maximum 14 per day)"],
  slot_full: ["Slot is full"],
  large_dog_ineligible: [
    // The pair issue #665 named: same refusal, 12-hour vs 24-hour clock.
    "1:00pm is closed — large dog at 12:00 triggered early close",
    "13:00 is closed — large dog at 12:00 triggered early close",
    "12:00 large dog requires 1:00pm to be empty (early close)",
    "12:00 large dog requires 13:00 to be empty (early close)",
    "9:00am conditional: 8:30am must be empty",
    "09:00 large dog conditional: 08:30 must be empty",
    "Back-to-back large dogs only allowed at 12:30 + 13:00",
    "Only a small/medium dog can share this slot with a large dog",
    "Large dog fills this slot — already has bookings",
  ],
  pregnant: ["This dog is marked pregnant and cannot be booked online"],
  customer_slot_blocked: [
    "That time isn't available for your account — please pick a different time or message the salon.",
  ],
  double_booked: ["This dog is already booked in this slot"],
  unavailable: ["Invalid slot: 07:00"],
  calendar_closed: ["The salon is closed on that day"],
  past_date: ["That date is in the past"],
  past_cutoff: ["Same-day bookings close 30 minutes before the slot"],
  seat_blocked: ["That seat is blocked"],
  unknown: ["something nobody has classified yet"],
};

/** Every `reason:` string the two TypeScript engines can produce. */
function engineReasonStrings(): string[] {
  const found = new Set<string>();
  for (const path of ["src/engine/capacity.ts", "supabase/functions/_shared/capacity.ts"]) {
    for (const m of read(path).matchAll(/reason:\s*\n?\s*"([^"]+)"/g)) found.add(m[1]);
  }
  return [...found].sort();
}

const ALL_SAMPLES = Object.values(SAMPLE_MESSAGES).flat();
const CODES = Object.keys(DENIAL_REASON_LABELS);

describe("denial reason mapper: browser ↔ Deno parity", () => {
  it("covers every reason code with at least one real sample message", () => {
    expect(Object.keys(SAMPLE_MESSAGES).sort()).toEqual([...CODES].sort());
  });

  it.each(ALL_SAMPLES)("agrees on the reason code for %s", (message) => {
    expect(flowMapper(message)).toBe(portalMapper(message));
  });

  it("classifies each sample as the code it is filed under", () => {
    for (const [code, messages] of Object.entries(SAMPLE_MESSAGES)) {
      for (const message of messages) {
        expect(portalMapper(message), `${message} should map to ${code}`).toBe(code);
      }
    }
  });

  it("agrees on every reason string the two capacity engines can emit", () => {
    const reasons = engineReasonStrings();
    expect(reasons.length, "engine reason strings should be discoverable").toBeGreaterThan(5);
    for (const reason of reasons) {
      expect(flowMapper(reason), `mappers disagree on "${reason}"`).toBe(portalMapper(reason));
    }
  });

  it("agrees on empty and missing input", () => {
    for (const input of [undefined, null, ""]) {
      expect(flowMapper(input)).toBe(portalMapper(input));
    }
  });
});

/**
 * The wording rule itself. A customer is told what to do next, never why the
 * rule exists — so no customer-facing refusal may carry a clock time, a rule
 * name, or a capacity number, on either channel.
 */
describe("customer-facing denial copy: the ADR 008 wording rule", () => {
  const CHANNELS: Array<[string, (m: string) => string]> = [
    ["portal", portalCopy],
    ["whatsapp flow", flowCopy],
  ];

  it.each(CHANNELS)("%s never prints a digit — no clock, no capacity number", (_name, copy) => {
    for (const message of ALL_SAMPLES) {
      const out = copy(message);
      // Digits are how a clock ("13:00", "9:00am") and a capacity figure
      // ("14 dog(s)", "maximum 14 per day") reach a customer. Banning them
      // outright settles issue #665's 12-hour-vs-24-hour question by making it
      // unreachable on this surface. A future message that genuinely needs a
      // number is a deliberate change to this rule, not an accident.
      expect(out, `"${out}" leaks a number, from: ${message}`).not.toMatch(/\d/);
    }
  });

  it.each(CHANNELS)("%s never leaks internal rule vocabulary", (_name, copy) => {
    const JARGON = [
      /2-2-1/i,
      /capped at/i,
      /back-to-back/i,
      /early close/i,
      /conditional/i,
      /slot is full/i, // the engine's phrasing, not the customer's
      /seat/i,
      /trigger/i,
      /P0001/i,
      /capacity/i,
    ];
    for (const message of ALL_SAMPLES) {
      const out = copy(message);
      for (const pattern of JARGON) {
        expect(out, `"${out}" leaks ${pattern}, from: ${message}`).not.toMatch(pattern);
      }
    }
  });

  it.each(CHANNELS)("%s answers every reason code with usable copy", (_name, copy) => {
    for (const [code, messages] of Object.entries(SAMPLE_MESSAGES)) {
      const out = copy(messages[0]);
      expect(out.length, `${code} needs real copy`).toBeGreaterThan(20);
      // Every refusal has to leave the customer somewhere to go.
      expect(
        /please|try|choose|pick|reply|message us|check/i.test(out),
        `${code} copy must offer a next step: "${out}"`,
      ).toBe(true);
    }
  });

  it.each(CHANNELS)("%s gives each code its own copy, not the catch-all", (_name, copy) => {
    const generic = copy("something nobody has classified yet");
    const shareGeneric = Object.entries(SAMPLE_MESSAGES)
      .filter(([code]) => code !== "unknown")
      .filter(([, messages]) => copy(messages[0]) === generic)
      .map(([code]) => code);
    expect(
      shareGeneric,
      "these codes fall through to the generic message — give them their own copy",
    ).toEqual([]);
  });

  it("never returns a raw gate message verbatim on either channel", () => {
    for (const message of ALL_SAMPLES.filter((m) => m !== SAMPLE_MESSAGES.customer_slot_blocked[0])) {
      expect(portalCopy(message)).not.toBe(message);
      expect(flowCopy(message)).not.toBe(message);
    }
  });
});

describe("the two channels stay deliberately different only where the channel differs", () => {
  it("says 'message us on WhatsApp' in the portal and 'reply here' in the Flow", () => {
    // Inside WhatsApp, telling someone to message us on WhatsApp is nonsense.
    // This is the ONE reason the two tables are allowed to diverge.
    const pregnant = SAMPLE_MESSAGES.pregnant[0];
    expect(portalCopy(pregnant)).toMatch(/message us on WhatsApp/i);
    expect(flowCopy(pregnant)).toMatch(/reply here/i);
  });

  it("keeps the Flow free of any 'message us on WhatsApp' instruction", () => {
    for (const message of ALL_SAMPLES) {
      expect(flowCopy(message)).not.toMatch(/message us on WhatsApp/i);
    }
  });
});
