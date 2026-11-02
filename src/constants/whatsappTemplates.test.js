import { describe, it, expect } from "vitest";
import * as whatsappTemplates from "./whatsappTemplates.js";

const {
  WHATSAPP_TEMPLATES,
  WHATSAPP_PICKER_TEMPLATES,
  buildTemplateParams,
} = whatsappTemplates;

describe("buildTemplateParams", () => {
  it("returns appointment_reminder_v1 params in {{1}}..{{3}} order", () => {
    const template = WHATSAPP_TEMPLATES.find((t) => t.name === "appointment_reminder_v1");
    const values = {
      customer_first_name: "Sarah",
      dog_name: "Bella",
      appointment_when: "Monday 25 May at 9:00am",
    };
    expect(buildTemplateParams(template, values)).toEqual([
      "Sarah",
      "Bella",
      "Monday 25 May at 9:00am",
    ]);
  });

  it("fills empty string for missing params", () => {
    const template = WHATSAPP_TEMPLATES.find((t) => t.name === "appointment_reminder_v1");
    expect(buildTemplateParams(template, { customer_first_name: "Sarah" })).toEqual([
      "Sarah",
      "",
      "",
    ]);
  });

  it("returns booking_confirmed_v1 params in {{1}}..{{4}} order, not sentence order", () => {
    // Meta's body reads "{{1}}, {{2}}'s {{4}} is confirmed for {{3}}" — the
    // service is placeholder #4 even though sentence-position is mid-text,
    // and `when` is placeholder #3 even though sentence-position is after.
    // The params array MUST match Meta's numbering, not reading order.
    const template = WHATSAPP_TEMPLATES.find((t) => t.name === "booking_confirmed_v1");
    const values = {
      customer_first_name: "Jon",
      dog_name: "Bella",
      appointment_when: "Monday 25 May at 9:00am",
      service: "Full Groom",
    };
    expect(buildTemplateParams(template, values)).toEqual([
      "Jon",
      "Bella",
      "Monday 25 May at 9:00am",
      "Full Groom",
    ]);
  });

  it("preview renders the registered appointment_reminder_v1 wording", () => {
    const template = WHATSAPP_TEMPLATES.find((t) => t.name === "appointment_reminder_v1");
    const values = {
      customer_first_name: "Sarah",
      dog_name: "Bella",
      appointment_when: "Monday 25 May at 9:00am",
    };
    expect(template.preview(values)).toBe(
      "Hi Sarah, Just a quick reminder that Bella is booked in with us at Smarter Dog Grooming Salon for Monday 25 May at 9:00am, see you soon.",
    );
  });

  it("preview renders the registered booking_confirmed_v1 wording", () => {
    const template = WHATSAPP_TEMPLATES.find((t) => t.name === "booking_confirmed_v1");
    const values = {
      customer_first_name: "Jon",
      dog_name: "Bella",
      appointment_when: "Monday 25 May at 9:00am",
      service: "Full Groom",
    };
    expect(template.preview(values)).toBe(
      "Hi Jon, Bella's Full Groom is confirmed for Monday 25 May at 9:00am at Smarter Dog Grooming Salon. We're looking forward to seeing you. Reply here if anything changes.",
    );
  });

  it("preview falls back to friendly placeholders for missing values", () => {
    const template = WHATSAPP_TEMPLATES.find((t) => t.name === "appointment_reminder_v1");
    expect(template.preview({})).toBe(
      "Hi [their name], Just a quick reminder that [dog's name] is booked in with us at Smarter Dog Grooming Salon for [date and time], see you soon.",
    );
  });

  it("preview renders the registered booking_changed_v1 wording", () => {
    const template = WHATSAPP_TEMPLATES.find((t) => t.name === "booking_changed_v1");
    const values = {
      customer_first_name: "Sam",
      dog_name: "Bella",
      change_description: "moved to 10:30 instead of 9:00",
    };
    expect(template.preview(values)).toBe(
      "Hi Sam, a quick update on Bella's booking: moved to 10:30 instead of 9:00. If this isn't right or you have any questions, just reply here.",
    );
  });

  it("booking_changed_v1 uses the generic 'en' language code, not en_GB", () => {
    const template = WHATSAPP_TEMPLATES.find((t) => t.name === "booking_changed_v1");
    expect(template.language).toBe("en");
  });
});

describe("appointment_request_reply_v1", () => {
  const template = WHATSAPP_TEMPLATES.find((t) => t.name === "appointment_request_reply_v1");

  it("is registered as approved en_GB", () => {
    expect(template.status).toBe("approved");
    expect(template.language).toBe("en_GB");
  });

  it("returns params in Meta's {{1}} name, {{2}} date, {{3}} time order", () => {
    const values = {
      customer_first_name: "Sarah",
      appointment_date: "Tuesday 28 October",
      appointment_time: "10:30am",
    };
    expect(buildTemplateParams(template, values)).toEqual([
      "Sarah",
      "Tuesday 28 October",
      "10:30am",
    ]);
  });

  it("preview renders the wording registered with Meta", () => {
    const values = {
      customer_first_name: "Sarah",
      appointment_date: "Tuesday 28 October",
      appointment_time: "10:30am",
    };
    expect(template.preview(values)).toBe(
      "Hi Sarah, hope you are well. Thanks for getting in touch about an appointment. We have availability on Tuesday 28 October at 10:30am. Does that work for you? 🎓🐶❤️ X",
    );
  });

  it("preview falls back to friendly placeholders for missing values", () => {
    expect(template.preview({})).toBe(
      "Hi [their name], hope you are well. Thanks for getting in touch about an appointment. We have availability on [date] at [time]. Does that work for you? 🎓🐶❤️ X",
    );
  });
});

describe("booking_cancelled_v1", () => {
  const template = WHATSAPP_TEMPLATES.find((t) => t.name === "booking_cancelled_v1");

  it("is the approved en_GB template and is offered in the staff picker", () => {
    expect(template.status).toBe("approved");
    expect(template.language).toBe("en_GB");
    expect(WHATSAPP_PICKER_TEMPLATES.some((t) => t.name === "booking_cancelled_v1")).toBe(true);
  });

  it("sends first name, dog name, then the date and time, in that order", () => {
    expect(buildTemplateParams(template, {
      customer_first_name: "Sarah",
      dog_name: "Cooper",
      appointment_when: "Monday 16 June at 10:00am",
    })).toEqual(["Sarah", "Cooper", "Monday 16 June at 10:00am"]);
  });

  it("previews the body Meta has already approved", () => {
    expect(template.preview({
      customer_first_name: "Sarah",
      dog_name: "Cooper",
      appointment_when: "Monday 16 June at 10:00am",
    })).toBe(
      "Hi Sarah, we're sorry to let you know that Cooper's appointment on Monday 16 June at 10:00am has been cancelled. If you'd like to rearrange, just reply here and we'll find a new time — Smarter Dog Grooming Salon.",
    );
  });
});

describe("WHATSAPP_PICKER_TEMPLATES", () => {
  it("only exposes Meta-approved templates to the staff picker", () => {
    expect(WHATSAPP_PICKER_TEMPLATES.map((t) => t.name)).toEqual([
      "appointment_reminder_v1",
      "booking_confirmed_v1",
      "booking_changed_v1",
      "ready_for_collection_v2",
      "welcome_to_the_pack_v1__english",
      "appointment_request_reply_v1",
      "customer_enquiry_response_v1",
      "booking_cancelled_v1",
    ]);
    expect(WHATSAPP_PICKER_TEMPLATES.every((t) => t.status === "approved")).toBe(true);
  });
});

describe("ready_for_collection templates", () => {
  const byName = (name) => WHATSAPP_TEMPLATES.find((t) => t.name === name);

  it("v2 is Meta's approved wording and reads correctly for one dog or several", () => {
    const v2 = byName("ready_for_collection_v2");
    expect(v2.language).toBe("en_GB");
    expect(buildTemplateParams(v2, { dog_name: "Bella and Max", minutes: "15" })).toEqual(["Bella and Max", "15"]);
    expect(v2.preview({ dog_name: "Bella", minutes: "15" })).toBe(
      "Hi! 🐾 We've finished pampering Bella and they're ready to head home in 15 mins. See you soon 🎓🐶❤️ X",
    );
    expect(v2.preview({ dog_name: "Bella, Max and Alfie", minutes: "10" })).toBe(
      "Hi! 🐾 We've finished pampering Bella, Max and Alfie and they're ready to head home in 10 mins. See you soon 🎓🐶❤️ X",
    );
  });

  it("v1 is retired: still known (old inbox messages render) but never offered to staff", () => {
    const v1 = byName("ready_for_collection_v1");
    expect(v1).toBeDefined();
    expect(v1.status).toBe("retired");
    expect(WHATSAPP_PICKER_TEMPLATES.map((t) => t.name)).not.toContain("ready_for_collection_v1");
  });
});
