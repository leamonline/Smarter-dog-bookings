import { BRAND } from "../../constants/index.ts";

export function LoadingSpinner(): React.ReactElement {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      minHeight: 300, gap: 16,
    }}>
      <div style={{
        width: 40, height: 40, border: `4px solid ${BRAND.greyLight}`,
        borderTopColor: BRAND.blue, borderRadius: "50%",
        animation: "spin 0.8s linear infinite",
      }} />
      <div style={{ fontSize: 14, color: BRAND.textLight, fontWeight: 600 }}>Loading...</div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
