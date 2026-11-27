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
//
// Wording signed off by the owner on 22 November 2026. The heading appears on the
// booking confirm step; the notice itself appears there and on both screens where
// a customer gives their mobile number.
export const MESSAGE_CHANNEL_NOTICE = "We\u2019ll use WhatsApp where possible or send you a text if preferred.";
export const ESSENTIAL_MESSAGES_HEADING = "We\u2019ll keep you in the loop!";
export const ESSENTIAL_MESSAGES_NOTICE =
  "We\u2019ll send you confirmations, booking updates, and a message when your dog is ready to come home. " +
  MESSAGE_CHANNEL_NOTICE +
  " Don\u2019t worry, we\u2019ll only send you offers or promotions if you\u2019ve said you\u2019d like them!";
