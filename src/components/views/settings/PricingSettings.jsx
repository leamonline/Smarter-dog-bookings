import { useState } from "react";
import { SERVICES } from "../../../constants/index.js";
import { Card, CardHead, CardBody, SaveButton, SECTION_LABEL_CLS } from "./shared.jsx";

export function PricingSettings({ config, onUpdateConfig }) {
  const [newServiceName, setNewServiceName] = useState("");
  const [newServiceIcon, setNewServiceIcon] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const currentServices = config?.services || SERVICES;
  const currentPricing = config?.pricing || {};

  const updatePricing = (serviceId, size, value) => {
    onUpdateConfig((prev) => ({
      ...prev,
      pricing: {
        ...prev.pricing,
        [serviceId]: { ...(prev.pricing?.[serviceId] || {}), [size]: value },
      },
    }));
  };

  const deleteService = (serviceId) => {
    onUpdateConfig((prev) => {
      const updatedServices = (prev.services || SERVICES).filter((s) => s.id !== serviceId);
      const updatedPricing = { ...prev.pricing };
      delete updatedPricing[serviceId];
      return { ...prev, services: updatedServices, pricing: updatedPricing };
    });
  };

  const addService = () => {
    const name = newServiceName.trim();
    if (!name) return;
    const id = name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    onUpdateConfig((prev) => ({
      ...prev,
      services: [...(prev.services || SERVICES), { id, name, icon: newServiceIcon || "\u2702\uFE0F" }],
      pricing: { ...prev.pricing, [id]: { small: "", medium: "", large: "" } },
    }));
    setNewServiceName("");
    setNewServiceIcon("");
  };

  const handleSave = () => {
    setSaving(true);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const priceInputCls = "w-full py-2 px-2 pl-10 rounded-lg border-[1.5px] border-slate-200 text-[13px] font-inherit text-slate-800 outline-none transition-colors focus:border-brand-teal";

  return (
    <Card id="settings-pricing">
      <CardHead
        variant="yellow"
        title="Services & Pricing"
        desc='Base prices per size — shown as "from" on the booking portal'
      />
      <CardBody>
        {/* Header row */}
        <div className="grid grid-cols-[1fr_90px_90px_90px_32px] gap-2 pb-2 border-b-2 border-slate-200 mb-1">
          <span className={`${SECTION_LABEL_CLS} !mb-0`}>Service</span>
          <span className={`${SECTION_LABEL_CLS} !mb-0 text-center`}>
            <span className="inline-block w-2 h-2 rounded-full bg-size-small mr-0.5 align-middle" />
            Small
          </span>
          <span className={`${SECTION_LABEL_CLS} !mb-0 text-center`}>
            <span className="inline-block w-2 h-2 rounded-full bg-size-medium mr-0.5 align-middle" />
            Medium
          </span>
          <span className={`${SECTION_LABEL_CLS} !mb-0 text-center`}>
            <span className="inline-block w-2 h-2 rounded-full bg-size-large mr-0.5 align-middle" />
            Large
          </span>
          <span />
        </div>

        {/* Service rows */}
        {currentServices.map((s, idx) => (
          <div
            key={s.id}
            className={`grid grid-cols-[1fr_90px_90px_90px_32px] gap-2 items-center py-2.5 ${
              idx < currentServices.length - 1 ? "border-b border-slate-200" : ""
            }`}
          >
            <div className="text-sm font-semibold text-slate-800">
              {s.name}
            </div>
            {["small", "medium", "large"].map((size) => {
              const val = currentPricing[s.id]?.[size] || "";
              return (
                <div key={size} className="relative">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-slate-500 font-semibold pointer-events-none">
                    from
                  </span>
                  <input
                    type="text"
                    value={val}
                    onChange={(e) => updatePricing(s.id, size, e.target.value)}
                    className={priceInputCls}
                  />
                </div>
              );
            })}
            <div
              onClick={() => deleteService(s.id)}
              title="Delete service"
              className="w-8 h-8 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-center cursor-pointer text-sm text-slate-500 transition-all hover:bg-red-100 hover:text-brand-red hover:border-brand-red"
            >
              {"\u2715"}
            </div>
          </div>
        ))}

        {/* Add service */}
        <div className="flex gap-2 mt-3 items-center">
          <input
            type="text"
            value={newServiceName}
            onChange={(e) => setNewServiceName(e.target.value)}
            placeholder="Service name"
            className="flex-1 py-2 px-3 rounded-[10px] border-[1.5px] border-slate-200 text-[13px] font-inherit outline-none text-slate-800 transition-colors focus:border-brand-teal"
          />
          <button
            onClick={addService}
            className="border-[1.5px] border-dashed border-slate-200 rounded-[10px] bg-transparent px-4 py-2 text-xs font-bold text-slate-500 cursor-pointer font-inherit transition-all whitespace-nowrap hover:border-brand-teal hover:text-brand-teal"
          >
            + Add service
          </button>
        </div>

        <div className="mt-3.5">
          <SaveButton onClick={handleSave} saving={saving} saved={saved} label="Save pricing" />
        </div>
      </CardBody>
    </Card>
  );
}
