import { useState, useMemo } from "react";
import { SIZE_THEME, SIZE_FALLBACK } from "../../constants/index.js";
import { getHumanByIdOrName } from "../../engine/bookingRules.js";
import { IconSearch } from "../icons/index.jsx";
import { AddDogModal } from "../modals/AddDogModal.jsx";
import { ConfirmDeleteModal } from "../modals/ConfirmDeleteModal.jsx";
import { useToast } from "../../contexts/ToastContext.jsx";
import { titleCase } from "../../utils/text.js";

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

function sizeDot(size) {
  const t = SIZE_THEME[size] || SIZE_FALLBACK;
  return t.gradient[0];
}

export function DogsView({ dogs, humans, onOpenDog, onAddDog, onAddHuman, onDeleteDog, hasMore, totalCount, loadMore, onSearch, searchQuery, isSearching }) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null); // { id, name }
  const toast = useToast();

  const sortedDogs = useMemo(() => Object.values(dogs).sort((a, b) => a.name.localeCompare(b.name)), [dogs]);

  const handleConfirmDelete = async () => {
    if (!pendingDelete) return;
    const { id, name } = pendingDelete;
    const result = await onDeleteDog?.(id);
    setPendingDelete(null);
    if (result?.ok) {
      toast.show(`Deleted ${titleCase(name)}`, "success");
    } else if (result?.error) {
      toast.show(result.error, "error");
    }
  };

  return (
    <div className="animate-[fadeIn_0.2s_ease-in]">
      {/* Header banner */}
      <div className="bg-gradient-to-br from-brand-cyan-light to-brand-cyan-dark py-5 px-5 md:px-7 rounded-xl relative overflow-hidden mb-5">
        <svg className="absolute right-6 top-1 w-20 h-20 opacity-[0.06] -rotate-[15deg] pointer-events-none select-none" viewBox="0 0 24 24" fill="white"><ellipse cx="8" cy="6" rx="2.5" ry="3" /><ellipse cx="16" cy="6" rx="2.5" ry="3" /><ellipse cx="4.5" cy="12" rx="2" ry="2.5" /><ellipse cx="19.5" cy="12" rx="2" ry="2.5" /><ellipse cx="12" cy="16.5" rx="5" ry="4" /></svg>
        <div className="relative z-[1] flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xl md:text-2xl font-black text-white font-display">Dogs Directory</div>
            <div className="text-sm font-semibold text-white/70 mt-0.5">
              {totalCount} dog{totalCount !== 1 ? "s" : ""} registered
            </div>
          </div>
          <div className="flex gap-2.5 items-center flex-1 max-w-[420px]">
            <div className="relative flex-1">
              <div className="absolute left-3.5 top-1/2 -translate-y-1/2 flex">
                <IconSearch size={16} colour="rgba(255,255,255,0.5)" />
              </div>
              <input
                type="text"
                placeholder="Search dogs..."
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

      {/* Size legend */}
      <div className="flex items-center gap-4 mb-3 text-xs font-semibold text-slate-500 flex-wrap">
        <span className="text-slate-400 uppercase tracking-wide text-[10px] font-bold">Size:</span>
        {[
          { label: "Small", colour: SIZE_THEME.small.gradient[0] },
          { label: "Medium", colour: SIZE_THEME.medium.gradient[0] },
          { label: "Large", colour: SIZE_THEME.large.gradient[0] },
          { label: "Unset", colour: SIZE_FALLBACK.gradient[0] },
        ].map((s) => (
          <span key={s.label} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: s.colour }} />
            {s.label}
          </span>
        ))}
      </div>

      {/* Card grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {sortedDogs.map((dog) => {
          const owner = getHumanByIdOrName(humans, dog._humanId || dog.humanId);
          const ownerName =
            owner?.fullName ||
            (owner
              ? `${owner.name} ${owner.surname}`.trim()
              : dog.humanId || "");
          const alertCount = (dog.alerts || []).length;
          const t = SIZE_THEME[dog.size] || SIZE_FALLBACK;
          const age = computeAge(dog);

          return (
            <div
              key={dog.id}
              onClick={() => onOpenDog(dog.id || dog.name)}
              className="group relative bg-white rounded-xl border border-slate-200 overflow-hidden cursor-pointer transition-all shadow-[0_2px_8px_rgba(0,0,0,0.03)] hover:-translate-y-0.5 hover:border-brand-teal hover:shadow-[0_6px_16px_rgba(45,139,122,0.12)] h-[140px] flex flex-col"
            >
              {onDeleteDog && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setPendingDelete({ id: dog.id, name: dog.name });
                  }}
                  aria-label={`Delete ${titleCase(dog.name)}`}
                  className="absolute top-1.5 right-1.5 z-10 w-7 h-7 rounded-md bg-white/95 border border-slate-200 text-slate-400 opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-brand-coral hover:border-brand-coral transition-all flex items-center justify-center cursor-pointer"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                    <path d="M10 11v6M14 11v6" />
                    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                  </svg>
                </button>
              )}
              <div className="h-[3px] shrink-0" style={{ background: `linear-gradient(to right, ${t.gradient[0]}, ${t.gradient[1] || t.gradient[0]})` }} />

              <div className="p-3.5 px-4 flex flex-col flex-1 min-h-0">
                {/* Name + alert */}
                <div className="flex justify-between items-start gap-2">
                  <div className="flex items-center gap-1.5 truncate">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ background: sizeDot(dog.size), boxShadow: `0 0 0 2px ${sizeDot(dog.size)}33` }}
                    />
                    <span className="text-[15px] font-extrabold text-slate-800 truncate">
                      {titleCase(dog.name)}
                    </span>
                  </div>
                  {alertCount > 0 && (
                    <span className="text-[11px] font-bold text-brand-coral shrink-0">
                      {"\u26A0\uFE0F"} {alertCount}
                    </span>
                  )}
                </div>

                {/* Breed + age */}
                <div className="text-[13px] text-slate-500 font-semibold leading-snug mt-0.5 truncate">
                  {titleCase(dog.breed)}{age ? ` \u00B7 ${age}` : ""}
                </div>

                {/* Owner — pushed to bottom */}
                <div className="mt-auto text-[12px] font-semibold text-slate-400 truncate">
                  {ownerName ? titleCase(ownerName) : <span className="italic">No owner</span>}
                </div>
              </div>
            </div>
          );
        })}

        {sortedDogs.length === 0 && !isSearching && (
          <div className="col-span-full text-center py-16 px-5 text-slate-500">
            <div className="text-[32px] mb-3">{"\uD83D\uDC3E"}</div>
            <div className="text-[15px] font-semibold">
              {searchQuery ? `No dogs found matching "${searchQuery}"` : "No dogs yet."}
            </div>
            {searchQuery && (
              <div className="text-[13px] mt-1.5">
                Try searching by breed or owner name instead.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="mt-5 flex items-center justify-between flex-wrap gap-2.5">
        <div className="text-[13px] text-slate-500">
          {isSearching ? (
            <span className="italic">Searching...</span>
          ) : (
            <span>Showing {sortedDogs.length} of {totalCount} dogs</span>
          )}
        </div>
        {hasMore && !isSearching && (
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

      {pendingDelete && (
        <ConfirmDeleteModal
          title={`Delete ${titleCase(pendingDelete.name)}?`}
          message="This will also remove their booking history and any groom photos."
          confirmLabel="Delete dog"
          onConfirm={handleConfirmDelete}
          onClose={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}
