import { describe, it, expect } from "vitest";
import { bookingToReminderRow } from "./bookingToReminderRow.js";

const base = {
  id: "b-1",
  _ownerId: "h-1",
  _bookingDate: "2026-06-18",
  owner: "Jane Smith",
  dogName: "Bella",
  slot: "09:00",
  reminderState: "none",
  reminderChannel: null,
  reminderSentAt: null,
};

describe("bookingToReminderRow", () => {
  it("maps a normal booking onto the reminder-row shape", () => {
    const row = bookingToReminderRow(base);
    expect(row.anchorBookingId).toBe("b-1");
    expect(row.customerKey).toBe("h-1");
    expect(row.bookingIds).toEqual(["b-1"]);
    expect(row.customerName).toBe("Jane Smith");
    expect(row.dogNames).toEqual(["Bella"]);
    expect(row.dogNamesDisplay).toBe("Bella");
    expect(row.slot).toBe("09:00");
    expect(row.slots).toEqual(["09:00"]);
    expect(row.reminderStatus).toBeUndefined();
  });

  it("leaves customerKey null for an orphan booking (no owner)", () => {
    const row = bookingToReminderRow({ ...base, _ownerId: null });
    expect(row.customerKey).toBeNull();
  });

  it("flags reminderStatus 'sent' when the booking is already sent", () => {
    const row = bookingToReminderRow({
      ...base,
      reminderState: "sent",
      reminderChannel: "whatsapp",
      reminderSentAt: "2026-06-18T08:00:00Z",
    });
    expect(row.reminderStatus).toBe("sent");
    expect(row.reminderChannel).toBe("whatsapp");
    expect(row.reminderSentAt).toBe("2026-06-18T08:00:00Z");
  });
});
