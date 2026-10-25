// src/components/ui/Select.jsx
//
// The native dropdown, styled like Input. It stays a real <select> on purpose:
// the browser's own picker is the best experience on a phone and costs nothing
// to keep accessible. Pass <option>s as children.

import { forwardRef } from "react";
import { controlClassName } from "./formControl.js";
import { useControlProps } from "./Field.jsx";

/**
 * @typedef {Omit<import("react").SelectHTMLAttributes<HTMLSelectElement>, "size"> & {
 *   size?: "sm" | "md" | "lg" | "portal" | "portal-sm";
 *   surface?: "page" | "paper";
 *   invalid?: boolean;
 * }} SelectProps
 */
export const Select = /** @type {import("react").ForwardRefExoticComponent<SelectProps & import("react").RefAttributes<HTMLSelectElement>>} */ (forwardRef(function Select(
  { size = "md", surface = "page", className = "", children, ...rest },
  ref,
) {
  const { isInvalid, props } = useControlProps(rest);
  return (
    <select
      ref={ref}
      {...props}
      className={controlClassName({ invalid: isInvalid, size, surface, className })}
    >
      {children}
    </select>
  );
}));
