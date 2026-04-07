import { useState, useMemo } from "react";
import { SIZE_THEME, SIZE_FALLBACK } from "../../constants/index.js";
import { getHumanByIdOrName } from "../../engine/bookingRules.js";
import { IconSearch } from "../icons/index.jsx";
import { AddDogModal } from "../modals/AddDogModal.jsx";

function titleCase(str) {
  if (!str) return "";
  return str.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function DogsView({ dogs, humans, onOpenDog, onAddDog, onAddHuman, hasMore, totalCount, loadMore, onSearch, searchQuery, isSearching }) {
  const [showAddModal, setShowAddModal] = useState(false);

  const sortedDogs = useMemo(() => Object.values(dogs).sort((a, b) => a.name.localeCompare(b.name)), [dogs]);

  return (
    <div className="animate-[fadeIn_0.2s_ease-in]">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-extrabold m-0 text-slate-800">
            Dogs Directory
          </h2>
          <div className="text-[13px] text-slate-500 mt-1">
            Search by name, breed, owner, or alerts.
          </div>
        </div>

        <div className="flex gap-2.5 items-center w-full max-w-[460px]">
          <div className="relative flex-1">
            <div className="absolute left-3.5 top-1/2 -translate-y-1/2 flex">
              <IconSearch size={16} colour="#6B7280" />
            </div>
            <input
              type="text"
              placeholder="Search dogs..."
              value={searchQuery}
              onChange={(e) => onSearch(e.target.value)}
              className="w-full py-2.5 pl-10 pr-3.5 rounded-[10px] border-[1.5px] border-slate-200 text-sm font-inherit outline-none text-slate-800 transition-colors focus:border-brand-blue"
            />
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="bg-brand-blue text-white border-none rounded-[10px] px-4 py-2.5 text-[13px] font-bold cursor-pointer font-inherit whitespace-nowrap transition-all hover:bg-brand-blue-dark"
          >
            + Add Dog
          </button>
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
          const sizeTheme = { bg: t.light, text: t.primary, border: t.gradient[0], shadow: `${t.gradient[0]}26` };

          return (
            <div
              key={dog.id}
              onClick={() => onOpenDog(dog.id || dog.name)}
              className="bg-white rounded-xl border border-slate-200 overflow-hidden cursor-pointer transition-all shadow-[0_2px_8px_rgba(0,0,0,0.03)] hover:-translate-y-0.5 hover:shadow-md"
              style={{
                "--hover-border": sizeTheme.border,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = sizeTheme.border;
                e.currentTarget.style.boxShadow = `0 6px 16px ${sizeTheme.shadow}`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "";
                e.currentTarget.style.boxShadow = "";
              }}
            >
              <div
                className="p-3.5 px-4 border-b border-slate-200 flex justify-between items-start"
                style={{ background: sizeTheme.bg }}
              >
                <div>
                  <div
                    className="text-base font-extrabold"
                    style={{ color: sizeTheme.text }}
                  >
                    {titleCase(dog.name)}
                  </div>
                  <div className="text-[13px] text-slate-800 font-semibold mt-1">
                    {titleCase(dog.breed)}{(() => {
                      let age = "";
                      if (dog.dob) {
                        const [y, m] = dog.dob.split("-").map(Number);
                        if (y && m) {
                          const now = new Date();
                          let yrs = now.getFullYear() - y;
                          let mos = now.getMonth() + 1 - m;
                          if (mos < 0) { yrs--; mos += 12; }
                          age = yrs >= 1 ? `${yrs} ${yrs === 1 ? "yr" : "yrs"}` : `${mos} ${mos === 1 ? "month" : "months"}`;
                        }
                      } else {
                        const raw = dog.age || "";
                        if (/^\d+$/.test(raw.trim())) age = `${raw.trim()} yrs`;
                        else age = raw;
                      }
                      return age ? ` \u00B7 ${age}` : "";
                    })()}
                  </div>
                </div>
                {alertCount > 0 && (
                  <span className="bg-brand-coral-light text-brand-coral px-2.5 py-1 rounded-xl text-[11px] font-bold">
                    {"\u26A0\uFE0F"} {alertCount} alert{alertCount > 1 ? "s" : ""}
                  </span>
                )}
              </div>

              <div className="p-3.5 px-4">
                <div className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wide mb-1.5">
                  Owner
                </div>
                <span className="bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-xl text-xs font-semibold text-slate-800">
                  {titleCase(ownerName)}
                </span>

                {dog.groomNotes && (
                  <div className="mt-2.5">
                    <div className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wide mb-1">
                      Groom Notes
                    </div>
                    <div className="text-xs text-slate-800 leading-relaxed">
                      {dog.groomNotes}
                    </div>
                  </div>
                )}
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
            className="border border-slate-200 rounded-[10px] px-4 py-2 text-[13px] font-semibold cursor-pointer font-inherit bg-white text-slate-800 transition-all hover:border-brand-blue hover:text-brand-blue"
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
