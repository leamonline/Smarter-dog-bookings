// The brief's warm notes — the two "worth knowing" lines under the diary.
// Each note renders ONLY when its data source is genuinely available and
// non-zero (offline or errored sources say nothing rather than guessing),
// and taps through to the reports page where the full story lives. They sit
// behind a quiet "Later" disclosure so a busy board doesn't compete with the
// active lanes above it — collapsed by default, expanded state is local and
// never gates or delays the two queries that decide whether it renders at all.
import { ChevronDown } from "lucide-react";
import { useUnpaidFortnight } from "../../../hooks/useUnpaidFortnight";
import { useRetentionData } from "../../../hooks/useRetentionData";

function Note({ tone, onClick, children }) {
  const toneClass =
    tone === "amber"
      ? "bg-amber-50 text-amber-800 border-l-amber-400"
      : "bg-white text-slate-700 border-l-brand-paper-line";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left rounded-xl border border-l-4 border-brand-paper-line px-3.5 py-2.5 text-[13px] leading-relaxed min-h-[44px] hover:brightness-[0.98] motion-safe:transition ${toneClass}`}
    >
      {children}
    </button>
  );
}

export function TodayBriefNotes({ todayStr, onOpenReports }) {
  const unpaid = useUnpaidFortnight(todayStr);
  const retention = useRetentionData();

  const showUnpaid = unpaid.available && unpaid.count > 0;
  const showDueBack = retention.available && retention.overdueCount > 0;
  const count = [showUnpaid, showDueBack].filter(Boolean).length;
  if (count === 0) return null;

  return (
    <details className="group rounded-xl border border-slate-200/80 bg-white/65">
      <summary className="flex min-h-[44px] cursor-pointer list-none items-center gap-2 px-3.5 py-2.5 text-[13px] font-bold text-slate-700 marker:content-none [&::-webkit-details-marker]:hidden">
        Later
        <span className="text-[12px] font-medium text-slate-500">
          {count} {count === 1 ? "thing" : "things"} worth reviewing
        </span>
        <ChevronDown size={16} aria-hidden="true" className="ml-auto shrink-0 text-slate-400 transition-transform group-open:rotate-180" />
      </summary>
      <div className="flex flex-col gap-2 px-3.5 pb-3.5 pt-1">
        {showUnpaid && (
          <Note tone="amber" onClick={onOpenReports}>
            {unpaid.count} {unpaid.count === 1 ? "groom" : "grooms"} in the last fortnight{" "}
            {unpaid.count === 1 ? "isn't" : "aren't"} marked paid — worth a tidy at cash-up.
          </Note>
        )}
        {showDueBack && (
          <Note tone="calm" onClick={onOpenReports}>
            {retention.overdueCount} {retention.overdueCount === 1 ? "dog is" : "dogs are"} due back with no
            booking — the retention report has the list.
          </Note>
        )}
      </div>
    </details>
  );
}
