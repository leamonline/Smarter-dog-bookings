import { CardStripe } from "smarter-dog-ui";

export const SolidAccent = () => (
  <div style={{ width: 240, borderRadius: 16, overflow: "hidden", border: "1px solid #e2e8f0" }}>
    <CardStripe accent="#FECC13" />
    <div style={{ padding: 16 }}>Solid brand-yellow accent</div>
  </div>
);

export const GradientAccent = () => (
  <div style={{ width: 240, borderRadius: 16, overflow: "hidden", border: "1px solid #e2e8f0" }}>
    <CardStripe accent={{ from: "#2D004B", to: "#5B3D80" }} />
    <div style={{ padding: 16 }}>Gradient accent</div>
  </div>
);
