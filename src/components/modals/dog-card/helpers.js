export { titleCase } from "../../../utils/text";
// Phone-link helpers used to live here. They moved to `src/utils/phone.js`
// so the same `normalisePhoneDigits` is shared with the inbox-summary
// path. Re-exported so existing dog-card consumers keep their import.
export { normalisePhoneDigits, telLink, waLink } from "../../../utils/phone.js";

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
