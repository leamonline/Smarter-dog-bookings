// src/components/views/settings/shared.jsx
// Shared sub-components used by multiple settings sections.

import { cloneElement, useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "../../../contexts/ToastContext.jsx";

// Email format check shared by the explicit-save tabs (Business, Account).
export const isValidEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s ?? "").trim());

const CARD_HEAD_THEMES = {
  teal:   { bg: "bg-[#E6F5F2]", color: "text-brand-teal-dark" },
  blue:   { bg: "bg-blue-50",    color: "text-brand-cyan-dark" },
  yellow: { bg: "bg-amber-50",   color: "text-amber-800" },
  coral:  { bg: "bg-brand-coral-light", color: "text-brand-coral" },
};

export function Card({ id, children }) {
  return (
    <div id={id} className="bg-white border border-slate-200 rounded-xl mb-4 shadow-card-resting overflow-hidden">
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
        {desc && <div className="text-body font-semibold text-slate-800 mt-0.5">{desc}</div>}
      </div>
      {right}
    </div>
  );
}

export function CardBody({ children }) {
  return <div className="p-4">{children}</div>;
}

let settingRowIdCounter = 0;
const nextSettingRowId = () => `setting-row-${++settingRowIdCounter}`;

export function SettingRow({ label, sublabel, control, border = true }) {
  // Give the label a stable id so interactive controls (e.g. Toggle) can
  // reference it via aria-labelledby and assistive tech reads the row label
  // together with the switch state.
  const [labelId] = useState(nextSettingRowId);
  const enhancedControl =
    control && typeof control === "object" && "type" in control
      ? cloneElement(control, { "aria-labelledby": labelId })
      : control;

  return (
    <div className={`flex justify-between items-center py-3.5 ${border ? "border-b border-slate-200" : ""}`}>
      <div>
        <div id={labelId} className="text-sm font-semibold text-slate-800">{label}</div>
        {sublabel && <div className="text-xs text-slate-500 mt-0.5">{sublabel}</div>}
      </div>
      <div className="shrink-0">{enhancedControl}</div>
    </div>
  );
}

export function Toggle({ on, onToggle, disabled = false, ...rest }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={disabled ? undefined : onToggle}
      {...rest}
      className={`w-11 h-6 rounded-xl relative transition-colors duration-200 border-none p-0 ${
        disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"
      } ${on ? "bg-brand-green" : "bg-slate-200"}`}
    >
      <div
        className="w-5 h-5 bg-white rounded-full absolute top-0.5 transition-[left] duration-200"
        style={{ left: on ? 22 : 2 }}
      />
    </button>
  );
}

export function InlineField({ label, sublabel, suffix, value, onChange, border = true, disabled = false, min = 0, error }) {
  const [errId] = useState(nextSettingRowId);
  return (
    <div className={border ? "border-b border-slate-200" : ""}>
      <div className="flex justify-between items-center py-3.5">
        <div>
          <div className="text-sm font-semibold text-slate-800">{label}</div>
          {sublabel && <div className="text-xs text-slate-500 mt-0.5">{sublabel}</div>}
        </div>
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            inputMode="numeric"
            min={min}
            value={value}
            onChange={onChange}
            disabled={disabled}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errId : undefined}
            className={`py-2 px-3 rounded-lg border-[1.5px] text-body font-[inherit] text-slate-800 text-right outline-none w-20 transition-colors focus:border-brand-teal disabled:bg-slate-50 disabled:text-slate-500 disabled:cursor-not-allowed ${
              error ? "border-brand-coral" : "border-slate-200"
            }`}
          />
          <span className="text-body text-slate-500">{suffix}</span>
        </div>
      </div>
      {error && (
        <div id={errId} role="alert" className="text-xs text-brand-coral font-semibold text-right pb-2.5">
          {error}
        </div>
      )}
    </div>
  );
}

export function SaveButton({ onClick, saving, saved, label = "Save changes", disabled = false }) {
  const base = "px-4 py-2.5 rounded-control border-none text-body font-bold font-[inherit] motion-safe:transition-colors duration-200";
  const state = disabled
    ? "bg-slate-200 text-slate-500 cursor-not-allowed"
    : saving
    ? "bg-slate-200 text-slate-500 cursor-not-allowed"
    : saved
      ? "bg-brand-teal text-white"
      : "bg-brand-teal text-white cursor-pointer hover:bg-brand-teal-dark";

  return (
    <button onClick={onClick} disabled={saving || disabled} className={`${base} ${state}`}>
      {saving ? "Saving\u2026" : saved ? "\u2713 Saved" : label}
    </button>
  );
}

// Wraps onUpdateConfig for the live-save (autosave) tabs. Every interaction
// is one save. Gives each tab (a) one consistent error toast on failure and
// (b) a shared "Saving… / Saved ✓" status so the autosave is visible rather
// than silent. Pair the returned `status` with <SaveStatus> in the CardHead.
export function useAutosaveStatus(onUpdateConfig, { canEdit = true } = {}) {
  const toast = useToast();
  const [status, setStatus] = useState("idle"); // idle | saving | saved | error
  const timerRef = useRef(null);
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  const save = useCallback(
    async (updater) => {
      if (!canEdit) {
        const error = "Only salon owners can edit settings.";
        toast.show(error, "error");
        return { ok: false, error };
      }
      setStatus("saving");
      const result = await onUpdateConfig(updater);
      if (result?.ok === false) {
        setStatus("error");
        toast.show(result.error || "Couldn't save — try again?", "error");
        return result;
      }
      setStatus("saved");
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setStatus("idle"), 2000);
      return result;
    },
    [canEdit, onUpdateConfig, toast],
  );

  return { save, status };
}

const SAVE_STATUS_DISPLAY = {
  saving: { text: "Saving…", cls: "text-slate-500" },
  saved: { text: "✓ Saved", cls: "text-brand-teal" },
  error: { text: "Couldn't save", cls: "text-brand-coral" },
};

// Inline autosave indicator for an autosave tab's CardHead. Always renders the
// live region (so screen readers hear status changes); shows nothing when idle.
export function SaveStatus({ status }) {
  const display = status && status !== "idle" ? SAVE_STATUS_DISPLAY[status] : null;
  return (
    <span role="status" aria-live="polite" className="text-xs font-bold inline-block min-w-[4.5rem] text-right">
      {display && <span className={display.cls}>{display.text}</span>}
    </span>
  );
}

// Reusable class strings
export const LABEL_CLS = "text-label text-brand-teal-dark block mb-1.5";
export const SECTION_LABEL_CLS = "text-label text-brand-teal-dark mb-2";
export const INPUT_CLS = "w-full py-2.5 px-3.5 rounded-control border-[1.5px] border-slate-200 text-body font-[inherit] outline-none text-slate-800 transition-colors focus:border-brand-teal disabled:bg-slate-50 disabled:text-slate-500 disabled:cursor-not-allowed";
