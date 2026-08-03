import { useState, useEffect } from "react";
import { DEFAULT_BUSINESS_HOURS } from "../../../constants/index";
import { Card, CardHead, CardBody, SaveButton, SECTION_LABEL_CLS, INPUT_CLS } from "./shared.jsx";

const NOOP_SAVE = async () => ({ ok: true });
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function readHours(config) {
  const source = config?.businessHours || DEFAULT_BUSINESS_HOURS;
  return Object.fromEntries(
    DAYS.map((day) => [day, { ...(source[day] || DEFAULT_BUSINESS_HOURS[day]) }]),
  );
}

function readClosures(config) {
  return Array.isArray(config?.closures) ? config.closures.map((c) => ({ ...c })) : [];
}

export function HoursSettings({ config, onUpdateConfig = NOOP_SAVE, canEdit = true, onDirtyChange }) {
  const [hours, setHours] = useState(() => readHours(config));
  const [closures, setClosures] = useState(() => readClosures(config));
  const [newClosureDate, setNewClosureDate] = useState("");
  const [newClosureLabel, setNewClosureLabel] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!dirty) {
      setHours(readHours(config));
      setClosures(readClosures(config));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, config?.businessHours, config?.closures]);

  useEffect(() => {
    onDirtyChange?.(dirty);
    return () => onDirtyChange?.(false);
  }, [dirty, onDirtyChange]);

  const markDirty = () => {
    setDirty(true);
    setSaved(false);
  };

  const updateDay = (day, patch) => {
    setHours((h) => ({ ...h, [day]: { ...h[day], ...patch } }));
    markDirty();
  };

  const toggleClosed = (day) => {
    const d = hours[day];
    updateDay(
      day,
      d.closed
        ? { closed: false, open: d.open || "08:00", close: d.close || "17:00" }
        : { closed: true, open: "", close: "" },
    );
  };

  const addClosure = () => {
    if (!newClosureDate) return;
    setClosures((list) => [...list, { date: newClosureDate, label: newClosureLabel.trim() }]);
    setNewClosureDate("");
    setNewClosureLabel("");
    markDirty();
  };

  const removeClosure = (index) => {
    setClosures((list) => list.filter((_, i) => i !== index));
    markDirty();
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    const result = await onUpdateConfig((previous) => ({
      ...previous,
      businessHours: hours,
      closures,
    }));
    setSaving(false);
    if (result?.ok === false) {
      setError(result.error || "Couldn't save your changes — please try again");
      return;
    }
    setDirty(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <Card id="settings-hours">
      <CardHead
        variant="blue"
        title="Opening Hours & Closures"
        desc="Shown on the public website — for a one-off date change use Bookings instead"
      />
      <CardBody>
        <div className={SECTION_LABEL_CLS}>Weekly Hours</div>
        <div className="flex flex-col gap-1 overflow-x-auto">
          {DAYS.map((day) => {
            const d = hours[day];
            return (
              <div key={day}>
                <div className="grid grid-cols-[80px_1fr_1fr_32px] gap-2 items-center py-1 min-w-[320px]">
                  <span className={`text-[13px] font-bold ${d.closed ? "text-brand-red" : "text-slate-800"}`}>
                    {day}
                  </span>
                  {d.closed ? (
                    <div className="col-span-2 text-center text-[11px] font-bold text-brand-red bg-red-100 py-2 rounded-lg">
                      CLOSED
                    </div>
                  ) : (
                    <>
                      <input
                        type="time"
                        value={d.open}
                        onChange={(e) => updateDay(day, { open: e.target.value })}
                        disabled={!canEdit}
                        aria-label={`${day} opening time`}
                        className={`${INPUT_CLS} !py-2 !px-2.5 text-center`}
                      />
                      <input
                        type="time"
                        value={d.close}
                        onChange={(e) => updateDay(day, { close: e.target.value })}
                        disabled={!canEdit}
                        aria-label={`${day} closing time`}
                        className={`${INPUT_CLS} !py-2 !px-2.5 text-center`}
                      />
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => toggleClosed(day)}
                    disabled={!canEdit}
                    aria-label={`${d.closed ? "Open" : "Close"} ${day}`}
                    className={`w-8 h-8 rounded-lg border flex items-center justify-center text-[13px] transition-all ${
                      canEdit ? "cursor-pointer" : "cursor-not-allowed opacity-60"
                    } ${
                      d.closed
                        ? "border-brand-red bg-red-100 text-brand-red"
                        : "border-slate-200 bg-slate-50 text-slate-500 hover:bg-red-100 hover:text-brand-red hover:border-brand-red"
                    }`}
                  >
                    {"✕"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="border-t border-slate-200 mt-3.5 pt-3.5">
          <div className={SECTION_LABEL_CLS}>Closures</div>
          <div className="flex flex-wrap gap-1.5">
            {closures.map((c, i) => (
              <span
                key={`${c.date}-${i}`}
                className="inline-flex items-center gap-1.5 bg-brand-coral-light text-brand-coral px-3 py-[5px] rounded-xl text-xs font-semibold"
              >
                {c.date}
                {c.label ? ` — ${c.label}` : ""}
                <button
                  type="button"
                  onClick={() => removeClosure(i)}
                  disabled={!canEdit}
                  aria-label={`Remove closure ${c.date}`}
                  className={`text-sm bg-transparent border-none p-0 font-inherit ${
                    canEdit ? "cursor-pointer" : "cursor-not-allowed opacity-60"
                  }`}
                >
                  {"×"}
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-1.5 mt-2.5 items-center flex-wrap">
            <input
              type="date"
              value={newClosureDate}
              onChange={(e) => setNewClosureDate(e.target.value)}
              disabled={!canEdit}
              aria-label="New closure date"
              className={`${INPUT_CLS} !w-40 !py-1.5 !px-2.5`}
            />
            <input
              type="text"
              value={newClosureLabel}
              onChange={(e) => setNewClosureLabel(e.target.value)}
              disabled={!canEdit}
              aria-label="Closure label (optional)"
              placeholder="Label (optional)"
              className={`${INPUT_CLS} !w-[180px] !py-1.5 !px-2.5`}
            />
            <button
              type="button"
              onClick={addClosure}
              disabled={!canEdit || !newClosureDate}
              className="border-[1.5px] border-dashed border-slate-200 rounded-control bg-transparent px-3.5 py-1.5 text-xs font-bold text-slate-500 cursor-pointer font-inherit transition-all hover:border-brand-teal hover:text-brand-teal disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-slate-200 disabled:hover:text-slate-500"
            >
              + Add
            </button>
          </div>
        </div>

        {error && (
          <div role="alert" className="text-[13px] text-brand-coral font-semibold bg-brand-coral-light px-3 py-2 rounded-lg mt-3.5 mb-1">
            {error}
          </div>
        )}
        <div className="mt-3.5">
          <SaveButton onClick={handleSave} saving={saving} saved={saved} disabled={!canEdit} />
        </div>
      </CardBody>
    </Card>
  );
}
