const UK_MOBILE_E164_PATTERN = /^\+447\d{9}$/;

/**
 * Validate the customer-login phone format for Supabase phone OTP auth.
 *
 * The login form intentionally accepts only the already-formatted UK E.164
 * mobile shape: +447 followed by 9 digits.
 *
 * Returns the unchanged number, or an empty string for invalid input.
 */
export function normaliseUkMobile(raw) {
  if (typeof raw !== "string") return "";

  const phone = raw.trim();
  return UK_MOBILE_E164_PATTERN.test(phone) ? phone : "";
}
