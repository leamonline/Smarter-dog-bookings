export function ScribbleUnderline({ color = "var(--sd-yellow)", className = "" }) {
  return (
    <svg
      viewBox="0 0 200 14"
      preserveAspectRatio="none"
      aria-hidden="true"
      className={`scribble-underline ${className}`}
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
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  );
}
