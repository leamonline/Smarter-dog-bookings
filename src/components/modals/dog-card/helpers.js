export { titleCase } from "../../../utils/text.js";

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

export function waLink(phone) {
  const digits = normalisePhoneDigits(phone);
  if (!digits) return "#";
  return `https://wa.me/${digits}`;
}

export function telLink(phone) {
  const digits = normalisePhoneDigits(phone);
  if (!digits) return "#";
  return `tel:+${digits}`;
}

export function calcAge(dob) {
  if (!dob) return null;
  const [y, m] = dob.split("-").map(Number);
  if (!y || !m) return null;
  const now = new Date();
  let years = now.getFullYear() - y;
  let months = now.getMonth() + 1 - m;
  if (months < 0) { years--; months += 12; }
  if (years >= 1) return `${years} ${years === 1 ? "yr" : "yrs"}`;
  return `${months} ${months === 1 ? "month" : "months"}`;
}
