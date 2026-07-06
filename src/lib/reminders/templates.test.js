import { describe, it, expect } from "vitest";
import {
  joinNames,
  formatTime,
  formatDateShort,
  formatDateWhen,
  buildWhatsAppReminderParams,
  renderWhatsAppReminderPreview,
  renderSmsReminder,
  renderEmailReminder,
} from "./templates.js";
import { smsSegmentInfo } from "../sms/segments.js";

describe("joinNames", () => {
  it("handles 0, 1, 2 and 3 names", () => {
    expect(joinNames([])).toBe("");
    expect(joinNames(["Bella"])).toBe("Bella");
    expect(joinNames(["Bella", "Max"])).toBe("Bella and Max");
    expect(joinNames(["Bella", "Max", "Daisy"])).toBe("Bella, Max and Daisy");
  });
  it("drops empty entries", () => {
    expect(joinNames(["Bella", "", null, undefined])).toBe("Bella");
  });
});

describe("formatTime / date formatting", () => {
  it("formats slots as 12h am/pm", () => {
    expect(formatTime("09:00")).toBe("9:00am");
    expect(formatTime("13:30")).toBe("1:30pm");
    expect(formatTime("12:00")).toBe("12:00pm");
    expect(formatTime("00:00")).toBe("12:00am");
  });
  it("formats dates without timezone drift", () => {
    // Robust against host TZ because we parse at noon UTC.
    expect(formatDateShort("2026-05-25")).toBe("Mon 25 May");
    expect(formatDateWhen("2026-05-25")).toBe("Monday 25 May");
  });
});

describe("buildWhatsAppReminderParams", () => {
  it("returns params in {{1}}..{{3}} order", () => {
    expect(
      buildWhatsAppReminderParams({
        firstName: "Sarah",
        dogNames: ["Bella"],
        date: "2026-05-25",
        slot: "09:00",
      }),
    ).toEqual(["Sarah", "Bella", "Monday 25 May at 9:00am"]);
  });

  it("joins multiple dogs into the single dog slot", () => {
    const params = buildWhatsAppReminderParams({
      firstName: "Sarah",
      dogNames: ["Bella", "Max"],
      date: "2026-05-25",
      slot: "09:00",
    });
    expect(params[1]).toBe("Bella and Max");
  });

  it("preview is byte-identical to the registered template wording", () => {
    expect(
      renderWhatsAppReminderPreview({
        firstName: "Sarah",
        dogNames: ["Bella"],
        date: "2026-05-25",
        slot: "09:00",
      }),
    ).toBe(
      "Hi Sarah, Just a quick reminder that Bella is booked in with us at Smarter Dog Grooming Salon for Monday 25 May at 9:00am, see you soon.",
    );
  });
});

describe("renderSmsReminder", () => {
  it("renders a single-segment GSM-7 message for the common case", () => {
    const text = renderSmsReminder({
      firstName: "Sarah",
      dogNames: ["Bella"],
      date: "2026-05-25",
      slot: "09:00",
      service: "Full groom",
    });
    expect(text).toBe(
      "Hi Sarah, just a reminder Bella is booked in for a Full groom on Mon 25 May at 9:00am. See you then!",
    );
    const info = smsSegmentInfo(text);
    expect(info.encoding).toBe("GSM-7");
    expect(info.segments).toBe(1);
  });

  it("uses 'are' for multiple dogs and omits service when absent", () => {
    const text = renderSmsReminder({
      firstName: "Sarah",
      dogNames: ["Bella", "Max"],
      date: "2026-05-25",
      slot: "09:00",
    });
    expect(text).toContain("Bella and Max are booked in on");
    expect(text).not.toContain("for a");
  });

  it("falls back to 'there' when no first name", () => {
    expect(renderSmsReminder({ dogNames: ["Bella"], date: "2026-05-25", slot: "09:00" })).toContain(
      "Hi there,",
    );
  });
});

describe("renderEmailReminder", () => {
  it("merges booking details into subject and body", () => {
    const { subject, body } = renderEmailReminder({
      firstName: "Sarah",
      dogNames: ["Bella"],
      date: "2026-05-25",
      slot: "09:00",
      service: "Full groom",
    });
    expect(subject).toBe("Reminder: Bella is booked in on Mon 25 May");
    expect(body.startsWith("Hi Sarah,")).toBe(true);
    expect(body).toContain("for a Full groom on Monday 25 May at 9:00am");
    expect(body).toContain("Smarter Dog Grooming");
  });
});
