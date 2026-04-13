export function SkeletonCard() {
  return (
    <div className="bg-white border-[1.5px] border-slate-100 rounded-xl overflow-hidden flex flex-col animate-pulse">
      <div className="h-[3px] bg-slate-200" />
      <div className="p-2.5 md:p-3.5 flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-slate-200 shrink-0" />
          <span className="h-4 bg-slate-200 rounded w-24" />
        </div>
        <div className="h-3 bg-slate-100 rounded w-20 ml-5" />
        <div className="h-3 bg-slate-100 rounded w-16 ml-5" />
        <div className="flex gap-1 ml-5 mt-1">
          <span className="h-5 bg-slate-100 rounded-md flex-1" />
          <span className="h-5 bg-slate-100 rounded-md flex-1" />
        </div>
      </div>
    </div>
  );
}
