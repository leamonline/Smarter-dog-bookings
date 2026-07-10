// The brief's warm notes — the two "worth knowing" lines under the diary.
// Each note renders ONLY when its data source is genuinely available and
// non-zero (offline or errored sources say nothing rather than guessing),
// and taps through to the reports page where the full story lives.
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
  if (!showUnpaid && !showDueBack) return null;

  return (
    <div className="flex flex-col gap-2">
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
  );
}
