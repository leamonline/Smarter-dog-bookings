import { useEffect, useRef } from "react";
import { X, Plus, Minus, DoorOpen, DoorClosed, Printer } from "lucide-react";

function formatDisplay(slot) {
  if (!slot) return "";
  const [h, m] = slot.split(":");
  const hour = parseInt(h, 10);
  return `${hour}:${m}`;
}

export function DaySettingsDrawer({
  open,
  onClose,
  currentDateObj,
  isOpen,
  extraSlots = [],
  bookingCount,
  onAddSlot,
  onRemoveSlot,
  onToggleDayOpen,
  onPrintDaySheet,
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

  const dayLabel = currentDateObj?.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const lastSlot = extraSlots[extraSlots.length - 1];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Day settings"
      className="fixed inset-0 z-[1000] flex justify-end"
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close day settings"
        onClick={onClose}
        className="absolute inset-0 bg-black/35 cursor-pointer border-none animate-[overlayFade_150ms_ease-out]"
      />

      {/* Drawer */}
      <div
        ref={drawerRef}
        className="relative w-full max-w-sm h-full bg-white shadow-elevated flex flex-col animate-[fadeInUp_220ms_cubic-bezier(0.16,1,0.3,1)]"
      >
        <header className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-100">
          <div>
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Day settings
            </div>
            <div className="text-base font-bold text-brand-purple font-display leading-tight">
              {dayLabel}
            </div>
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-9 h-9 rounded-full flex items-center justify-center border-none cursor-pointer text-slate-500 hover:bg-slate-100 hover:text-brand-purple transition-colors"
          >
            <X size={18} strokeWidth={2.2} />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5">
          {/* Open/close */}
          <section>
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
              Status
            </h3>
            <button
              type="button"
              onClick={onToggleDayOpen}
              className="w-full flex items-center gap-3 p-3 rounded-xl border border-slate-200 hover:border-brand-yellow/60 cursor-pointer transition-colors bg-white font-[inherit] text-left"
            >
              <span className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                isOpen ? "bg-emerald-100 text-emerald-700" : "bg-brand-coral-light text-brand-coral"
              }`}>
                {isOpen ? (
                  <DoorClosed size={16} strokeWidth={2.2} />
                ) : (
                  <DoorOpen size={16} strokeWidth={2.2} />
                )}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-brand-purple">
                  {isOpen ? "Close this day" : "Open this day"}
                </div>
                <div className="text-[11px] text-slate-500">
                  {isOpen
                    ? bookingCount > 0
                      ? `${bookingCount} ${bookingCount === 1 ? "booking" : "bookings"} would need rearranging`
                      : "Mark the salon as closed"
                    : "Mark the salon as open for bookings"}
                </div>
              </div>
            </button>
          </section>

          {/* Timeslots */}
          <section>
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
              Timeslots
            </h3>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={onAddSlot}
                className="w-full flex items-center gap-3 p-3 rounded-xl border border-slate-200 hover:border-brand-yellow/60 cursor-pointer transition-colors bg-white font-[inherit] text-left"
              >
                <span className="w-9 h-9 rounded-full bg-brand-yellow/15 text-brand-purple flex items-center justify-center shrink-0">
                  <Plus size={16} strokeWidth={2.5} />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-brand-purple">Add an extra slot</div>
                  <div className="text-[11px] text-slate-500">Add 30 minutes to the end of the day</div>
                </div>
              </button>

              {lastSlot && (
                <button
                  type="button"
                  onClick={onRemoveSlot}
                  className="w-full flex items-center gap-3 p-3 rounded-xl border border-slate-200 hover:border-brand-coral/60 cursor-pointer transition-colors bg-white font-[inherit] text-left"
                >
                  <span className="w-9 h-9 rounded-full bg-brand-coral-light text-brand-coral flex items-center justify-center shrink-0">
                    <Minus size={16} strokeWidth={2.5} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-brand-coral">
                      Remove {formatDisplay(lastSlot)} slot
                    </div>
                    <div className="text-[11px] text-slate-500">Drop the last extra slot</div>
                  </div>
                </button>
              )}
            </div>
          </section>

          {/* Print */}
          <section>
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
              Print
            </h3>
            <button
              type="button"
              onClick={onPrintDaySheet}
              className="w-full flex items-center gap-3 p-3 rounded-xl border border-slate-200 hover:border-brand-yellow/60 cursor-pointer transition-colors bg-white font-[inherit] text-left"
            >
              <span className="w-9 h-9 rounded-full bg-brand-purple/5 text-brand-purple flex items-center justify-center shrink-0">
                <Printer size={16} strokeWidth={2.2} />
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-brand-purple">Print day sheet</div>
                <div className="text-[11px] text-slate-500">Today's schedule for the salon</div>
              </div>
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}
