// ============================================================
// src/components/views/inbox/customer-context/DogSummaryCard.jsx
//
// One card per dog in the customer-context panel. Shows the size
// dot, breed/age, alert pills, and the full groom notes.
// Tapping the card calls onOpenDog so staff can jump to the full
// DogCardModal for everything else.
// ============================================================

import { SizeTag } from "../../../ui/SizeTag.jsx";
import { titleCase } from "../../../../utils/text";

const ALERT_PILL_CLASS =
  "inline-flex items-center px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-200 text-[10px] font-bold uppercase tracking-wide";

export function DogSummaryCard({ dog, onOpenDog }) {
  if (!dog) return null;
  const name = titleCase(dog.name || "Unnamed dog");
  const breedLine = [
    dog.breed ? titleCase(dog.breed) : null,
    dog.age ? dog.age : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const groomNotes = dog.groomNotes?.trim() || null;

  return (
    <button
      type="button"
      onClick={onOpenDog ? () => onOpenDog(dog.id) : undefined}
      className={`w-full text-left rounded-2xl border border-slate-200 bg-white px-3 py-2.5 transition-colors font-[inherit] ${
        onOpenDog ? "cursor-pointer hover:border-brand-yellow/60 hover:bg-brand-yellow/5" : "cursor-default"
      }`}
    >
      <div className="flex items-center gap-2.5">
        {dog.size && <SizeTag size={dog.size} />}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[14px] font-bold text-brand-purple truncate">
              {name}
            </span>
            {dog.alerts?.length > 0 && (
              <span
                className="inline-block w-2 h-2 rounded-full bg-rose-500"
                aria-label={`${dog.alerts.length} alert${dog.alerts.length === 1 ? "" : "s"}`}
                title={dog.alerts.join(" · ")}
              />
            )}
          </div>
          {breedLine && (
            <div className="text-[11px] text-slate-500 truncate">{breedLine}</div>
          )}
        </div>
      </div>

      {dog.alerts?.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {dog.alerts.map((alert) => (
            <span key={alert} className={ALERT_PILL_CLASS}>
              {alert}
            </span>
          ))}
        </div>
      )}

      {groomNotes && (
        <p className="text-[12px] text-slate-600 mt-1.5 leading-snug whitespace-pre-wrap">
          {groomNotes}
        </p>
      )}
    </button>
  );
}
