import { Section } from "./ReportWidgets.jsx";
import { fmtLabel } from "../../../hooks/useReportsData.ts";

// 2C — "How often do bookings get rescheduled, cancelled or missed?"
// Reschedule/cancel counts come from booking_events (history starts ~May 2026).
// No-shows are split: confirmed (staff marked cancel_reason 'No-show') vs the
// legacy proxy (a past booking still sitting in 'Booked'), never double-counted.
const MIN_N_FOR_RATE = 5;

function Stat({ label, value, tone = "slate" }) {
  const color = tone === "coral" ? "var(--color-brand-coral)" : "var(--color-brand-purple)";
  return (
    <div className="bg-slate-50 rounded-xl px-3 py-2">
      <div className="text-lg font-black font-display leading-none" style={{ color }}>{value}</div>
      <div className="text-micro text-ink-muted font-semibold mt-0.5">{label}</div>
    </div>
  );
}

export function OutcomesReport({ outcomes }) {
  const {
    rescheduleCount, cancelCount, noShowConfirmedCount, lateCancelCount,
    noShowProxyCount, confirmedN, unconfirmedN,
    confirmedCancelRatePct, unconfirmedCancelRatePct, historyStart,
  } = outcomes;

  const hasComparison = confirmedN >= MIN_N_FOR_RATE && unconfirmedN >= MIN_N_FOR_RATE;
  const nothingYet = rescheduleCount + cancelCount + noShowConfirmedCount + noShowProxyCount === 0;

  let insight;
  if (hasComparison && confirmedCancelRatePct < unconfirmedCancelRatePct) {
    insight = `Reminder-confirmed bookings cancel less (${confirmedCancelRatePct.toFixed(0)}% vs ${unconfirmedCancelRatePct.toFixed(0)}%) — confirmations are worth chasing.`;
  }

  return (
    <Section title="Reschedules, cancellations & no-shows" accent="var(--color-brand-coral)" insight={insight}>
      {nothingYet ? (
        <div className="text-caption text-ink-muted font-medium">Nothing rescheduled, cancelled or missed in this period. 🎉</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Stat label="Reschedules" value={rescheduleCount} />
          <Stat label="Cancellations" value={cancelCount} />
          <Stat label="No-shows (marked)" value={noShowConfirmedCount} tone="coral" />
          <Stat label="Late (<24h)" value={lateCancelCount} tone="coral" />
        </div>
      )}

      {noShowProxyCount > 0 && (
        <div className="mt-3 text-caption text-ink-muted font-medium">
          {noShowProxyCount} past booking{noShowProxyCount !== 1 ? "s" : ""} left as “Booked” — not counted as no-shows. Closing them off keeps this accurate.
        </div>
      )}

      {hasComparison && (
        <div className="mt-3 pt-3 border-t border-slate-100">
          <div className="text-xs font-semibold text-slate-500 mb-2">Cancel rate — did they confirm the reminder?</div>
          <div className="flex gap-4">
            <div>
              <div className="text-sm font-black text-emerald-600 font-display">{confirmedCancelRatePct.toFixed(0)}%</div>
              <div className="text-micro text-ink-muted font-semibold">confirmed</div>
            </div>
            <div>
              <div className="text-sm font-black text-slate-600 font-display">{unconfirmedCancelRatePct.toFixed(0)}%</div>
              <div className="text-micro text-ink-muted font-semibold">not confirmed</div>
            </div>
          </div>
        </div>
      )}

      <div className="mt-3 pt-3 border-t border-slate-100 text-micro text-ink-muted font-medium">
        Event history from {fmtLabel(historyStart, true)} {new Date(historyStart + "T00:00:00").getFullYear()} — earlier reschedules and cancellations aren’t recorded.
      </div>
    </Section>
  );
}
