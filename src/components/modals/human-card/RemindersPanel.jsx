import { Clock, Mail, MessageSquare, MessageCircle } from "lucide-react";
import { PanelShell } from "./PanelShell.jsx";

// Reminder preferences condensed onto a single row: three channel
// icon toggles on the left, timing select on the right. Replaces the
// four-row stack (Timing + WhatsApp + SMS + Email) that doubled the
// right column's height. Toggle palette matches the Channels pills
// (amber here because the panel accent is amber).

const CHANNELS = [
  { key: "whatsapp", label: "WhatsApp", icon: MessageCircle },
  { key: "sms", label: "SMS", icon: MessageSquare },
  { key: "email", label: "Email", icon: Mail },
];

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
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1.5">
          {CHANNELS.map(({ key, label, icon: Icon }) => {
            const active = channels.includes(key);
            return (
              <button
                key={key}
                type="button"
                role="switch"
                aria-checked={active}
                aria-label={`Reminders via ${label}`}
                onClick={() => toggleChannel(key)}
                title={`${label} ${active ? "on" : "off"}`}
                className={[
                  "inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[12px] font-bold font-inherit border-none cursor-pointer transition-colors",
                  active
                    ? "bg-amber-500 text-white"
                    : "bg-slate-100 text-slate-500 hover:bg-slate-200",
                ].join(" ")}
              >
                <Icon size={12} strokeWidth={2.4} aria-hidden="true" />
                {label}
              </button>
            );
          })}
        </div>
        <select
          value={timing}
          onChange={(e) =>
            onUpdateHuman(human.id, { reminderHours: Number(e.target.value) })
          }
          aria-label="Reminder timing"
          className="py-1 px-2 rounded-md border border-slate-200 text-sm font-semibold text-brand-purple font-inherit cursor-pointer bg-white focus:border-brand-teal outline-none transition-colors"
        >
          <option value={24}>24h before</option>
          <option value={12}>12h before</option>
          <option value={2}>2h before</option>
        </select>
      </div>
    </PanelShell>
  );
}
