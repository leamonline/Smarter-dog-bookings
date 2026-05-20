// One-line inline error used inside forms, modals, and small cards.
// Sits below the field or card section that caused it. Use ErrorBanner
// for full-card "couldn't load" states or page-level failures.
export function InlineError({ message, id }) {
  if (!message) return null;
  return (
    <div
      id={id}
      role="alert"
      className="flex items-start gap-2 mt-2 px-3 py-2 rounded-lg bg-brand-coral-light text-brand-coral text-[12px] font-semibold leading-snug border border-brand-coral/30"
    >
      <span aria-hidden="true" className="leading-tight">{"⚠"}</span>
      <span className="flex-1 min-w-0">{message}</span>
    </div>
  );
}
