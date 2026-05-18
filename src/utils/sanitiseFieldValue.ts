// Some legacy rows in the dataset carry literal placeholder strings —
// "Unknown" breeds from imports, "Null" surnames from an old faker
// pipeline. New writes can't introduce them (see the CHECK constraint
// added in migration 20260513150000_fix_null_surnames.sql), but old
// rows can still hit the UI before they're cleaned up.
//
// This helper strips those tokens at the data-layer transform so every
// downstream consumer can treat the field as "blank" without each
// surface re-implementing the check.

const PLACEHOLDER_TOKENS = new Set([
  "",
  "unknown",
  "unknown owner",
  "null",
  "n/a",
  "none",
  "tbd",
  "undefined",
]);

export function sanitiseFieldValue(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (PLACEHOLDER_TOKENS.has(trimmed.toLowerCase())) return "";
  return trimmed;
}
