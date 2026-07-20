import { SizeDot } from "smarter-dog-ui";

export const Sizes = () => (
  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
    <SizeDot size="small" />
    <SizeDot size="medium" />
    <SizeDot size="large" />
    <SizeDot size={null} />
  </div>
);

export const LargerDim = () => <SizeDot size="medium" dim={28} />;
