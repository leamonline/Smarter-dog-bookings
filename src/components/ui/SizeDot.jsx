// src/components/ui/SizeDot.jsx
//
// A coloured circle with a single letter inside (S / M / L / ?). The
// letter is the accessibility net: colour-blind users and anyone in
// a tiny-icon situation can read the size without relying on the dot
// colour alone. WCAG 2.1 SC 1.4.1.

const LETTERS = { small: "S", medium: "M", large: "L" };
const LABELS = { small: "Small dog", medium: "Medium dog", large: "Large dog" };

// Medium/large/unset use the darker brand shades as the fill so the white
// letter clears WCAG AA 4.5:1 (the lighter teal/coral/cyan sat at ~4.0/3.6/2.4).
// Flyer visual language, decision 7: Small and Medium are neutral letter chips
// (white, charcoal outline and letter); only Large is coloured, navy with a
// white letter. The letter is the signal; colour only marks the size that
// changes what a slot can hold.
const COLOURS = {
  small: { bg: "var(--color-surface-card)", border: "var(--color-size-small)", fg: "var(--color-brand-ink)" },
  medium: { bg: "var(--color-surface-card)", border: "var(--color-size-medium)", fg: "var(--color-brand-ink)" },
  large: { bg: "var(--color-size-large)", border: "var(--color-size-large)", fg: "#FFFFFF" },
  unset: { bg: "#0E7490", border: "#0C5168", fg: "#FFFFFF" },
};

/**
 * @param {{ size: 'small'|'medium'|'large'|null|undefined, dim?: number }} props
 */
export function SizeDot({ size, dim = 12 }) {
  const key = size && COLOURS[size] ? size : "unset";
  const palette = COLOURS[key];
  const letter = LETTERS[key] || "?";
  const label = LABELS[key] || "Size unknown";

  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className="inline-flex items-center justify-center font-extrabold leading-none select-none shrink-0"
      style={{
        width: dim,
        height: dim,
        borderRadius: "9999px",
        background: palette.bg,
        color: palette.fg,
        border: `1px solid ${palette.border}`,
        fontSize: Math.max(8, Math.round(dim * 0.65)),
        lineHeight: 1,
      }}
    >
      {letter}
    </span>
  );
}
