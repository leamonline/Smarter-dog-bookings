import { Field, Input, Textarea, Select } from "smarter-dog-ui";

export const WithInput = () => (
  <div style={{ maxWidth: 360 }}>
    <Field label="Phone number" hint="We only text about appointments.">
      <Input type="tel" defaultValue="07700 900782" />
    </Field>
  </div>
);

export const Required = () => (
  <div style={{ maxWidth: 360 }}>
    <Field label="Dog's name" markRequired>
      <Input defaultValue="Biscuit" />
    </Field>
  </div>
);

export const WithError = () => (
  <div style={{ maxWidth: 360 }}>
    <Field
      label="Phone number"
      error="Enter a valid UK mobile number."
    >
      <Input type="tel" defaultValue="0786" />
    </Field>
  </div>
);

export const WrappingATextarea = () => (
  <div style={{ maxWidth: 360 }}>
    <Field
      label="Grooming notes"
      hint="Anything the groomer should know before Biscuit arrives."
    >
      <Textarea defaultValue="Nervous around clippers — give him a minute to settle." />
    </Field>
  </div>
);

export const WrappingASelect = () => (
  <div style={{ maxWidth: 360 }}>
    <Field label="Service" hint="Pick the groom you'd like.">
      <Select defaultValue="full">
        <option value="full">Full Groom</option>
        <option value="bath">Bath &amp; Brush</option>
        <option value="deshed">Bath &amp; De-shed</option>
        <option value="puppy">Puppy Groom</option>
      </Select>
    </Field>
  </div>
);
