export function titleCase(str: string): string {
  if (!str) return "";
  return str.replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Defensive surname clean-up. Returns "" when the input is falsy or
 * one of the common sentinel strings that leak into customer data
 * ("Null", "Undefined", "N/A") — usually from a CSV import or a
 * fallback assignment in seed data.
 *
 * Keeps the original casing for everything else, since the surname
 * may legitimately contain mixed case (McDonald, O'Brien).
 */
export function normaliseSurname(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (/^(null|undefined|n\/a|none)$/i.test(trimmed)) return "";
  return trimmed;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Format a YYYY-MM-DD date string to a readable UK format, e.g. "14 Apr 2026" */
export function formatDateStr(dateStr: string): string {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-");
  return `${parseInt(d, 10)} ${MONTHS[parseInt(m, 10) - 1]} ${y}`;
}
