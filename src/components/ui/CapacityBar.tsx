import { BRAND } from "../../constants/index.ts";

interface Props {
  used: number;
  max: number;
  isConstrained: boolean;
}

export function CapacityBar({ used, max, isConstrained }: Props) {
  return (
    <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
      {[0, 1].map((i) => (
        <div key={i} style={{
          width: 14, height: 20, borderRadius: 3,
          background: i < used ? (i < max ? BRAND.blue : BRAND.coral) : (i < max ? BRAND.greyLight : "transparent"),
          border: i < max ? `1.5px solid ${i < used ? BRAND.blue : BRAND.greyLight}` : `1.5px dashed ${BRAND.greyLight}`,
          transition: "all 0.2s ease",
        }} />
      ))}
      {isConstrained && (
        <span style={{ fontSize: 10, color: BRAND.coral, fontWeight: 600, marginLeft: 2 }}>2-2-1</span>
      )}
    </div>
  );
}
