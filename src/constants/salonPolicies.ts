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
