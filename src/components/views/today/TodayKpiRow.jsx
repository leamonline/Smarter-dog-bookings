// The brief-style KPI row — the day at a glance in three cards: live on-site
// dogs (or booked dogs for a future brief), expected takings if everyone pays,
// and booked capacity against the daily dog cap.
import { DAY_CAPACITY } from "../../../engine/utilisation";
import { formatMoney } from "./parts.jsx";

function KpiCard({ label, children, hint }) {
  return (
    <div className="rounded-xl border border-brand-paper-line bg-white px-3.5 py-3">
      <p className="text-[12px] text-slate-600">{label}</p>
      <p className="text-[23px] font-extrabold text-brand-purple leading-tight mt-0.5 tabular-nums">{children}</p>
      {hint && <p className="text-[11px] text-slate-500">{hint}</p>}
    </div>
  );
}

export function TodayKpiRow({ dogsBooked, onSite, expectedRevenue }) {
  const pct = Math.min(100, Math.round((dogsBooked / DAY_CAPACITY) * 100));
  const isLiveDay = Number.isFinite(onSite);
  return (
    <div className="grid grid-cols-3 gap-2.5">
      <KpiCard
        label={isLiveDay ? "On site" : "Booked"}
        hint={isLiveDay ? `${dogsBooked} booked today` : undefined}
      >
        {isLiveDay ? onSite : dogsBooked}
      </KpiCard>
      <KpiCard label="Expected" hint="if all paid">{formatMoney(expectedRevenue)}</KpiCard>
      <div className="rounded-xl border border-brand-paper-line bg-white px-3.5 py-3">
        <p className="text-[12px] text-slate-600">Capacity</p>
        <p className="text-[23px] font-extrabold text-brand-purple leading-tight mt-0.5 tabular-nums">
          {dogsBooked} <span className="text-[14px] text-slate-500 font-bold">/ {DAY_CAPACITY}</span>
        </p>
        <div
          role="progressbar"
          aria-label="Capacity used"
          aria-valuenow={dogsBooked}
          aria-valuemin={0}
          aria-valuemax={DAY_CAPACITY}
          className="mt-2 h-1.5 rounded-full bg-slate-100 overflow-hidden"
        >
          <span className="block h-full bg-brand-yellow" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  );
}
