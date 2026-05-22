import { Clock } from "lucide-react";
import { PanelShell } from "./PanelShell.jsx";

// Reminder preferences as a proper panel. Mirrors the dashboard's
// "REMINDERS FOR MON 25 MAY" treatment — amber accent, clock icon
// chip in the corner. Thin dividers between rows and teal toggles
// (calmer than the previous lime green).

const CHANNELS = [
  { key: "whatsapp", label: "WhatsApp" },
  { key: "sms", label: "SMS" },
  { key: "email", label: "Email" },
];

function ToggleRow({ label, active, onToggle, ariaLabel }) {
  return (
    <div className="flex items-center justify-between py-2.5">
      <span className="text-sm text-slate-600 font-medium">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={active}
        aria-label={ariaLabel || label}
        onClick={onToggle}
        className={`w-9 h-5 rounded-full relative transition-colors cursor-pointer border-none p-0 ${
          active ? "bg-brand-teal" : "bg-slate-300"
        }`}
      >
        <span
          aria-hidden="true"
          className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
            active ? "left-[18px]" : "left-0.5"
          }`}
        />
      </button>
    </div>
  );
}

export function RemindersPanel({ human, onUpdateHuman }) {
  const channels = human.reminderChannels || ["whatsapp"];
  const timing = human.reminderHours ?? 24;

  const toggleChannel = (key) => {
    const active = channels.includes(key);
    const next = active
      ? channels.filter((c) => c !== key)
      : [...channels, key];
    onUpdateHuman(human.id, {
      reminderChannels: next.length > 0 ? next : ["whatsapp"],
    });
  };

  return (
    <PanelShell eyebrow="Reminder preferences" icon={Clock} accent="amber">
      <div className="flex items-center justify-between py-2.5">
        <span className="text-sm text-slate-600 font-medium">Timing</span>
        <select
          value={timing}
          onChange={(e) =>
            onUpdateHuman(human.id, { reminderHours: Number(e.target.value) })
          }
          aria-label="Reminder timing"
          className="py-1 px-2 rounded-md border border-slate-200 text-sm font-semibold text-brand-purple font-inherit cursor-pointer bg-white focus:border-brand-teal outline-none transition-colors"
        >
          <option value={24}>24 hours before</option>
          <option value={12}>12 hours before</option>
          <option value={2}>2 hours before</option>
        </select>
      </div>
      <div className="divide-y divide-slate-100 border-t border-slate-100">
        {CHANNELS.map(({ key, label }) => (
          <ToggleRow
            key={key}
            label={label}
            active={channels.includes(key)}
            onToggle={() => toggleChannel(key)}
            ariaLabel={`Reminders via ${label}`}
          />
        ))}
      </div>
    </PanelShell>
  );
}
