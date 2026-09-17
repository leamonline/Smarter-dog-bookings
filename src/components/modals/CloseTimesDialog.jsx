import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { AccessibleModal } from "../shared/AccessibleModal";
import { Button } from "../ui/index.js";
import {
  validateClosure,
  endTimeOptions,
  closureLabel,
  bookingsInClosure,
  slotsCoveredBy,
  MAX_REASON_LENGTH,
} from "../../engine/closures";

const TITLE_ID = "close-times-title";

// Quick fills for the reasons this is actually used for. They drop straight
// into the reason box unchanged, so the card reads "Closed for late start" —
// the wording staff asked for, not a reworded version of it.
const QUICK_REASONS = ["doctor's appointment", "late start", "early finish", "appointment"];

/** 24-hour, no leading zero: "9:00", "13:00". Matches SlotRowMenu. */
function formatTime(slot) {
  if (!slot) return "";
  const [h, m] = slot.split(":");
  return `${parseInt(h, 10)}:${m}`;
}

/**
 * Close part of a day, in half-hour steps.
 *
 * Reached two ways, both landing here: "Close from here…" on a slot's clock
 * menu (start prefilled to that slot) and "Close part of the day" in the Day
 * settings drawer (start prefilled to the first slot). Closing a WHOLE day
 * stays with the existing Close-this-day flow — this dialog never touches
 * isOpen.
 *
 * Bookings already sitting in the chosen range do NOT block the save. The
 * dialog says how many there are and what will happen to them; they end up on
 * the calendar inside the coral card, hazard-framed, for staff to move or
 * cancel. That is a deliberate decision — the salon would rather see the clash
 * than be stopped from recording the closure.
 */
export function CloseTimesDialog({
  activeSlots = [],
  closures = [],
  bookings = [],
  initialFrom,
  dayLabel,
  submitLabel = "Close these times",
  onSave,
  onClose,
}) {
  const firstSlot = activeSlots[0] || "";
  const startFrom =
    initialFrom && activeSlots.includes(initialFrom) ? initialFrom : firstSlot;

  const [from, setFrom] = useState(startFrom);
  const [to, setTo] = useState(() => endTimeOptions(startFrom, activeSlots)[0] || "");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const toOptions = useMemo(() => endTimeOptions(from, activeSlots), [from, activeSlots]);

  // Moving the start past the current end would leave an impossible range
  // selected, so fall back to the first legal end rather than going invalid.
  const effectiveTo = toOptions.includes(to) ? to : toOptions[0] || "";

  // The full check gates saving. A second check with a stand-in reason isolates
  // whether the TIMES are wrong, because the engine validates the reason before
  // the overlap — so an untouched form would otherwise answer "add a reason" to
  // someone whose real problem is that they have picked times already closed.
  const check = useMemo(
    () => validateClosure({ from, to: effectiveTo, reason }, closures, activeSlots),
    [from, effectiveTo, reason, closures, activeSlots],
  );
  const timesCheck = useMemo(
    () =>
      validateClosure(
        { from, to: effectiveTo, reason: "placeholder" },
        closures,
        activeSlots,
      ),
    [from, effectiveTo, closures, activeSlots],
  );

  const covered = useMemo(() => {
    if (!effectiveTo) return [];
    return slotsCoveredBy({ id: "", from, to: effectiveTo, reason: "x" }, activeSlots);
  }, [from, effectiveTo, activeSlots]);

  const clashes = useMemo(() => {
    if (!effectiveTo) return [];
    return bookingsInClosure(
      bookings,
      { id: "", from, to: effectiveTo, reason: "x" },
      activeSlots,
    );
  }, [bookings, from, effectiveTo, activeSlots]);

  // A wrong range shows straight away — staff can see it without typing. A
  // missing reason waits until they have started, so an untouched form looks
  // calm rather than shouting at someone who has not done anything yet.
  const visibleError = !timesCheck.ok
    ? timesCheck.error
    : !check.ok && reason.trim().length > 0
      ? check.error
      : null;

  const handleSave = async () => {
    if (!check.ok || saving) return;
    setSaving(true);
    setSaveError(null);
    const result = await onSave({ from, to: effectiveTo, reason: reason.trim() });
    setSaving(false);
    if (result && result.ok === false) {
      setSaveError(result.error || "Couldn't save change.");
      return;
    }
    onClose?.();
  };

  const fieldClass =
    "w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold text-brand-purple bg-white font-[inherit]";

  return (
    <AccessibleModal
      onClose={onClose}
      titleId={TITLE_ID}
      className="bg-white rounded-2xl w-full max-w-md shadow-xl overflow-hidden"
    >
      <header className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-100 bg-[var(--color-brand-paper)]">
        <div>
          <div className="text-label text-ink-muted">Close part of the day</div>
          <h2
            id={TITLE_ID}
            className="text-base font-bold text-brand-purple font-display leading-tight"
          >
            {dayLabel}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="tap-target w-9 h-9 rounded-full flex items-center justify-center border-none cursor-pointer text-slate-500 hover:bg-slate-100 hover:text-brand-purple transition-colors"
        >
          <X size={18} strokeWidth={2.2} aria-hidden="true" />
        </button>
      </header>

      <div className="p-5 flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-label text-ink-muted">From</span>
            <select
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className={fieldClass}
            >
              {activeSlots.map((slot) => (
                <option key={slot} value={slot}>
                  {formatTime(slot)}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-label text-ink-muted">To</span>
            <select
              value={effectiveTo}
              onChange={(e) => setTo(e.target.value)}
              className={fieldClass}
            >
              {toOptions.map((slot) => (
                <option key={slot} value={slot}>
                  {formatTime(slot)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <p className="text-[11px] text-slate-500 -mt-2">
          {covered.length} {covered.length === 1 ? "slot" : "slots"} will be closed.
        </p>

        <label className="flex flex-col gap-1.5">
          <span className="text-label text-ink-muted">Reason</span>
          <input
            type="text"
            value={reason}
            maxLength={MAX_REASON_LENGTH}
            onChange={(e) => setReason(e.target.value)}
            placeholder="doctor's appointment"
            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-brand-purple bg-white font-[inherit]"
          />
        </label>

        <div className="flex flex-wrap gap-1.5 -mt-1">
          {QUICK_REASONS.map((quick) => (
            <button
              key={quick}
              type="button"
              onClick={() => setReason(quick)}
              className="rounded-full border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-600 bg-white hover:border-brand-yellow hover:bg-brand-yellow/10 cursor-pointer font-[inherit] transition-colors"
            >
              {quick}
            </button>
          ))}
        </div>

        {/* Exactly what the calendar will show, so there are no surprises. */}
        <div className="rounded-xl bg-brand-coral text-white px-3 py-2.5">
          <div className="text-sm font-extrabold leading-tight break-words">
            {closureLabel({ reason: reason.trim() || "…" })}
          </div>
          <div className="text-[11px] font-semibold text-white/85 tabular-nums mt-0.5">
            {formatTime(from)} – {effectiveTo ? formatTime(effectiveTo) : "…"}
          </div>
        </div>

        {clashes.length > 0 && (
          <p className="text-[12px] text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
            {clashes.length} {clashes.length === 1 ? "booking sits" : "bookings sit"} in these
            times. {clashes.length === 1 ? "It'll be flagged" : "They'll be flagged"} NEEDS
            ATTENTION on the calendar until you move or cancel{" "}
            {clashes.length === 1 ? "it" : "them"}.
          </p>
        )}

        {visibleError && (
          <p role="alert" className="text-[12px] text-brand-coral-text font-semibold">
            {visibleError}
          </p>
        )}

        {saveError && (
          <p role="alert" className="text-[12px] text-brand-coral-text font-semibold">
            {saveError}
          </p>
        )}
      </div>

      <footer className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100 bg-slate-50">
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        {/* Coral, matching the card this creates — closing time is a
            take-away, not the usual yellow "add something" CTA. */}
        <Button variant="danger" onClick={handleSave} disabled={!check.ok || saving}>
          {saving ? "Closing…" : submitLabel}
        </Button>
      </footer>
    </AccessibleModal>
  );
}
