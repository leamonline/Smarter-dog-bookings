import { describe, it, expect } from "vitest";
import { eventSentence } from "./bookingEventFormat";

describe("eventSentence", () => {
  const base = {
    customer_name: "Catherine Green",
    dog_name: "Alfie",
    dog_breed: "Yorkshire Terrier",
    service: "full-groom",
    booking_date: "2026-06-01", // a Monday
    slot: "09:00",
  };

  it("renders a created event in the user's preferred shape", () => {
    expect(eventSentence({ ...base, event_type: "created" })).toBe(
      "Catherine Green booked a Full Groom for Alfie (Yorkshire Terrier) Mon 1 Jun at 9:00am.",
    );
  });

  it("renders a rescheduled event with previous date + time", () => {
    expect(
      eventSentence({
        ...base,
        event_type: "rescheduled",
        previous_booking_date: "2026-06-01",
        previous_slot: "09:00",
        booking_date: "2026-06-03", // a Wednesday
        slot: "10:30",
      }),
    ).toBe(
      "Catherine Green moved Alfie (Yorkshire Terrier)'s Full Groom from Mon 1 Jun at 9:00am to Wed 3 Jun at 10:30am.",
    );
  });

  it("renders a cancelled event with the cancel_reason when present", () => {
    expect(
      eventSentence({
        ...base,
        event_type: "cancelled",
        cancel_reason: "Dog feeling poorly",
      }),
    ).toBe(
      "Catherine Green cancelled Alfie (Yorkshire Terrier)'s Full Groom for Mon 1 Jun at 9:00am (Dog feeling poorly).",
    );
  });

  it("omits the breed parenthetical when breed is missing", () => {
    expect(
      eventSentence({
        ...base,
        dog_breed: null,
        event_type: "created",
      }),
    ).toBe("Catherine Green booked a Full Groom for Alfie Mon 1 Jun at 9:00am.");
  });

  it("falls back gracefully when customer/dog snapshots are missing", () => {
    expect(
      eventSentence({
        ...base,
        customer_name: null,
        dog_name: null,
        event_type: "created",
      }),
    ).toBe("Someone booked a Full Groom for a dog (Yorkshire Terrier) Mon 1 Jun at 9:00am.");
  });

  it("renders a completed event owner-led when there's no actor", () => {
    expect(
      eventSentence({ ...base, event_type: "completed" }),
    ).toBe("Alfie (Yorkshire Terrier)'s Full Groom for Catherine Green was completed.");
  });

  it("leads a staff-completed event with the staff first name", () => {
    expect(
      eventSentence({
        ...base,
        event_type: "completed",
        actor_role: "staff",
        actor_name: "Leam Online",
      }),
    ).toBe("Leam completed Alfie (Yorkshire Terrier)'s Full Groom (Catherine Green).");
  });

  it("returns empty string for a null event", () => {
    expect(eventSentence(null)).toBe("");
  });
});

describe("eventSentence — actor attribution", () => {
  const base = {
    customer_name: "Catherine Green",
    dog_name: "Alfie",
    dog_breed: "Yorkshire Terrier",
    service: "full-groom",
    booking_date: "2026-06-01", // a Monday
    slot: "09:00",
  };

  it("leads a staff-made booking with the staff first name and names the owner", () => {
    expect(
      eventSentence({
        ...base,
        event_type: "created",
        actor_role: "staff",
        actor_name: "Leam Online", // trimmed to first word
      }),
    ).toBe(
      "Leam booked in Alfie (Yorkshire Terrier) with Catherine Green for a Full Groom at Mon 1 Jun at 9:00am.",
    );
  });

  it("leads an AI auto-booking with the full AI name (no trimming)", () => {
    expect(
      eventSentence({
        ...base,
        event_type: "created",
        actor_role: "ai",
        actor_name: "Smarter Dog AI",
      }),
    ).toBe(
      "Smarter Dog AI booked in Alfie (Yorkshire Terrier) with Catherine Green for a Full Groom at Mon 1 Jun at 9:00am.",
    );
  });

  it("keeps a customer-made booking owner-led even with an actor set", () => {
    expect(
      eventSentence({
        ...base,
        event_type: "created",
        actor_role: "customer",
        actor_name: "Catherine Green",
      }),
    ).toBe(
      "Catherine Green booked a Full Groom for Alfie (Yorkshire Terrier) Mon 1 Jun at 9:00am.",
    );
  });

  it("leads a staff reschedule with the owner in brackets", () => {
    expect(
      eventSentence({
        ...base,
        event_type: "rescheduled",
        actor_role: "staff",
        actor_name: "Leam",
        previous_booking_date: "2026-06-01",
        previous_slot: "09:00",
        booking_date: "2026-06-03", // a Wednesday
        slot: "10:30",
      }),
    ).toBe(
      "Leam moved Alfie (Yorkshire Terrier)'s Full Groom (Catherine Green) from Mon 1 Jun at 9:00am to Wed 3 Jun at 10:30am.",
    );
  });

  it("leads a staff cancellation with the owner in brackets and keeps the reason", () => {
    expect(
      eventSentence({
        ...base,
        event_type: "cancelled",
        actor_role: "staff",
        actor_name: "Leam",
        cancel_reason: "Dog feeling poorly",
      }),
    ).toBe(
      "Leam cancelled Alfie (Yorkshire Terrier)'s Full Groom (Catherine Green) for Mon 1 Jun at 9:00am (Dog feeling poorly).",
    );
  });

  it("renders a reconfirmed event as owner-led", () => {
    expect(
      eventSentence({
        ...base,
        event_type: "reconfirmed",
        actor_role: "customer",
        actor_name: "Catherine Green",
      }),
    ).toBe("Catherine Green reconfirmed the Full Groom for Alfie (Yorkshire Terrier).");
  });
});
