import { SERVICES, PRICING } from "../../../constants/index";
import { AVAILABLE_ADDONS, getAddonPrice } from "../../../constants/salon";

// Service dropdown + add-on chips for one dog. Mirrors the block inside
// DogSearchSection.jsx (the live booking path); kept as a standalone
// presentational component here so the New client wizard can reuse the exact
// same control. Callbacks take just the value/addon — the wizard keys by
// clientKey at the call site. (Follow-up: dedupe with DogSearchSection.)
export function ServiceAddonsPicker({ dogName, size, service, addons, onServiceChange, onAddonsChange }) {
  const sz = size || "small";
  const label = dogName || "this dog";
  return (
    <div>
      <select
        value={service}
        onChange={(e) => onServiceChange(e.target.value)}
        aria-label={`Service for ${label}`}
        className="w-full px-2.5 py-2 rounded-lg border border-slate-200 text-xs font-[inherit] font-semibold cursor-pointer bg-white text-slate-800 box-border"
      >
        {SERVICES.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name} — {PRICING[s.id]?.[sz] || "N/A"}
          </option>
        ))}
      </select>

      <div className="flex flex-wrap gap-1 mt-2" role="group" aria-label={`Add-ons for ${label}`}>
        {AVAILABLE_ADDONS.map((addon) => {
          const active = (addons || []).includes(addon);
          const price = getAddonPrice(addon);
          return (
            <button
              key={addon}
              type="button"
              onClick={() => onAddonsChange(addon)}
              aria-pressed={active}
              className={`px-2 py-[3px] rounded-full text-[10px] font-semibold border transition-colors ${
                active
                  ? "bg-brand-cyan text-white border-brand-cyan"
                  : "bg-white text-slate-600 border-slate-200"
              }`}
            >
              {addon}
              {price > 0 ? ` +£${price}` : ""}
            </button>
          );
        })}
      </div>
    </div>
  );
}
