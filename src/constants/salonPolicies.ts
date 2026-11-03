// Smarter Dog policy URLs. One source of truth so the onboarding gate,
// the dashboard footer, and anywhere else that links to the policies stay
// in sync. Hosted on the marketing site (smarterdog.co.uk).
export const SALON_TERMS_URL = "https://smarterdog.co.uk/terms";
export const SALON_MATTED_COAT_POLICY_URL =
  "https://smarterdog.co.uk/matted-coat-policy";
export const SALON_PRIVACY_URL = "https://smarterdog.co.uk/privacy";

// Bump this whenever the policies change materially so we can tell which
// version a customer agreed to (stored in humans.policies_version). Date
// string keeps it human-readable and monotonic.
export const POLICIES_VERSION = "2026-06-08";

// Plain-English notice shown wherever a customer gives their mobile number,
// agrees to the policies, or confirms a booking, so the SMS requirement is
// explained clearly and says the same thing everywhere. SMS is a required
// operational channel (supabase/functions/_shared/channelPolicy.ts): these
// messages are not marketing and don't depend on any optional tickbox.
// Promotions have their own, separate consent and none are sent today.
//
// Deliberately avoids the word "cancel": the booking confirm step must show no
// cancellation wording unless the server supplied a policy (its own test
// enforces that), and "any changes to it" covers a salon cancellation.
//
// NOTE for whoever owns the Terms/Privacy text on smarterdog.co.uk: it should
// say the same, and POLICIES_VERSION should be bumped when it does.
export const ESSENTIAL_MESSAGES_NOTICE =
  "We\u2019ll message you about your booking: confirmations, reminders, any changes to it, and when your dog is ready for collection. We use WhatsApp where we can, and text you if it doesn\u2019t reach you. We only send promotions if you separately say yes.";
