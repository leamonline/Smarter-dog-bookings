import { StatusPill } from "smarter-dog-ui";

export const States = () => (
  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
    <StatusPill state="ai_handling" />
    <StatusPill state="human_takeover" />
    <StatusPill state="snoozed" />
    <StatusPill state="closed" />
  </div>
);

export const Sizes = () => (
  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
    <StatusPill state="human_takeover" size="xs" />
    <StatusPill state="human_takeover" size="sm" />
  </div>
);
