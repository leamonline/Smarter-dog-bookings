// src/components/ui/SizeDot.jsx
//
// A coloured circle with a single letter inside (S / M / L / ?). The
// letter is the accessibility net: colour-blind users and anyone in
// a tiny-icon situation can read the size without relying on the dot
// colour alone. WCAG 2.1 SC 1.4.1.

const LETTERS = { small: "S", medium: "M", large: "L" };
const LABELS = { small: "Small dog", medium: "Medium dog", large: "Large dog" };

const COLOURS = {
  small: { bg: "#F5C518", border: "#D4A500", fg: "#2D004B" },
  medium: { bg: "#2D8B7A", border: "#1E6B5C", fg: "#FFFFFF" },
  large: { bg: "#E7546C", border: "#C93D63", fg: "#FFFFFF" },
  unset: { bg: "#00B8E0", border: "#0099BD", fg: "#FFFFFF" },
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
