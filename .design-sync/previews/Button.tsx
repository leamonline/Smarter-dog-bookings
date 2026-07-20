import { Button } from "smarter-dog-ui";

export const Variants = () => (
  <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
    <Button variant="primary">Confirm booking</Button>
    <Button variant="danger">Cancel booking</Button>
    <Button variant="ghost">Not now</Button>
    <Button variant="link">Skip this step</Button>
  </div>
);

export const Sizes = () => (
  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
    <Button size="sm">Small</Button>
    <Button size="md">Medium</Button>
  </div>
);

export const States = () => (
  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
    <Button loading>Saving…</Button>
    <Button disabled>Disabled</Button>
    <Button fullWidth>Full width</Button>
  </div>
);
