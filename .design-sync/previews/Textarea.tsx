import { Field, Textarea } from "smarter-dog-ui";

export const InField = () => (
  <div style={{ maxWidth: 420 }}>
    <Field label="Grooming notes" hint="Coat condition, behaviour, anything to watch.">
      <Textarea defaultValue="Matting behind the ears — may need scissoring. Loves a fuss once he's up on the table." />
    </Field>
  </div>
);

export const Rows = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 420 }}>
    <Textarea rows={2} aria-label="Two rows" defaultValue="A short note, two rows tall." />
    <Textarea rows={5} aria-label="Five rows" defaultValue="A longer note with room to breathe — five rows for the full picture of a dog's visit." />
  </div>
);

export const Invalid = () => (
  <div style={{ maxWidth: 420 }}>
    <Field label="Grooming notes" error="Please keep notes under 500 characters.">
      <Textarea defaultValue="…" />
    </Field>
  </div>
);
