import { ToggleChip } from "smarter-dog-ui";

const noop = () => {};

export const OnAndOff = () => (
  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
    <ToggleChip pressed={false} onClick={noop}>Flea bath</ToggleChip>
    <ToggleChip pressed onClick={noop}>Sensitive shampoo</ToggleChip>
    <ToggleChip pressed={false} onClick={noop} disabled>Anal glands</ToggleChip>
  </div>
);

export const WithCounts = () => (
  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
    <ToggleChip pressed onClick={noop} count={3}>Unread</ToggleChip>
    <ToggleChip pressed={false} onClick={noop} count={0}>Drafts</ToggleChip>
    <ToggleChip pressed={false} onClick={noop} count={12}>Bookings</ToggleChip>
  </div>
);

export const SizesAndTones = () => (
  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
    <ToggleChip size="sm" pressed tone="cyan" onClick={noop}>Small, cyan</ToggleChip>
    <ToggleChip size="md" pressed tone="ink" onClick={noop}>Medium, ink</ToggleChip>
  </div>
);
