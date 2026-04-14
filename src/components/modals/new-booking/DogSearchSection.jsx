import { useMemo, useRef, useEffect } from "react";
import { SERVICES, PRICING, SIZE_THEME, SIZE_FALLBACK } from "../../../constants/index.js";
import { IconSearch } from "../../icons/index.jsx";
import { titleCase, buildSearchEntries } from "./helpers.js";

export function DogSearchSection({
  dogs,
  humans,
  dogEntries,
  dogQuery,
  setDogQuery,
  selectedHumanKey,
  addingAnotherDog,
  setAddingAnotherDog,
  primaryTheme,
  onSelectEntry,
  onAddAnotherDog,
  onRemoveDog,
  onServiceChange,
  onClearAll,
  onClose,
  onOpenAddDog,
  onOpenAddHuman,
  onSearchDogs,
  isSearchingDogs,
  setError,
}) {
  const searchRef = useRef(null);
  const hasDogs = dogEntries.length > 0;

  // Auto-focus the search field
  useEffect(() => {
    if (!hasDogs && searchRef.current) {
      searchRef.current.focus();
    }
  }, [hasDogs]);

  // Build search entries from current dogs state, filtered by query
  const filteredEntries = useMemo(() => {
    if (hasDogs) return [];
    const all = buildSearchEntries(dogs, humans);
    if (!dogQuery.trim()) return all.slice(0, 8);
    const q = dogQuery.toLowerCase().trim();
    return all.filter(e =>
      e.dog.name?.toLowerCase().includes(q) ||
      e.dog.breed?.toLowerCase().includes(q) ||
      e.humanKey?.toLowerCase().includes(q)
    ).slice(0, 8);
  }, [dogs, humans, hasDogs, dogQuery]);

  // Same owner's other dogs for "add another" picker
  const sameOwnerDogs = useMemo(() => {
    if (!selectedHumanKey) return [];
    return Object.values(dogs || {}).filter(d =>
      d.humanId === selectedHumanKey &&
      !dogEntries.some(e => e.dog.id === d.id)
    );
  }, [dogs, selectedHumanKey, dogEntries]);

  return (
    <div className="px-6 pt-5 overflow-visible shrink-0 relative z-10">

      {/* ─── STEP 1: Dog Search / Dog Cards ─── */}
      {hasDogs ? (
        <div className="flex flex-col gap-2">
          {dogEntries.map((entry, idx) => {
            const dogTheme = SIZE_THEME[entry.dog.size || "small"] || SIZE_FALLBACK;
            return (
            <div
              key={entry.dog.id}
              className="rounded-xl p-2.5 px-3.5 border-[1.5px]"
              style={{ background: dogTheme.light, borderColor: dogTheme.gradient[0] }}
            >
              <div className="flex items-center gap-2.5">
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center text-lg shrink-0"
                  style={{ background: dogTheme.gradient[0] }}
                >🐕</div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-extrabold" style={{ color: dogTheme.primary }}>
                    {titleCase(entry.dog.name)}
                    {entry.dog.alerts?.length > 0 && <span className="ml-1.5">⚠️</span>}
                  </div>
                  <div className="text-[11px] text-slate-800">
                    {titleCase(entry.dog.breed)} · {entry.dog.size || "small"} · {titleCase(entry.humanKey)}
                  </div>
                  {entry.dog.alerts?.length > 0 && (
                    <div className="text-[10px] text-brand-coral font-semibold mt-px">
                      {entry.dog.alerts.join(", ")}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => onRemoveDog(entry.dog.id)}
                  className="bg-transparent border-none cursor-pointer text-lg text-slate-500 font-bold py-1 px-2 rounded-md transition-all hover:text-brand-coral"
                >
                  ×
                </button>
              </div>
              {/* Inline service dropdown */}
              <select
                value={entry.service}
                onChange={(e) => onServiceChange(entry.dog.id, e.target.value)}
                className="w-full mt-2 px-2.5 py-2 rounded-lg border border-slate-200 text-xs font-inherit font-semibold cursor-pointer bg-white text-slate-800 box-border"
              >
                {SERVICES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} — {PRICING[s.id]?.[entry.dog.size || "small"] || "N/A"}
                  </option>
                ))}
              </select>
            </div>
          );
          })}

          {/* Add another dog / Start over buttons */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setAddingAnotherDog(true)}
              className="flex-1 py-2 px-3 rounded-lg border-[1.5px] border-dashed bg-white text-xs font-bold cursor-pointer font-inherit transition-all"
              style={{ borderColor: primaryTheme.gradient[0], color: primaryTheme.gradient[0] }}
              onMouseEnter={(e) => { e.currentTarget.style.background = primaryTheme.light; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "#FFFFFF"; }}
            >
              + Add another dog
            </button>
            <button
              type="button"
              onClick={onClearAll}
              className="py-2 px-3 rounded-lg border-[1.5px] border-slate-200 bg-white text-slate-500 text-xs font-bold cursor-pointer font-inherit transition-all hover:border-brand-coral hover:text-brand-coral"
            >
              Start over
            </button>
          </div>

          {/* Same-owner dog picker */}
          {addingAnotherDog && (
            <div className="bg-white border-[1.5px] border-slate-200 rounded-xl shadow-[0_4px_16px_rgba(0,0,0,0.08)] overflow-hidden">
              <div className="px-3 py-2 text-[11px] font-bold text-slate-500 border-b border-slate-200">
                {titleCase(selectedHumanKey)}'s other dogs
              </div>
              {sameOwnerDogs.length === 0 ? (
                <div className="p-3 text-xs text-slate-500">
                  No other dogs for this owner.
                </div>
              ) : (
                sameOwnerDogs.map(dog => (
                  <div key={dog.id}
                    onMouseDown={() => onAddAnotherDog(dog)}
                    className="px-3 py-2.5 cursor-pointer border-b border-slate-200 transition-colors"
                    onMouseEnter={(e) => (e.currentTarget.style.background = primaryTheme.light)}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "#FFFFFF")}
                  >
                    <span className="text-[13px] font-bold text-slate-800">{titleCase(dog.name)}</span>
                    <span className="text-xs text-slate-500 ml-1.5">{titleCase(dog.breed)} · {dog.size || "small"}</span>
                  </div>
                ))
              )}
              <div
                onMouseDown={() => { onClose(); onOpenAddDog?.(); }}
                className="px-3 py-2.5 cursor-pointer text-xs font-bold transition-colors"
                style={{ color: primaryTheme.gradient[0] }}
                onMouseEnter={(e) => (e.currentTarget.style.background = primaryTheme.light)}
                onMouseLeave={(e) => (e.currentTarget.style.background = "#FFFFFF")}
              >
                + New dog for {titleCase(selectedHumanKey)}
              </div>
              <div className="px-3 py-1.5 border-t border-slate-200">
                <button type="button" onClick={() => setAddingAnotherDog(false)} className="bg-transparent border-none text-[11px] text-slate-500 cursor-pointer font-inherit p-0">Cancel</button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div>
          <label className="text-[11px] font-extrabold text-brand-teal uppercase tracking-wide block mb-1.5">Search Dog</label>
          <div className="relative">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 flex pointer-events-none z-[1]">
              <IconSearch size={15} colour="#6B7280" />
            </div>
            <input
              ref={searchRef}
              placeholder="Start typing a dog's name, breed, or owner..."
              value={dogQuery}
              onChange={(e) => { setDogQuery(e.target.value); setError(""); onSearchDogs?.(e.target.value); }}
              className="w-full py-3 pl-9 pr-3.5 rounded-[10px] border-[1.5px] border-slate-200 text-[15px] font-inherit box-border outline-none text-slate-800 transition-colors focus:border-brand-blue"
            />

            {/* Searching indicator — only when no local results */}
            {isSearchingDogs && dogQuery.trim().length > 0 && filteredEntries.length === 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 z-30 bg-white border-[1.5px] border-slate-200 rounded-xl shadow-[0_8px_24px_rgba(0,0,0,0.12)] px-3.5 py-3 text-[13px] text-slate-500 italic">
                Searching...
              </div>
            )}

            {/* Dropdown results — show even during server search */}
            {filteredEntries.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 z-30 bg-white border-[1.5px] border-slate-200 rounded-xl shadow-[0_8px_24px_rgba(0,0,0,0.12)] max-h-[280px] overflow-auto">
                {filteredEntries.map((entry, idx) => {
                  const isTrusted = entry.isTrusted;
                  const textColor = isTrusted ? "#2D8B7A" : "#1F2937";
                  const subtextColor = isTrusted ? "#2D8B7A" : "#6B7280";
                  const bgHover = isTrusted ? "#E6F5F2" : "#E0F7FC";
                  const label = isTrusted ? "Trusted" : "Owner";
                  const labelBg = isTrusted ? "#E6F5F2" : "#E0F7FC";
                  const labelColor = isTrusted ? "#2D8B7A" : "#0099BD";

                  return (
                    <div
                      key={`${entry.dog.id}-${entry.humanKey}-${idx}`}
                      onMouseDown={() => onSelectEntry(entry)}
                      className="px-3.5 py-2.5 cursor-pointer transition-colors"
                      style={{ borderBottom: idx < filteredEntries.length - 1 ? "1px solid #E5E7EB" : "none" }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = bgHover)}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "#FFFFFF")}
                    >
                      <div className="flex items-center gap-1.5 justify-between">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-sm font-bold" style={{ color: textColor }}>{titleCase(entry.dog.name)}</span>
                          <span className="text-xs" style={{ color: subtextColor }}>—</span>
                          <span className="text-xs" style={{ color: subtextColor }}>{titleCase(entry.dog.breed)}</span>
                          {entry.hasAlerts && <span className="text-[13px]">⚠️</span>}
                        </div>
                        <span
                          className="text-[10px] font-bold py-0.5 px-[7px] rounded-md shrink-0 uppercase tracking-wide"
                          style={{ background: labelBg, color: labelColor }}
                        >{label}</span>
                      </div>
                      <div className="text-xs mt-0.5" style={{ color: subtextColor }}>
                        {titleCase(entry.humanKey)}{entry.humanPhone ? ` · ${entry.humanPhone}` : ""}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* No results + add buttons */}
            {!isSearchingDogs && dogQuery.trim().length >= 2 && filteredEntries.length === 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 z-30 bg-white border-[1.5px] border-slate-200 rounded-xl shadow-[0_8px_24px_rgba(0,0,0,0.12)] p-3.5">
                <div className="text-[13px] text-slate-500 mb-2.5">
                  No dogs found matching "{dogQuery}"
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => { onClose(); onOpenAddDog?.(); }} className="flex-1 py-[9px] px-3 rounded-lg border-none bg-brand-blue text-white text-xs font-bold cursor-pointer font-inherit">+ New Dog</button>
                  <button type="button" onClick={() => { onClose(); onOpenAddHuman?.(); }} className="flex-1 py-[9px] px-3 rounded-lg border-none bg-brand-teal text-white text-xs font-bold cursor-pointer font-inherit">+ New Human</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
