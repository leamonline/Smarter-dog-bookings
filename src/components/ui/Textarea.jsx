// src/components/ui/Textarea.jsx
//
// The multi-line text control. Same wiring and styling as Input; grows
// vertically only, so it can never push a layout sideways.

import { forwardRef } from "react";
import { controlClassName } from "./formControl.js";
import { useControlProps } from "./Field.jsx";

/**
 * @typedef {Omit<import("react").TextareaHTMLAttributes<HTMLTextAreaElement>, "size"> & {
 *   size?: "sm" | "md" | "lg" | "portal" | "portal-sm";
 *   surface?: "page" | "paper";
 *   invalid?: boolean;
 * }} TextareaProps
 */
export const Textarea = /** @type {import("react").ForwardRefExoticComponent<TextareaProps & import("react").RefAttributes<HTMLTextAreaElement>>} */ (forwardRef(function Textarea(
  { rows = 3, size = "md", surface = "page", className = "", ...rest },
  ref,
) {
  const { isInvalid, props } = useControlProps(rest);
  return (
    <textarea
      ref={ref}
      rows={rows}
      {...props}
      className={controlClassName({ invalid: isInvalid, size, surface, className: `resize-y ${className}`.trim() })}
    />
  );
}));
