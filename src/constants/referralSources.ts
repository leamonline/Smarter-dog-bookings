// Options for the "Where did you hear about us?" question on the customer
// self-signup form. The chosen label is stored verbatim on humans.heard_about_us
// (or the free text typed when "Other" is picked). Keep this list short and
// plain — it's customer-facing.
export const REFERRAL_SOURCE_OTHER = "Other";

export const REFERRAL_SOURCES = [
  "Google search",
  "Facebook",
  "Instagram",
  "Friend or family recommendation",
  "Walked / drove past",
  "TikTok",
  "Vet / groomer referral",
  REFERRAL_SOURCE_OTHER,
] as const;

export type ReferralSource = (typeof REFERRAL_SOURCES)[number];
