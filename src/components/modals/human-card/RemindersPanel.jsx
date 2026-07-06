import { Clock, Mail, MessageSquare, MessageCircle } from "lucide-react";
import { PanelShell } from "../shell/PanelShell.jsx";

// Reminder preferences: three channel icon toggles (WhatsApp / SMS /
// Email). Toggle palette matches the Channels pills (amber here because
// the panel accent is amber). Reminders go out on a fixed daily schedule,
// so there is no per-customer timing control.

const CHANNELS = [
  { key: "whatsapp", label: "WhatsApp", icon: MessageCircle },
  { key: "sms", label: "SMS", icon: MessageSquare },
  { key: "email", label: "Email", icon: Mail },
];

export function RemindersPanel({ human, onUpdateHuman }) {
  const channels = human.reminderChannels || ["whatsapp"];

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
      <div className="flex items-center gap-1.5 flex-wrap">
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
    </PanelShell>
  );
}
