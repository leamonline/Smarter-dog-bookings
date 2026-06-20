// Visible error feedback used at page and card level. Defaults match
// the original global-banner styling; pass `title`, `retry`, or
// `retryLabel` to customise. Use <InlineError /> for one-line,
// in-form error messages instead.
//
// Tone guide: keep messages warm and empathetic — avoid cold tech-speak,
// and use UK English throughout ("colour", "apologise", "Cancelled") to
// match the salon's customer-facing voice.
export function ErrorBanner({
  message,
  title = "Something went wrong",
  onClose,
  retry,
  retryLabel = "Try again",
}) {
  return (
    <div
      role="alert"
      className="bg-red-100 border border-brand-red rounded-control py-4 px-5 my-5 flex items-center gap-2.5"
    >
      <span className="text-xl" aria-hidden="true">{"\u26A0\uFE0F"}</span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold text-brand-red">{title}</div>
        {message && <div className="text-[13px] text-slate-800 mt-1">{message}</div>}
      </div>
      {retry && (
        <button
          type="button"
          onClick={retry}
          className="shrink-0 px-3 h-7 flex items-center rounded-md bg-white border border-brand-red text-brand-red text-[12px] font-bold cursor-pointer transition-colors hover:bg-red-50"
        >
          {retryLabel}
        </button>
      )}
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Dismiss error"
          className="shrink-0 w-7 h-7 flex items-center justify-center rounded-md bg-white/60 border-none text-brand-red text-sm font-bold cursor-pointer transition-colors hover:bg-white"
        >
          {"\u00D7"}
        </button>
      )}
    </div>
  );
}
