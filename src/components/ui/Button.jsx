// src/components/ui/Button.jsx
//
// Canonical button primitive for the staff dashboard. Mirrors the visual
// language of the .btn-* utility classes in index.css (yellow/purple primary,
// coral danger, white/slate ghost) but as a real React component with
// variants, sizes, loading + icon support, and consistent a11y.
//
// The .btn-* CSS classes stay valid for un-migrated call sites; new and
// touched code should use <Button>.
//
// Tailwind v4 detects classes by literal occurrence, so every variant/size is
// a full literal string in the maps below — never interpolated.

import { forwardRef } from "react";
import { Spinner } from "./Spinner.jsx";

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-full font-semibold font-[inherit] " +
  "cursor-pointer select-none border whitespace-nowrap " +
  "motion-safe:transition-all motion-safe:duration-[var(--duration-base)] " +
  "motion-safe:hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.97] " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 " +
  "disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:active:scale-100";

const VARIANTS = {
  primary:
    "bg-brand-yellow text-brand-purple border-transparent shadow-cta-yellow " +
    "hover:bg-brand-yellow-dark focus-visible:ring-brand-yellow-dark " +
    "disabled:bg-slate-200 disabled:text-slate-500 disabled:shadow-none",
  danger:
    "bg-brand-coral text-white border-transparent " +
    "hover:bg-brand-coral-dark focus-visible:ring-brand-coral-dark " +
    "disabled:bg-slate-200 disabled:text-slate-500 disabled:shadow-none",
  ghost:
    "bg-white text-slate-700 border-[1.5px] border-slate-200 " +
    "hover:bg-slate-50 hover:border-slate-400 focus-visible:ring-slate-400 " +
    "disabled:bg-white disabled:text-slate-300 disabled:border-slate-100",
  link:
    "bg-transparent text-ink border-transparent underline-offset-2 " +
    "hover:underline focus-visible:ring-brand-yellow-dark " +
    "motion-safe:hover:translate-y-0 active:scale-100",
};

const SIZES = {
  sm: "py-1.5 px-3 text-xs",
  md: "py-2 px-4 text-sm",
};

const LINK_SIZES = {
  sm: "p-0 text-xs",
  md: "p-0 text-sm",
};

export const Button = forwardRef(function Button(
  {
    variant = "primary",
    size = "md",
    as = "button",
    type,
    loading = false,
    disabled = false,
    iconLeft = null,
    iconRight = null,
    fullWidth = false,
    className = "",
    children,
    ...rest
  },
  ref,
) {
  const isLink = variant === "link";
  const sizing = (isLink ? LINK_SIZES : SIZES)[size] || (isLink ? LINK_SIZES : SIZES).md;
  const cls = [
    BASE,
    VARIANTS[variant] || VARIANTS.primary,
    sizing,
    fullWidth ? "w-full" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const isDisabled = disabled || loading;

  if (import.meta.env.DEV && !children && !rest["aria-label"]) {
    // Icon-only buttons must carry an accessible name.
    console.warn("[Button] icon-only button is missing an aria-label.");
  }

  const content = (
    <>
      {loading ? <Spinner size="sm" /> : iconLeft}
      {children}
      {!loading && iconRight}
    </>
  );

  if (as === "a") {
    return (
      <a
        ref={ref}
        className={cls}
        aria-busy={loading || undefined}
        aria-disabled={isDisabled || undefined}
        {...rest}
      >
        {content}
      </a>
    );
  }

  return (
    <button
      ref={ref}
      type={type || "button"}
      className={cls}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      {...rest}
    >
      {content}
    </button>
  );
});
