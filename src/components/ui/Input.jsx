// src/components/ui/Input.jsx
//
// The single-line text control. Inside a <Field> it takes its id, description,
// invalid state and required flag from the field; on its own it needs an
// aria-label. `invalid` styles the border on its own, for the rare control
// that has an error but no Field around it.

import { forwardRef } from "react";
import { controlClassName } from "./formControl.js";
import { useControlProps } from "./Field.jsx";

export const Input = forwardRef(function Input(
  { type = "text", size = "md", surface = "page", className = "", ...rest },
  ref,
) {
  const { isInvalid, props } = useControlProps(rest);
  return (
    <input
      ref={ref}
      type={type}
      {...props}
      className={controlClassName({ invalid: isInvalid, size, surface, className })}
    />
  );
});
