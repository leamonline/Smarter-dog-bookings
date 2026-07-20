import { PageHeaderPill } from "smarter-dog-ui";

export const Tones = () => (
  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
    <PageHeaderPill tone="neutral">Neutral</PageHeaderPill>
    <PageHeaderPill tone="open">Open</PageHeaderPill>
    <PageHeaderPill tone="closed">Closed</PageHeaderPill>
    <PageHeaderPill tone="purple">Purple</PageHeaderPill>
    <PageHeaderPill tone="teal" dot>
      Live
    </PageHeaderPill>
  </div>
);
