// src/components/ui/Card.jsx
//
// White surface card primitive. Encapsulates the staff-dashboard card look
// (rounded-2xl, slate-200 border, resting shadow) plus the established gradient
// top-accent stripe (h-[3px]) and an interactive variant for clickable cards
// (hover lift + focus ring + optional button semantics).
//
// ≈ the .card-solid utility class; the portal glass variant is not ported.
// Callers whose card contains nested interactive elements (links/buttons) must
// pass `as="div" role="button"` to avoid invalid nested buttons.
//
// Tailwind v4 needs literal classes — keep the maps literal.

import { forwardRef } from "react";

const PADDING = {
  none: "",
  compact: "p-4",
  default: "p-5",
};

const ELEVATION = {
  resting: "shadow-card-resting",
  hover: "shadow-card-hover",
};

function Stripe({ accent }) {
  if (!accent) return null;
  const background =
    typeof accent === "string"
      ? `linear-gradient(90deg, ${accent}, color-mix(in srgb, ${accent} 53%, transparent))`
      : `linear-gradient(90deg, ${accent.from}, ${accent.to})`;
  return <div className="h-[3px] shrink-0" style={{ background }} aria-hidden="true" />;
}

export const Card = forwardRef(function Card(
  {
    as,
    padding = "default",
    interactive = false,
    accent = null,
    elevation = "resting",
    className = "",
    children,
    onKeyDown,
    ...rest
  },
  ref,
) {
  const Comp = as || (interactive ? "button" : "div");
  const isButton = Comp === "button";
  const isRoleButton = !isButton && rest.role === "button";

  const interactiveCls = interactive
    ? "cursor-pointer text-left w-full motion-safe:transition-all motion-safe:duration-[var(--duration-base)] " +
      "hover:-translate-y-0.5 hover:border-brand-teal hover:shadow-card-hover " +
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-yellow focus-visible:ring-offset-1"
    : "";

  // For a non-button clickable card (role="button"), supply the Enter/Space
  // handler so call sites stop hand-rolling it.
  const handleKeyDown = isRoleButton
    ? (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          rest.onClick?.(e);
        }
        onKeyDown?.(e);
      }
    : onKeyDown;

  const cls = [
    "bg-white rounded-2xl border border-slate-200 overflow-hidden font-[inherit]",
    ELEVATION[elevation] || ELEVATION.resting,
    interactiveCls,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Comp
      ref={ref}
      className={cls}
      onKeyDown={handleKeyDown}
      {...(isRoleButton ? { tabIndex: 0 } : {})}
      {...rest}
    >
      <Stripe accent={accent} />
      {padding === "none" ? children : <div className={PADDING[padding]}>{children}</div>}
    </Comp>
  );
});

export { Stripe as CardStripe };
