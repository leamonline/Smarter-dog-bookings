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
      "Hi Sarah, just a friendly reminder that Bella is booked in with us at Smarter Dog Grooming Salon for Monday 25 May at 9:00am. Reply here if you need to change anything — see you soon..",
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
      "Hi [their name], just a friendly reminder that [dog's name] is booked in with us at Smarter Dog Grooming Salon for [date and time]. Reply here if you need to change anything — see you soon..",
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

describe("WHATSAPP_PICKER_TEMPLATES", () => {
  it("only exposes Meta-approved templates to the staff picker", () => {
    expect(WHATSAPP_PICKER_TEMPLATES.map((t) => t.name)).toEqual([
      "appointment_reminder_v1",
      "booking_confirmed_v1",
      "booking_changed_v1",
      "ready_for_collection_v1",
      "welcome_to_the_pack_v1",
    ]);
    expect(WHATSAPP_PICKER_TEMPLATES.every((t) => t.status === "approved")).toBe(true);
  });
});
