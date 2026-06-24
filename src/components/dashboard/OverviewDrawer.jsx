import { X } from "lucide-react";
import { DrawerShell } from "../shared/DrawerShell";
import { WeekOverviewCard } from "./WeekOverviewCard.jsx";
import { MiniCalendarCard } from "./MiniCalendarCard.jsx";
import { CapacityCard } from "./CapacityCard.jsx";

const TITLE_ID = "overview-drawer-title";

export function OverviewDrawer({
  open,
  onClose,
  dates,
  selectedDay,
  onSelectDay,
  currentDateObj,
  bookingsByDate,
  dayOpenState,
  daySettings,
  onSelectDate,
}) {
  if (!open) return null;

  const handleSelectAndClose = (idxOrDate) => {
    if (typeof idxOrDate === "number") {
      onSelectDay?.(idxOrDate);
    } else {
      onSelectDate?.(idxOrDate);
    }
    onClose?.();
  };

  // DrawerShell (built on AccessibleModal) owns the behaviour — focus trap,
  // Escape, reference-counted scroll-lock, portal, role/aria-modal, backdrop
  // click — so this component only renders the panel's header + body.
  return (
    <DrawerShell
      side="left"
      onClose={() => onClose?.()}
      titleId={TITLE_ID}
      widthClass="max-w-[min(24rem,80vw)]"
    >
      <header className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-100 bg-[var(--color-brand-paper)] shrink-0">
        <div>
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            Overview
          </div>
          <h2
            id={TITLE_ID}
            className="text-base font-bold text-brand-purple font-display leading-tight"
          >
            Week, month, capacity
          </h2>
        </div>
        <button
          type="button"
          onClick={() => onClose?.()}
          aria-label="Close"
          className="tap-target w-9 h-9 rounded-full flex items-center justify-center border-none cursor-pointer text-slate-500 hover:bg-slate-100 hover:text-brand-purple transition-colors"
        >
          <X size={18} strokeWidth={2.2} aria-hidden="true" />
        </button>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 flex flex-col gap-4">
        <WeekOverviewCard
          dates={dates}
          selectedDay={selectedDay}
          onSelectDay={(i) => handleSelectAndClose(i)}
          bookingsByDate={bookingsByDate}
          dayOpenState={dayOpenState}
        />
        <MiniCalendarCard
          currentDateObj={currentDateObj}
          onSelectDate={(d) => handleSelectAndClose(d)}
        />
        <CapacityCard
          currentDateObj={currentDateObj}
          dates={dates}
          bookingsByDate={bookingsByDate}
          dayOpenState={dayOpenState}
          daySettings={daySettings}
          onSelectDate={(d) => handleSelectAndClose(d)}
        />
      </div>
    </DrawerShell>
  );
}
