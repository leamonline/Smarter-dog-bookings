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

/** White card wrapper for grouped sections */
export function SectionCard({ title, children }) {
  return (
    <div className="bg-white rounded-xl shadow-[0_1px_4px_rgba(0,0,0,0.06)] mb-3 overflow-hidden">
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
            ? "text-brand-teal cursor-pointer"
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

/**
 * Maps booking status IDs to Tailwind accent classes for the redesigned card.
 * Status IDs come from BOOKING_STATUSES in src/constants/salon.ts and are
 * used in the engine + DB — we don't rename them, only style them.
 */
export const STATUS_ACCENT = {
  "No-show": {              // labelled "Booked" in the UI
    stripe: "bg-amber-400",
    fill: "bg-amber-50",
    ring: "ring-amber-200",
    text: "text-amber-700",
    pillBg: "bg-amber-100",
    pillText: "text-amber-800",
  },
  "Checked in": {
    stripe: "bg-sky-400",
    fill: "bg-sky-50",
    ring: "ring-sky-200",
    text: "text-sky-700",
    pillBg: "bg-sky-100",
    pillText: "text-sky-800",
  },
  "Ready for pick-up": {    // labelled "Finished" in the UI
    stripe: "bg-emerald-400",
    fill: "bg-emerald-50",
    ring: "ring-emerald-200",
    text: "text-emerald-700",
    pillBg: "bg-emerald-100",
    pillText: "text-emerald-800",
  },
};

export function getStatusAccent(statusId) {
  return STATUS_ACCENT[statusId] || STATUS_ACCENT["No-show"];
}

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

/**
 * Circular ghost icon button used in the redesigned header.
 * White/20 fill on coloured headers; lifts on hover.
 */
export function IconBtn({ children, onClick, ariaLabel, className = "" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={`w-9 h-9 rounded-full bg-white/25 hover:bg-white/40 active:bg-white/50 backdrop-blur-sm flex items-center justify-center transition-all duration-150 hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-1 focus-visible:ring-offset-amber-400 ${className}`}
    >
      {children}
    </button>
  );
}

/**
 * Faint paw print watermark for the header background. Pure decorative.
 */
export function PawWatermark({ className = "" }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 64 64"
      className={`pointer-events-none select-none ${className}`}
      fill="currentColor"
    >
      <ellipse cx="20" cy="22" rx="5" ry="7" />
      <ellipse cx="44" cy="22" rx="5" ry="7" />
      <ellipse cx="10" cy="36" rx="5" ry="6.5" />
      <ellipse cx="54" cy="36" rx="5" ry="6.5" />
      <path d="M32 32c-9 0-16 7-16 14 0 5 4 8 9 8 3 0 5-1 7-1s4 1 7 1c5 0 9-3 9-8 0-7-7-14-16-14z" />
    </svg>
  );
}
