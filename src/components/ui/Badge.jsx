// src/components/ui/Badge.jsx
//
// Generic chip / count / filter pill — distinct from StatusPill (which encodes
// semantic conversation/booking states). tone × variant × size. Decorative by
// default; pass aria-hidden for pure count badges whose value is announced
// elsewhere (e.g. the nav's aria-label).
//
// Tailwind v4 needs literal classes — keep the maps literal.

const TONES = {
  soft: {
    neutral: "bg-slate-100 text-slate-700 border-slate-200",
    info: "bg-sky-100 text-sky-800 border-sky-200",
    success: "bg-emerald-100 text-emerald-800 border-emerald-200",
    warning: "bg-amber-100 text-amber-900 border-amber-300",
    danger: "bg-red-100 text-red-800 border-red-200",
    brand: "bg-brand-purple/10 text-brand-purple border-brand-purple/20",
  },
  solid: {
    neutral: "bg-slate-600 text-white border-transparent",
    info: "bg-sky-600 text-white border-transparent",
    success: "bg-emerald-600 text-white border-transparent",
    warning: "bg-amber-500 text-white border-transparent",
    danger: "bg-brand-coral text-white border-transparent",
    brand: "bg-brand-purple text-white border-transparent",
  },
  outline: {
    neutral: "bg-white text-slate-700 border-slate-300",
    info: "bg-white text-sky-700 border-sky-300",
    success: "bg-white text-emerald-700 border-emerald-300",
    warning: "bg-white text-amber-800 border-amber-300",
    danger: "bg-white text-red-700 border-red-300",
    brand: "bg-white text-brand-purple border-brand-purple/30",
  },
};

const SIZES = {
  xs: "text-micro px-1.5 py-0 gap-0.5",
  sm: "text-caption px-2 py-0.5 gap-1",
};

export function Badge({
  tone = "neutral",
  variant = "soft",
  size = "sm",
  uppercase = false,
  icon = null,
  className = "",
  children,
  ...rest
}) {
  const palette = TONES[variant] || TONES.soft;
  const toneCls = palette[tone] || palette.neutral;
  const cls = [
    "inline-flex items-center font-bold rounded-full border leading-none",
    SIZES[size] || SIZES.sm,
    uppercase ? "uppercase tracking-wide" : "",
    toneCls,
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <span className={cls} {...rest}>
      {icon}
      {children}
    </span>
  );
}
