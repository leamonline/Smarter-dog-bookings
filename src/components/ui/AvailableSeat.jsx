import { IconTick, IconPlus, IconBlock } from "../icons/index.jsx";
import { StaffIconBtn } from "./StaffIconBtn.jsx";

export function AvailableSeat({ onAddBooking, onBlock }) {
  return (
    <div className="flex items-center justify-between rounded-[10px] py-1.5 px-2.5 min-h-[42px] box-border bg-sky-50 border-[1.5px] border-[#8AD8EE]">
      <div className="flex items-center gap-2">
        <div className="w-7 min-w-[28px] flex items-center justify-center shrink-0"><IconTick size={16} /></div>
        <span className="text-xs font-semibold text-brand-blue-dark">Available</span>
      </div>
      <div className="flex gap-1">
        <StaffIconBtn icon={<IconPlus />} title="Add appointment" onClick={onAddBooking} />
        <StaffIconBtn icon={<IconBlock />} title="Block appointment" onClick={onBlock} />
      </div>
    </div>
  );
}
