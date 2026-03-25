import { BRAND } from "../../constants/index.js";

export function ErrorBanner({ message }) {
  return (
    <div style={{
      background: BRAND.closedRedBg, border: `1px solid ${BRAND.closedRed}`,
      borderRadius: 10, padding: "16px 20px", margin: "20px 0",
      display: "flex", alignItems: "center", gap: 10,
    }}>
      <span style={{ fontSize: 20 }}>{"\u26A0\uFE0F"}</span>
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color: BRAND.closedRed }}>Something went wrong</div>
        <div style={{ fontSize: 13, color: BRAND.text, marginTop: 4 }}>{message}</div>
      </div>
    </div>
  );
}
