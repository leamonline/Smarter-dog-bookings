// src/components/ui/EmptyState.jsx
//
// Unified empty state — icon + title + description + optional action. Replaces
// the hand-rolled empties across Dogs/Humans/Reports/Inbox so they read as one
// family. `size="sm"` for in-card empties, "md" for full-grid empties.
//
// `mark="mascot"` is the flyer visual language's empty state (decision 8): a
// service mascot and a heavy hero title. Only for a true "nothing here yet",
// never a failed read or a search with no matches.
import { ServiceMascot } from "./ServiceMascot.jsx";

const SIZES = {
  sm: { wrap: "py-8 px-4", icon: "text-3xl mb-2", title: "text-sm", desc: "text-body" },
  md: { wrap: "py-16 px-6", icon: "text-5xl mb-3", title: "text-lg", desc: "text-sm" },
};

export function EmptyState({
  icon = null,
  mark = null,
  title,
  description = null,
  action = null,
  size = "md",
  className = "",
}) {
  const s = SIZES[size] || SIZES.md;
  return (
    <div
      className={`flex flex-col items-center justify-center text-center ${s.wrap} ${className}`}
    >
      {mark === "dog" && (
        <span
          aria-hidden="true"
          className={`sd-dog-mark mb-3 block text-slate-300 ${size === "sm" ? "h-8 w-8" : "h-14 w-14"}`}
        />
      )}
      {mark === "mascot" && (
        <ServiceMascot serviceId="puppy-groom" size={size === "sm" ? 48 : 72} className="mb-3" />
      )}
      {icon && (
        <div className={s.icon} aria-hidden="true">
          {icon}
        </div>
      )}
      <p
        className={
          mark === "mascot"
            ? `${size === "sm" ? "text-xl" : "text-3xl"} font-hero font-black tracking-tight text-brand-ink`
            : `${s.title} font-bold text-slate-700`
        }
      >
        {title}
      </p>
      {description && (
        <p className={`${s.desc} text-ink-muted mt-1 max-w-sm`}>{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
