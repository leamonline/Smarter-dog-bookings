// src/constants/whatsappTemplates.js

/**
 * Each template maps to a Meta-approved WhatsApp message template.
 *
 * `params` defines the ordered list of {{N}} placeholders in the template body.
 * `autoFill` is a hint to the picker: which context key to pre-populate from.
 *   Supported values: "customer_first_name", "dog_name_select" (dropdown if multiple dogs, text otherwise)
 *
 * `preview(values)` renders the message with the given param values for the
 *   UI preview — must match the exact wording registered with Meta.
 */
// Friendly placeholder rendered in the preview when a param hasn't been
// filled in yet. We deliberately avoid Meta's raw {{N}} syntax here —
// the preview is for staff, not Meta, so "[date]" reads as a missing
// value much more clearly than "{{3}}". The actual outbound payload
// still uses the ordered param array built by buildTemplateParams.
const PLACEHOLDER = {
  customer_first_name: "[their name]",
  dog_name: "[dog's name]",
  date: "[date]",
  time: "[time]",
};

export const WHATSAPP_TEMPLATES = [
  {
    name: "smarter_appointment_reminder",
    label: "Appointment Reminder",
    description: "Remind a customer about an upcoming appointment",
    language: "en_GB",
    params: [
      { key: "customer_first_name", label: "Customer first name", autoFill: "customer_first_name" },
      { key: "dog_name", label: "Dog name", autoFill: "dog_name_select" },
      { key: "date", label: "Date (e.g. Monday 12 May)", autoFill: null },
      { key: "time", label: "Time (e.g. 9:00am)", autoFill: null },
    ],
    preview: (values) =>
      `Hi ${values.customer_first_name || PLACEHOLDER.customer_first_name}, just a quick reminder that ${values.dog_name || PLACEHOLDER.dog_name} has a grooming appointment with us on ${values.date || PLACEHOLDER.date} at ${values.time || PLACEHOLDER.time}. We're looking forward to seeing you both! 🐾`,
  },
  {
    name: "smarter_general_contact",
    label: "General Contact",
    description: "Reach out when you need to speak to a customer",
    language: "en_GB",
    params: [
      { key: "customer_first_name", label: "Customer first name", autoFill: "customer_first_name" },
    ],
    preview: (values) =>
      `Hi ${values.customer_first_name || PLACEHOLDER.customer_first_name}, it's the Smarter Dog Grooming team here! We just wanted to reach out — could you reply here when you get a chance? Thanks so much! 🐾`,
  },
  {
    name: "smarter_rebook_invite",
    label: "Rebook Invite",
    description: "Invite a customer to book their next groom",
    language: "en_GB",
    params: [
      { key: "customer_first_name", label: "Customer first name", autoFill: "customer_first_name" },
      { key: "dog_name", label: "Dog name", autoFill: "dog_name_select" },
    ],
    preview: (values) =>
      `Hi ${values.customer_first_name || PLACEHOLDER.customer_first_name}, it was lovely seeing ${values.dog_name || PLACEHOLDER.dog_name} recently! 🐾 Would you like to book their next groom? Just reply here and we'll sort something out.`,
  },
];

/** Pure helper: build the ordered params array for whatsapp-send from a template's param values. */
export function buildTemplateParams(template, values) {
  return template.params.map((p) => values[p.key] ?? "");
}
