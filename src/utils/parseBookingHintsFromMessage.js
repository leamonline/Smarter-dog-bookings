// parseBookingHintsFromMessage — pull date + slot hints out of a WhatsApp
// customer message so the New Booking dialog can pre-fill instead of
// defaulting to today.
//
// Returns: { dateStr: "YYYY-MM-DD" | null, slot: "HH:MM" | null }

const DOW_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MONTH_NAMES = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

function pad2(n) { return String(n).padStart(2, "0"); }
function toDateStr(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function parseTime(text) {
  // Strip slash-date patterns first so "18/05 at 8.30" doesn't match 18 as the hour.
  const stripped = text.replace(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g, "");

  // 9am, 9:30am, 9.30am, 09:30, 14:00, 2pm
  const re = /\b(\d{1,2})(?::|\.)?(\d{2})?\s*(am|pm)?\b/i;
  const m = stripped.match(re);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  const period = (m[3] || "").toLowerCase();
  if (period === "pm" && h < 12) h += 12;
  if (period === "am" && h === 12) h = 0;
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  // Guard against bare numbers with no time context (e.g. ordinal day digits
  // that slipped through) — require either a period (am/pm) OR a minutes part.
  if (!period && !m[2]) return null;
  return `${pad2(h)}:${pad2(min)}`;
}

function parseDate(text, referenceDate) {
  const t = text.toLowerCase();
  const now = new Date(referenceDate);

  if (/\btomorrow\b/.test(t)) {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    return toDateStr(d);
  }
  if (/\btoday\b/.test(t)) return toDateStr(now);

  const slashMatch = t.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (slashMatch) {
    const day = parseInt(slashMatch[1], 10);
    const month = parseInt(slashMatch[2], 10) - 1;
    let year = slashMatch[3] ? parseInt(slashMatch[3], 10) : now.getFullYear();
    if (year < 100) year += 2000;
    const d = new Date(year, month, day);
    if (!isNaN(d.getTime())) return toDateStr(d);
  }

  const ordinalMatch = t.match(/\b(?:on the |the )?(\d{1,2})(?:st|nd|rd|th)\b/);
  if (ordinalMatch) {
    const day = parseInt(ordinalMatch[1], 10);
    // Use the day as stated in the current month — don't roll forward.
    // Customers say "the 11th" meaning a specific date they have in mind.
    if (day >= 1 && day <= 31) {
      const candidate = new Date(now.getFullYear(), now.getMonth(), day);
      return toDateStr(candidate);
    }
  }

  for (let i = 0; i < DOW_NAMES.length; i++) {
    const re = new RegExp(`\\b${DOW_NAMES[i]}\\b`);
    if (re.test(t)) {
      const target = i;
      const today = now.getDay();
      let offset = target - today;
      if (offset <= 0) offset += 7;
      const d = new Date(now);
      d.setDate(d.getDate() + offset);
      return toDateStr(d);
    }
  }

  for (let i = 0; i < MONTH_NAMES.length; i++) {
    const re = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:of\\s+)?${MONTH_NAMES[i]}\\b`);
    const m = t.match(re);
    if (m) {
      const day = parseInt(m[1], 10);
      const d = new Date(now.getFullYear(), i, day);
      if (d < now) d.setFullYear(d.getFullYear() + 1);
      return toDateStr(d);
    }
  }

  return null;
}

export function parseBookingHintsFromMessage(text, { referenceDate = new Date() } = {}) {
  if (!text) return { dateStr: null, slot: null };
  return {
    dateStr: parseDate(text, referenceDate),
    slot: parseTime(text),
  };
}
