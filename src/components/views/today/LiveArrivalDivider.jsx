export function LiveArrivalDivider({ context }) {
  const tone = context.tone === "overdue"
    ? "border-brand-coral/45 bg-brand-coral text-white"
    : "border-brand-yellow-dark/30 bg-brand-yellow text-brand-purple";

  return (
    <div
      role="separator"
      aria-label={context.ariaLabel}
      data-testid="live-arrival-divider"
      className="flex w-full items-center gap-2 py-1"
    >
      <span aria-hidden="true" className="h-px min-w-3 flex-1 bg-brand-purple/20" />
      <span className={`inline-flex min-h-7 max-w-[min(100%,24rem)] items-center rounded-full border px-3 py-1 text-center text-[12px] font-extrabold leading-tight shadow-sm ${tone}`}>
        {context.text}
      </span>
      <span aria-hidden="true" className="h-px min-w-3 flex-1 bg-brand-purple/20" />
    </div>
  );
}
