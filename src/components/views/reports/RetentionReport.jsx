import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Section } from "./ReportWidgets.jsx";
import { useRetentionData } from "../../../hooks/useRetentionData.ts";
import { fmtLabel } from "../../../hooks/useReportsData.ts";

const SNOOZE_DAYS = 28;

function statusChip(c) {
  if (c.status === "overdue") {
    return <span className="text-micro font-bold text-brand-coral-dark bg-brand-coral/15 rounded-full px-1.5 py-0.5">{c.overdueDays}d overdue</span>;
  }
  return <span className="text-micro font-bold text-amber-700 bg-amber-100 rounded-full px-1.5 py-0.5">due in {c.dueInDays}d</span>;
}

export function RetentionReport() {
  const navigate = useNavigate();
  const { loading, available, candidates, excludedCount, overdueCount, mark } = useRetentionData();
  const [busyDog, setBusyDog] = useState(null);

  // The report is about who to bring back — show overdue + due-soon only.
  const due = candidates.filter((c) => c.status !== "not-due");

  const doMark = async (dogId, kind) => {
    setBusyDog(dogId);
    if (kind === "snoozed") {
      const until = new Date();
      until.setDate(until.getDate() + SNOOZE_DAYS);
      await mark(dogId, "snoozed", "Snoozed from reports", until.toISOString().slice(0, 10));
    } else {
      await mark(dogId, "excluded", "Excluded from reports");
    }
    setBusyDog(null);
  };

  const insight =
    available && overdueCount > 0
      ? `${overdueCount} dog${overdueCount !== 1 ? "s are" : " is"} overdue for a groom — a quick message could rebook them.`
      : undefined;

  return (
    <Section title="Due back but not booked" accent="var(--color-brand-purple)" insight={insight}>
      {!available ? (
        <div className="text-caption text-ink-muted font-medium">
          {loading ? "Working out who's due back…" : "Retention needs live booking history — it isn't available in offline mode."}
        </div>
      ) : due.length === 0 ? (
        <div className="text-caption text-ink-muted font-medium">No dogs are overdue right now. Lovely — everyone's on schedule. 🐾</div>
      ) : (
        <div className="flex flex-col divide-y divide-slate-100">
          {due.slice(0, 12).map((c) => (
            <div key={c.dogId} className="py-2.5 flex items-center gap-2 flex-wrap">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => navigate(`/dogs/${c.dogId}`)}
                    className="text-sm font-bold text-slate-800 hover:text-brand-teal-text bg-transparent border-none p-0 cursor-pointer font-[inherit] truncate"
                  >
                    {c.dogName}
                  </button>
                  {statusChip(c)}
                  {c.recentlyContacted && <span className="text-micro text-ink-muted font-medium">· recently messaged</span>}
                </div>
                <div className="text-micro text-ink-muted font-medium mt-0.5 truncate">
                  {c.owner || "Owner"} · last groomed {c.lastGroomedDate ? fmtLabel(c.lastGroomedDate, true) : "—"} · usually every {c.typicalIntervalDays}d
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => navigate(`/inbox?human=${c.ownerId}`)}
                  className="min-h-[36px] px-2.5 rounded-lg text-caption font-bold text-brand-teal-text bg-brand-teal/10 hover:bg-brand-teal/20 border-none cursor-pointer font-[inherit]"
                >
                  Message
                </button>
                <button
                  type="button"
                  disabled={busyDog === c.dogId}
                  onClick={() => doMark(c.dogId, "snoozed")}
                  className="min-h-[36px] px-2 rounded-lg text-caption font-semibold text-slate-500 hover:bg-slate-100 border-none cursor-pointer font-[inherit] disabled:opacity-50"
                >
                  Snooze
                </button>
                <button
                  type="button"
                  disabled={busyDog === c.dogId}
                  onClick={() => doMark(c.dogId, "excluded")}
                  className="min-h-[36px] px-2 rounded-lg text-caption font-semibold text-slate-500 hover:bg-slate-100 border-none cursor-pointer font-[inherit] disabled:opacity-50"
                  title="Don't chase this dog"
                >
                  Not now
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {available && excludedCount > 0 && (
        <div className="mt-3 pt-3 border-t border-slate-100 text-micro text-ink-muted font-medium">
          {excludedCount} dog{excludedCount !== 1 ? "s" : ""} hidden (archived, opted out, or snoozed).
        </div>
      )}
    </Section>
  );
}
