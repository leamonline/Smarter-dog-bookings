import { useState } from "react";
import { Card, CardHead, CardBody, SaveButton, SECTION_LABEL_CLS, INPUT_CLS } from "./shared.jsx";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const DEFAULT_HOURS = {
  Monday: { open: "08:00", close: "17:00", closed: false },
  Tuesday: { open: "08:00", close: "17:00", closed: false },
  Wednesday: { open: "08:00", close: "17:00", closed: false },
  Thursday: { open: "08:00", close: "17:00", closed: false },
  Friday: { open: "08:00", close: "17:00", closed: false },
  Saturday: { open: "09:00", close: "14:00", closed: false },
  Sunday: { open: "", close: "", closed: true },
};

export function HoursSettings({ config, onUpdateConfig }) {
  const [hours, setHours] = useState(config?.businessHours || DEFAULT_HOURS);
  const [closures, setClosures] = useState(config?.closures || []);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [newClosureDate, setNewClosureDate] = useState("");
  const [newClosureLabel, setNewClosureLabel] = useState("");

  const updateDay = (day, field, value) => {
    setHours((prev) => ({ ...prev, [day]: { ...prev[day], [field]: value } }));
  };

  const toggleDayClosed = (day) => {
    setHours((prev) => ({ ...prev, [day]: { ...prev[day], closed: !prev[day].closed } }));
  };

  const addClosure = () => {
    if (!newClosureDate) return;
    setClosures((prev) => [...prev, { date: newClosureDate, label: newClosureLabel || "Closed" }]);
    setNewClosureDate("");
    setNewClosureLabel("");
  };

  const removeClosure = (index) => {
    setClosures((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = () => {
    setSaving(true);
    onUpdateConfig((prev) => ({ ...prev, businessHours: hours, closures }));
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <Card id="settings-hours">
      <CardHead variant="blue" title="Opening Hours & Closures" desc="Weekly schedule and holiday dates" />
      <CardBody>
        <div className={SECTION_LABEL_CLS}>Weekly Hours</div>
        <div className="flex flex-col gap-1">
          {DAYS.map((day) => {
            const d = hours[day] || DEFAULT_HOURS[day];
            return (
              <div key={day} className="grid grid-cols-[80px_1fr_1fr_32px] gap-2 items-center py-1">
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
                      onChange={(e) => updateDay(day, "open", e.target.value)}
                      className={`${INPUT_CLS} !py-2 !px-2.5 text-center`}
                    />
                    <input
                      type="time"
                      value={d.close}
                      onChange={(e) => updateDay(day, "close", e.target.value)}
                      className={`${INPUT_CLS} !py-2 !px-2.5 text-center`}
                    />
                  </>
                )}
                <div
                  onClick={() => toggleDayClosed(day)}
                  className={`w-8 h-8 rounded-lg border flex items-center justify-center cursor-pointer text-[13px] transition-all ${
                    d.closed
                      ? "border-brand-red bg-red-100 text-brand-red"
                      : "border-slate-200 bg-slate-50 text-slate-500 hover:bg-red-100 hover:text-brand-red hover:border-brand-red"
                  }`}
                >
                  {"\u2715"}
                </div>
              </div>
            );
          })}
        </div>

        {/* Closures */}
        <div className="border-t border-slate-200 mt-3.5 pt-3.5">
          <div className={SECTION_LABEL_CLS}>Upcoming Closures</div>
          <div className="flex flex-wrap gap-1.5">
            {closures.map((c, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1.5 bg-brand-coral-light text-brand-coral px-3 py-[5px] rounded-xl text-xs font-semibold"
              >
                {c.date}{c.label ? ` \u2014 ${c.label}` : ""}
                <span
                  onClick={() => removeClosure(i)}
                  className="cursor-pointer opacity-60 hover:opacity-100 text-sm"
                >
                  {"\u00D7"}
                </span>
              </span>
            ))}
          </div>
          <div className="flex gap-1.5 mt-2.5 items-center flex-wrap">
            <input
              type="date"
              value={newClosureDate}
              onChange={(e) => setNewClosureDate(e.target.value)}
              className={`${INPUT_CLS} !w-40 !py-1.5 !px-2.5`}
            />
            <input
              type="text"
              value={newClosureLabel}
              onChange={(e) => setNewClosureLabel(e.target.value)}
              placeholder="Label (optional)"
              className={`${INPUT_CLS} !w-[180px] !py-1.5 !px-2.5`}
            />
            <button
              onClick={addClosure}
              className="border-[1.5px] border-dashed border-slate-200 rounded-[10px] bg-transparent px-3.5 py-1.5 text-xs font-bold text-slate-500 cursor-pointer font-inherit transition-all hover:border-brand-teal hover:text-brand-teal"
            >
              + Add
            </button>
          </div>
        </div>
        <div className="mt-3.5">
          <SaveButton onClick={handleSave} saving={saving} saved={saved} label="Save hours" />
        </div>
      </CardBody>
    </Card>
  );
}
