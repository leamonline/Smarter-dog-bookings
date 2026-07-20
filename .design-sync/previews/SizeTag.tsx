import { SizeTag } from "smarter-dog-ui";

export const Sizes = () => (
  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
    <SizeTag size="small" />
    <SizeTag size="medium" />
    <SizeTag size="large" />
  </div>
);

export const HeaderMode = () => (
  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
    <SizeTag size="medium" headerMode />
    <SizeTag size="large" legendMode />
  </div>
);
