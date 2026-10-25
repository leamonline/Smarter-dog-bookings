// src/components/ui/Input.jsx
//
// The single-line text control. Inside a <Field> it takes its id, description,
// invalid state and required flag from the field; on its own it needs an
// aria-label. `invalid` styles the border on its own, for the rare control
// that has an error but no Field around it.

import { forwardRef } from "react";
import { controlClassName } from "./formControl.js";
import { useControlProps } from "./Field.jsx";

/**
 * @typedef {Omit<import("react").InputHTMLAttributes<HTMLInputElement>, "size"> & {
 *   size?: "sm" | "md" | "lg" | "portal" | "portal-sm";
 *   surface?: "page" | "paper";
 *   invalid?: boolean;
 * }} InputProps
 */
export const Input = /** @type {import("react").ForwardRefExoticComponent<InputProps & import("react").RefAttributes<HTMLInputElement>>} */ (forwardRef(function Input(
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
}));
