import { Field, Select } from "smarter-dog-ui";

export const InField = () => (
  <div style={{ maxWidth: 360 }}>
    <Field label="Service">
      <Select defaultValue="full">
        <option value="full">Full Groom</option>
        <option value="bath">Bath &amp; Brush</option>
        <option value="deshed">Bath &amp; De-shed</option>
        <option value="puppy">Puppy Groom</option>
      </Select>
    </Field>
  </div>
);

export const Sizes = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 360 }}>
    <Select size="sm" aria-label="Small" defaultValue="s">
      <option value="s">Small</option>
    </Select>
    <Select size="md" aria-label="Medium" defaultValue="m">
      <option value="m">Medium</option>
    </Select>
    <Select size="lg" aria-label="Large" defaultValue="l">
      <option value="l">Large</option>
    </Select>
  </div>
);

export const Invalid = () => (
  <div style={{ maxWidth: 360 }}>
    <Field label="Dog size" error="Please choose a size.">
      <Select defaultValue="">
        <option value="" disabled>
          Choose…
        </option>
        <option value="small">Small</option>
        <option value="medium">Medium</option>
        <option value="large">Large</option>
      </Select>
    </Field>
  </div>
);
