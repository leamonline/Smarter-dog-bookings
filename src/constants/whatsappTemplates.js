// src/constants/whatsappTemplates.js

/**
 * Each template maps to a Meta-approved WhatsApp message template.
 *
 * `params` is the ordered list of {{N}} placeholders in the registered
 * template body. The array order is what gets sent to Meta via
 * buildTemplateParams — Meta substitutes by index ({{1}} = params[0],
 * {{2}} = params[1], etc.), so this MUST match the numbering Meta has
 * on file or the send will 132xxx error.
 *
 * `autoFill` is a hint to the picker UI: which context key to
 * pre-populate from. Supported values:
 *   - "customer_first_name"
 *   - "dog_name_select" (dropdown if multiple dogs, text otherwise)
 *
 * `preview(values)` renders the message with the given param values
 * for the in-app preview pane — must match the exact wording
 * registered with Meta, otherwise staff send something that reads
 * differently from what they previewed.
 *
 * Template names here MUST match the registered names in Meta
 * Business Manager → WhatsApp Manager → Message Templates. As of
 * 2026-05-20 the salon has:
 *   - appointment_reminder_v1   (en_GB, 3 params, Active)
 *   - booking_confirmed_v1      (en_GB, 4 params, Active)
 *   - booking_changed_v1        (en,    3 params, Active)
 *   - ready_for_collection_v1   (en_GB, 2 params, PENDING Meta approval —
 *                                {{1}} dog name, {{2}} minutes. Sends fail
 *                                with a 132xxx gateway error until Approved.)
 *   - welcome_to_the_pack_v1    (en_GB, 1 param, PENDING Meta approval —
 *                                {{1}} customer first name. Sent when staff
 *                                approve a Join the Pack self-signup. Sends
 *                                fail with a 132xxx gateway error until it is
 *                                Approved in Meta Business Manager.)
 *   - hello_world               (en_US, Meta's starter — not customer-facing)
 * Add a new picker entry here only after the corresponding template
 * is Approved in Meta — otherwise sends will fail at the gateway.
 */
const PLACEHOLDER = {
  customer_first_name: "[their name]",
  dog_name: "[dog's name]",
  when: "[date and time]",
  service: "[service]",
  change_description: "[what changed]",
  minutes: "[mins]",
};

export const WHATSAPP_TEMPLATES = [
  {
    name: "appointment_reminder_v1",
    label: "Appointment Reminder",
    description: "Remind a customer about an upcoming appointment",
    status: "approved",
    language: "en_GB",
    params: [
      { key: "customer_first_name", label: "Customer first name", autoFill: "customer_first_name" },
      { key: "dog_name", label: "Dog name", autoFill: "dog_name_select" },
      { key: "appointment_when", label: "When (e.g. Monday 25 May at 9:00am)", autoFill: null },
    ],
    preview: (values) =>
      `Hi ${values.customer_first_name || PLACEHOLDER.customer_first_name}, just a friendly reminder that ${values.dog_name || PLACEHOLDER.dog_name} is booked in with us at Smarter Dog Grooming Salon for ${values.appointment_when || PLACEHOLDER.when}. Reply here if you need to change anything — see you soon..`,
  },
  {
    name: "booking_confirmed_v1",
    label: "Booking Confirmation",
    description: "Confirm a new or rescheduled booking",
    status: "approved",
    language: "en_GB",
    // Note Meta's body reads "{{1}}, {{2}}'s {{4}} is confirmed for {{3}}"
    // — service is placeholder #4 even though it appears mid-sentence.
    // Order here mirrors the registered placeholder numbering, not the
    // sentence reading order.
    params: [
      { key: "customer_first_name", label: "Customer first name", autoFill: "customer_first_name" },
      { key: "dog_name", label: "Dog name", autoFill: "dog_name_select" },
      { key: "appointment_when", label: "When (e.g. Monday 25 May at 9:00am)", autoFill: null },
      { key: "service", label: "Service (e.g. Full Groom)", autoFill: null },
    ],
    preview: (values) =>
      `Hi ${values.customer_first_name || PLACEHOLDER.customer_first_name}, ${values.dog_name || PLACEHOLDER.dog_name}'s ${values.service || PLACEHOLDER.service} is confirmed for ${values.appointment_when || PLACEHOLDER.when} at Smarter Dog Grooming Salon. We're looking forward to seeing you both. Reply here if anything changes.`,
  },
  {
    name: "booking_changed_v1",
    label: "Booking Update",
    description: "Tell a customer their booking has changed",
    status: "approved",
    language: "en",
    params: [
      { key: "customer_first_name", label: "Customer first name", autoFill: "customer_first_name" },
      { key: "dog_name", label: "Dog name", autoFill: "dog_name_select" },
      { key: "change_description", label: "What changed (e.g. moved to 10:30 instead of 9:00)", autoFill: null },
    ],
    preview: (values) =>
      `Hi ${values.customer_first_name || PLACEHOLDER.customer_first_name}, a quick update on ${values.dog_name || PLACEHOLDER.dog_name}'s booking: ${values.change_description || PLACEHOLDER.change_description}. If this isn't right or you have any questions, just reply here.`,
  },
  {
    name: "ready_for_collection_v1",
    label: "Ready for Collection",
    description: "Tell the owner or a trusted contact the dog is ready to collect",
    // Approved & live in Meta (verified 2026-06-15: 34 sends read by customers).
    status: "approved",
    language: "en_GB",
    params: [
      { key: "dog_name", label: "Dog name", autoFill: "dog_name_select" },
      { key: "minutes", label: "Minutes until ready (e.g. 15)", autoFill: null },
    ],
    preview: (values) =>
      `Hi! ${values.dog_name || PLACEHOLDER.dog_name} is all done and ready for collection in ${values.minutes || PLACEHOLDER.minutes} mins. See you soon — Smarter Dog Grooming Salon.`,
  },
  {
    // Approved & live in Meta (verified 2026-06-15: welcome sends read by
    // customers). Sent automatically when staff approve a "Join the Pack"
    // self-signup; the welcome edge function still falls back to SMS / email
    // when the customer has no WhatsApp / has opted out.
    name: "welcome_to_the_pack_v1",
    label: "Welcome to the Pack",
    description: "Welcome a newly-approved self-signup customer",
    status: "approved",
    language: "en_GB",
    params: [
      { key: "customer_first_name", label: "Customer first name", autoFill: "customer_first_name" },
    ],
    preview: (values) =>
      `Hi ${values.customer_first_name || PLACEHOLDER.customer_first_name}, welcome to the Pack! 🐾 You're all set up with Smarter Dog Grooming Salon and can now book appointments. See you soon!`,
  },
];

export const WHATSAPP_PICKER_TEMPLATES = WHATSAPP_TEMPLATES.filter(
  (template) => template.status === "approved",
);

/** Pure helper: build the ordered params array for whatsapp-send from a template's param values. */
export function buildTemplateParams(template, values) {
  return template.params.map((p) => values[p.key] ?? "");
}
