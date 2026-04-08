/**
 * Shared layout helpers for BookingDetailModal and sub-components.
 * All styling uses Tailwind — no BRAND import needed.
 */

/** Tailwind class string equivalent of the old modalInputStyle object */
export const MODAL_INPUT_CLS =
  "w-full px-3 py-2 rounded-lg border border-slate-200 text-[13px] outline-none font-inherit text-slate-800 box-border";

export function LogisticsLabel({ text }) {
  return (
    <span className="text-[12px] font-extrabold text-brand-teal uppercase tracking-wide">
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
