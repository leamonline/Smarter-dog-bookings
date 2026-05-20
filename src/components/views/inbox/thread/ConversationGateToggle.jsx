// Per-conversation gate toggle (pill switch). Used by AutoSendToggle and
// AutonomousBookingToggle — same shape, different conversation field,
// different colour, different copy.
//
// `requireConfirmOn` flips the on-action into a two-step confirm: the
// auto-send case is irreversible enough (drafts can go to customers
// without staff approval) that one accidental click shouldn't enable it.
// Auto-book uses one-click toggle since the customer still confirms.
//
// `forceDisabledTitle` lets a caller hard-disable the toggle in a state
// that warrants its own explanation (e.g. human_takeover puts auto-send
// in "paused", which is different from the off state).

import { useState } from "react";
import { ConfirmDialog } from "../../../shared/ConfirmDialog.jsx";

const ACCENT_THEMES = {
  emerald: {
    pillOn: "bg-emerald-100 border-emerald-300 text-emerald-900 hover:bg-emerald-200",
    trackOn: "bg-emerald-500",
  },
  sky: {
    pillOn: "bg-sky-100 border-sky-300 text-sky-900 hover:bg-sky-200",
    trackOn: "bg-sky-500",
  },
};

export function ConversationGateToggle({
  conversation,
  field,
  onChange,
  disabled,
  label,
  accent,
  titleOn,
  titleOff,
  ariaLabelOn,
  ariaLabelOff,
  forceDisabledTitle,
  confirm,
}) {
  const [confirming, setConfirming] = useState(false);
  if (!conversation) return null;

  const enabled = !!conversation[field];
  const isDisabled = !!disabled || !!forceDisabledTitle;

  const title = forceDisabledTitle ?? (enabled ? titleOn : titleOff);
  const theme = ACCENT_THEMES[accent];
  const pillOffClasses = "bg-white border-slate-300 text-slate-700 hover:bg-slate-50";

  const handleClick = () => {
    if (enabled) {
      onChange(false);
      return;
    }
    if (confirm) {
      setConfirming(true);
      return;
    }
    onChange(true);
  };

  const handleConfirm = () => {
    setConfirming(false);
    onChange(true);
  };

  return (
    <>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label={enabled ? ariaLabelOn : ariaLabelOff}
        onClick={handleClick}
        disabled={isDisabled}
        title={title}
        className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[12px] font-bold border transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-[inherit] ${
          enabled ? theme.pillOn : pillOffClasses
        }`}
      >
        <span
          aria-hidden="true"
          className={`relative inline-block w-7 h-4 rounded-full transition-colors ${
            enabled ? theme.trackOn : "bg-slate-300"
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white shadow-sm transition-transform ${
              enabled ? "translate-x-3" : "translate-x-0"
            }`}
          />
        </span>
        {label} {enabled ? "on" : "off"}
      </button>

      {confirming && confirm && (
        <ConfirmDialog
          title={confirm.title}
          message={confirm.message}
          confirmLabel={confirm.confirmLabel}
          cancelLabel={confirm.cancelLabel ?? "Cancel"}
          variant={confirm.variant ?? "primary"}
          onConfirm={handleConfirm}
          onCancel={() => setConfirming(false)}
        />
      )}
    </>
  );
}
