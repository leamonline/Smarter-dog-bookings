import { CalendarClock } from "lucide-react";
import { PanelShell } from "../shell/PanelShell.jsx";
import { SALON_SLOTS } from "../../../constants/salon";

// Booking rules — staff-only controls on the human card:
//  • preferred slots: steering only (the portal stars them, never enforced)
//  • blocked slots: DB-enforced for non-staff (trigger, migration
//    20260714120000); staff can still book them deliberately
//  • deposit required: every booking for this customer is created awaiting
//    a bank-transfer deposit (unique reference, 12h hold, then auto-release)
// A slot can't be both preferred and blocked — picking one clears the other.

function SlotRow({ kind, selected, onToggle, disabled, activeClasses }) {
  return (
    <div className="flex flex-wrap gap-1">
      {SALON_SLOTS.map((slot) => {
        const on = selected.includes(slot);
        return (
          <button
            key={slot}
            type="button"
            aria-label={`${kind} ${slot}`}
            aria-pressed={on}
            disabled={disabled}
            onClick={() => onToggle(slot)}
            className={[
              "px-2 py-1 rounded-full text-[11px] font-bold font-inherit border-none transition-colors",
              disabled ? "cursor-default" : "cursor-pointer",
              on ? activeClasses : "bg-slate-100 text-slate-500 hover:bg-slate-200",
            ].join(" ")}
          >
            {slot}
          </button>
        );
      })}
    </div>
  );
}

export function BookingRulesPanel({ human, onUpdateHuman }) {
  const preferred = human?.preferredSlots || [];
  const blocked = human?.blockedSlots || [];
  const depositRequired = human?.depositRequired === true;
  const disabled = !onUpdateHuman;

  const toggle = (list, slot) =>
    list.includes(slot) ? list.filter((s) => s !== slot) : [...list, slot].sort();

  const togglePreferred = (slot) => {
    const updates = { preferredSlots: toggle(preferred, slot) };
    if (blocked.includes(slot)) updates.blockedSlots = blocked.filter((s) => s !== slot);
    onUpdateHuman(human.id, updates);
  };

  const toggleBlocked = (slot) => {
    const updates = { blockedSlots: toggle(blocked, slot) };
    if (preferred.includes(slot)) updates.preferredSlots = preferred.filter((s) => s !== slot);
    onUpdateHuman(human.id, updates);
  };

  return (
    <PanelShell eyebrow="Booking rules" icon={CalendarClock} accent="sky">
      <div className="flex flex-col gap-3">
        <div>
          <p className="text-[12px] font-bold text-slate-600 mb-1">Preferred times</p>
          <p className="text-[11px] text-slate-400 mb-1.5">
            Starred for them in the portal — a gentle steer, never enforced.
          </p>
          <SlotRow
            kind="preferred"
            selected={preferred}
            onToggle={togglePreferred}
            disabled={disabled}
            activeClasses="bg-sky-500 text-white"
          />
        </div>

        <div>
          <p className="text-[12px] font-bold text-slate-600 mb-1">Blocked times</p>
          <p className="text-[11px] text-slate-400 mb-1.5">
            They can't book these themselves — you still can, deliberately.
          </p>
          <SlotRow
            kind="blocked"
            selected={blocked}
            onToggle={toggleBlocked}
            disabled={disabled}
            activeClasses="bg-rose-500 text-white"
          />
        </div>

        <div className="flex items-start justify-between gap-2 pt-1 border-t border-slate-200/70">
          <div>
            <p className="text-[12px] font-bold text-slate-600">Deposit required</p>
            <p className="text-[11px] text-slate-400">
              Every booking holds its slot awaiting a £10 bank transfer (unique
              reference, 12-hour window) and is released if it doesn't arrive.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={depositRequired}
            aria-label="Deposit required"
            disabled={disabled}
            onClick={() => onUpdateHuman(human.id, { depositRequired: !depositRequired })}
            className={[
              "relative w-9 h-5 rounded-full border-none shrink-0 transition-colors mt-0.5",
              disabled ? "cursor-default" : "cursor-pointer",
              depositRequired ? "bg-amber-500" : "bg-slate-200",
            ].join(" ")}
          >
            <span
              aria-hidden="true"
              className={[
                "absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all",
                depositRequired ? "left-[18px]" : "left-0.5",
              ].join(" ")}
            />
          </button>
        </div>
      </div>
    </PanelShell>
  );
}
