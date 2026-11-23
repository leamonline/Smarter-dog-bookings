export const SIZE_FALLBACK = {
  primary: "#0099BD",
  light: "#E0F7FC",
  gradient: ["#00B8E0", "#0099BD"],
  headerText: "#FFFFFF",
  headerTextSub: "rgba(255,255,255,0.8)",
};

// Flyer visual language, decision 7 (22 November 2026): only Large stands out.
// Small and Medium cost the same seat in the capacity engine, so they share one
// neutral look (charcoal fill, grey wash); Large, the size that changes what a
// slot can hold, is navy. `primary` and `gradient` are fills under `headerText`;
// `light` is a wash under dark text. The size letter is always shown as well.
const NEUTRAL_SIZE = {
  primary: "var(--color-brand-ink)",
  light: "#F6F4F2",
  gradient: ["var(--color-ink-soft)", "var(--color-brand-ink)"],
  headerText: "#FFFFFF",
  headerTextSub: "rgba(255,255,255,0.8)",
};

export const SIZE_THEME = {
  small: NEUTRAL_SIZE,
  medium: NEUTRAL_SIZE,
  large: {
    primary: "var(--color-brand-cyan-dark)",
    light: "#EAF4FF",
    gradient: ["var(--color-brand-cyan)", "var(--color-brand-cyan-dark)"],
    headerText: "#FFFFFF",
    headerTextSub: "rgba(255,255,255,0.8)",
  },
};
