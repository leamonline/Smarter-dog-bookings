// The brief's warm notes — the two "worth knowing" lines under the diary.
// Each note renders ONLY when its data source is genuinely available and
// non-zero (offline or errored sources say nothing rather than guessing),
// and taps through to the reports page where the full story lives. They sit
// behind a quiet "Later" disclosure so a busy board doesn't compete with the
// active lanes above it. The closed summary names what is inside ("3 unpaid
// grooms · 4 dogs due back") rather than a bare count, so nobody has to open
// it to learn whether it matters. Collapsed by default on a working day; an
// empty day passes `defaultOpen`, because then these notes are the work.
// Expanded state is local and never gates or delays the two queries that
// decide whether it renders at all.
import { ChevronDown, ChevronRight } from "lucide-react";
import { useUnpaidFortnight } from "../../../hooks/useUnpaidFortnight";
import { useRetentionData } from "../../../hooks/useRetentionData";

function Note({ tone, onClick, children }) {
  const toneClass =
    tone === "amber"
      ? "bg-feedback-warning-tint text-feedback-warning-ink border-l-brand-mustard"
      : "bg-white text-slate-700 border-l-brand-paper-line";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 text-left rounded-tile border border-l-4 border-brand-paper-line px-3.5 py-2.5 text-body leading-relaxed min-h-[44px] hover:brightness-[0.98] motion-safe:transition ${toneClass}`}
    >
      <span className="min-w-0 flex-1">{children}</span>
      <ChevronRight size={16} aria-hidden="true" className="shrink-0 opacity-60" />
    </button>
  );
}

// `onOpenReports(path)` goes straight to the report that holds the list: the
// cash-up sheet for unpaid grooms, Insights (which carries the retention report)
// for dogs due back. `heading` is "Later" on a working day, when these notes
// wait behind the diary; an empty day passes "Catch up", because then they are
// the work to do now and "Later" would be wrong.
const CASH_UP_PATH = "/reports/cash-up";
const INSIGHTS_PATH = "/reports/insights";

export function TodayBriefNotes({ todayStr, onOpenReports, defaultOpen = false, heading = "Later" }) {
  const unpaid = useUnpaidFortnight(todayStr);
  const retention = useRetentionData();

  const showUnpaid = unpaid.available && unpaid.count > 0;
  const showDueBack = retention.available && retention.overdueCount > 0;
  const items = [
    showUnpaid && `${unpaid.count} unpaid ${unpaid.count === 1 ? "groom" : "grooms"}`,
    showDueBack && `${retention.overdueCount} ${retention.overdueCount === 1 ? "dog" : "dogs"} due back`,
  ].filter(Boolean);
  if (items.length === 0) return null;

  return (
    <details
      open={defaultOpen}
      className={`group rounded-card border ${
        // On an empty day this card sits beside two solid cards, so it matches
        // them; on a busy day it stays the quiet, translucent one.
        defaultOpen ? "border-brand-paper-line bg-white" : "border-slate-200/80 bg-white/65"
      }`}
    >
      <summary className="flex min-h-[44px] cursor-pointer list-none items-center gap-2 px-3.5 py-2.5 text-body font-bold text-slate-700 marker:content-none [&::-webkit-details-marker]:hidden">
        {heading}
        {/* The summary names what is inside only while it is shut; open, the
            notes below say the same thing in full. */}
        <span className="min-w-0 text-caption font-medium text-ink-muted group-open:hidden">
          {items.join(" · ")}
        </span>
        <ChevronDown size={16} aria-hidden="true" className="ml-auto shrink-0 text-ink-muted transition-transform group-open:rotate-180" />
      </summary>
      <div className="flex flex-col gap-2 px-3.5 pb-3.5 pt-1">
        {showUnpaid && (
          <Note tone="amber" onClick={() => onOpenReports?.(CASH_UP_PATH)}>
            {unpaid.count} {unpaid.count === 1 ? "groom" : "grooms"} in the last fortnight{" "}
            {unpaid.count === 1 ? "isn't" : "aren't"} marked paid — open the cash-up sheet to tidy them.
          </Note>
        )}
        {showDueBack && (
          <Note tone="calm" onClick={() => onOpenReports?.(INSIGHTS_PATH)}>
            {retention.overdueCount} {retention.overdueCount === 1 ? "dog is" : "dogs are"} due back with no
            booking — see who in the retention report.
          </Note>
        )}
      </div>
    </details>
  );
}
