import { IconBlock, IconPlus, IconReopen } from "../icons/index.jsx";
import { StaffIconBtn } from "./StaffIconBtn.jsx";

export function BlockedSeat({ onOpen, onAddBooking }) {
  return (
    <div className="flex items-center justify-between rounded-[10px] py-1.5 px-2.5 min-h-[42px] box-border bg-slate-50 border-[1.5px] border-slate-200">
      <div className="flex items-center gap-2">
        <div className="w-7 min-w-[28px] flex items-center justify-center shrink-0"><IconBlock size={16} /></div>
        <span className="text-xs font-semibold text-brand-coral">Blocked</span>
      </div>
      <div className="flex gap-1">
        <StaffIconBtn icon={<IconPlus />} title="Add appointment" onClick={onAddBooking} />
        <StaffIconBtn icon={<IconReopen />} title="Re-open appointment" onClick={onOpen} />
      </div>
    </div>
  );
}
