export function ErrorBanner({ message, onClose }) {
  return (
    <div className="bg-red-100 border border-brand-red rounded-[10px] py-4 px-5 my-5 flex items-center gap-2.5">
      <span className="text-xl">{"\u26A0\uFE0F"}</span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold text-brand-red">Something went wrong</div>
        <div className="text-[13px] text-slate-800 mt-1">{message}</div>
      </div>
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
