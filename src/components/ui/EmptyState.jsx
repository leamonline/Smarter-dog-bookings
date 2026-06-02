// src/components/ui/EmptyState.jsx
//
// Unified empty state — icon + title + description + optional action. Replaces
// the hand-rolled empties across Dogs/Humans/Reports/Inbox so they read as one
// family. `size="sm"` for in-card empties, "md" for full-grid empties.

const SIZES = {
  sm: { wrap: "py-8 px-4", icon: "text-3xl mb-2", title: "text-sm", desc: "text-body" },
  md: { wrap: "py-16 px-6", icon: "text-5xl mb-3", title: "text-lg", desc: "text-sm" },
};

export function EmptyState({
  icon = null,
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
      {icon && (
        <div className={s.icon} aria-hidden="true">
          {icon}
        </div>
      )}
      <p className={`${s.title} font-bold text-slate-700`}>{title}</p>
      {description && (
        <p className={`${s.desc} text-ink-muted mt-1 max-w-sm`}>{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
