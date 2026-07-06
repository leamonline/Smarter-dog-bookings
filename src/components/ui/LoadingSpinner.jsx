// `label` lets callers say what's loading ("Loading messages…") instead of a
// context-free "Loading…", so staff know which pane is still fetching.
export function LoadingSpinner({ label = "Loading…" }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[300px] gap-4" role="status">
      <div className="w-10 h-10 border-4 border-slate-200 border-t-brand-cyan rounded-full animate-spin" aria-hidden="true" />
      <div className="text-sm text-slate-500 font-semibold">{label}</div>
    </div>
  );
}
