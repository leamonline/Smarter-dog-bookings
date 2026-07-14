export function JourneyIconButton({
  label,
  active = false,
  complete = false,
  onClick,
  children,
}) {
  return (
    <span className="group relative flex min-w-0 flex-col items-center justify-start gap-1 pb-7">
      <button
        type="button"
        data-testid="journey-action"
        aria-label={label}
        onClick={onClick}
        className={[
          "inline-flex size-11 items-center justify-center rounded-full border-2 outline-none transition",
          "focus-visible:ring-2 focus-visible:ring-brand-purple focus-visible:ring-offset-2",
          complete
            ? "border-brand-teal bg-brand-teal text-white"
            : active
              ? "border-brand-yellow-dark bg-brand-yellow text-brand-purple"
              : "border-brand-paper-line bg-[#F4EFE6] text-slate-500",
        ].join(" ")}
      >
        {children}
      </button>
      <input
        type="checkbox"
        checked={complete}
        disabled
        aria-label={`${label} completed`}
        className="size-4 accent-brand-teal disabled:cursor-default disabled:opacity-100"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute bottom-0 z-10 whitespace-nowrap rounded-full bg-brand-purple px-2 py-1 text-[10px] font-bold text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
      >
        {label}
      </span>
    </span>
  );
}
