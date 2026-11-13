import { useState } from "react";
import { MessageCircle, MessageSquare, MessagesSquare } from "lucide-react";
import { PanelShell } from "../shell/PanelShell.jsx";

// Preferred method of contact: one of two pills, WhatsApp or SMS.
//
// Everyone can be texted, so SMS is always possible. The WhatsApp pill says
// this customer has WhatsApp and may be contacted on it. It is the single
// switch the messaging policy reads (humans.whatsapp, see
// supabase/functions/_shared/channelPolicy.ts): WhatsApp on -> essential
// messages go by WhatsApp with SMS as the fallback; SMS on -> they are texted.
// The same flag is set by sign-up and by the customer portal.
//
// Live in view mode (onUpdateHuman), staged in edit mode (setEditWhatsapp).

const OPTIONS = [
  { key: "whatsapp", label: "WhatsApp", icon: MessageCircle, value: true },
  { key: "sms", label: "SMS", icon: MessageSquare, value: false },
];

export function PreferredContactPanel({ isEditing, human, onUpdateHuman, editWhatsapp, setEditWhatsapp }) {
  const prefersWhatsApp = isEditing ? !!editWhatsapp : !!human.whatsapp;
  const [savingKey, setSavingKey] = useState(null);
  const canChange = isEditing || (!!onUpdateHuman && !!human.id);

  const choose = (option) => {
    if (!canChange || option.value === prefersWhatsApp) return;
    if (isEditing) {
      setEditWhatsapp(option.value);
      return;
    }
    setSavingKey(option.key);
    setTimeout(() => setSavingKey((current) => (current === option.key ? null : current)), 200);
    onUpdateHuman(human.id, { whatsapp: option.value });
  };

  return (
    <PanelShell eyebrow="Preferred method of contact" icon={MessagesSquare} accent="amber">
      <div role="radiogroup" aria-label="Preferred method of contact" className="flex items-center gap-1.5 flex-wrap">
        {OPTIONS.map((option) => {
          const Icon = option.icon;
          const active = option.value === prefersWhatsApp;
          return (
            <button
              key={option.key}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={!canChange}
              onClick={() => choose(option)}
              title={
                option.key === "whatsapp"
                  ? "They have WhatsApp: message them there first, with SMS as the fallback"
                  : "Text them. Everyone can be reached by SMS"
              }
              className={[
                "inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-bold font-inherit border-none transition-[background-color,color,transform] duration-200",
                canChange ? "cursor-pointer" : "cursor-default",
                active ? "bg-feedback-warning-ink text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200",
                savingKey === option.key ? "scale-110" : "scale-100",
              ].join(" ")}
            >
              <Icon size={12} strokeWidth={2.4} aria-hidden="true" />
              {option.label}
            </button>
          );
        })}
      </div>
    </PanelShell>
  );
}
