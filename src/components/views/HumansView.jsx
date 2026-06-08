import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { getSizeForBreed } from "../../constants/index.js";
import { IconSearch } from "../icons/index.jsx";
import { AddHumanModal } from "../modals/AddHumanModal.jsx";
import { titleCase, normaliseSurname } from "../../utils/text.js";
import { filterHumansForDirectory } from "../../utils/directorySearch.js";
import { CardGridSkeleton, SkeletonBlock } from "../ui/Skeleton.jsx";
import { ErrorBanner } from "../ui/ErrorBanner.jsx";
import { SizeDot } from "../ui/SizeDot.jsx";
import { Button, EmptyState } from "../ui/index.js";
import { telLink, waLink } from "../modals/dog-card/helpers.js";

const AZ_LETTERS = [
  "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M",
  "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z", "#",
];

// A–Z jump rail. Letters with no matches under the current query are
// disabled. The same component renders as a vertical sticky rail on desktop
// and a horizontal scroll strip on mobile (caller sets the layout classes).
function AlphabetRail({ availableLetters, activeLetter, onLetterChange, className = "" }) {
  const have = useMemo(() => new Set(availableLetters || []), [availableLetters]);
  return (
    <nav aria-label="Jump to letter" className={className}>
      {AZ_LETTERS.map((letter) => {
        const enabled = have.has(letter) || activeLetter === letter;
        const active = activeLetter === letter;
        return (
          <button
            key={letter}
            type="button"
            onClick={() => onLetterChange(letter)}
            disabled={!enabled}
            aria-pressed={active}
            aria-label={`Jump to ${letter === "#" ? "non-letter names" : `the letter ${letter}`}`}
            className={`shrink-0 w-6 h-6 rounded-md text-micro font-bold flex items-center justify-center transition-colors ${
              active
                ? "bg-brand-teal text-white"
                : enabled
                  ? "text-slate-500 hover:bg-brand-teal/10 hover:text-brand-teal cursor-pointer"
                  : "text-slate-300 cursor-default"
            }`}
          >
            {letter}
          </button>
        );
      })}
    </nav>
  );
}

export function HumansView({
  humans,
  dogs,
  dogsByHumanId,
  ensureDogsForHumans,
  onOpenHuman,
  onAddHuman,
  onUpdateHuman,
  fetchArchivedHumans,
  findHumanByFullName,
  hasMore,
  totalCount,
  loadMore,
  onSearch,
  searchQuery,
  isSearching,
  isInitialLoading = false,
  isOnline = true,
  loadError = null,
  // Server-driven directory (null when offline → client fallback below)
  directoryHumans = null,
  availableLetters = [],
  sortMode = "first",
  onSortModeChange,
  activeLetter = null,
  onLetterChange,
}) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [archivedList, setArchivedList] = useState(null);

  // When offline the directory RPC can't run, so fall back to filtering the
  // cached humans map on the client (the historical behaviour).
  const online = directoryHumans != null && isOnline;
  const hasSearchQuery = Boolean(searchQuery?.trim());

  const offlineList = useMemo(() => {
    const base = hasSearchQuery
      ? filterHumansForDirectory(humans, dogs, dogsByHumanId, searchQuery)
      : Object.values(humans);
    return base
      .filter((h) => !h.archivedAt)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [dogs, dogsByHumanId, hasSearchQuery, humans, searchQuery]);

  // Load the archived set the first time the toggle is switched on.
  useEffect(() => {
    if (!showArchived || archivedList !== null || !fetchArchivedHumans) return;
    let cancelled = false;
    fetchArchivedHumans().then((rows) => {
      if (!cancelled) setArchivedList(rows || []);
    });
    return () => {
      cancelled = true;
    };
  }, [showArchived, archivedList, fetchArchivedHumans]);

  const handleUnarchive = async (humanId) => {
    if (!onUpdateHuman) return;
    await onUpdateHuman(humanId, { archivedAt: null });
    setArchivedList((prev) => (prev || []).filter((h) => h.id !== humanId));
  };

  const displayList = useMemo(() => {
    if (showArchived) return archivedList || [];
    return online ? directoryHumans : offlineList;
  }, [showArchived, archivedList, online, directoryHumans, offlineList]);

  const loadedCount = displayList.length;
  const archivedCount = (archivedList || []).length;
  const total = showArchived
    ? archivedCount
    : online
      ? totalCount
      : offlineList.length;

  const headerCountText = showArchived
    ? `${archivedCount} archived`
    : hasSearchQuery
      ? `${total} matching human${total !== 1 ? "s" : ""}`
      : `${total} human${total !== 1 ? "s" : ""} registered`;
  const footerText = showArchived
    ? `${archivedCount} archived human${archivedCount !== 1 ? "s" : ""}`
    : hasSearchQuery
      ? `Showing ${loadedCount} of ${total} match${total !== 1 ? "es" : ""} for "${searchQuery.trim()}"`
      : `Showing ${loadedCount} of ${total} human${total !== 1 ? "s" : ""}`;

  const visibleHumanIdsKey = useMemo(
    () => displayList.map((h) => h.id).filter(Boolean).join(","),
    [displayList],
  );

  useEffect(() => {
    if (!ensureDogsForHumans || !visibleHumanIdsKey) return;
    ensureDogsForHumans(visibleHumanIdsKey.split(","));
  }, [ensureDogsForHumans, visibleHumanIdsKey]);

  // Infinite scroll. A sentinel below the grid triggers loadMore when it
  // scrolls into view; the "Load more" button stays as the fallback for
  // no-JS and reduced-motion users.
  const canPage = hasMore && !showArchived && online;
  const handleLoadMore = useCallback(async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    await loadMore();
    setLoadingMore(false);
  }, [loadingMore, loadMore]);

  const [autoLoad, setAutoLoad] = useState(false);
  useEffect(() => {
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    setAutoLoad(
      !reduced && typeof window !== "undefined" && "IntersectionObserver" in window,
    );
  }, []);

  const sentinelRef = useRef(null);
  useEffect(() => {
    const node = sentinelRef.current;
    if (!autoLoad || !node || !canPage) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) handleLoadMore();
      },
      { rootMargin: "300px" },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [autoLoad, canPage, handleLoadMore]);

  const showRailAndSort = online && !showArchived;

  return (
    <div className="animate-[fadeIn_0.2s_ease-in]">
      {/* Header banner */}
      <div className="bg-gradient-to-br from-brand-cyan-light to-brand-cyan-dark py-5 px-5 md:px-7 rounded-xl relative overflow-hidden mb-5">
        <svg className="absolute right-6 top-1 w-20 h-20 opacity-[0.06] -rotate-[15deg] pointer-events-none select-none" viewBox="0 0 24 24" fill="white"><ellipse cx="8" cy="6" rx="2.5" ry="3" /><ellipse cx="16" cy="6" rx="2.5" ry="3" /><ellipse cx="4.5" cy="12" rx="2" ry="2.5" /><ellipse cx="19.5" cy="12" rx="2" ry="2.5" /><ellipse cx="12" cy="16.5" rx="5" ry="4" /></svg>
        <div className="relative z-[1] flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xl md:text-2xl font-black text-white font-display">Humans Directory</div>
            <div className="text-sm font-semibold text-white/70 mt-0.5 min-h-[1.25rem]">
              {isInitialLoading && displayList.length === 0 ? (
                <SkeletonBlock className="h-4 w-32 bg-white/20" />
              ) : (
                headerCountText
              )}
            </div>
          </div>
          <div className="flex gap-2.5 items-center flex-1 max-w-[420px]">
            <div className="relative flex-1">
              <div className="absolute left-3.5 top-1/2 -translate-y-1/2 flex">
                <IconSearch size={16} colour="rgba(255,255,255,0.85)" />
              </div>
              <input
                type="text"
                placeholder="Search rolodex..."
                value={searchQuery}
                onChange={(e) => onSearch(e.target.value)}
                className="w-full py-2.5 pl-10 pr-3.5 rounded-control border border-white/40 bg-white/25 text-sm font-inherit outline-none text-white placeholder:text-white/85 transition-colors focus:bg-white/35 focus:border-white/60"
              />
            </div>
            <button
              onClick={() => setShowAddModal(true)}
              className="bg-white text-brand-cyan border-none rounded-control px-4 py-2.5 text-[13px] font-bold cursor-pointer font-inherit whitespace-nowrap transition-all hover:bg-white/90 shadow-[0_2px_8px_rgba(0,0,0,0.1)]"
            >
              + Add Human
            </button>
          </div>
        </div>
      </div>

      {/* Toolbar: sort toggle (+ view toggle / filter chips land here too) */}
      {showRailAndSort && (
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <div className="inline-flex items-center gap-2">
            <span className="text-micro font-bold uppercase tracking-wide text-slate-400">Sort</span>
            <div className="inline-flex rounded-control border border-slate-200 bg-white p-0.5">
              {[["first", "First name"], ["last", "Surname"]].map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => onSortModeChange?.(mode)}
                  aria-pressed={sortMode === mode}
                  className={`px-2.5 py-1 rounded-[6px] text-micro font-bold transition-colors ${
                    sortMode === mode
                      ? "bg-brand-teal text-white"
                      : "text-slate-500 hover:text-brand-teal"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Mobile A–Z strip */}
      {showRailAndSort && (
        <AlphabetRail
          availableLetters={availableLetters}
          activeLetter={activeLetter}
          onLetterChange={onLetterChange}
          className="md:hidden flex gap-0.5 overflow-x-auto pb-2 mb-3 -mx-1 px-1"
        />
      )}

      {/* Surface the fetch error inline when the directory ended up empty. */}
      {loadError && displayList.length === 0 && !isInitialLoading && (
        <ErrorBanner
          title="Couldn't load the humans directory"
          message="Check your connection and try again."
          retry={() => window.location.reload()}
          retryLabel="Refresh"
        />
      )}

      <div className="flex gap-3 items-start">
        <div className="flex-1 min-w-0">
          {/* Card grid — skeleton during the initial fetch. */}
          {!showArchived && isInitialLoading && displayList.length === 0 ? (
            <CardGridSkeleton rows={3} cols={3} />
          ) : showArchived && archivedList === null ? (
            <div className="py-12 text-center text-body text-slate-500 italic">
              Loading archived…
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {displayList.map((human) => {
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
                    className="group relative bg-white rounded-xl border border-slate-200 overflow-hidden cursor-pointer motion-safe:transition-all shadow-card-resting hover:-translate-y-0.5 hover:border-brand-teal hover:shadow-card-hover h-[140px] flex flex-col focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow-dark"
                  >
                    {/* Trash icon removed in task 4 of the May 2026 review pass.
                        Delete now lives inside the human profile. */}
                    <div className="h-[3px] bg-gradient-to-r from-brand-teal to-brand-teal-light shrink-0" />

                    {showArchived && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleUnarchive(human.id);
                        }}
                        title="Unarchive this person"
                        className="absolute top-2 right-2 z-[1] text-[11px] font-bold text-brand-teal-text bg-brand-teal/10 border border-brand-teal/30 px-2 py-0.5 rounded-md cursor-pointer hover:bg-brand-teal/20 transition-colors"
                      >
                        Unarchive
                      </button>
                    )}

                    <div className="p-3.5 px-4 flex flex-col flex-1 min-h-0">
                      {/* Name + flag */}
                      <div className="flex justify-between items-start gap-2">
                        <div className="text-title font-extrabold text-slate-800 truncate">
                          {titleCase(fullName)}
                        </div>
                        {human.historyFlag && (
                          <span title={human.historyFlag} className="text-sm shrink-0">{"⚠️"}</span>
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
                            className="text-body text-slate-500 font-semibold no-underline hover:text-brand-teal"
                          >
                            {human.phone}
                          </a>
                          <a
                            href={waLink(human.phone)}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Open in WhatsApp"
                            className="text-micro font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 rounded-md no-underline hover:bg-emerald-100"
                          >
                            WA
                          </a>
                        </div>
                      ) : (
                        <div className="text-body text-ink-muted italic leading-snug">No phone</div>
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
                                  <span className="text-xs font-semibold text-slate-600">
                                    {titleCase(dog.name)}
                                    {dog.breed && <span className="font-medium text-ink-muted"> ({titleCase(dog.breed)})</span>}
                                  </span>
                                </span>
                              );
                            })}
                            {overflow > 0 && (
                              <span className="text-caption font-semibold text-ink-muted shrink-0">+{overflow}</span>
                            )}
                          </>
                        ) : (
                          <span className="text-xs text-ink-muted italic">No dogs</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              {displayList.length === 0 && !isSearching && !loadError && (
                <div className="col-span-full">
                  <EmptyState
                    icon={showArchived ? "🗄️" : "🔍"}
                    title={
                      showArchived
                        ? "No archived humans."
                        : searchQuery
                          ? `No humans found matching "${searchQuery}"`
                          : "No humans yet."
                    }
                    description={
                      !showArchived && searchQuery
                        ? "Try searching by phone number or dog breed instead."
                        : null
                    }
                  />
                </div>
              )}
            </div>
          )}

          {/* Infinite-scroll sentinel — observed when paging is possible. */}
          {canPage && <div ref={sentinelRef} aria-hidden="true" className="h-1" />}
        </div>

        {/* Desktop A–Z rail — sticky on the right edge. */}
        {showRailAndSort && (
          <AlphabetRail
            availableLetters={availableLetters}
            activeLetter={activeLetter}
            onLetterChange={onLetterChange}
            className="hidden md:flex md:flex-col gap-0.5 sticky top-24 self-start shrink-0"
          />
        )}
      </div>

      {/* Footer */}
      <div className="mt-5 flex items-center justify-between flex-wrap gap-2.5">
        <div className="text-body text-slate-500">
          {isSearching ? (
            <span className="italic">Searching...</span>
          ) : (
            <span>{footerText}</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {fetchArchivedHumans && !hasSearchQuery && (
            <button
              type="button"
              onClick={() => setShowArchived((v) => !v)}
              className="text-body font-semibold text-slate-500 hover:text-brand-teal bg-transparent border-none cursor-pointer font-inherit underline-offset-2 hover:underline"
            >
              {showArchived ? "← Back to active" : "Show archived"}
            </button>
          )}
          {canPage && (
            <Button
              variant="ghost"
              loading={loadingMore}
              onClick={handleLoadMore}
            >
              Load more
            </Button>
          )}
        </div>
      </div>

      {showAddModal && (
        <AddHumanModal
          onClose={() => setShowAddModal(false)}
          onAdd={onAddHuman}
          dogs={dogs}
          humans={humans}
          findHumanByFullName={findHumanByFullName}
        />
      )}
    </div>
  );
}
