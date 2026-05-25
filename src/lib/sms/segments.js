// ============================================================
// src/lib/sms/segments.js
//
// SMS segment estimator. Approximates Twilio's per-segment billing:
//   - GSM-7 charset:  160 single, 153 per segment in concatenation
//   - UCS-2 (any non-GSM-7 char): 70 single, 67 per segment
// Real billing is computed Twilio-side; we surface a hint so staff
// know roughly what a longer SMS will cost / when it splits.
//
// Extracted from the inbox compose box so the reminder SMS composer
// and the unit tests can share the exact same logic.
// ============================================================

// Characters outside 32..126 that the GSM-7 default + extension tables
// still encode in a single 7-bit unit (the common Western-European set
// a UK salon actually types).
const GSM7_EXTRA_CHARS = new Set(
  "£¥§¿¡¤€äöüÄÖÜßéèìòùÉÈÌÒÙñÑàâêîôûÀÂÊÎÔÛ".split(""),
);

export function isGsm7Char(ch) {
  const code = ch.codePointAt(0);
  if (code === undefined) return false;
  if (code === 9 || code === 10 || code === 13) return true; // tab, LF, CR
  if (code >= 32 && code <= 126) return true;
  return GSM7_EXTRA_CHARS.has(ch);
}

/**
 * @param {string} text
 * @returns {{ length: number, segments: number, encoding: "GSM-7" | "UCS-2" }}
 */
export function smsSegmentInfo(text) {
  const length = text.length;
  if (length === 0) return { length, segments: 0, encoding: "GSM-7" };
  let allGsm7 = true;
  for (const ch of text) {
    if (!isGsm7Char(ch)) {
      allGsm7 = false;
      break;
    }
  }
  if (allGsm7) {
    return {
      length,
      encoding: "GSM-7",
      segments: length <= 160 ? 1 : Math.ceil(length / 153),
    };
  }
  return {
    length,
    encoding: "UCS-2",
    segments: length <= 70 ? 1 : Math.ceil(length / 67),
  };
}
