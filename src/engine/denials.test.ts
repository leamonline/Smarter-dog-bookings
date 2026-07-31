import { describe, it, expect } from "vitest";
import { mapDenialReason, friendlyDenialMessage, computeDenialStats, DENIAL_REASON_LABELS, type DenialRow } from "./denials";

describe("mapDenialReason", () => {
  it("maps the real gate messages to reason codes", () => {
    expect(mapDenialReason("Slot is full")).toBe("slot_full");
    expect(mapDenialReason("Capped at 1 (2-2-1 rule)")).toBe("capacity_2_2_1");
    expect(mapDenialReason("Not enough capacity (2-2-1 rule)")).toBe("capacity_2_2_1");
    expect(mapDenialReason("Day is fully booked: 04 Jul 2026 already has 14 dog(s) (maximum 14 per day)")).toBe("daily_cap");
    expect(mapDenialReason("We can't book a pregnant dog online — please call the salon.")).toBe("pregnant");
    expect(mapDenialReason("Back-to-back large dogs only allowed at 12:30 + 13:00")).toBe("large_dog_ineligible");
    expect(mapDenialReason("Large dogs need approval for this slot (12:30)")).toBe("large_dog_ineligible");
    expect(mapDenialReason("13:00 closed — early close from 12:00 large dog")).toBe("large_dog_ineligible");
    expect(mapDenialReason("The salon is closed on that date")).toBe("calendar_closed");
    expect(mapDenialReason("Cannot book a date in the past")).toBe("past_date");
    expect(mapDenialReason("Same-day booking isn't available for that time")).toBe("past_cutoff");
    expect(mapDenialReason("The same dog is listed twice for one slot")).toBe("double_booked");
    expect(mapDenialReason("Invalid slot: 14:00")).toBe("unavailable");
    expect(mapDenialReason("That time slot is closed on this date")).toBe("calendar_closed");
    // NOTE: the WhatsApp Flow endpoint keeps a Deno copy of this mapper
    // (flowDenialReason). If you change a branch here, mirror it there — these
    // canonical cases lock the frontend side so drift is at least visible.
  });

  it("falls back to unknown for empty / unrecognised messages", () => {
    expect(mapDenialReason("")).toBe("unknown");
    expect(mapDenialReason(null)).toBe("unknown");
    expect(mapDenialReason("network request failed")).toBe("unknown");
  });

  it("every reason code has a display label", () => {
    ["capacity_2_2_1", "daily_cap", "slot_full", "pregnant", "large_dog_ineligible", "calendar_closed", "past_date", "past_cutoff", "double_booked", "unavailable", "unknown"].forEach((code) => {
      expect(DENIAL_REASON_LABELS[code]).toBeTruthy();
    });
  });
});

describe("friendlyDenialMessage", () => {
  // Every raw message the capacity/calendar/large-dog/pregnancy triggers can
  // raise on the customer insert path. None of these engineer-facing strings
  // may reach a customer verbatim.
  const REAL_TRIGGER_MESSAGES = [
    "Slot is full",
    "Not enough capacity (2-2-1 rule)",
    "Capped at 1 (2-2-1 rule)",
    "Back-to-back large dogs only allowed at 12:30 + 13:00",
    "Only a small/medium dog can share this slot with a large dog",
    "Large dog fills this slot — already has bookings",
    "Large dogs need approval for this slot (12:30)",
    "09:00 large dog conditional: 08:30 must be empty",
    "12:00 large dog requires 13:00 to be empty (early close)",
    "13:00 is closed — large dog at 12:00 triggered early close",
    "Day is fully booked: 04 Jul 2026 already has 14 dog(s) (maximum 14 per day)",
    "Cannot book a date in the past",
    "The salon is closed on that date",
    "That time slot is closed on this date",
    "Invalid slot: 14:00",
  ];

  it("never leaks trigger jargon to the customer", () => {
    const jargon = /2-2-1|capped at|back-to-back|early close|conditional|seats used|maximum \d+ per day|invalid slot|P0001|trigger/i;
    for (const raw of REAL_TRIGGER_MESSAGES) {
      const friendly = friendlyDenialMessage(raw);
      expect(friendly.length).toBeGreaterThan(0);
      expect(friendly, `leaked jargon for: ${raw}`).not.toMatch(jargon);
    }
  });

  it("gives each denial category its own actionable copy", () => {
    expect(friendlyDenialMessage("Slot is full")).toMatch(/another slot/i);
    expect(friendlyDenialMessage("Capped at 1 (2-2-1 rule)")).toMatch(/another slot/i);
    expect(friendlyDenialMessage("Day is fully booked: 04 Jul 2026 already has 14 dog(s) (maximum 14 per day)")).toMatch(/waitlist|another day/i);
    expect(friendlyDenialMessage("Back-to-back large dogs only allowed at 12:30 + 13:00")).toMatch(/larger dog/i);
    expect(friendlyDenialMessage("The salon is closed on that date")).toMatch(/closed/i);
    expect(friendlyDenialMessage("Cannot book a date in the past")).toMatch(/passed|upcoming/i);
    expect(friendlyDenialMessage("Same-day booking isn't available for that time")).toMatch(/notice|later time/i);
    expect(
      friendlyDenialMessage("We can't book a pregnant dog online — please call the salon."),
    ).toMatch(/message us on WhatsApp/i);
  });

  it("falls back to a safe generic for unknown / empty messages", () => {
    for (const m of ["", null, "network request failed", "boom"]) {
      const friendly = friendlyDenialMessage(m);
      expect(friendly).toMatch(/another time|try again/i);
    }
  });
});

describe("computeDenialStats (2F)", () => {
  const rows: DenialRow[] = [
    { created_at: "2026-07-01T10:00:00Z", reason_code: "capacity_2_2_1", size: "small", slot: "12:30", service: "full-groom", source: "portal", alternative_shown: true, alternative_taken: false },
    { created_at: "2026-07-02T10:00:00Z", reason_code: "capacity_2_2_1", size: "medium", slot: "12:30", service: "full-groom", source: "whatsapp_flow", alternative_shown: true, alternative_taken: true },
    { created_at: "2026-07-03T10:00:00Z", reason_code: "daily_cap", size: "large", slot: "09:00", service: "bath-and-brush", source: "portal", alternative_shown: false, alternative_taken: false },
    { created_at: "2026-05-01T10:00:00Z", reason_code: "slot_full", size: "small", slot: "10:00", service: "full-groom", source: "portal", alternative_shown: false, alternative_taken: false }, // before the 30-day window
  ];
  const stats = computeDenialStats(rows, 30, new Date("2026-07-04T09:00:00Z"));

  it("counts only denials inside the window", () => {
    expect(stats.total).toBe(3);
  });

  it("ranks reasons by frequency", () => {
    expect(stats.byReason[0].code).toBe("capacity_2_2_1");
    expect(stats.byReason[0].n).toBe(2);
    expect(stats.byReason[1].code).toBe("daily_cap");
  });

  it("breaks demand down by size and slot", () => {
    expect(stats.bySlot.find((s) => s.slot === "12:30")!.n).toBe(2);
    expect(stats.bySize.find((s) => s.size === "large")!.n).toBe(1);
  });

  it("counts alternatives shown vs taken", () => {
    expect(stats.alternativeShownN).toBe(2);
    expect(stats.alternativeTakenN).toBe(1);
  });

  it("reports the earliest in-window denial for the 'collecting since' note", () => {
    expect(stats.firstSeen).toBe("2026-07-01T10:00:00Z");
  });

  it("is empty and safe with no rows", () => {
    const empty = computeDenialStats([], 30, new Date("2026-07-04T09:00:00Z"));
    expect(empty.total).toBe(0);
    expect(empty.byReason).toEqual([]);
    expect(empty.firstSeen).toBeNull();
  });
});

describe("customer_slot_blocked (per-human blocked slots)", () => {
  it("maps the enforce_human_slot_blocks message", () => {
    expect(
      mapDenialReason(
        "That time isn't available for your account — please pick a different time or message the salon.",
      ),
    ).toBe("customer_slot_blocked");
  });
  it("keeps the meaning in the friendly copy", () => {
    expect(
      friendlyDenialMessage("That time isn't available for your account — x"),
    ).toMatch(/for your account/i);
  });
});
