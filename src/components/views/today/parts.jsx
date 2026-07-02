// Shared presentational building blocks for the Today command centre.
// All status/urgency is carried by text + hierarchy + an accent bar — never
// colour alone — matching the app's accessibility bar. Every tap target is at
// least 44px tall (wet hands, one thumb, a wriggling dog under the other arm).
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
          {subtitle && <p className="text-[12px] text-slate-600 mt-0.5">{subtitle}</p>}
        </div>
        {typeof count === "number" && (
          <span className="shrink-0 inline-flex items-center justify-center min-w-[24px] h-6 px-2 rounded-full bg-slate-100 text-slate-700 text-[12px] font-bold">
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
    <p className="px-3 py-6 text-center text-[13px] text-slate-600">{children}</p>
  );
}

/**
 * A one-line reassurance row for a category with nothing in it — replaces a
 * whole empty card so a good day reads calm, not padded.
 */
export function CompactZeroState({ children }) {
  return (
    <p className="flex items-center gap-2.5 rounded-xl border border-brand-teal/20 bg-brand-teal/[0.05] px-4 py-2.5 text-[13px] font-semibold text-brand-teal-text">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
        <path d="M20 6 9 17l-5-5" />
      </svg>
      {children}
    </p>
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

/** The one strong action on a card — teal, filled, unmissable. */
export function PrimaryButton({ onClick, children, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center justify-center min-h-[44px] px-4 rounded-xl bg-brand-teal text-white text-[13px] font-bold hover:bg-brand-teal-dark motion-safe:transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {children}
    </button>
  );
}

/** The quieter companion action — filled but subtle, never competing. */
export function SecondaryButton({ onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center justify-center min-h-[44px] px-3.5 rounded-xl bg-slate-100 text-slate-700 text-[13px] font-semibold hover:bg-slate-200 motion-safe:transition-colors"
    >
      {children}
    </button>
  );
}

/** Tertiary text action — a link, but with a full-height tap area. */
export function TertiaryLink({ onClick, tone = "muted", children }) {
  const toneClass =
    tone === "purple"
      ? "text-brand-purple"
      : tone === "whatsapp"
        ? "text-brand-whatsapp-dark"
        : "text-slate-600";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center min-h-[44px] px-2 text-[13px] font-semibold ${toneClass} hover:underline underline-offset-2`}
    >
      {children}
    </button>
  );
}

/** Rotating chevron for expandable rows — a supporting cue, not the only one. */
export function Chevron({ open }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`shrink-0 text-slate-500 motion-safe:transition-transform ${open ? "rotate-180" : ""}`}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
