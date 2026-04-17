// Brand decoration components — used to add the smarterdog.co.uk
// playfulness to functional surfaces without hurting scannability.
// All decor is pointer-events: none so it never intercepts taps.

/**
 * The brand dog silhouette, paintable in any colour.
 * Uses the PNG at /images/dog-silhouette.png as a CSS mask, then
 * fills with a background-color. That way one asset → infinite colours.
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
        WebkitMaskImage: "url(/images/dog-silhouette.png)",
        maskImage: "url(/images/dog-silhouette.png)",
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

/**
 * SVG wave divider — sits at the bottom of one section to flow into the next.
 * Pass `fill` to set the colour of the wave (it should match the BG of the
 * section the wave is FLOWING INTO).
 */
export function WaveDivider({ fill = "var(--color-brand-paper)", className = "" }) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none w-full overflow-hidden leading-none ${className}`}
      style={{ marginBottom: "-1px" }}
    >
      <svg
        viewBox="0 0 1440 60"
        preserveAspectRatio="none"
        className="block w-full h-[40px]"
      >
        <path
          fill={fill}
          d="M0,32 C240,64 480,0 720,16 C960,32 1200,64 1440,32 L1440,60 L0,60 Z"
        />
      </svg>
    </div>
  );
}

/**
 * Hand-drawn brushstroke underline — used under one keyword in a heading
 * for the smarterdog.co.uk "gorgeous" / "scruffy" treatment.
 *
 * Wrap the keyword in a relative span and place this absolutely below it.
 */
export function HandDrawnUnderline({
  color = "var(--color-brand-yellow)",
  className = "",
}) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 200 16"
      preserveAspectRatio="none"
      className={`pointer-events-none ${className}`}
      style={{ display: "block", width: "100%", height: "10px" }}
    >
      <path
        d="M4,8 Q40,2 80,9 T160,7 Q180,5 196,8"
        stroke={color}
        strokeWidth="6"
        strokeLinecap="round"
        fill="none"
        opacity="0.6"
      />
    </svg>
  );
}
