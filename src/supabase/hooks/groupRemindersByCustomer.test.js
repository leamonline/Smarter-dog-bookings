import { describe, it, expect } from "vitest";
import { groupRemindersByCustomer } from "./groupRemindersByCustomer.js";

const HUMAN_A = "11111111-1111-1111-1111-111111111111";
const HUMAN_B = "22222222-2222-2222-2222-222222222222";

function booking(over = {}) {
  return {
    id: "b1",
    slot: "09:00",
    service: "Full groom",
    status: "Booked",
    booking_date: "2026-05-26",
    dog_id: "d1",
    dog_name_snapshot: "Eti",
    owner_name_snapshot: "Jayne",
    dogs: { human_id: HUMAN_A, name: "Eti" },
    ...over,
  };
}

describe("groupRemindersByCustomer", () => {
  it("collapses two dogs for one customer at the same slot into a single row", () => {
    const rows = groupRemindersByCustomer([
      booking({ id: "b1", dog_id: "d1", dogs: { human_id: HUMAN_A, name: "Eti" } }),
      booking({ id: "b2", dog_id: "d2", dogs: { human_id: HUMAN_A, name: "Belle" } }),
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0].customerKey).toBe(HUMAN_A);
    expect(rows[0].bookingIds).toEqual(["b1", "b2"]);
    expect(rows[0].anchorBookingId).toBe("b1");
    expect(rows[0].dogNamesDisplay).toBe("Eti & Belle");
    expect(rows[0].multiSlot).toBe(false);
    expect(rows[0].slots).toEqual(["09:00"]);
  });

  it("keeps a single row but flags multiSlot when the dogs are at different times", () => {
    const rows = groupRemindersByCustomer([
      booking({ id: "b1", slot: "09:00", dog_id: "d1", dogs: { human_id: HUMAN_A, name: "Eti" } }),
      booking({ id: "b2", slot: "14:30", dog_id: "d2", dogs: { human_id: HUMAN_A, name: "Belle" } }),
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0].multiSlot).toBe(true);
    expect(rows[0].slots).toEqual(["09:00", "14:30"]);
    expect(rows[0].slot).toBe("09:00");
    expect(rows[0].dogNamesDisplay).toBe("Eti & Belle");
  });

  it("does NOT merge two different customers who share a first name", () => {
    const rows = groupRemindersByCustomer([
      booking({ id: "b1", dog_id: "d1", owner_name_snapshot: "Emma", dogs: { human_id: HUMAN_A, name: "Reggie" } }),
      booking({ id: "b2", dog_id: "d2", owner_name_snapshot: "Emma", dogs: { human_id: HUMAN_B, name: "Reggie" } }),
    ]);

    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.customerKey).sort()).toEqual([HUMAN_A, HUMAN_B]);
  });

  it("joins three dogs with commas and an ampersand", () => {
    const rows = groupRemindersByCustomer([
      booking({ id: "b1", dog_id: "d1", dogs: { human_id: HUMAN_A, name: "Eti" } }),
      booking({ id: "b2", dog_id: "d2", dogs: { human_id: HUMAN_A, name: "Belle" } }),
      booking({ id: "b3", dog_id: "d3", dogs: { human_id: HUMAN_A, name: "Max" } }),
    ]);
    expect(rows[0].dogNamesDisplay).toBe("Eti, Belle & Max");
  });

  it("de-dupes a dog that has two bookings the same day", () => {
    const rows = groupRemindersByCustomer([
      booking({ id: "b1", slot: "09:00", dog_id: "d1", dogs: { human_id: HUMAN_A, name: "Eti" } }),
      booking({ id: "b2", slot: "15:00", dog_id: "d1", dogs: { human_id: HUMAN_A, name: "Eti" } }),
    ]);
    expect(rows[0].dogNames).toEqual(["Eti"]);
    expect(rows[0].dogNamesDisplay).toBe("Eti");
    expect(rows[0].bookingIds).toEqual(["b1", "b2"]);
    expect(rows[0].multiSlot).toBe(true);
  });

  it("gives orphaned bookings (deleted dog) their own row and falls back to the snapshot name", () => {
    const rows = groupRemindersByCustomer([
      booking({ id: "b1", dog_id: null, dogs: null, dog_name_snapshot: "Ghost" }),
      booking({ id: "b2", dog_id: null, dogs: null, dog_name_snapshot: "Spectre" }),
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0].customerKey).toBe("orphan:b1");
    expect(rows[0].dogNamesDisplay).toBe("Ghost");
    expect(rows[1].customerKey).toBe("orphan:b2");
  });

  describe("derived reminderStatus", () => {
    const twoDogs = [
      booking({ id: "b1", dog_id: "d1", dogs: { human_id: HUMAN_A, name: "Eti" } }),
      booking({ id: "b2", dog_id: "d2", dogs: { human_id: HUMAN_A, name: "Belle" } }),
    ];

    it("is 'sent' only when every booking has a sent row", () => {
      const sentMap = new Map([
        ["b1", { status: "sent", sent_at: "2026-05-25T10:00:00Z", channel: "whatsapp" }],
        ["b2", { status: "sent", sent_at: "2026-05-25T10:05:00Z", channel: "whatsapp" }],
      ]);
      const [row] = groupRemindersByCustomer(twoDogs, sentMap);
      expect(row.reminderStatus).toBe("sent");
      expect(row.reminderSentAt).toBe("2026-05-25T10:05:00Z"); // latest
      expect(row.reminderChannel).toBe("whatsapp");
    });

    it("is 'pending' when any booking is mid-send", () => {
      const sentMap = new Map([
        ["b1", { status: "sent", sent_at: "2026-05-25T10:00:00Z", channel: "whatsapp" }],
        ["b2", { status: "pending", sent_at: null, channel: "whatsapp" }],
      ]);
      const [row] = groupRemindersByCustomer(twoDogs, sentMap);
      expect(row.reminderStatus).toBe("pending");
    });

    it("is null when no booking has been reminded", () => {
      const [row] = groupRemindersByCustomer(twoDogs, new Map());
      expect(row.reminderStatus).toBe(null);
    });

    it("is null (not sent) when only some bookings are sent and none are pending", () => {
      const sentMap = new Map([
        ["b1", { status: "sent", sent_at: "2026-05-25T10:00:00Z", channel: "whatsapp" }],
      ]);
      const [row] = groupRemindersByCustomer(twoDogs, sentMap);
      expect(row.reminderStatus).toBe(null);
    });
  });

  it("orders customer rows by their earliest slot (input is slot-ordered)", () => {
    const rows = groupRemindersByCustomer([
      booking({ id: "b1", slot: "09:00", dog_id: "d1", owner_name_snapshot: "Jayne", dogs: { human_id: HUMAN_A, name: "Eti" } }),
      booking({ id: "b2", slot: "10:00", dog_id: "d2", owner_name_snapshot: "Sam", dogs: { human_id: HUMAN_B, name: "Rex" } }),
    ]);
    expect(rows.map((r) => r.customerName)).toEqual(["Jayne", "Sam"]);
  });
});

describe("groupRemindersByCustomer — confirmed flag", () => {
  it("sets confirmed=true when any of the customer's bookings has reminder_confirmed_at", () => {
    const bookings = [
      {
        id: "b-1",
        slot: "09:00",
        dog_id: "d-1",
        dog_name_snapshot: "Bella",
        owner_name_snapshot: "Jane",
        dogs: { human_id: "h-1", name: "Bella" },
        reminder_confirmed_at: "2026-05-31T15:53:00Z",
      },
      {
        id: "b-2",
        slot: "11:00",
        dog_id: "d-2",
        dog_name_snapshot: "Rex",
        owner_name_snapshot: "Jane",
        dogs: { human_id: "h-1", name: "Rex" },
        reminder_confirmed_at: null,
      },
    ];
    const [row] = groupRemindersByCustomer(bookings, new Map());
    expect(row.confirmed).toBe(true);
  });

  it("sets confirmed=false when no booking has been confirmed", () => {
    const bookings = [
      {
        id: "b-1",
        slot: "09:00",
        dog_id: "d-1",
        dog_name_snapshot: "Bella",
        owner_name_snapshot: "Jane",
        dogs: { human_id: "h-1", name: "Bella" },
        reminder_confirmed_at: null,
      },
    ];
    const [row] = groupRemindersByCustomer(bookings, new Map());
    expect(row.confirmed).toBe(false);
  });

  it("exposes the latest reminderConfirmedAt across the customer's bookings", () => {
    const bookings = [
      {
        id: "b-1",
        slot: "09:00",
        dog_id: "d-1",
        dog_name_snapshot: "Bella",
        owner_name_snapshot: "Jane",
        dogs: { human_id: "h-1", name: "Bella" },
        reminder_confirmed_at: "2026-05-31T15:53:00Z",
      },
      {
        id: "b-2",
        slot: "11:00",
        dog_id: "d-2",
        dog_name_snapshot: "Rex",
        owner_name_snapshot: "Jane",
        dogs: { human_id: "h-1", name: "Rex" },
        reminder_confirmed_at: "2026-05-31T15:55:30Z",
      },
    ];
    const [row] = groupRemindersByCustomer(bookings, new Map());
    expect(row.reminderConfirmedAt).toBe("2026-05-31T15:55:30Z");
  });

  it("takes reminderConfirmedBy from the latest confirmation", () => {
    const bookings = [
      {
        id: "b-1",
        slot: "09:00",
        dog_id: "d-1",
        dog_name_snapshot: "Bella",
        owner_name_snapshot: "Jane",
        dogs: { human_id: "h-1", name: "Bella" },
        reminder_confirmed_at: "2026-05-31T15:53:00Z",
        reminder_confirmed_source: "customer",
      },
      {
        id: "b-2",
        slot: "11:00",
        dog_id: "d-2",
        dog_name_snapshot: "Rex",
        owner_name_snapshot: "Jane",
        dogs: { human_id: "h-1", name: "Rex" },
        reminder_confirmed_at: "2026-05-31T15:55:30Z",
        reminder_confirmed_source: "staff",
      },
    ];
    const [row] = groupRemindersByCustomer(bookings, new Map());
    expect(row.reminderConfirmedBy).toBe("staff");
  });

  it("reads a confirmed row with no source as customer (legacy WhatsApp confirms)", () => {
    const bookings = [
      {
        id: "b-1",
        slot: "09:00",
        dog_id: "d-1",
        dog_name_snapshot: "Bella",
        owner_name_snapshot: "Jane",
        dogs: { human_id: "h-1", name: "Bella" },
        reminder_confirmed_at: "2026-05-31T15:53:00Z",
      },
    ];
    const [row] = groupRemindersByCustomer(bookings, new Map());
    expect(row.reminderConfirmedBy).toBe("customer");
  });

  it("leaves reminderConfirmedBy null when nothing is confirmed", () => {
    const bookings = [
      {
        id: "b-1",
        slot: "09:00",
        dog_id: "d-1",
        dog_name_snapshot: "Bella",
        owner_name_snapshot: "Jane",
        dogs: { human_id: "h-1", name: "Bella" },
        reminder_confirmed_at: null,
      },
    ];
    const [row] = groupRemindersByCustomer(bookings, new Map());
    expect(row.reminderConfirmedBy).toBe(null);
  });
});
