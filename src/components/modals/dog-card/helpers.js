export function titleCase(str) {
  if (!str) return "";
  return str.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function waLink(phone) {
  if (!phone) return "#";
  const digits = phone.replace(/[\s\-()]/g, "");
  const intl = digits.startsWith("0") ? "44" + digits.slice(1) : digits;
  return `https://wa.me/${intl}`;
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
