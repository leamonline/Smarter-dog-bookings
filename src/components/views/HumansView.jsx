import { useState, useMemo, useEffect } from "react";
import { getSizeForBreed } from "../../constants/index.js";
import { IconSearch } from "../icons/index.jsx";
import { AddHumanModal } from "../modals/AddHumanModal.jsx";
import { titleCase, normaliseSurname } from "../../utils/text.js";
import { filterHumansForDirectory } from "../../utils/directorySearch.js";
import { CardGridSkeleton, SkeletonBlock } from "../ui/Skeleton.jsx";
import { ErrorBanner } from "../ui/ErrorBanner.jsx";
import { SizeDot } from "../ui/SizeDot.jsx";
import { telLink, waLink } from "../modals/dog-card/helpers.js";

export function HumansView({ humans, dogs, dogsByHumanId, ensureDogsForHumans, onOpenHuman, onAddHuman, hasMore, totalCount, loadMore, onSearch, searchQuery, isSearching, isInitialLoading = false, isOnline = true, loadError = null }) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const hasSearchQuery = Boolean(searchQuery?.trim());
  const sortedHumans = useMemo(() => {
    const visibleHumans =
      hasSearchQuery && !isOnline
        ? filterHumansForDirectory(humans, dogs, dogsByHumanId, searchQuery)
        : Object.values(humans);
    return visibleHumans.sort((a, b) => a.name.localeCompare(b.name));
  }, [dogs, dogsByHumanId, hasSearchQuery, humans, isOnline, searchQuery]);
  const registeredTotal = hasSearchQuery
    ? sortedHumans.length
    : Math.max(Number(totalCount) || 0, Object.keys(humans).length);
  const headerCountText = hasSearchQuery
    ? `${sortedHumans.length} matching human${sortedHumans.length !== 1 ? "s" : ""}`
    : `${registeredTotal} human${registeredTotal !== 1 ? "s" : ""} registered`;
  const footerText = hasSearchQuery
    ? `${sortedHumans.length} match${sortedHumans.length !== 1 ? "es" : ""} for "${searchQuery.trim()}"`
    : `Showing ${sortedHumans.length} of ${registeredTotal} humans`;

  const visibleHumanIdsKey = useMemo(
    () => sortedHumans.map((h) => h.id).filter(Boolean).join(","),
    [sortedHumans],
  );

  useEffect(() => {
    if (!ensureDogsForHumans || !visibleHumanIdsKey) return;
    ensureDogsForHumans(visibleHumanIdsKey.split(","));
  }, [ensureDogsForHumans, visibleHumanIdsKey]);

  return (
    <div className="animate-[fadeIn_0.2s_ease-in]">
      {/* Header banner */}
      <div className="bg-gradient-to-br from-brand-cyan-light to-brand-cyan-dark py-5 px-5 md:px-7 rounded-xl relative overflow-hidden mb-5">
        <svg className="absolute right-6 top-1 w-20 h-20 opacity-[0.06] -rotate-[15deg] pointer-events-none select-none" viewBox="0 0 24 24" fill="white"><ellipse cx="8" cy="6" rx="2.5" ry="3" /><ellipse cx="16" cy="6" rx="2.5" ry="3" /><ellipse cx="4.5" cy="12" rx="2" ry="2.5" /><ellipse cx="19.5" cy="12" rx="2" ry="2.5" /><ellipse cx="12" cy="16.5" rx="5" ry="4" /></svg>
        <div className="relative z-[1] flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xl md:text-2xl font-black text-white font-display">Humans Directory</div>
            <div className="text-sm font-semibold text-white/70 mt-0.5 min-h-[1.25rem]">
              {isInitialLoading && Object.keys(humans).length === 0 ? (
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
                placeholder="Search rolodex..."
                value={searchQuery}
                onChange={(e) => onSearch(e.target.value)}
                className="w-full py-2.5 pl-10 pr-3.5 rounded-[10px] border border-white/25 bg-white/15 text-sm font-inherit outline-none text-white placeholder:text-white/50 transition-colors focus:bg-white/25 focus:border-white/40"
              />
            </div>
            <button
              onClick={() => setShowAddModal(true)}
              className="bg-white text-brand-cyan border-none rounded-[10px] px-4 py-2.5 text-[13px] font-bold cursor-pointer font-inherit whitespace-nowrap transition-all hover:bg-white/90 shadow-[0_2px_8px_rgba(0,0,0,0.1)]"
            >
              + Add Human
            </button>
          </div>
        </div>
      </div>

      {/* Surface the fetch error inline when the directory ended up
          empty — the global page-level banner can be dismissed, and
          we want the user to know where to retry from. */}
      {loadError && sortedHumans.length === 0 && !isInitialLoading && (
        <ErrorBanner
          title="Couldn't load the humans directory"
          message="Check your connection and try again."
          retry={() => window.location.reload()}
          retryLabel="Refresh"
        />
      )}

      {/* Card grid — skeleton during the initial fetch. */}
      {isInitialLoading && sortedHumans.length === 0 ? (
        <CardGridSkeleton rows={3} cols={3} />
      ) : (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {sortedHumans.map((human) => {
          const cleanSurname = normaliseSurname(human.surname);
          const fullName = human.fullName || `${human.name || ""} ${cleanSurname}`.trim();
          const humanDogs =
            dogsByHumanId?.[human.id] ||
            Object.values(dogs).filter(
              (dog) => dog._humanId === human.id || dog.humanId === fullName,
            );
          const visibleDogs = humanDogs.slice(0, 4);
          const overflow = humanDogs.length - visibleDogs.length;

          return (
            <div
              key={human.id}
              role="button"
              tabIndex={0}
              aria-label={`Open ${titleCase(fullName)}'s profile`}
              onClick={() => onOpenHuman(human.id || fullName)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onOpenHuman(human.id || fullName);
                }
              }}
              className="group relative bg-white rounded-xl border border-slate-200 overflow-hidden cursor-pointer transition-all shadow-[0_2px_8px_rgba(0,0,0,0.03)] hover:-translate-y-0.5 hover:border-brand-teal hover:shadow-[0_6px_16px_rgba(45,139,122,0.12)] h-[140px] flex flex-col focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow-dark"
            >
              {/* Trash icon removed in task 4 of the May 2026 review pass.
                  Delete now lives inside the human profile. */}
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

                {/* Phone — tel: lets desktop dial via FaceTime / Skype /
                    Android pair-up, and on mobile it triggers the dialer.
                    WhatsApp deep-link kept as a second icon button. */}
                {human.phone ? (
                  <div
                    className="flex items-center gap-2 leading-snug"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <a
                      href={telLink(human.phone)}
                      className="text-[13px] text-slate-500 font-semibold no-underline hover:text-brand-teal"
                    >
                      {human.phone}
                    </a>
                    <a
                      href={waLink(human.phone)}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Open in WhatsApp"
                      className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 rounded-md no-underline hover:bg-emerald-100"
                    >
                      WA
                    </a>
                  </div>
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
                            <SizeDot size={dogSize} dim={10} />
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

        {sortedHumans.length === 0 && !isSearching && !loadError && (
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
        {hasMore && !isSearching && !hasSearchQuery && (
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
        <AddHumanModal
          onClose={() => setShowAddModal(false)}
          onAdd={onAddHuman}
          dogs={dogs}
          humans={humans}
        />
      )}
    </div>
  );
}
