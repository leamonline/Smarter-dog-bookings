const UK_MOBILE_E164_PATTERN = /^\+447\d{9}$/;

/**
 * Strip invisible Unicode format characters (general category Cf) from a string.
 *
 * Covers bidirectional marks (U+202A–202E embeddings/overrides, U+2066–2069
 * isolates), zero-width characters (U+200B–200D), LRM/RLM (U+200E/200F), the
 * byte-order mark (U+FEFF) and the soft hyphen (U+00AD). iOS Contacts and
 * WhatsApp wrap copied phone numbers in these (e.g. "‪07…‬"), which is invisible
 * on screen but silently breaks number validation — the digits no longer sit at
 * the start of the string. Note: Unicode NFC normalisation does NOT remove them,
 * so they must be stripped explicitly.
 *
 * Returns "" for non-string input.
 */
export function stripFormatChars(raw) {
  return typeof raw === "string" ? raw.replace(/\p{Cf}/gu, "") : "";
}

/**
 * Normalise a UK mobile to the E.164 form Supabase Auth expects (+447XXXXXXXXX).
 *
 * Accepts the formats a UK customer is most likely to type:
 *   • National with separators:    "07700 900123", "07700-900-123"
 *   • National no separators:      "07700900123"
 *   • International with +44:      "+44 7700 900123", "+447700900123"
 *   • +44(0) variant:              "+44 (0)7700 900123"
 *   • Bare 44 (no +):              "447700900123"
 *   • International dial prefix:   "00447700900123"
 *
 * Rejects landlines, non-UK numbers, and anything that doesn't resolve to
 * exactly +447 followed by 9 digits.
 *
 * Returns the normalised E.164 string, or "" for invalid input.
 */
export function normaliseUkMobile(raw) {
  if (typeof raw !== "string") return "";

  let phone = stripFormatChars(raw).replace(/[\s\-().]/g, "");
  if (phone.startsWith("00")) phone = "+" + phone.slice(2);
  phone = phone.replace(/^\+440/, "+44");
  if (/^447\d{9}$/.test(phone)) phone = "+" + phone;
  if (/^07\d{9}$/.test(phone)) phone = "+44" + phone.slice(1);

  return UK_MOBILE_E164_PATTERN.test(phone) ? phone : "";
}

// Normalise a phone number to international digits-only form (no leading +).
// Used to build tel: and wa.me links from however the phone was typed.
//   "07510053019"        → "447510053019"
//   "+447510053019"      → "447510053019"
//   "+44 (0)7510 053019" → "447510053019"
//   "0044 7510 053019"   → "447510053019"
//   "+1 415 555 0100"    → "14155550100"
// Returns "" when the input has no usable digits.
export function normalisePhoneDigits(phone) {
  if (!phone) return "";
  let digits = String(phone).replace(/\D/g, "");
  if (!digits) return "";
  digits = digits.replace(/^00/, "");
  digits = digits.replace(/^440(7\d{9})$/, "44$1");
  if (/^07\d{9}$/.test(digits)) digits = "44" + digits.slice(1);
  return digits;
}

/**
 * Validate a phone number typed for a customer/contact and return the value to
 * store alongside any error message.
 *
 * The rule, in plain terms: **if it looks like a UK mobile, it must be a valid
 * one.** A UK mobile is normalised to E.164 (+447XXXXXXXXX) — the form every
 * messaging path expects. A number that looks like a UK mobile but isn't the
 * right length (e.g. a digit dropped on entry) is rejected, because it sails
 * through a naive digit-count check and then silently fails to deliver on
 * WhatsApp/SMS — error 131026 "Message undeliverable". Landlines and non-UK
 * numbers are NOT mobile-shaped, so they're accepted as-is (trimmed) provided
 * they have at least 10 digits: still useful as a contact-of-record even though
 * we can't message them.
 *
 * Returns { value, error }:
 *   • valid UK mobile   → { value: "+447700900123", error: "" }   (normalised)
 *   • broken UK mobile  → { value: "",              error: <mobile-specific> }
 *   • landline / non-UK → { value: "<trimmed>",     error: "" }
 *   • too short         → { value: "",              error: <generic> }
 *   • empty input       → { value: "",              error: "" }    (caller decides if required)
 */
export function validateContactPhone(raw) {
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  if (!trimmed) return { value: "", error: "" };

  // A clean UK mobile (in any accepted format) — store the canonical E.164.
  const mobile = normaliseUkMobile(trimmed);
  if (mobile) return { value: mobile, error: "" };

  // Not a valid mobile. Decide whether it was *meant* to be one: strip to
  // digits and look at the national part (drop a 44 or 0 prefix). A leading 7
  // means someone was typing a mobile — so a missing/extra digit is an error,
  // not a landline.
  const digits = normalisePhoneDigits(trimmed);
  const national = digits.startsWith("44")
    ? digits.slice(2)
    : digits.startsWith("0")
      ? digits.slice(1)
      : digits;
  if (national.startsWith("7")) {
    return {
      value: "",
      error:
        "That looks like a UK mobile but the digits don't add up — check for a missing or extra digit (it should be 11, e.g. 07700 900123).",
    };
  }

  // Landline / international / other — keep it if it's a plausible length.
  if (digits.length >= 10) return { value: trimmed, error: "" };
  return {
    value: "",
    error: "Please enter a valid phone number (at least 10 digits).",
  };
}

// `tel:` link with a safe "#" fallback. Use in `<a href={telLink(phone)}>`
// where the anchor renders unconditionally.
export function telLink(phone) {
  const digits = normalisePhoneDigits(phone);
  if (!digits) return "#";
  return `tel:+${digits}`;
}

// `https://wa.me/<digits>` link with a safe "#" fallback. Always goes
// through wa.me so the link opens in the browser rather than stealing
// context to a desktop app.
export function waLink(phone) {
  const digits = normalisePhoneDigits(phone);
  if (!digits) return "#";
  return `https://wa.me/${digits}`;
}

// `tel:` link that returns null when there's no usable phone — use in
// `{tel && <a href={tel}>}` patterns where the anchor should be omitted
// rather than rendered as a dead "#".
export function telLinkOrNull(phone) {
  const digits = normalisePhoneDigits(phone);
  return digits ? `tel:+${digits}` : null;
}

// `https://wa.me/<digits>` returning null when there's no usable phone.
export function waMeLink(phone) {
  const digits = normalisePhoneDigits(phone);
  return digits ? `https://wa.me/${digits}` : null;
}

/**
 * Format a phone number for display to staff. UK mobiles in E.164 form
 * (+447XXXXXXXXX) render as "07XXX XXXXXX" — the national form a salon
 * staff member would read off a takeaway pad. Non-UK or malformed input
 * is returned as-is (trimmed), so we never show an empty card while
 * eating someone's number.
 */
export function formatPhoneForDisplay(raw) {
  if (typeof raw !== "string") return "";
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const normalised = normaliseUkMobile(trimmed);
  if (normalised) {
    // +447700900123 → 07700 900123
    const national = "0" + normalised.slice(3);
    return `${national.slice(0, 5)} ${national.slice(5)}`;
  }
  return trimmed;
}
