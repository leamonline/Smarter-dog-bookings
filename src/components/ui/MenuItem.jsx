// src/components/ui/MenuItem.jsx
//
// One row in a menu (`role="menu"`). It is a real button with `role="menuitem"`,
// so it is in the tab order and answers Enter and Space like any button. The
// menu that holds it owns opening, closing, Escape and where it appears; this
// only draws the row, so every menu in the app reads the same.
//
// `tone="danger"` is for the one destructive row, in the existing danger ink.
// A disabled row stays readable (not faded to nothing). Every class is a literal
// string because Tailwind v4 finds classes by literal occurrence.
import { forwardRef } from "react";

const BASE =
  "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm font-semibold font-[inherit] " +
  "bg-transparent border-none cursor-pointer " +
  "motion-safe:transition-colors motion-safe:duration-[var(--duration-base)] " +
  "focus-visible:bg-slate-100 focus-visible:outline-none " +
  "pointer-coarse:min-h-11 " +
  "disabled:cursor-not-allowed disabled:hover:bg-transparent";

const TONES = {
  default: "text-slate-700 hover:bg-slate-50 disabled:text-slate-500",
  danger: "text-brand-coral-text hover:bg-brand-coral-light disabled:text-slate-500",
};

/**
 * @param {{
 *   tone?: "default" | "danger";
 *   icon?: import("react").ReactNode;
 *   children: import("react").ReactNode;
 * } & Omit<import("react").ComponentPropsWithoutRef<"button">, "role">} props
 */
export const MenuItem = forwardRef(function MenuItem(
  { tone = "default", icon = null, className = "", children, type = "button", ...rest },
  ref,
) {
  return (
    <button ref={ref} type={type} role="menuitem" className={`${BASE} ${TONES[tone] ?? TONES.default} ${className}`} {...rest}>
      {icon ? <span aria-hidden="true" className="shrink-0">{icon}</span> : null}
      {children}
    </button>
  );
});
