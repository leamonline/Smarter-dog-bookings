// src/utils/intl.js
//
// Locale-aware helpers for tiny formatting jobs that show up in
// every report and summary string. Centralising them prevents the
// "1 bookings" pluralisation bugs flagged in the May 2026 review.

const PLURAL_RULES = typeof Intl !== "undefined" && typeof Intl.PluralRules === "function"
  ? new Intl.PluralRules("en-GB")
  : null;

/**
 * Pick the right singular/plural form for a count. Uses
 * Intl.PluralRules where available; falls back to `n === 1` for the
 * singular branch.
 *
 * Returns just the word — does NOT prefix the count, so callers can
 * format ("1 booking" vs "no bookings") however they like.
 */
export function intlPlural(n, singular, plural) {
  const form = PLURAL_RULES ? PLURAL_RULES.select(Number(n)) : (n === 1 ? "one" : "other");
  return form === "one" ? singular : plural;
}

/**
 * "1 booking" / "5 bookings". Combines `n` with the right form of
 * the noun.
 */
export function pluralCount(n, singular, plural) {
  return `${n} ${intlPlural(n, singular, plural)}`;
}

/**
 * Format a period-over-period delta as a percentage string.
 *
 * Returns "—" (em dash) when the previous period was zero, since
 * "+100% vs zero" is technically correct but misleading — there's
 * no rate of change you can divide by. Also returns "—" when both
 * values are zero.
 *
 * Otherwise returns a signed string like "+12%" or "-4%".
 */
export function formatDelta(current, previous) {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return "—";
  if (previous === 0) return "—";
  const pct = ((current - previous) / previous) * 100;
  const rounded = Math.round(pct);
  if (rounded === 0) return "0%";
  return rounded > 0 ? `+${rounded}%` : `${rounded}%`;
}
