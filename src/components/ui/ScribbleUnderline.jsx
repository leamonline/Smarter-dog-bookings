// The yellow swash under a title (flyer visual language, decision 4). `draw`
// makes the stroke draw itself in once, the approved hero-moment motion
// (decision 10); the keyframes in src/index.css remove it under
// prefers-reduced-motion, so the finished line shows instead. pathLength="1"
// lets that animation work in fractions of the path, whatever its drawn length.
export function ScribbleUnderline({ color = "var(--color-brand-yellow)", className = "", draw = false }) {
  return (
    <svg
      viewBox="0 0 200 14"
      preserveAspectRatio="none"
      aria-hidden="true"
      className={`scribble-underline${draw ? " scribble-underline--draw" : ""} ${className}`}
      style={{
        position: "absolute",
        left: "-2%",
        right: "-2%",
        bottom: "-6px",
        width: "104%",
        height: "12px",
        color,
        pointerEvents: "none",
      }}
    >
      <path
        d="M2 10 C 40 3, 80 13, 120 7 S 180 3, 198 9"
        pathLength="1"
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  );
}
