import { useEffect, useState } from "react";
import { MessageCircleOff } from "lucide-react";
import { PanelShell } from "../shell/PanelShell.jsx";

export function AiMessagingPanel({ human, onUpdateHuman }) {
  const persistedAllowed = human?.aiWhatsappAllowed !== false;
  const [allowed, setAllowed] = useState(persistedAllowed);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setAllowed(persistedAllowed);
  }, [human?.id, persistedAllowed]);

  async function toggle() {
    if (!human?.id || !onUpdateHuman || saving) return;
    const next = !allowed;
    setAllowed(next);
    setSaving(true);
    const saved = await onUpdateHuman(human.id, {
      aiWhatsappAllowed: next,
    });
    if (saved === null) setAllowed(!next);
    setSaving(false);
  }

  return (
    <PanelShell eyebrow="AI messaging" icon={MessageCircleOff} accent="sky">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[12px] font-bold text-slate-600">
            Allow AI-initiated WhatsApp messages
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
            {allowed
              ? "Allowed when the salon switch is on."
              : "Blocked for this customer. Staff can still message them manually."}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={allowed}
          aria-label="Allow AI-initiated WhatsApp messages"
          disabled={!onUpdateHuman || !human?.id || saving}
          onClick={toggle}
          className={[
            "relative mt-0.5 h-6 w-11 shrink-0 rounded-full border-none transition-colors",
            !onUpdateHuman || !human?.id || saving
              ? "cursor-not-allowed opacity-60"
              : "cursor-pointer",
            allowed ? "bg-emerald-500" : "bg-slate-300",
          ].join(" ")}
        >
          <span
            aria-hidden="true"
            className={[
              "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all",
              allowed ? "left-[22px]" : "left-0.5",
            ].join(" ")}
          />
        </button>
      </div>
    </PanelShell>
  );
}
