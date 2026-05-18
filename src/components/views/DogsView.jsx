import { useState, useMemo } from "react";
import { SIZE_THEME, SIZE_FALLBACK } from "../../constants/index.js";
import { IconSearch } from "../icons/index.jsx";
import { AddDogModal } from "../modals/AddDogModal.jsx";
import { useToast } from "../../contexts/ToastContext.jsx";
import { titleCase } from "../../utils/text.js";
import { formatOwnerLabel } from "../../utils/formatOwnerLabel.js";
import { filterDogsForDirectory } from "../../utils/directorySearch.js";
import { CardGridSkeleton, SkeletonBlock } from "../ui/Skeleton.jsx";
import { SizeDot } from "../ui/SizeDot.jsx";

function computeAge(dog) {
  if (dog.dob) {
    const [y, m] = dog.dob.split("-").map(Number);
    if (y && m) {
      const now = new Date();
      let yrs = now.getFullYear() - y;
      let mos = now.getMonth() + 1 - m;
      if (mos < 0) { yrs--; mos += 12; }
      return yrs >= 1 ? `${yrs} ${yrs === 1 ? "yr" : "yrs"}` : `${mos} ${mos === 1 ? "month" : "months"}`;
    }
  }
  const raw = dog.age || "";
  if (/^\d+$/.test(raw.trim())) return `${raw.trim()} yrs`;
  return raw || "";
}

/**
 * A dog has an "incomplete profile" when any of the three core
 * fields is missing — surfaced as a yellow badge on the card and
 * profile page so staff can spot records that need attention.
 */
export function isIncompleteDogProfile(dog, humans) {
  if (!dog) return true;
  if (!dog.size) return true;
  if (!dog.breed || !dog.breed.trim()) return true;
  const owner = formatOwnerLabel(dog, humans);
  return owner.missing;
}

const SIZE_FILTERS = [
  { value: "small", label: "Small" },
  { value: "medium", label: "Medium" },
  { value: "large", label: "Large" },
  { value: "unset", label: "Unset" },
];

export function DogsView({ dogs, humans, onOpenDog, onAddDog, onAddHuman, hasMore, totalCount, loadMore, onSearch, searchQuery, isSearching, isInitialLoading = false, isOnline = true }) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [sizeFilter, setSizeFilter] = useState(null); // "small" | "medium" | "large" | "unset" | null
  const [alertFilter, setAlertFilter] = useState(false); // true → only dogs with alerts
  const [incompleteFilter, setIncompleteFilter] = useState(false);
  useToast(); // wired for child modals; cards no longer surface toasts directly

  const hasSearchQuery = Boolean(searchQuery?.trim());
  const sortedDogs = useMemo(() => {
    const baseDogs =
      hasSearchQuery && !isOnline
        ? filterDogsForDirectory(dogs, humans, searchQuery)
        : Object.values(dogs);
    const filtered = baseDogs.filter((dog) => {
      if (sizeFilter) {
        const dogSize = dog.size || "unset";
        if (dogSize !== sizeFilter) return false;
      }
      if (alertFilter && !(dog.alerts?.length)) return false;
      if (incompleteFilter && !isIncompleteDogProfile(dog, humans)) return false;
      return true;
    });
    return filtered.sort((a, b) => a.name.localeCompare(b.name));
  }, [dogs, humans, hasSearchQuery, isOnline, searchQuery, sizeFilter, alertFilter, incompleteFilter]);

  const anyFilterActive = sizeFilter || alertFilter || incompleteFilter;
  const registeredTotal = hasSearchQuery || anyFilterActive
    ? sortedDogs.length
    : Math.max(Number(totalCount) || 0, Object.keys(dogs).length);
  const headerCountText = hasSearchQuery || anyFilterActive
    ? `${sortedDogs.length} matching dog${sortedDogs.length !== 1 ? "s" : ""}`
    : `${registeredTotal} dog${registeredTotal !== 1 ? "s" : ""} registered`;
  const footerText = hasSearchQuery
    ? `${sortedDogs.length} match${sortedDogs.length !== 1 ? "es" : ""} for "${searchQuery.trim()}"`
    : `Showing ${sortedDogs.length} of ${registeredTotal} dogs`;

  return (
    <div className="animate-[fadeIn_0.2s_ease-in]">
      {/* Header banner */}
      <div className="bg-gradient-to-br from-brand-cyan-light to-brand-cyan-dark py-5 px-5 md:px-7 rounded-xl relative overflow-hidden mb-5">
        <svg className="absolute right-6 top-1 w-20 h-20 opacity-[0.06] -rotate-[15deg] pointer-events-none select-none" viewBox="0 0 24 24" fill="white"><ellipse cx="8" cy="6" rx="2.5" ry="3" /><ellipse cx="16" cy="6" rx="2.5" ry="3" /><ellipse cx="4.5" cy="12" rx="2" ry="2.5" /><ellipse cx="19.5" cy="12" rx="2" ry="2.5" /><ellipse cx="12" cy="16.5" rx="5" ry="4" /></svg>
        <div className="relative z-[1] flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xl md:text-2xl font-black text-white font-display">Dogs Directory</div>
            <div className="text-sm font-semibold text-white/70 mt-0.5 min-h-[1.25rem]">
              {isInitialLoading && Object.keys(dogs).length === 0 ? (
                <SkeletonBlock className="h-4 w-32 bg-white/20" />
              ) : (
                headerCountText
              )}
            </div>
          </div>
          <div className="flex gap-2.5 items-center flex-1 max-w-[420px]">
            <div className="relative flex-1">
              <div className="absolute left-3.5 top-1/2 -translate-y-1/2 flex">
                <IconSearch size={16} colour="rgba(255,255,255,0.5)" />
              </div>
              <input
                type="text"
                placeholder="Search by name, breed or owner..."
                value={searchQuery}
                onChange={(e) => onSearch(e.target.value)}
                className="w-full py-2.5 pl-10 pr-3.5 rounded-[10px] border border-white/25 bg-white/15 text-sm font-inherit outline-none text-white placeholder:text-white/50 transition-colors focus:bg-white/25 focus:border-white/40"
              />
            </div>
            <button
              onClick={() => setShowAddModal(true)}
              className="bg-white text-brand-cyan border-none rounded-[10px] px-4 py-2.5 text-[13px] font-bold cursor-pointer font-inherit whitespace-nowrap transition-all hover:bg-white/90 shadow-[0_2px_8px_rgba(0,0,0,0.1)]"
            >
              + Add Dog
            </button>
          </div>
        </div>
      </div>

      {/* Filters — size chips + alert/incomplete chips. Click an active
          chip again to clear it. */}
      <div className="flex items-center gap-3 mb-3 flex-wrap" role="group" aria-label="Filter dogs">
        <span className="text-slate-400 uppercase tracking-wide text-[10px] font-bold">Size:</span>
        {SIZE_FILTERS.map((s) => {
          const active = sizeFilter === s.value;
          return (
            <button
              key={s.value}
              type="button"
              onClick={() => setSizeFilter(active ? null : s.value)}
              aria-pressed={active}
              className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full transition-colors cursor-pointer border ${
                active
                  ? "bg-slate-800 text-white border-slate-800"
                  : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"
              }`}
            >
              <SizeDot size={s.value === "unset" ? null : s.value} dim={12} />
              {s.label}
            </button>
          );
        })}
        <span className="text-slate-300 mx-1">·</span>
        <button
          type="button"
          onClick={() => setAlertFilter((v) => !v)}
          aria-pressed={alertFilter}
          className={`text-xs font-semibold px-2.5 py-1 rounded-full transition-colors cursor-pointer border ${
            alertFilter
              ? "bg-rose-50 text-rose-800 border-rose-300"
              : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"
          }`}
        >
          {"⚠️"} Has alert
        </button>
        <button
          type="button"
          onClick={() => setIncompleteFilter((v) => !v)}
          aria-pressed={incompleteFilter}
          className={`text-xs font-semibold px-2.5 py-1 rounded-full transition-colors cursor-pointer border ${
            incompleteFilter
              ? "bg-amber-50 text-amber-900 border-amber-300"
              : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"
          }`}
        >
          Incomplete profile
        </button>
        {anyFilterActive && (
          <button
            type="button"
            onClick={() => { setSizeFilter(null); setAlertFilter(false); setIncompleteFilter(false); }}
            className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 underline cursor-pointer bg-transparent border-none p-0 font-[inherit]"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Card grid — skeleton during the initial fetch so the page
          settles into shape before the data arrives. */}
      {isInitialLoading && sortedDogs.length === 0 ? (
        <CardGridSkeleton rows={3} cols={3} />
      ) : (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {sortedDogs.map((dog) => {
          // formatOwnerLabel refuses to render a UUID-shaped string —
          // when the human row isn't in the loaded map, the card shows
          // "Unknown owner" rather than the raw humans.id from the dog.
          const { label: ownerName, missing: ownerMissing } = formatOwnerLabel(dog, humans);
          const alertCount = (dog.alerts || []).length;
          const t = SIZE_THEME[dog.size] || SIZE_FALLBACK;
          const age = computeAge(dog);
          const incomplete = isIncompleteDogProfile(dog, humans);

          return (
            <button
              key={dog.id}
              type="button"
              onClick={() => onOpenDog(dog.id || dog.name)}
              aria-label={`Open ${titleCase(dog.name)}'s profile`}
              className="group relative bg-white rounded-xl border border-slate-200 overflow-hidden cursor-pointer transition-all shadow-[0_2px_8px_rgba(0,0,0,0.03)] hover:-translate-y-0.5 hover:border-brand-teal hover:shadow-[0_6px_16px_rgba(45,139,122,0.12)] h-[140px] flex flex-col text-left p-0 font-[inherit]"
            >
              {/* Trash icon removed in task 4 of the May 2026 review pass.
                  Bulk delete from the directory was too easy to mis-fire;
                  the action now lives inside the dog profile (Edit mode). */}
              <div className="h-[3px] shrink-0" style={{ background: `linear-gradient(to right, ${t.gradient[0]}, ${t.gradient[1] || t.gradient[0]})` }} />

              <div className="p-3.5 px-4 flex flex-col flex-1 min-h-0">
                {/* Name + alert + incomplete badge */}
                <div className="flex justify-between items-start gap-2">
                  <div className="flex items-center gap-1.5 truncate">
                    <SizeDot size={dog.size} dim={14} />
                    <span className="text-[15px] font-extrabold text-slate-800 truncate">
                      {titleCase(dog.name)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {incomplete && (
                      <span
                        className="text-[9px] font-extrabold uppercase tracking-wide text-amber-900 bg-amber-100 border border-amber-300 px-1.5 py-0.5 rounded-full"
                        title="Missing size, breed or owner"
                      >
                        Incomplete
                      </span>
                    )}
                    {alertCount > 0 && (
                      <span className="text-[11px] font-bold text-brand-coral">
                        {"⚠️"} {alertCount}
                      </span>
                    )}
                  </div>
                </div>

                {/* Breed + age */}
                <div className="text-[13px] text-slate-500 font-semibold leading-snug mt-0.5 truncate">
                  {titleCase(dog.breed) || <span className="italic text-slate-400">No breed</span>}{age ? ` · ${age}` : ""}
                </div>

                {/* Owner — pushed to bottom. While humans are still
                    loading we can't tell "missing owner" from "owner
                    row hasn't arrived yet", so show a skeleton instead
                    of the misleading "Unknown owner" flash. */}
                <div className="mt-auto text-[12px] font-semibold text-slate-400 truncate">
                  {ownerMissing && Object.keys(humans).length === 0
                    ? <SkeletonBlock className="h-3 w-24" />
                    : ownerMissing
                      ? <span className="italic">{ownerName}</span>
                      : titleCase(ownerName)}
                </div>
              </div>
            </button>
          );
        })}

        {sortedDogs.length === 0 && !isSearching && (
          <div className="col-span-full text-center py-16 px-5 text-slate-500">
            <div className="text-[32px] mb-3">{"🐾"}</div>
            <div className="text-[15px] font-semibold">
              {searchQuery
                ? `No dogs found matching "${searchQuery}"`
                : anyFilterActive
                  ? "No dogs match the active filters."
                  : "No dogs yet."}
            </div>
            {(searchQuery || anyFilterActive) && (
              <div className="text-[13px] mt-1.5">
                Try clearing some filters or searching by breed or owner name.
              </div>
            )}
          </div>
        )}
      </div>
      )}

      {/* Footer */}
      <div className="mt-5 flex items-center justify-between flex-wrap gap-2.5">
        <div className="text-[13px] text-slate-500">
          {isSearching ? (
            <span className="italic">Searching...</span>
          ) : (
            <span>{footerText}</span>
          )}
        </div>
        {hasMore && !isSearching && !hasSearchQuery && !anyFilterActive && (
          <button
            onClick={async () => { setLoadingMore(true); await loadMore(); setLoadingMore(false); }}
            disabled={loadingMore}
            className={`border border-slate-200 rounded-[10px] px-4 py-2 text-[13px] font-semibold font-inherit transition-all ${loadingMore ? "bg-slate-100 text-slate-400 cursor-not-allowed" : "bg-white text-slate-800 cursor-pointer hover:border-brand-teal hover:text-brand-teal"}`}
          >
            {loadingMore ? "Loading..." : "Load more"}
          </button>
        )}
      </div>

      {showAddModal && (
        <AddDogModal
          onClose={() => setShowAddModal(false)}
          onAdd={onAddDog}
          onAddHuman={onAddHuman}
          humans={humans}
        />
      )}

    </div>
  );
}
