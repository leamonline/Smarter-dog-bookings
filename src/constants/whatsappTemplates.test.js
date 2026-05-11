import { describe, it, expect } from "vitest";
import { WHATSAPP_TEMPLATES, buildTemplateParams } from "./whatsappTemplates.js";

describe("buildTemplateParams", () => {
  it("returns params in template order", () => {
    const template = WHATSAPP_TEMPLATES[0]; // appointment_reminder
    const values = {
      customer_first_name: "Sarah",
      dog_name: "Bella",
      date: "Monday 12 May",
      time: "9:00am",
    };
    expect(buildTemplateParams(template, values)).toEqual(["Sarah", "Bella", "Monday 12 May", "9:00am"]);
  });

  it("fills empty string for missing params", () => {
    const template = WHATSAPP_TEMPLATES[0];
    expect(buildTemplateParams(template, { customer_first_name: "Sarah" })).toEqual([
      "Sarah", "", "", "",
    ]);
  });

  it("general_contact only has one param", () => {
    const template = WHATSAPP_TEMPLATES[1]; // general_contact
    expect(buildTemplateParams(template, { customer_first_name: "Jon" })).toEqual(["Jon"]);
  });

  it("preview renders correctly for appointment_reminder", () => {
    const template = WHATSAPP_TEMPLATES[0];
    const values = { customer_first_name: "Sarah", dog_name: "Bella", date: "Monday 12 May", time: "9:00am" };
    expect(template.preview(values)).toBe(
      "Hi Sarah, just a quick reminder that Bella has a grooming appointment with us on Monday 12 May at 9:00am. We're looking forward to seeing you both! 🐾"
    );
  });

  it("preview falls back to friendly placeholders for missing values", () => {
    const template = WHATSAPP_TEMPLATES[0];
    expect(template.preview({})).toBe(
      "Hi [their name], just a quick reminder that [dog's name] has a grooming appointment with us on [date] at [time]. We're looking forward to seeing you both! 🐾"
    );
  });
});
