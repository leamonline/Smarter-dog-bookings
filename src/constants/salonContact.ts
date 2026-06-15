// Salon contact details. One source of truth so customer-facing pages
// don't drift between formats.
//
// NOTE: this number is a WhatsApp-message line ONLY — there is no phone
// line for calls. Customers reach us by WhatsApp or email; never render a
// tel:/"Call" action for it.
export const SALON_PHONE_E164 = "+447873329440";
export const SALON_PHONE_NATIONAL = "07873329440";
export const SALON_PHONE_DISPLAY = "07873 329440";
export const SALON_WHATSAPP_URL = "https://wa.me/447873329440";

export const SALON_EMAIL = "bookings@smarterdog.co.uk";
export const SALON_EMAIL_HREF = `mailto:${SALON_EMAIL}`;
