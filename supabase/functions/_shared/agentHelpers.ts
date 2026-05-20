// Pure helpers extracted from whatsapp-agent/index.ts so the
// regression-sensitive bits can be exercised in vitest.
// Adding more helpers here is fine; keep them dependency-free.

// Heuristic: did the customer's latest message signal a positive
// confirmation of the AI's summary? False positives are worse than
// false negatives — bias strict. Token must match the start of the
// trimmed message.
// Deliberately omits "ye" — matches Irish/UK colloquial "ye" (= "you")
// which is unambiguously not a confirmation. The "yeh"/"yep"/"yup"/"yeah"
// entries cover the genuine phonetic variants.
export const POSITIVE_TOKENS = [
  "yes", "yeah", "yep", "yup", "yeh",
  "that's right", "thats right", "thats it", "that's it",
  "correct", "perfect", "all good", "sounds good", "sounds right",
  "looks good", "go ahead", "all correct",
];

export function isPositiveConfirm(text: string): boolean {
  const t = text.toLowerCase().trim();
  if (!t) return false;
  return POSITIVE_TOKENS.some((tok) =>
    t === tok || t.startsWith(`${tok} `) || t.startsWith(`${tok}.`) || t.startsWith(`${tok},`),
  );
}
