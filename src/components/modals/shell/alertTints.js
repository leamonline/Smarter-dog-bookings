import { ALERT_OPTIONS } from "../../../constants/index";

// Quiet tint per alert family — behavioural alerts read rose, caution
// reads amber, informational reads sky. Replaces the solid coral fills
// so alerts warn without shouting over the rest of the card. Shared by
// the dog and booking modals so the same alert always wears the same
// colour. Key by meaning, never by a coincidentally matching hex string.
export const ALERT_TINTS = {
  behaviour: "bg-rose-50 text-[#B83A4F] border border-rose-200",
  caution: "bg-amber-50 text-amber-800 border border-amber-200",
  information: "bg-sky-50 text-sky-800 border border-sky-200",
};

export function alertTint(label) {
  const opt = ALERT_OPTIONS.find((o) => o.label === label);
  return ALERT_TINTS[opt?.tone] || ALERT_TINTS.behaviour;
}
