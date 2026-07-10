import { useMemo, useRef, useEffect } from "react";
import { SERVICES, SIZE_THEME, SIZE_FALLBACK } from "../../../constants/index";
import { getServicePriceLabel } from "../../../engine/bookingRules";
import { AVAILABLE_ADDONS, getAddonPrice } from "../../../constants/salon";
import { IconSearch } from "../../icons/index.jsx";
import { SkeletonBlock } from "../../ui/Skeleton.jsx";
import { titleCase, buildSearchEntries } from "./helpers.js";
import { getDogsForHuman } from "../../../utils/directorySearch";

export function DogSearchSection({
  dogs,
  humans,
  dogsByHumanId,
  ensureDogsForHumans,
  dogEntries,
  dogQuery,
  setDogQuery,
  selectedHumanKey,
  selectedHumanId,
  addingAnotherDog,
  setAddingAnotherDog,
  primaryTheme,
  onSelectEntry,
  onAddAnotherDog,
  onRemoveDog,
  onServiceChange,
  onAddonsChange,
  onClearAll,
  onOpenAddDog,
  onOpenNewClient,
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

  // Build search entries from current dogs state, filtered by query.
  // One entry per dog; owner + trusted humans are nested inside `entry.humans`.
  const filteredEntries = useMemo(() => {
    if (hasDogs) return [];
    const all = buildSearchEntries(dogs, humans);
    if (!dogQuery.trim()) return all.slice(0, 8);
    const q = dogQuery.toLowerCase().trim();
    return all.filter(e =>
      e.dog.name?.toLowerCase().includes(q) ||
      e.dog.breed?.toLowerCase().includes(q) ||
      e.humans.some(h => h.key?.toLowerCase().includes(q))
    ).slice(0, 8);
  }, [dogs, humans, hasDogs, dogQuery]);

  // Load the owner's full dog list on demand. The paginated `dogs` map (and
  // the last dog-name search that replaced it) often won't contain the
  // owner's other dogs, so we fetch them into dogsByHumanId — same pattern
  // HumanCardModal uses.
  useEffect(() => {
    if (selectedHumanId && ensureDogsForHumans) {
      ensureDogsForHumans([selectedHumanId]);
    }
  }, [selectedHumanId, ensureDogsForHumans]);

  // Same owner's other dogs for "add another" picker. Source the list from
  // dogsByHumanId (pagination-proof, populated above) and fall back to the
  // in-memory map only when we don't have the owner UUID.
  const sameOwnerDogs = useMemo(() => {
    if (!selectedHumanId && !selectedHumanKey) return [];
    const ownerDogs = selectedHumanId
      ? getDogsForHuman(
          { id: selectedHumanId, fullName: selectedHumanKey },
          dogs || {},
          dogsByHumanId || {},
        )
      : Object.values(dogs || {}).filter(d => d.humanId === selectedHumanKey);
    return ownerDogs.filter(d => !dogEntries.some(e => e.dog.id === d.id));
  }, [dogs, dogsByHumanId, selectedHumanId, selectedHumanKey, dogEntries]);

  return (
    <div className="px-6 pt-5 overflow-visible shrink-0 relative z-10">

      {/* ─── STEP 1: Dog Search / Dog Cards ─── */}
      {hasDogs ? (
        <div className="flex flex-col gap-2">
          {dogEntries.map((entry) => {
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
                  aria-label={`Remove ${titleCase(entry.dog.name)}`}
                  className="bg-transparent border-none cursor-pointer text-lg text-slate-500 font-bold py-1 px-2 rounded-md transition-all hover:text-brand-coral"
                >
                  ×
                </button>
              </div>
              {/* Inline service dropdown */}
              <select
                value={entry.service}
                onChange={(e) => onServiceChange(entry.dog.id, e.target.value)}
                aria-label={`Service for ${titleCase(entry.dog.name)}`}
                className="w-full mt-2 px-2.5 py-2 rounded-lg border border-slate-200 text-xs font-inherit font-semibold cursor-pointer bg-white text-slate-800 box-border"
              >
                {SERVICES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} — {getServicePriceLabel(s.id, entry.dog.size || "small")}
                  </option>
                ))}
              </select>

              {/* Add-ons chips */}
              <div className="flex flex-wrap gap-1 mt-2" role="group" aria-label={`Add-ons for ${titleCase(entry.dog.name)}`}>
                {AVAILABLE_ADDONS.map((addon) => {
                  const active = (entry.addons || []).includes(addon);
                  const price = getAddonPrice(addon);
                  return (
                    <button
                      key={addon}
                      type="button"
                      onClick={() => onAddonsChange(entry.dog.id, addon)}
                      aria-pressed={active}
                      className={`px-2 py-[3px] rounded-full text-[10px] font-semibold border transition-colors ${
                        active
                          ? "bg-brand-cyan text-white border-brand-cyan"
                          : "bg-white text-slate-600 border-slate-200"
                      }`}
                    >
                      {addon}
                      {price > 0 ? ` +\u00A3${price}` : ""}
                    </button>
                  );
                })}
              </div>
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
                  Just this one dog for them
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
                onMouseDown={() => onOpenAddDog?.()}
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
          {/* Search an existing dog/owner, or jump straight into the guided
              New Client wizard for a brand-new customer. The wizard button is
              always visible here so staff never have to fail a search first. */}
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <label htmlFor="dog-search-input" className="text-[11px] font-extrabold text-brand-teal-text uppercase tracking-wide">Search Dog</label>
            <button
              type="button"
              onClick={() => onOpenNewClient?.()}
              className="shrink-0 py-1 px-2.5 rounded-md border border-brand-teal/40 bg-white text-brand-teal-text text-[11px] font-bold cursor-pointer font-inherit transition-colors hover:bg-brand-teal/5"
            >New customer</button>
          </div>
          <div className="relative">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 flex pointer-events-none z-[1]">
              <IconSearch size={15} colour="#6B7280" />
            </div>
            <input
              ref={searchRef}
              id="dog-search-input"
              placeholder="Start typing a dog's name, breed, or owner..."
              value={dogQuery}
              onChange={(e) => { setDogQuery(e.target.value); setError(""); onSearchDogs?.(e.target.value); }}
              className="w-full py-3 pl-9 pr-3.5 rounded-control border-[1.5px] border-slate-200 text-[15px] font-inherit box-border outline-none text-slate-800 transition-colors focus:border-brand-teal"
            />

            {/* Searching indicator — only when no local results */}
            {isSearchingDogs && dogQuery.trim().length > 0 && filteredEntries.length === 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 z-30 bg-white border-[1.5px] border-slate-200 rounded-xl shadow-[0_8px_24px_rgba(0,0,0,0.12)] px-3.5 py-3 text-[13px] text-slate-500 italic">
                Looking for matches…
              </div>
            )}

            {/* Dropdown results — one card per dog, humans nested inside */}
            {filteredEntries.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 z-30 bg-white border-[1.5px] border-slate-200 rounded-xl shadow-[0_8px_24px_rgba(0,0,0,0.12)] max-h-[320px] overflow-auto">
                {filteredEntries.map((entry, idx) => {
                  const primaryHuman = entry.humans[0];
                  const selectPrimary = () =>
                    onSelectEntry({
                      dog: entry.dog,
                      humanKey: primaryHuman?.key || "",
                      humanPhone: primaryHuman?.phone || "",
                      isTrusted: primaryHuman?.isTrusted || false,
                      hasAlerts: entry.hasAlerts,
                    });
                  return (
                  <div
                    key={entry.dog.id}
                    className="px-3.5 py-2.5"
                    style={{ borderBottom: idx < filteredEntries.length - 1 ? "1px solid #E5E7EB" : "none" }}
                  >
                    {/* Dog header — clickable, picks the primary owner by default */}
                    <button
                      type="button"
                      onMouseDown={selectPrimary}
                      aria-label={`Book ${titleCase(entry.dog.name)}${primaryHuman ? ` with ${titleCase(primaryHuman.key)}` : ""}`}
                      className="flex items-center gap-1.5 min-w-0 mb-1.5 w-full text-left bg-transparent border-none cursor-pointer p-0 font-[inherit] rounded-md transition-colors hover:bg-slate-50"
                    >
                      <span className="text-sm font-bold text-slate-800">{titleCase(entry.dog.name)}</span>
                      <span className="text-xs text-slate-400">—</span>
                      <span className="text-xs text-slate-500">{titleCase(entry.dog.breed)}</span>
                      {entry.hasAlerts && <span className="text-[13px]" aria-label="Has alerts">⚠️</span>}
                    </button>

                    {/* Humans — each row is clickable to pick that (dog, human) pair */}
                    {entry.humans.length === 0 ? (
                      <button
                        type="button"
                        onMouseDown={() => onSelectEntry({ dog: entry.dog, humanKey: "", humanPhone: "", isTrusted: false, hasAlerts: entry.hasAlerts })}
                        className="w-full text-left px-2 py-1.5 rounded-md text-xs font-semibold text-slate-500 italic bg-transparent border-none cursor-pointer font-[inherit] hover:bg-slate-50"
                      >
                        No human listed — that's fine, carry on
                      </button>
                    ) : (
                      <div className="flex flex-col gap-1">
                        {entry.humans.map((human) => {
                          const labelBg = human.isTrusted ? "#E6F5F2" : "#E0F7FC";
                          const labelColor = human.isTrusted ? "var(--color-brand-teal)" : "#0099BD";
                          const hoverBg = human.isTrusted ? "#E6F5F2" : "#E0F7FC";
                          // When the humans map hasn't loaded yet, the entry is
                          // marked missing. Show a shimmer instead of the
                          // misleading "Unknown owner" text — the row will
                          // re-render once humans hydrate.
                          const stillLoading = human.missing && Object.keys(humans || {}).length === 0;
                          return (
                            <button
                              key={human.key}
                              type="button"
                              aria-label={`Book ${titleCase(entry.dog.name)} with ${stillLoading ? "this owner" : titleCase(human.key)}${human.isTrusted ? " (trusted)" : " (owner)"}`}
                              onMouseDown={() => onSelectEntry({ dog: entry.dog, humanKey: human.key, humanPhone: human.phone, isTrusted: human.isTrusted, hasAlerts: entry.hasAlerts })}
                              className="flex items-center gap-2 w-full text-left px-2 py-1.5 rounded-md transition-colors bg-transparent border-none cursor-pointer font-[inherit]"
                              onMouseEnter={(e) => (e.currentTarget.style.background = hoverBg)}
                              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                            >
                              <span
                                className="text-[9px] font-bold py-0.5 px-[7px] rounded-md shrink-0 uppercase tracking-wide"
                                style={{ background: labelBg, color: labelColor }}
                              >{human.isTrusted ? "Trusted" : "Owner"}</span>
                              {stillLoading ? (
                                <SkeletonBlock className="h-3 w-24" />
                              ) : (
                                <span className="text-xs font-semibold text-slate-800 truncate">{titleCase(human.key)}</span>
                              )}
                              {human.phone && (
                                <span className="text-xs text-slate-500 truncate">· {human.phone}</span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  );
                })}
              </div>
            )}

            {/* No results + add buttons */}
            {!isSearchingDogs && dogQuery.trim().length >= 2 && filteredEntries.length === 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 z-30 bg-white border-[1.5px] border-slate-200 rounded-xl shadow-[0_8px_24px_rgba(0,0,0,0.12)] p-3.5">
                <div className="text-[13px] text-slate-500 mb-2.5">
                  Can't find anyone with "{dogQuery}" — try another name
                </div>
                {/* Two create paths: "+ New Dog" is the quick single-dog add
                    (owner created inline, resumes this booking); "New customer"
                    hands off to the guided New Client wizard for a brand-new
                    client. */}
                <button type="button" onClick={() => onOpenAddDog?.()} className="w-full py-[10px] px-3 rounded-lg border-none bg-brand-cyan text-white text-sm font-bold cursor-pointer font-inherit">+ New Dog</button>
                <div className="mt-2 pt-2 border-t border-slate-100 text-center">
                  <button type="button" onClick={() => onOpenNewClient?.()} className="bg-transparent border-none text-brand-teal-text text-[11px] font-bold cursor-pointer font-inherit hover:underline">New customer</button>
                </div>
              </div>
            )}
          </div>

          {/* Persistent "can't find them?" row so the create paths
              never hide behind a failed search. The only state that
              suppresses it is the bigger "no matches" panel that
              already surfaces the same CTAs in expanded form. */}
          {!(dogQuery.trim().length >= 2 && filteredEntries.length === 0 && !isSearchingDogs) && (
            <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-slate-500">
              <span>Can't find them?</span>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => onOpenAddDog?.()}
                  className="py-1 px-2 rounded-md border border-brand-cyan/40 bg-white text-brand-cyan text-[11px] font-bold cursor-pointer font-inherit hover:bg-brand-cyan/5"
                >+ New Dog</button>
                <button
                  type="button"
                  onClick={() => onOpenNewClient?.()}
                  className="py-1 px-2 rounded-md border border-brand-teal/40 bg-white text-brand-teal-text text-[11px] font-bold cursor-pointer font-inherit hover:bg-brand-teal/5"
                >New customer</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
