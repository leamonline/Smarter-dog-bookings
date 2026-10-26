import { Field, Input } from "smarter-dog-ui";

export const InField = () => (
  <div style={{ maxWidth: 360 }}>
    <Field label="Owner's name">
      <Input defaultValue="Sarah Jennings" />
    </Field>
  </div>
);

export const Sizes = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 360 }}>
    <Input size="sm" aria-label="Small" defaultValue="Small" />
    <Input size="md" aria-label="Medium" defaultValue="Medium" />
    <Input size="lg" aria-label="Large" defaultValue="Large" />
  </div>
);

export const States = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 360 }}>
    <Input aria-label="Normal" placeholder="e.g. Biscuit" />
    <Input aria-label="Invalid" invalid defaultValue="07" />
    <Input aria-label="Disabled" disabled defaultValue="Can't edit this" />
  </div>
);

export const Surfaces = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 360 }}>
    <Input surface="page" aria-label="On a page" defaultValue="On the page surface" />
    <div style={{ background: "#fff", padding: 12, borderRadius: 12 }}>
      <Input surface="paper" aria-label="On paper" defaultValue="On a paper card" />
    </div>
  </div>
);
