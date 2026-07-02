// Shared presentational building blocks for the Today command centre.
// All status/urgency is carried by text + hierarchy + an accent bar — never
// colour alone — matching the app's accessibility bar.
import { getStatusDisplay } from "../../../constants/index";

/** "25 min", "1 hr 5 min", "just now". */
export function formatMinutes(mins) {
  if (mins == null) return null;
  if (mins <= 0) return "just now";
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}

/** Whole-pound money for operational nudges (no decimals of pence). */
export function formatMoney(amount) {
  if (amount == null) return "";
  return `£${Math.round(amount)}`;
}

export function SectionCard({ title, subtitle, count, accent, action, children }) {
  return (
    <section
      className="rounded-2xl border border-slate-200 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)] overflow-hidden"
      aria-label={typeof title === "string" ? title : undefined}
    >
      <header className="flex items-center gap-3 px-4 sm:px-5 py-3 border-b border-slate-100">
        {accent && <span aria-hidden className={`h-5 w-1.5 rounded-full ${accent}`} />}
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-bold text-slate-800 leading-tight">{title}</h2>
          {subtitle && <p className="text-[12px] text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
        {typeof count === "number" && (
          <span className="shrink-0 inline-flex items-center justify-center min-w-[24px] h-6 px-2 rounded-full bg-slate-100 text-slate-600 text-[12px] font-bold">
            {count}
          </span>
        )}
        {action}
      </header>
      <div className="p-2 sm:p-3">{children}</div>
    </section>
  );
}

/** A calm, warm empty state — the warmth lives here. */
export function EmptyState({ children }) {
  return (
    <p className="px-3 py-6 text-center text-[13px] text-slate-500">{children}</p>
  );
}

export function StatusPill({ status }) {
  const d = getStatusDisplay(status);
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold whitespace-nowrap"
      style={{ background: d.bg, color: d.color }}
    >
      {d.label}
    </span>
  );
}

/** Welfare / handover chips — surfaced plainly, never editorialised. */
export function WelfareChips({ alerts = [], pregnant = false, notes = "" }) {
  const chips = [];
  if (pregnant) chips.push("Pregnant");
  for (const a of alerts) chips.push(a);
  if (notes && notes.trim()) chips.push(notes.trim());
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1.5">
      {chips.map((c, i) => (
        <span
          key={i}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 text-[11px] font-medium border border-amber-100"
        >
          <span aria-hidden>⚑</span>
          {c}
        </span>
      ))}
    </div>
  );
}

export function PrimaryButton({ onClick, children, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center justify-center min-h-[38px] px-3 rounded-lg bg-brand-teal text-white text-[13px] font-bold hover:bg-brand-teal-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {children}
    </button>
  );
}

export function GhostButton({ onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center justify-center min-h-[38px] px-3 rounded-lg bg-slate-100 text-slate-700 text-[13px] font-semibold hover:bg-slate-200 transition-colors"
    >
      {children}
    </button>
  );
}
