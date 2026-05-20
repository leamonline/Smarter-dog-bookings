import { describe, it, expect } from "vitest";
import { eventSentence } from "./BookingHistoryCard.jsx";

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

  it("returns empty string for a null event", () => {
    expect(eventSentence(null)).toBe("");
  });
});
