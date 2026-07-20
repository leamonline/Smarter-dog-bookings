import { SkeletonCircle } from "smarter-dog-ui";

export const Sizes = () => (
  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
    <SkeletonCircle size={24} />
    <SkeletonCircle size={40} />
    <SkeletonCircle size={64} />
  </div>
);
