/**
 * Shared form styles used across all modals and form components.
 * Centralised here to prevent drift between 8+ files that previously
 * declared identical `inputStyle` / `labelStyle` objects inline.
 *
 * NOTE: These are kept as inline-style objects for backward compatibility
 * with any remaining consumers. New code should use Tailwind classes directly.
 */

export const inputStyle = {
  width: "100%",
  padding: "10px 14px",
  borderRadius: 8,
  border: "1.5px solid #E5E7EB",
  fontSize: 13,
  fontFamily: "inherit",
  boxSizing: "border-box",
  outline: "none",
  color: "#1F2937",
  transition: "border-color 0.15s",
};

export const labelStyle = {
  fontSize: 11,
  fontWeight: 700,
  color: "#6B7280",
  textTransform: "uppercase",
  letterSpacing: 0.5,
  display: "block",
  marginBottom: 4,
};

export const closeBtnStyle = {
  background: "rgba(255,255,255,0.2)",
  border: "none",
  borderRadius: 8,
  width: 28,
  height: 28,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  fontSize: 14,
  color: "#FFFFFF",
  fontWeight: 700,
};

/** Attach to onFocus for consistent input highlight */
export const onInputFocus = (color = "#0EA5E9") => (e) => {
  e.target.style.borderColor = color;
};

/** Attach to onBlur to reset input border */
export const onInputBlur = (e) => {
  e.target.style.borderColor = "#E5E7EB";
};
