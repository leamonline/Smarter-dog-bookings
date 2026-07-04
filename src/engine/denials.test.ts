import { describe, it, expect } from "vitest";
import { mapDenialReason, computeDenialStats, DENIAL_REASON_LABELS, type DenialRow } from "./denials";

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
