import { useState } from "react";
import { Card, CardHead, CardBody, SettingRow, Toggle, SECTION_LABEL_CLS } from "./shared.jsx";

export function CapacitySettings({ config, onUpdateConfig }) {
  const [newSlotTime, setNewSlotTime] = useState("");

  const toggleCapacity = () => {
    onUpdateConfig((prev) => ({ ...prev, enforceCapacity: !prev.enforceCapacity }));
  };

  const addLargeDogSlot = () => {
    if (!newSlotTime) return;
    if (config.largeDogSlots[newSlotTime]) return;
    onUpdateConfig((prev) => ({
      ...prev,
      largeDogSlots: {
        ...prev.largeDogSlots,
        [newSlotTime]: { seats: 2, canShare: false, needsApproval: false },
      },
    }));
    setNewSlotTime("");
  };

  const removeLargeDogSlot = (time) => {
    onUpdateConfig((prev) => {
      const updated = { ...prev.largeDogSlots };
      delete updated[time];
      return { ...prev, largeDogSlots: updated };
    });
  };

  return (
    <Card id="settings-capacity">
      <CardHead variant="coral" title="Capacity Engine" desc="The 2-2-1 rule controls how many dogs can be booked at once" />
      <CardBody>
        <SettingRow
          label="Enforce 2-2-1 strict capacity"
          sublabel="Prevents overbooking beyond safe limits"
          control={<Toggle on={config?.enforceCapacity} onToggle={toggleCapacity} />}
        />
        <div className="pt-2">
          <div className={SECTION_LABEL_CLS}>Large Dog Approved Slots</div>
          <div className="text-xs text-slate-500 mb-2.5">
            Times when large dogs are allowed. Click to remove.
          </div>
          <div className="flex flex-wrap gap-1.5 items-center">
            {Object.keys(config?.largeDogSlots || {}).sort().map((time) => (
              <span
                key={time}
                onClick={() => removeLargeDogSlot(time)}
                className="inline-flex items-center gap-1 bg-brand-coral-light text-brand-coral px-3 py-[5px] rounded-xl text-xs font-bold cursor-pointer transition-all hover:bg-brand-coral hover:text-white"
              >
                {time} {"\u00D7"}
              </span>
            ))}
            <span className="inline-flex items-center gap-1.5">
              <input
                type="time"
                value={newSlotTime}
                onChange={(e) => setNewSlotTime(e.target.value)}
                className="py-[5px] px-2 rounded-lg border-[1.5px] border-dashed border-slate-500 text-xs font-inherit text-slate-800 outline-none w-20"
              />
              <button
                onClick={addLargeDogSlot}
                className="bg-slate-50 border-[1.5px] border-dashed border-slate-500 text-slate-500 px-3 py-[5px] rounded-lg text-xs font-bold cursor-pointer font-inherit transition-all hover:bg-[#E6F5F2] hover:text-brand-teal"
              >
                + Add
              </button>
            </span>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
