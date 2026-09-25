// Brand decoration components — used to add the smarterdog.co.uk
// playfulness to functional surfaces without hurting scannability.
// All decor is pointer-events: none so it never intercepts taps.

/**
 * The brand dog silhouette, paintable in any colour.
 * Uses the silhouette master at /app/logos/smarter-dog-silhouette.svg as a
 * CSS mask and fills it with a background-color, so one asset gives every
 * colour. The master is black on transparent, which is what makes it work as
 * a mask — do not recolour the file itself.
 *
 * Props:
 *   color    — any valid CSS colour (default: deep purple)
 *   size     — px or any CSS length (default: 80px)
 *   rotation — degrees (default: 0)
 *   opacity  — 0–1 (default: 1)
 *   className — extra classes (positioning, etc.)
 */
export function DogSilhouette({
  color = "var(--color-brand-purple)",
  size = 80,
  rotation = 0,
  opacity = 1,
  className = "",
  ariaHidden = true,
}) {
  const sizeStr = typeof size === "number" ? `${size}px` : size;
  return (
    <div
      aria-hidden={ariaHidden}
      className={className}
      style={{
        width: sizeStr,
        height: sizeStr,
        backgroundColor: color,
        opacity,
        transform: `rotate(${rotation}deg)`,
        WebkitMaskImage: "url(/app/logos/smarter-dog-silhouette.svg)",
        maskImage: "url(/app/logos/smarter-dog-silhouette.svg)",
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
        WebkitMaskSize: "contain",
        maskSize: "contain",
        WebkitMaskPosition: "center",
        maskPosition: "center",
        pointerEvents: "none",
      }}
    />
  );
}

/**
 * Floating brand decor scattered across a page background.
 * Sits absolutely behind everything (z-0, pointer-events: none),
 * so it never blocks taps or text selection.
 *
 * Renders 6 silhouettes in different brand colours + 3 soft circles,
 * deterministically positioned so they don't overlap interactive grid areas.
 */
const SILHOUETTES = [
  { top: "8%",  left: "4%",  size: 72, rotation: -8,  color: "var(--color-brand-cyan-light)",   opacity: 0.08 },
  { top: "22%", right: "6%", size: 96, rotation: 12,  color: "var(--color-brand-yellow)",       opacity: 0.10 },
  { top: "55%", left: "2%",  size: 64, rotation: -4,  color: "var(--color-brand-coral)",        opacity: 0.07 },
  { top: "70%", right: "3%", size: 88, rotation: 18,  color: "var(--color-brand-teal)",         opacity: 0.08 },
  { top: "88%", left: "10%", size: 60, rotation: 6,   color: "var(--color-brand-purple-light)", opacity: 0.09 },
  { top: "40%", left: "48%", size: 110, rotation: -14, color: "var(--color-brand-green)",       opacity: 0.05 },
];

const CIRCLES = [
  { top: "5%",  right: "12%", size: 220, color: "var(--color-brand-cyan-light)", opacity: 0.08 },
  { top: "45%", left: "-6%",  size: 280, color: "var(--color-brand-yellow)",     opacity: 0.07 },
  { top: "78%", right: "-4%", size: 200, color: "var(--color-brand-coral)",      opacity: 0.06 },
];

export function FloatingDecor() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden -z-10"
    >
      {CIRCLES.map((c, i) => (
        <div
          key={`c${i}`}
          style={{
            position: "absolute",
            width: `${c.size}px`,
            height: `${c.size}px`,
            top: c.top,
            left: c.left,
            right: c.right,
            backgroundColor: c.color,
            opacity: c.opacity,
            borderRadius: "9999px",
            filter: "blur(2px)",
          }}
        />
      ))}
      {SILHOUETTES.map((s, i) => (
        <div
          key={`s${i}`}
          style={{
            position: "absolute",
            top: s.top,
            left: s.left,
            right: s.right,
          }}
        >
          <DogSilhouette
            color={s.color}
            size={s.size}
            rotation={s.rotation}
            opacity={s.opacity}
          />
        </div>
      ))}
    </div>
  );
}

