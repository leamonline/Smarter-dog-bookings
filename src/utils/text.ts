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

// Letter-only tokens that read as "didn't know the name" rather than a name.
// Punctuation/digit-only inputs ("?", "-", "...", "123") are caught by the
// no-letters check in isRealPersonName, so they don't need listing here.
const PLACEHOLDER_NAME_RE = /^(n\/?a|none|null|undefined|unknown|tbc|tbd|x{1,3})$/i;

/**
 * True when a person-name input looks like a real name attempt: non-empty
 * after trimming, contains at least one letter, and isn't a known
 * placeholder token ("?", "-", "n/a", "unknown", …). Deliberately light —
 * it blocks the junk that blinds owner/retention views, never unusual real
 * names (O'Brien, Xu and Ng all pass).
 */
export function isRealPersonName(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (!/\p{L}/u.test(trimmed)) return false;
  if (PLACEHOLDER_NAME_RE.test(trimmed)) return false;
  return true;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Format a YYYY-MM-DD date string to a readable UK format, e.g. "14 Apr 2026" */
export function formatDateStr(dateStr: string): string {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-");
  return `${parseInt(d, 10)} ${MONTHS[parseInt(m, 10) - 1]} ${y}`;
}
