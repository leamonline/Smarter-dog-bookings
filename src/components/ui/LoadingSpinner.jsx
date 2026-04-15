export function LoadingSpinner() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[300px] gap-4">
      <div className="w-10 h-10 border-4 border-slate-200 border-t-brand-cyan rounded-full animate-spin" />
      <div className="text-sm text-slate-500 font-semibold">Loading...</div>
    </div>
  );
}
