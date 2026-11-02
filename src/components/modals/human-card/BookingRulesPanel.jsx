import { useState } from "react";
import { CancellationHistoryPanel } from "./CancellationHistoryPanel";
import { CalendarClock } from "lucide-react";
import { PanelShell } from "../shell/PanelShell.jsx";
import { Button } from "../../ui/Button.jsx";
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
              "px-2 py-1 rounded-full text-caption font-bold font-inherit border-none transition-colors",
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

// One collapsible slot list. Collapsed by default: the heading carries a
// one-line summary (the times that are set, or "None") so the card stays short
// on a phone, and the 10-chip grid only appears when staff choose to edit.
function SlotSection({ title, hint, kind, selected, onToggle, disabled, activeClasses }) {
  const [open, setOpen] = useState(false);
  const panelId = `slots-${kind}`;
  return (
    <div>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-bold text-slate-600">{title}</p>
          <p className="text-caption text-slate-500 break-words">
            {selected.length ? selected.join(", ") : "None"}
          </p>
        </div>
        <Button
          variant="quiet"
          size="sm"
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={`${open ? "Done editing" : "Edit"} ${title.toLowerCase()}`}
          onClick={() => setOpen((v) => !v)}
          className="shrink-0"
        >
          {open ? "Done" : "Edit"}
        </Button>
      </div>
      {open && (
        <div id={panelId} className="mt-1">
          <p className="text-caption text-slate-400 mb-1.5">{hint}</p>
          <SlotRow
            kind={kind}
            selected={selected}
            onToggle={onToggle}
            disabled={disabled}
            activeClasses={activeClasses}
          />
        </div>
      )}
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
        <CancellationHistoryPanel key={human?.id} humanId={human?.id} />
        <SlotSection
          title="Preferred times"
          hint="Starred for them in the portal — a gentle steer, never enforced."
          kind="preferred"
          selected={preferred}
          onToggle={togglePreferred}
          disabled={disabled}
          activeClasses="bg-sky-500 text-white"
        />

        <SlotSection
          title="Blocked times"
          hint="They can't book these themselves — you still can, deliberately."
          kind="blocked"
          selected={blocked}
          onToggle={toggleBlocked}
          disabled={disabled}
          activeClasses="bg-rose-500 text-white"
        />

        <div className="flex items-start justify-between gap-2 pt-1 border-t border-slate-200/70">
          <div>
            <p className="text-xs font-bold text-slate-600">Deposit required</p>
            <p className="text-caption text-slate-400">
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
              depositRequired ? "bg-brand-mustard" : "bg-slate-200",
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
