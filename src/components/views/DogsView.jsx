import { useState, useMemo } from "react";
import { SIZE_THEME, SIZE_FALLBACK } from "../../constants/index.js";
import { getHumanByIdOrName } from "../../engine/bookingRules.js";
import { IconSearch } from "../icons/index.jsx";
import { AddDogModal } from "../modals/AddDogModal.jsx";

function titleCase(str) {
  if (!str) return "";
  return str.replace(/\b\w/g, (c) => c.toUpperCase());
}

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

export function DogsView({ dogs, humans, onOpenDog, onAddDog, onAddHuman, hasMore, totalCount, loadMore, onSearch, searchQuery, isSearching }) {
  const [showAddModal, setShowAddModal] = useState(false);

  const sortedDogs = useMemo(() => Object.values(dogs).sort((a, b) => a.name.localeCompare(b.name)), [dogs]);

  return (
    <div className="animate-[fadeIn_0.2s_ease-in]">
      {/* Header banner */}
      <div className="bg-gradient-to-br from-brand-blue to-brand-blue-dark py-5 px-5 md:px-7 rounded-[14px] relative overflow-hidden mb-5">
        <div className="absolute right-8 top-0 text-[80px] opacity-[0.04] -rotate-[15deg] pointer-events-none select-none">{"\uD83D\uDC3E"}</div>
        <div className="relative z-[1] flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xl md:text-2xl font-black text-white">Dogs Directory</div>
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
              className="bg-white text-brand-blue border-none rounded-[10px] px-4 py-2.5 text-[13px] font-bold cursor-pointer font-inherit whitespace-nowrap transition-all hover:bg-white/90 shadow-[0_2px_8px_rgba(0,0,0,0.1)]"
            >
              + Add Dog
            </button>
          </div>
        </div>
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
              className="bg-white rounded-[14px] border border-slate-200 overflow-hidden cursor-pointer transition-all shadow-[0_2px_8px_rgba(0,0,0,0.03)] hover:-translate-y-0.5 hover:border-brand-teal hover:shadow-[0_6px_16px_rgba(45,139,122,0.12)] h-[140px] flex flex-col"
            >
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
            onClick={loadMore}
            className="border border-slate-200 rounded-[10px] px-4 py-2 text-[13px] font-semibold cursor-pointer font-inherit bg-white text-slate-800 transition-all hover:border-brand-teal hover:text-brand-teal"
          >
            Load more
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
