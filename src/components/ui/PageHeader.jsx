import { forwardRef, useImperativeHandle, useRef } from "react";
import { Search, X } from "lucide-react";
import { Input } from "./Input.jsx";
import { Button } from "./Button.jsx";
import { IconButton } from "./IconButton.jsx";

function classes(...values) {
  return values.filter(Boolean).join(" ");
}

/**
 * Compact, shared identity row for staff pages.
 *
 * The negative horizontal margin cancels the shell gutter so the surface
 * spans the full content width beneath the global navigation, then puts the
 * same gutter back as padding. Both read --app-gutter (src/index.css), so
 * they cannot drift from the shell or from each other — the hard-coded
 * `-mx-4 sm:-mx-6` they replace was 8px short of the frame from `md` up.
 */
export function PageHeader({
  title,
  subtitle,
  meta,
  actions,
  actionsClassName = "",
  className = "",
  children,
}) {
  return (
    <header
      data-testid="page-header"
      className={classes(
        "relative -mx-[var(--app-gutter)] mb-4 flex min-h-[76px] flex-wrap items-center gap-3",
        "rounded-b-card border-x border-b border-slate-200 bg-white/90 px-[var(--app-gutter)] py-3 shadow-sm",
        className,
      )}
    >
      <h1 className="sr-only">{title}</h1>

      {children ?? (
        <>
          <div className="min-w-0 flex-1">
            {meta ? <div className="flex min-w-0 items-center">{meta}</div> : null}
            {subtitle ? (
              <div className="text-sm font-semibold text-ink-muted">
                {subtitle}
              </div>
            ) : null}
          </div>

          {actions ? (
            <div
              className={classes(
                "flex min-w-0 flex-wrap items-center justify-end gap-2",
                actionsClassName,
              )}
            >
              {actions}
            </div>
          ) : null}
        </>
      )}
    </header>
  );
}

const PILL_TONES = {
  neutral: "bg-slate-100 text-slate-700",
  open: "bg-emerald-50 text-emerald-700",
  closed: "bg-brand-coral-light text-brand-coral-text",
  purple: "bg-brand-ink/5 text-brand-ink",
  teal: "bg-brand-teal/10 text-brand-teal-text",
  amber: "bg-brand-yellow/25 text-slate-800",
  info: "bg-cyan-50 text-cyan-800",
};

export function PageHeaderPill({
  children,
  tone = "neutral",
  dot = false,
  className = "",
  ...props
}) {
  return (
    <span
      {...props}
      className={classes(
        "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-3 text-xs font-bold",
        PILL_TONES[tone] || PILL_TONES.neutral,
        className,
      )}
    >
      {dot ? <span aria-hidden="true" className="size-1.5 rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}

export function PageHeaderSegmented({
  value,
  onChange,
  options,
  ariaLabel,
  className = "",
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={classes(
        "inline-flex h-11 pointer-coarse:h-auto shrink-0 items-center rounded-control border border-slate-200 bg-slate-100 p-1",
        className,
      )}
    >
      {options.map((option) => {
        const active = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={active}
            className={classes(
              "inline-flex h-9 pointer-coarse:min-h-11 items-center justify-center rounded-control px-3 text-xs font-bold transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ink focus-visible:ring-offset-1",
              active
                ? "bg-brand-ink text-white shadow-sm"
                : "text-slate-600 hover:bg-white hover:text-brand-ink",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export const PageHeaderSearch = forwardRef(function PageHeaderSearch(
  {
    value,
    onChange,
    placeholder = "Search…",
    ariaLabel,
    onClear,
    className = "",
    ...inputProps
  },
  ref,
) {
  const inputRef = useRef(null);
  useImperativeHandle(ref, () => inputRef.current);
  const accessibleLabel =
    ariaLabel || inputProps["aria-label"] || placeholder || "Search";
  const canClear = Boolean(onClear && value);

  return (
    <div className="relative min-w-0 w-full md:w-80 md:flex-none md:shrink-0">
      <Search
        aria-hidden="true"
        size={18}
        className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted"
      />
      <Input
        {...inputProps}
        ref={inputRef}
        type="search"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        aria-label={accessibleLabel}
        className={classes(
          "min-h-11 pl-10",
          canClear ? "pr-12" : "pr-3",
          className,
        )}
      />
      {canClear ? (
        <IconButton
          label="Clear search"
          disabled={inputProps.disabled}
          onClick={() => { onClear(); inputRef.current?.focus(); }}
          className="absolute right-0 top-1/2 -translate-y-1/2"
        >
          <X aria-hidden="true" size={16} />
        </IconButton>
      ) : null}
    </div>
  );
});

export const PageHeaderAction = forwardRef(function PageHeaderAction(
  { children, icon: Icon, variant = "strong", className = "", ...buttonProps },
  ref,
) {
  return (
    <Button
      {...buttonProps}
      ref={ref}
      variant={variant}
      iconLeft={Icon ? <Icon aria-hidden="true" size={16} /> : null}
      className={classes("min-h-11 shrink-0", className)}
    >
      {children}
    </Button>
  );
});
