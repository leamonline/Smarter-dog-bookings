import { Badge } from "smarter-dog-ui";

export const Tones = () => (
  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
    <Badge tone="neutral">Neutral</Badge>
    <Badge tone="info">Info</Badge>
    <Badge tone="success">Success</Badge>
    <Badge tone="warning">Warning</Badge>
    <Badge tone="danger">Danger</Badge>
    <Badge tone="brand">Brand</Badge>
  </div>
);

export const Variants = () => (
  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
    <Badge variant="soft" tone="brand">Soft</Badge>
    <Badge variant="solid" tone="brand">Solid</Badge>
    <Badge variant="outline" tone="brand">Outline</Badge>
  </div>
);

export const Sizes = () => (
  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
    <Badge size="xs" tone="info" uppercase>
      New
    </Badge>
    <Badge size="sm" tone="success">
      Confirmed
    </Badge>
  </div>
);
