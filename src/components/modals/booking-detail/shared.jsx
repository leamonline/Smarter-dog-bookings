/**
 * Shared layout helpers for BookingDetailModal and sub-components.
 * All styling uses Tailwind — no BRAND import needed.
 */

/** Tailwind class string equivalent of the old modalInputStyle object */
export const MODAL_INPUT_CLS =
  "w-full px-3 py-2 rounded-lg border border-slate-200 text-[13px] outline-none font-inherit text-slate-800 box-border";

export function LogisticsLabel({ text }) {
  return (
    <span className="text-[12px] font-extrabold text-brand-teal-text uppercase tracking-wide">
      {text}
    </span>
  );
}

export function FinanceLabel({ text }) {
  return (
    <span className="text-[12px] font-extrabold text-brand-green uppercase tracking-wide">
      {text}
    </span>
  );
}

/** White card wrapper for grouped sections */
export function SectionCard({ title, children }) {
  return (
    <div className="bg-white rounded-2xl border-[1.5px] border-slate-200 mb-3 overflow-hidden">
      {title && (
        <div className="px-4 pt-3.5 pb-1">
          <span className="text-[13px] font-extrabold text-slate-700">
            {title}
          </span>
        </div>
      )}
      <div className="px-4 pb-3">{children}</div>
    </div>
  );
}

/** Compact key–value row for use inside SectionCard */
export function CardRow({ label, value, onClick, last }) {
  const content = (
    <div
      className={`flex justify-between items-start py-2.5 ${
        last ? "" : "border-b border-slate-100"
      }`}
    >
      <span className="text-[13px] text-slate-400 shrink-0 pr-3">{label}</span>
      <span
        className={`text-[13px] font-semibold text-right break-words ${
          onClick
            ? "text-brand-teal-text cursor-pointer"
            : "text-slate-800"
        }`}
        role={onClick ? "button" : undefined}
        tabIndex={onClick ? 0 : undefined}
        onClick={onClick}
        onKeyDown={onClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } } : undefined}
      >
        {value}
      </span>
    </div>
  );
  return content;
}

export function DetailRow({
  label,
  value,
  editNode = null,
  verticalEdit = false,
  isEditing,
}) {
  return (
    <div className="py-2.5 border-b border-slate-200">
      <div
        className={`flex justify-between ${
          isEditing && editNode && !verticalEdit ? "items-center" : "items-start"
        }`}
      >
        <span
          className={`text-[13px] text-slate-500 shrink-0 pr-3 ${
            isEditing && editNode && !verticalEdit ? "" : "pt-0.5"
          }`}
        >
          {label}
        </span>
        {isEditing && editNode && !verticalEdit ? (
          <div className="flex-1 flex justify-end max-w-[65%]">
            {editNode}
          </div>
        ) : (
          <span className="text-[13px] font-semibold text-slate-800 text-right break-words">
            {value}
          </span>
        )}
      </div>
      {isEditing && editNode && verticalEdit && (
        <div className="mt-2">{editNode}</div>
      )}
    </div>
  );
}

// Status colours (header accent bar, active stepper step, primary button) now
// come from the shared STATUS_DISPLAY map in src/constants/salon.ts so the
// modal always colour-matches the dashboard card it was opened from. The old
// Tailwind-class STATUS_ACCENT map has been removed.

/**
 * Single key-value row for the redesigned view-mode card.
 * Uppercase slate-500 label + stronger slate-900 value + hairline divider.
 */
export function Row({ label, value, last = false, onClick }) {
  return (
    <div className={`flex justify-between items-start gap-3 py-3 ${last ? "" : "border-b border-slate-100"}`}>
      <span className="text-[11px] font-bold tracking-[0.08em] uppercase text-slate-500 shrink-0 pt-0.5">
        {label}
      </span>
      <span
        className={`text-[14px] font-semibold text-slate-900 text-right break-words leading-snug ${onClick ? "cursor-pointer hover:underline decoration-slate-300 underline-offset-2" : ""}`}
        role={onClick ? "button" : undefined}
        tabIndex={onClick ? 0 : undefined}
        onClick={onClick}
        onKeyDown={onClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } } : undefined}
      >
        {value}
      </span>
    </div>
  );
}

