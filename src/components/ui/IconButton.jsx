// src/components/ui/IconButton.jsx
//
// A button that is only an icon. It exists so the accessible name is not
// optional: `label` is required, becomes the aria-label, and a missing one is
// warned about in development. (Button warns too, but an icon-only <Button>
// is easy to write by accident; this one cannot be written without a name.)
//
// Same family as Button: pill shape, the same focus ring, press and disabled
// behaviour. The visible box is 32px (sm) or 36px (md); on a touch screen the
// hit area grows to the 44px minimum without moving the glyph.
//
// Tailwind v4 detects classes by literal occurrence, so every option is a full
// literal string in the maps below.

import { forwardRef } from "react";
import { logger } from "../../lib/logger";

const BASE =
  "inline-flex shrink-0 items-center justify-center rounded-full font-[inherit] " +
  "cursor-pointer select-none border " +
  "motion-safe:transition-colors motion-safe:duration-[var(--duration-base)] " +
  "active:scale-[0.97] " +
  "focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-ink " +
  "pointer-coarse:min-h-11 pointer-coarse:min-w-11 " +
  "disabled:cursor-not-allowed disabled:active:scale-100";

const VARIANTS = {
  quiet:
    "bg-transparent text-slate-700 border-transparent hover:bg-slate-100 " +
    "disabled:text-slate-500 disabled:hover:bg-transparent",
  ghost:
    "bg-white text-slate-700 border-[1.5px] border-slate-200 " +
    "hover:bg-slate-50 hover:border-slate-400 " +
    "disabled:text-slate-500 disabled:hover:bg-white disabled:hover:border-slate-200",
  danger:
    "bg-brand-coral-dark text-white border-transparent hover:bg-brand-coral-deep " +
    "disabled:bg-slate-100 disabled:text-slate-600",
};

const SIZES = {
  sm: "h-8 w-8",
  md: "h-9 w-9",
};

/**
 * @typedef {Omit<import("react").ButtonHTMLAttributes<HTMLButtonElement>, "type" | "aria-label"> & {
 *   label: string;
 *   variant?: "quiet" | "ghost" | "danger";
 *   size?: "sm" | "md";
 *   type?: "button" | "submit" | "reset";
 * }} IconButtonProps
 */
export const IconButton = /** @type {import("react").ForwardRefExoticComponent<IconButtonProps & import("react").RefAttributes<HTMLButtonElement>>} */ (forwardRef(function IconButton(
  { label, variant = "quiet", size = "md", type, className = "", children, ...rest },
  ref,
) {
  if (import.meta.env.DEV && !label) {
    logger.warn("[IconButton] missing label: an icon-only button has no accessible name.");
  }
  const cls = [BASE, VARIANTS[variant] || VARIANTS.quiet, SIZES[size] || SIZES.md, className]
    .filter(Boolean)
    .join(" ");
  return (
    <button ref={ref} type={type || "button"} aria-label={label} className={cls} {...rest}>
      {children}
    </button>
  );
}));
