// GBP money helpers — the single place prices convert between integer pence
// (how price tables are stored) and pounds (how the legacy DB money columns
// paid_amount / deposit_amount / dogs.custom_price are denominated, and how
// figures read in the UI). No other file may parse a "£…" string.

/** Integer pence → display string: 4200 → "£42", 4250 → "£42.50". */
export function formatGBP(pence: number | null | undefined): string {
  if (pence == null || isNaN(Number(pence))) return "";
  const pounds = Math.trunc(pence / 100);
  const rem = Math.abs(pence % 100);
  return rem === 0 ? `£${pounds}` : `£${pounds}.${String(rem).padStart(2, "0")}`;
}

/**
 * User-typed price → integer pence, or null when it isn't a price.
 * Accepts "42", "£42", "42.5", "£42.50", "£42+" (trailing "+" is the
 * legacy "from" marker) and plain numbers (pounds). Rejects blank,
 * negatives and zero — a £0 price is never meaningful here (it's how the
 * accidental free-groom bug happened).
 */
export function parseGBPInput(input: unknown): number | null {
  if (typeof input === "number") {
    return isFinite(input) && input > 0 ? Math.round(input * 100) : null;
  }
  if (typeof input !== "string") return null;
  const cleaned = input.trim().replace(/^£/, "").replace(/\+$/, "").trim();
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const pence = Math.round(parseFloat(cleaned) * 100);
  return pence > 0 ? pence : null;
}

/** 4200 → 42 (number of pounds; may be fractional: 4250 → 42.5). */
export function penceToPounds(pence: number): number {
  return pence / 100;
}

/** 42 → 4200. */
export function poundsToPence(pounds: number): number {
  return Math.round(pounds * 100);
}

/**
 * Tolerant reader for a price-table value during the string→pence
 * transition: numbers are already pence; legacy strings ("£42", "£42+")
 * are pounds. Returns integer pence, or null for "N/A"/blank/junk.
 * Lets the app deploy before the salon_config.pricing migration runs
 * (and keeps old sample/seed data working).
 */
export function pricePenceFromTableValue(value: unknown): number | null {
  if (typeof value === "number") {
    return isFinite(value) && value > 0 ? Math.round(value) : null;
  }
  if (typeof value === "string") {
    if (value.trim().toUpperCase() === "N/A") return null;
    return parseGBPInput(value);
  }
  return null;
}
