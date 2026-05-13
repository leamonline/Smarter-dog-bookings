export function ScribbleDivider({ color = "rgba(45, 0, 75, 0.15)" }) {
  return (
    <svg
      viewBox="0 0 400 8"
      preserveAspectRatio="none"
      aria-hidden="true"
      style={{ width: "100%", height: 8, display: "block", margin: "8px 0" }}
    >
      <path
        d="M2 4 Q 80 1, 160 5 T 320 4 T 398 4"
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
