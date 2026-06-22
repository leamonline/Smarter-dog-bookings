import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { WeekOverviewCard } from "./WeekOverviewCard.jsx";
import { MiniCalendarCard } from "./MiniCalendarCard.jsx";
import { CapacityCard } from "./CapacityCard.jsx";

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
  const closeBtnRef = useRef(null);
  const drawerRef = useRef(null);
  const previousFocusRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement;
    closeBtnRef.current?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
      if (e.key === "Tab" && drawerRef.current) {
        const focusables = drawerRef.current.querySelectorAll(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (!focusables.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previousFocusRef.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  const handleSelectAndClose = (idxOrDate) => {
    if (typeof idxOrDate === "number") {
      onSelectDay?.(idxOrDate);
    } else {
      onSelectDate?.(idxOrDate);
    }
    onClose?.();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Overview"
      className="fixed inset-0 z-[1000] flex"
    >
      <button
        type="button"
        aria-label="Close overview"
        onClick={onClose}
        className="absolute inset-0 bg-black/35 cursor-pointer border-none animate-[overlayFade_150ms_ease-out]"
      />

      <div
        ref={drawerRef}
        className="relative w-full max-w-[min(24rem,80vw)] h-full bg-brand-paper shadow-elevated flex flex-col animate-[fadeInUp_220ms_cubic-bezier(0.16,1,0.3,1)]"
      >
        <header className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-100 bg-white">
          <div>
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Overview
            </div>
            <div className="text-base font-bold text-brand-purple font-display leading-tight">
              Week, month, capacity
            </div>
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="tap-target w-9 h-9 rounded-full flex items-center justify-center border-none cursor-pointer text-slate-500 hover:bg-slate-100 hover:text-brand-purple transition-colors"
          >
            <X size={18} strokeWidth={2.2} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
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
      </div>
    </div>
  );
}
