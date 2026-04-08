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

const DEFAULT_PILL = { bg: "#F8FAFB", text: "#1F2937", border: "#E5E7EB" };
function sizePill(size) {
  const t = SIZE_THEME[size];
  if (!t) return DEFAULT_PILL;
  return { bg: t.light, text: t.primary, border: t.gradient[0] };
}

export function HumansView({ humans, dogs, onOpenHuman, onAddHuman, hasMore, totalCount, loadMore, onSearch, searchQuery, isSearching }) {
  const [showAddModal, setShowAddModal] = useState(false);

  const sortedHumans = useMemo(() => Object.values(humans).sort((a, b) => a.name.localeCompare(b.name)), [humans]);

  return (
    <div className="animate-[fadeIn_0.2s_ease-in]">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-extrabold m-0 text-slate-800">
            Humans Directory
          </h2>
          <div className="text-[13px] text-slate-500 mt-1">
            Search by name, phone, address, dog, or notes.
          </div>
        </div>

        <div className="flex gap-2.5 items-center flex-1 max-w-[460px]">
          <div className="relative flex-1">
            <div className="absolute left-3.5 top-1/2 -translate-y-1/2 flex">
              <IconSearch size={16} colour="#6B7280" />
            </div>
            <input
              type="text"
              placeholder="Search rolodex..."
              value={searchQuery}
              onChange={(e) => onSearch(e.target.value)}
              className="w-full py-2.5 pl-10 pr-3.5 rounded-[10px] border-[1.5px] border-slate-200 text-sm font-inherit outline-none text-slate-800 transition-colors focus:border-brand-teal"
            />
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="bg-brand-teal text-white border-none rounded-[10px] px-4 py-2.5 text-[13px] font-bold cursor-pointer font-inherit whitespace-nowrap transition-all hover:bg-[#236b5d]"
          >
            + Add Human
          </button>
        </div>
      </div>

      {/* Card grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {sortedHumans.map((human) => {
          const fullName = human.fullName || `${human.name} ${human.surname}`;
          const humanDogs = Object.values(dogs).filter(
            (dog) => dog._humanId === human.id || dog.humanId === fullName,
          );

          return (
            <div
              key={human.id}
              onClick={() => onOpenHuman(human.id || fullName)}
              className="bg-white rounded-xl border border-slate-200 overflow-hidden cursor-pointer transition-all shadow-[0_2px_8px_rgba(0,0,0,0.03)] hover:-translate-y-0.5 hover:border-brand-teal hover:shadow-[0_6px_16px_rgba(45,139,122,0.12)]"
            >
              <div className="bg-[#E6F5F2] p-3.5 px-4 border-b border-slate-200 flex justify-between items-start">
                <div>
                  <div className="text-base font-extrabold text-[#1F6659]">
                    {titleCase(fullName)}
                  </div>
                  {human.phone ? (
                    <a
                      href={waLink(human.phone)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-[13px] text-slate-800 font-semibold mt-1 block no-underline hover:text-brand-teal"
                    >
                      {human.phone}
                    </a>
                  ) : (
                    <div className="text-[13px] text-slate-500 font-semibold mt-1 italic">
                      No phone
                    </div>
                  )}
                </div>
                {human.historyFlag && (
                  <span title={human.historyFlag} className="text-base">
                    {"\u26A0\uFE0F"}
                  </span>
                )}
              </div>
              <div className="p-3.5 px-4">
                <div className="text-[11px] font-extrabold text-[#1E6B5C] uppercase tracking-wide mb-2">
                  Dogs
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  {humanDogs.length > 0 ? (
                    humanDogs.map((dog) => {
                      const dogSize = dog.size || getSizeForBreed(dog.breed);
                      const pill = sizePill(dogSize);
                      return (
                        <span
                          key={dog.id}
                          className="px-2.5 py-1 rounded-xl text-xs font-semibold"
                          style={{
                            background: pill.bg,
                            border: `1px solid ${pill.border}`,
                            color: pill.text,
                          }}
                        >
                          {titleCase(dog.name)}{" "}
                          <span className="font-medium opacity-75">
                            ({titleCase(dog.breed)})
                          </span>
                        </span>
                      );
                    })
                  ) : (
                    <span className="text-[13px] text-slate-500 italic">
                      None listed
                    </span>
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
