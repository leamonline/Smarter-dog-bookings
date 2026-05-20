const UK_MOBILE_E164_PATTERN = /^\+447\d{9}$/;

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

  let phone = raw.replace(/[\s\-().]/g, "");
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
