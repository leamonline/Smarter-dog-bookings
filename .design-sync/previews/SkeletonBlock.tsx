import { SkeletonBlock } from "smarter-dog-ui";

export const Shapes = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 10, width: 220 }}>
    <SkeletonBlock className="h-4 w-2/3" />
    <SkeletonBlock className="h-3 w-full" />
    <SkeletonBlock className="w-full rounded-xl" style={{ height: 96 }} />
  </div>
);
