// src/components/ui/Field.jsx
//
// A label, an optional hint, the control, and an optional error, wired
// together so a screen reader gets all of it: the label names the control, the
// hint and the error describe it, and an error marks it invalid.
//
//   <Field label="Phone number" hint="We only text about appointments." error={phoneError}>
//     <Input type="tel" value={phone} onChange={...} />
//   </Field>
//
// `required` marks the field to the browser as well (native validation, a
// browser pop-up). `markRequired` shows the same star and tells assistive
// technology (aria-required) but leaves validation to the form, for forms that
// check and explain their own errors.
//
// Input, Textarea and Select read the wiring from here, so inside a Field they
// need no id, aria-describedby or aria-invalid of their own. Outside a Field
// they still work; give them an aria-label.

import { createContext, useContext, useId } from "react";
import { InlineError } from "./InlineError.jsx";

const FieldContext = createContext(null);

// Shared by Input, Textarea and Select: folds the surrounding Field (if any)
// into the control's own props. Inside a Field the field's id always wins, so
// the label's htmlFor can never point at something else; a description the
// caller passed is kept and the field's hint and error ids are added to it.
export function useControlProps({ invalid = false, ...rest }) {
  const ctx = useContext(FieldContext);
  const isInvalid = invalid || Boolean(ctx?.invalid);
  const describedBy = [rest["aria-describedby"], ctx?.describedBy].filter(Boolean).join(" ") || undefined;
  return {
    isInvalid,
    props: {
      ...rest,
      ...(ctx ? { id: ctx.id } : {}),
      ...(ctx?.required ? { required: true } : {}),
      ...(ctx?.markRequired && !ctx?.required ? { "aria-required": true } : {}),
      "aria-describedby": describedBy,
      "aria-invalid": isInvalid ? true : rest["aria-invalid"],
    },
  };
}

/**
 * @param {{
 *   label: import("react").ReactNode;
 *   hint?: import("react").ReactNode;
 *   error?: import("react").ReactNode;
 *   required?: boolean;
 *   markRequired?: boolean;
 *   className?: string;
 *   children: import("react").ReactNode;
 * }} props
 */
export function Field({ label, hint, error, required = false, markRequired = false, className = "", children }) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <FieldContext.Provider value={{ id, describedBy, invalid: Boolean(error), required, markRequired }}>
      <div className={className}>
        <label htmlFor={id} className="mb-1 block text-sm font-semibold text-ink">
          {label}
          {(required || markRequired) && (
            <span aria-hidden="true" className="text-brand-coral-text">
              {" *"}
            </span>
          )}
        </label>
        {hint && (
          <p id={hintId} className="mb-1.5 text-xs text-ink-muted">
            {hint}
          </p>
        )}
        {children}
        <InlineError id={errorId} message={error} />
      </div>
    </FieldContext.Provider>
  );
}
