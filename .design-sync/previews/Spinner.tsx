import { Spinner } from "smarter-dog-ui";

export const Sizes = () => (
  <div style={{ display: "flex", gap: 16, alignItems: "center", color: "#2D004B" }}>
    <Spinner size="sm" />
    <Spinner size="md" />
    <Spinner size="lg" />
  </div>
);
