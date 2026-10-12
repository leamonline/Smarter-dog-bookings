import { Section } from "./ReportWidgets.jsx";
import { useDenialsData } from "../../../hooks/useDenialsData.ts";
import { fmtLabel } from "../../../hooks/useReportsData.ts";
import { DENIAL_GROUP_LABELS } from "../../../engine/denials.ts";

const GROUP_ORDER = ["capacity", "restriction", "policy", "other"];

// 2F — "What demand did we have to turn away, and why?"
// Reads booking_denials (the fire-and-forget capture from the portal + WhatsApp
// flow). Frames carefully: a protective limit refusing a booking is the rules
// working as designed, NOT necessarily lost revenue.
export function CapacityPreventedReport({ days }) {
  const { loading, available, stats } = useDenialsData(days);

  if (loading || !available) {
    return (
      <Section title="Turned-away demand" accent="var(--color-brand-coral)">
        <div className="text-caption text-ink-muted font-medium">
          {loading ? "Checking for turned-away bookings…" : "This needs live booking data — none is loaded right now."}
        </div>
      </Section>
    );
  }

  if (stats.total === 0) {
    return (
      <Section title="Turned-away demand" accent="var(--color-brand-coral)">
        <div className="text-caption text-ink-muted font-medium">
          No booking denials were recorded in this period. Logging is best-effort, so this does not prove every attempt succeeded.
        </div>
      </Section>
    );
  }

  const maxReason = Math.max(...stats.byReason.map((r) => r.n), 1);
  const maxSlot = Math.max(...stats.bySlot.map((s) => s.n), 1);
  const takenPct = stats.alternativeShownN > 0 ? (stats.alternativeTakenN / stats.alternativeShownN) * 100 : 0;

  // Lead with capacity only. A customer the salon has blocked from a time,
  // or a closed day, is a rule doing its job, not demand we failed to serve.
  const { capacity, restriction } = stats.byGroup;
  const insight = capacity > 0
    ? `${capacity} capacity refusal${capacity !== 1 ? "s" : ""} recorded${restriction > 0 ? `, plus ${restriction} from a customer's own booking restriction` : ""} — most often "${stats.byReason[0].label}".`
    : `${stats.total} refusal${stats.total !== 1 ? "s" : ""} recorded, none of them for capacity — most often "${stats.byReason[0].label}".`;
  const groups = GROUP_ORDER.filter((g) => stats.byGroup[g] > 0);

  return (
    <Section title="Turned-away demand" accent="var(--color-brand-coral)" insight={insight}>
      <p className="text-caption text-ink-muted font-medium m-0 mb-2">
        Recorded refusals{stats.firstSeen ? `, since ${fmtLabel(stats.firstSeen.slice(0, 10), true)}` : ""}. Capacity limits are counted apart from a customer's own account restriction and from calendar or policy refusals. Events may repeat and are not unique failed appointments. A denial rate cannot be calculated without linked successful attempts. Dates use UTC and include today so far.
      </p>

      {/* Kind of refusal */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 mb-3 text-caption font-semibold text-slate-600" aria-label="Refusals by kind">
        {groups.map((g) => (
          <span key={g}>
            {DENIAL_GROUP_LABELS[g]} <strong className="text-slate-700 tabular-nums">{stats.byGroup[g]}</strong>
          </span>
        ))}
      </div>

      {/* Reasons ranked */}
      <div className="flex flex-col gap-1.5 mb-4">
        {stats.byReason.map((r) => (
          <div key={r.code} className="flex items-center gap-2">
            <span className="text-caption font-bold text-slate-600 w-[130px] shrink min-w-0 truncate" title={r.label}>{r.label}</span>
            <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden" role="img" aria-label={`${r.label}: ${r.n}`}>
              <div className="h-full rounded-full bg-brand-coral/60 transition-all" style={{ width: `${(r.n / maxReason) * 100}%` }} />
            </div>
            <span className="text-micro font-extrabold text-slate-500 w-[28px] shrink-0 text-right tabular-nums">{r.n}</span>
          </div>
        ))}
      </div>

      {/* Demand by slot */}
      {stats.bySlot.length > 0 && (
        <div className="pt-3 border-t border-slate-100">
          <div className="text-xs font-semibold text-slate-500 mb-2">Most-wanted times we couldn't fill</div>
          <div className="flex flex-col gap-1.5">
            {stats.bySlot.slice(0, 5).map((s) => (
              <div key={s.slot} className="flex items-center gap-2">
                <span className="text-caption font-bold text-slate-600 w-[50px] shrink-0">{s.label}</span>
                <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden" role="img" aria-label={`${s.label}: ${s.n}`}>
                  <div className="h-full rounded-full bg-purple-400 transition-all" style={{ width: `${(s.n / maxSlot) * 100}%` }} />
                </div>
                <span className="text-micro font-extrabold text-slate-500 w-[28px] shrink-0 text-right tabular-nums">{s.n}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Alternatives */}
      {stats.alternativeShownN > 0 && (
        <div className="mt-3 pt-3 border-t border-slate-100 text-caption text-ink-muted font-medium">
          Offered another time <strong className="text-slate-700">{stats.alternativeShownN}×</strong> — <strong className="text-slate-700">{stats.alternativeTakenN}</strong> taken ({takenPct.toFixed(0)}%).
        </div>
      )}
    </Section>
  );
}
