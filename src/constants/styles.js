/**
 * Shared form styles used across all modals and form components.
 * Centralised here to prevent drift between 8+ files that previously
 * declared identical `inputStyle` / `labelStyle` objects inline.
 */
import { BRAND } from "./brand.js";

export const inputStyle = {
  width: "100%",
  padding: "10px 14px",
  borderRadius: 8,
  border: `1.5px solid ${BRAND.greyLight}`,
  fontSize: 13,
  fontFamily: "inherit",
  boxSizing: "border-box",
  outline: "none",
  color: BRAND.text,
  transition: "border-color 0.15s",
};

export const labelStyle = {
  fontSize: 11,
  fontWeight: 700,
  color: BRAND.textLight,
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
  color: BRAND.white,
  fontWeight: 700,
};

/** Attach to onFocus for consistent input highlight */
export const onInputFocus = (color = BRAND.blue) => (e) => {
  e.target.style.borderColor = color;
};

/** Attach to onBlur to reset input border */
export const onInputBlur = (e) => {
  e.target.style.borderColor = BRAND.greyLight;
};
