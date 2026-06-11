import { ALERT_OPTIONS } from "../../../constants/index";

// Quiet tint per alert family — behavioural alerts read rose, caution
// reads amber, informational reads sky. Replaces the solid coral fills
// so alerts warn without shouting over the rest of the card. Shared by
// the dog and booking modals so the same alert always wears the same
// colour.
export const ALERT_TINTS = {
  "var(--color-brand-coral)": "bg-rose-50 text-[#B83A4F] border border-rose-200",
  "#D97706": "bg-amber-50 text-amber-800 border border-amber-200",
  "#0099BD": "bg-sky-50 text-sky-800 border border-sky-200",
};

export function alertTint(label) {
  const opt = ALERT_OPTIONS.find((o) => o.label === label);
  return ALERT_TINTS[opt?.color] || ALERT_TINTS["var(--color-brand-coral)"];
}
