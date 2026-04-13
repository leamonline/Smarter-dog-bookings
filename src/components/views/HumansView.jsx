import { useState, useMemo } from "react";
import { SIZE_THEME, getSizeForBreed } from "../../constants/index.js";
import { IconSearch } from "../icons/index.jsx";
import { AddHumanModal } from "../modals/AddHumanModal.jsx";

function titleCase(str) {
  if (!str) return "";
  return str.replace(/\b\w/g, (c) => c.toUpperCase());
}

function waLink(phone) {
  if (!phone) return "#";
  const digits = phone.replace(/[\s\-()]/g, "");
  const intl = digits.startsWith("0") ? "44" + digits.slice(1) : digits;
  return `https://wa.me/${intl}`;
}

function sizeDot(size) {
  const t = SIZE_THEME[size];
  return t ? t.gradient[0] : "#94A3B8";
}

export function HumansView({ humans, dogs, onOpenHuman, onAddHuman, hasMore, totalCount, loadMore, onSearch, searchQuery, isSearching }) {
  const [showAddModal, setShowAddModal] = useState(false);

  const sortedHumans = useMemo(() => Object.values(humans).sort((a, b) => a.name.localeCompare(b.name)), [humans]);

  return (
    <div className="animate-[fadeIn_0.2s_ease-in]">
      {/* Header banner */}
      <div className="bg-gradient-to-br from-brand-blue to-brand-blue-dark py-5 px-5 md:px-7 rounded-xl relative overflow-hidden mb-5">
        <div className="absolute right-8 top-0 text-[80px] opacity-[0.04] -rotate-[15deg] pointer-events-none select-none">{"\uD83D\uDC3E"}</div>
        <div className="relative z-[1] flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xl md:text-2xl font-black text-white">Humans Directory</div>
            <div className="text-sm font-semibold text-white/70 mt-0.5">
              {totalCount} human{totalCount !== 1 ? "s" : ""} registered
            </div>
          </div>
          <div className="flex gap-2.5 items-center flex-1 max-w-[420px]">
            <div className="relative flex-1">
              <div className="absolute left-3.5 top-1/2 -translate-y-1/2 flex">
                <IconSearch size={16} colour="rgba(255,255,255,0.5)" />
              </div>
              <input
                type="text"
                placeholder="Search rolodex..."
                value={searchQuery}
                onChange={(e) => onSearch(e.target.value)}
                className="w-full py-2.5 pl-10 pr-3.5 rounded-[10px] border border-white/25 bg-white/15 text-sm font-inherit outline-none text-white placeholder:text-white/50 transition-colors focus:bg-white/25 focus:border-white/40"
              />
            </div>
            <button
              onClick={() => setShowAddModal(true)}
              className="bg-white text-brand-blue border-none rounded-[10px] px-4 py-2.5 text-[13px] font-bold cursor-pointer font-inherit whitespace-nowrap transition-all hover:bg-white/90 shadow-[0_2px_8px_rgba(0,0,0,0.1)]"
            >
              + Add Human
            </button>
          </div>
        </div>
      </div>

      {/* Card grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {sortedHumans.map((human) => {
          const fullName = human.fullName || `${human.name} ${human.surname}`;
          const humanDogs = Object.values(dogs).filter(
            (dog) => dog._humanId === human.id || dog.humanId === fullName,
          );
          const visibleDogs = humanDogs.slice(0, 4);
          const overflow = humanDogs.length - visibleDogs.length;

          return (
            <div
              key={human.id}
              onClick={() => onOpenHuman(human.id || fullName)}
              className="bg-white rounded-xl border border-slate-200 overflow-hidden cursor-pointer transition-all shadow-[0_2px_8px_rgba(0,0,0,0.03)] hover:-translate-y-0.5 hover:border-brand-teal hover:shadow-[0_6px_16px_rgba(45,139,122,0.12)] h-[140px] flex flex-col"
            >
              <div className="h-[3px] bg-gradient-to-r from-brand-teal to-[#3BA594] shrink-0" />

              <div className="p-3.5 px-4 flex flex-col flex-1 min-h-0">
                {/* Name + flag */}
                <div className="flex justify-between items-start gap-2">
                  <div className="text-[15px] font-extrabold text-slate-800 truncate">
                    {titleCase(fullName)}
                  </div>
                  {human.historyFlag && (
                    <span title={human.historyFlag} className="text-sm shrink-0">{"\u26A0\uFE0F"}</span>
                  )}
                </div>

                {/* Phone */}
                {human.phone ? (
                  <a
                    href={waLink(human.phone)}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-[13px] text-slate-500 font-semibold no-underline hover:text-brand-teal leading-snug"
                  >
                    {human.phone}
                  </a>
                ) : (
                  <div className="text-[13px] text-slate-400 italic leading-snug">No phone</div>
                )}

                {/* Dogs — pushed to bottom */}
                <div className="mt-auto flex items-center gap-2.5 flex-wrap overflow-hidden max-h-[22px]">
                  {visibleDogs.length > 0 ? (
                    <>
                      {visibleDogs.map((dog) => {
                        const dogSize = dog.size || getSizeForBreed(dog.breed);
                        return (
                          <span key={dog.id} className="flex items-center gap-1.5 shrink-0">
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ background: sizeDot(dogSize), boxShadow: `0 0 0 2px ${sizeDot(dogSize)}33` }}
                            />
                            <span className="text-[12px] font-semibold text-slate-600">
                              {titleCase(dog.name)}
                              {dog.breed && <span className="font-medium text-slate-400"> ({titleCase(dog.breed)})</span>}
                            </span>
                          </span>
                        );
                      })}
                      {overflow > 0 && (
                        <span className="text-[11px] font-semibold text-slate-400 shrink-0">+{overflow}</span>
                      )}
                    </>
                  ) : (
                    <span className="text-[12px] text-slate-400 italic">No dogs</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {sortedHumans.length === 0 && !isSearching && (
          <div className="col-span-full text-center py-16 px-5 text-slate-500">
            <div className="text-[32px] mb-3">{"\uD83D\uDD0D"}</div>
            <div className="text-[15px] font-semibold">
              {searchQuery ? `No humans found matching "${searchQuery}"` : "No humans yet."}
            </div>
            {searchQuery && (
              <div className="text-[13px] mt-1.5">
                Try searching by phone number or dog breed instead.
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
            <span>Showing {sortedHumans.length} of {totalCount} humans</span>
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
        <AddHumanModal
          onClose={() => setShowAddModal(false)}
          onAdd={onAddHuman}
        />
      )}
    </div>
  );
}
