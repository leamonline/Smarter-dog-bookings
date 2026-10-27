// src/components/ui/ToggleChip.jsx
//
// A pill that is either on or off: a filter, an add-on, a channel. It is a real
// button with `aria-pressed`, so a screen reader says "pressed" or "not pressed"
// and the state is never carried by colour alone: the pressed chip also gets a
// tick. For one choice from several, use a segmented control, not a row of these.
//
// Same family as Button: the shared focus ring, the 44px touch floor on a touch
// screen, a disabled look that stays readable. Every class is a literal string
// because Tailwind v4 finds classes by literal occurrence.
import { forwardRef } from "react";
import { Check } from "lucide-react";

const BASE =
  "inline-flex shrink-0 items-center gap-1.5 rounded-full border font-semibold font-[inherit] " +
  "cursor-pointer select-none whitespace-nowrap " +
  "motion-safe:transition-colors motion-safe:duration-[var(--duration-base)] " +
  "focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-ink " +
  "pointer-coarse:min-h-11 " +
  "disabled:cursor-not-allowed disabled:opacity-60";

const SIZES = {
  sm: "min-h-7 px-2.5 py-0.5 text-caption",
  md: "min-h-9 px-3 py-1 text-xs",
};

const PRESSED = {
  ink: "bg-ink text-white border-ink",
  cyan: "bg-brand-cyan text-white border-brand-cyan",
};

const IDLE = "bg-white text-slate-700 border-slate-200 hover:bg-slate-50 hover:border-slate-400";

/**
 * @param {{
 *   pressed: boolean;
 *   tone?: "ink" | "cyan";
 *   size?: "sm" | "md";
 *   count?: number;
 *   children: import("react").ReactNode;
 * } & Omit<import("react").ComponentPropsWithoutRef<"button">, "aria-pressed">} props
 *   `pressed` is the state; pass `onClick` to change it.
 */
export const ToggleChip = forwardRef(function ToggleChip(
  { pressed, tone = "ink", size = "md", count, className = "", children, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-pressed={pressed}
      className={`${BASE} ${SIZES[size] ?? SIZES.md} ${pressed ? (PRESSED[tone] ?? PRESSED.ink) : IDLE} ${className}`}
      {...rest}
    >
      {pressed ? <Check size={12} strokeWidth={3} aria-hidden="true" className="shrink-0" /> : null}
      {children}
      {typeof count === "number" ? <span className="tabular-nums opacity-80">{count}</span> : null}
    </button>
  );
});
