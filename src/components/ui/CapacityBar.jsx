export function CapacityBar({ used, max, isConstrained }) {
  return (
    <div className="flex gap-[3px] items-center">
      {[0, 1].map((i) => {
        const filled = i < used;
        const withinMax = i < max;

        let bg, border;
        if (filled && withinMax) {
          bg = "bg-brand-blue"; border = "border-brand-blue";
        } else if (filled && !withinMax) {
          bg = "bg-brand-coral"; border = "border-brand-coral";
        } else if (!filled && withinMax) {
          bg = "bg-slate-200"; border = "border-slate-200";
        } else {
          bg = "bg-transparent"; border = "border-slate-200 border-dashed";
        }

        return (
          <div
            key={i}
            className={`w-3.5 h-5 rounded-[3px] border-[1.5px] transition-all ${bg} ${border} ${!withinMax && !filled ? "border-dashed" : ""}`}
          />
        );
      })}
      {isConstrained && (
        <span className="text-[10px] text-brand-coral font-semibold ml-0.5">2-2-1</span>
      )}
    </div>
  );
}
