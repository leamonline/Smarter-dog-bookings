import { useState } from "react";
import { SizeTag } from "./SizeTag.jsx";
import { IconTick, IconBlock, IconReopen, IconEdit, IconMessage } from "../icons/index.jsx";

export function Legend() {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setOpen((p) => !p)}
        className={`w-8 h-8 rounded-full border-none text-base font-extrabold cursor-pointer flex items-center justify-center transition-all shrink-0 shadow-[0_1px_4px_rgba(0,0,0,0.1)] ${
          open ? "bg-brand-cyan text-white" : "bg-slate-50 text-slate-500"
        }`}
        title="Show legend"
      >
        i
      </button>

      {open && (
        <div className="absolute top-[38px] left-0 z-50 flex flex-wrap py-2.5 px-4 bg-white rounded-[10px] text-xs text-slate-500 items-center justify-between gap-2.5 shadow-[0_4px_16px_rgba(0,0,0,0.12)] min-w-[340px] border border-slate-200">
          <div className="flex items-center gap-[5px]"><SizeTag size="small" legendMode /> Small</div>
          <div className="flex items-center gap-[5px]"><SizeTag size="medium" legendMode /> Medium</div>
          <div className="flex items-center gap-[5px]"><SizeTag size="large" legendMode /> Large</div>
          <div className="flex items-center gap-[5px]"><IconTick /> Available</div>
          <div className="flex items-center gap-[5px]"><IconBlock /> Blocked</div>
          <div className="flex items-center gap-[5px]"><IconReopen /> Re-open</div>
          <div className="flex items-center gap-[5px]"><IconEdit /> Edit</div>
          <div className="flex items-center gap-[5px]"><IconMessage /> Message</div>
        </div>
      )}
    </div>
  );
}
