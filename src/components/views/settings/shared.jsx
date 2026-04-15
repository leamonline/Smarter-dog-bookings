// src/components/views/settings/shared.jsx
// Shared sub-components used by multiple settings sections.

const CARD_HEAD_THEMES = {
  teal:   { bg: "bg-[#E6F5F2]", color: "text-[#1E6B5C]" },
  blue:   { bg: "bg-blue-50",    color: "text-brand-cyan-dark" },
  yellow: { bg: "bg-amber-50",   color: "text-amber-800" },
  coral:  { bg: "bg-brand-coral-light", color: "text-brand-coral" },
};

export function Card({ id, children }) {
  return (
    <div id={id} className="bg-white border border-slate-200 rounded-xl mb-4 shadow-[0_2px_8px_rgba(0,0,0,0.03)] overflow-hidden">
      {children}
    </div>
  );
}

export function CardHead({ variant = "teal", title, desc, right }) {
  const t = CARD_HEAD_THEMES[variant] || CARD_HEAD_THEMES.teal;
  return (
    <div className={`p-3.5 px-4 border-b border-slate-200 flex justify-between items-center ${t.bg}`}>
      <div>
        <div className={`text-base font-extrabold ${t.color}`}>{title}</div>
        {desc && <div className="text-[13px] font-semibold text-slate-800 mt-0.5">{desc}</div>}
      </div>
      {right}
    </div>
  );
}

export function CardBody({ children }) {
  return <div className="p-4">{children}</div>;
}

export function SettingRow({ label, sublabel, control, border = true }) {
  return (
    <div className={`flex justify-between items-center py-3.5 ${border ? "border-b border-slate-200" : ""}`}>
      <div>
        <div className="text-sm font-semibold text-slate-800">{label}</div>
        {sublabel && <div className="text-xs text-slate-500 mt-0.5">{sublabel}</div>}
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  );
}

export function Toggle({ on, onToggle }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      className={`w-11 h-6 rounded-xl relative cursor-pointer transition-colors duration-200 border-none p-0 ${on ? "bg-brand-green" : "bg-slate-200"}`}
    >
      <div
        className="w-5 h-5 bg-white rounded-full absolute top-0.5 transition-[left] duration-200"
        style={{ left: on ? 22 : 2 }}
      />
    </button>
  );
}

export function InlineField({ label, sublabel, suffix, value, onChange, border = true }) {
  return (
    <div className={`flex justify-between items-center py-3.5 ${border ? "border-b border-slate-200" : ""}`}>
      <div>
        <div className="text-sm font-semibold text-slate-800">{label}</div>
        {sublabel && <div className="text-xs text-slate-500 mt-0.5">{sublabel}</div>}
      </div>
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          value={value}
          onChange={onChange}
          className="py-2 px-3 rounded-lg border-[1.5px] border-slate-200 text-[13px] font-inherit text-slate-800 text-right outline-none w-20 transition-colors focus:border-brand-teal"
        />
        <span className="text-[13px] text-slate-500">{suffix}</span>
      </div>
    </div>
  );
}

export function SaveButton({ onClick, saving, saved, label = "Save changes" }) {
  const base = "px-4 py-2.5 rounded-[10px] border-none text-[13px] font-bold cursor-pointer font-inherit transition-colors duration-200";
  const state = saving
    ? "bg-slate-200 text-slate-500 cursor-not-allowed"
    : saved
      ? "bg-brand-teal text-white"
      : "bg-brand-teal text-white hover:bg-[#1E6B5C]";

  return (
    <button onClick={onClick} disabled={saving} className={`${base} ${state}`}>
      {saving ? "Saving\u2026" : saved ? "\u2713 Saved" : label}
    </button>
  );
}

// Reusable class strings
export const LABEL_CLS = "text-[11px] font-extrabold text-[#1E6B5C] uppercase tracking-wide block mb-1.5";
export const SECTION_LABEL_CLS = "text-[11px] font-extrabold text-[#1E6B5C] uppercase tracking-wide mb-2";
export const INPUT_CLS = "w-full py-2.5 px-3.5 rounded-[10px] border-[1.5px] border-slate-200 text-[13px] font-inherit outline-none text-slate-800 transition-colors focus:border-brand-teal";
