export function ErrorBanner({ message }) {
  return (
    <div className="bg-red-100 border border-brand-red rounded-[10px] py-4 px-5 my-5 flex items-center gap-2.5">
      <span className="text-xl">{"\u26A0\uFE0F"}</span>
      <div>
        <div className="text-sm font-bold text-brand-red">Something went wrong</div>
        <div className="text-[13px] text-slate-800 mt-1">{message}</div>
      </div>
    </div>
  );
}
