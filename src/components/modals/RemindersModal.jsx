import { X } from "lucide-react";
import { ModalShell, HeaderIconButton } from "./shell/index.js";
import { TomorrowRemindersCard } from "../dashboard/TomorrowRemindersCard.jsx";

// Lightweight modal home for tomorrow's reminders on mobile/tablet, opened
// from the bell badge on the day's controls bar. Reuses the same reminders
// card the desktop sidebar shows (bare = no outer card chrome).
export function RemindersModal({ onClose }) {
  const titleId = "reminders-modal-title";
  return (
    <ModalShell
      onClose={onClose}
      titleId={titleId}
      accent="var(--color-brand-yellow)"
      widthClass="w-[min(560px,95vw)]"
      maxHeightClass="max-h-[min(85vh,680px)]"
      header={
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-200">
          <h2 id={titleId} className="font-display text-lg font-extrabold text-brand-purple">
            Reminders
          </h2>
          <HeaderIconButton label="Close reminders" onClick={onClose}>
            <X size={18} strokeWidth={2.2} aria-hidden="true" />
          </HeaderIconButton>
        </div>
      }
      bodyClassName="p-4"
    >
      <TomorrowRemindersCard bare />
    </ModalShell>
  );
}
