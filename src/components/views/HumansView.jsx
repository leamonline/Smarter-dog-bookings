import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { getSizeForBreed } from "../../constants/index";
import { MessageCircle } from "lucide-react";
import { IconSearch } from "../icons/index.jsx";
import { FloatingDecor } from "../decor/index.jsx";
import { AddHumanModal } from "../modals/AddHumanModal.jsx";
import { titleCase, normaliseSurname } from "../../utils/text";
import { filterHumansForDirectory } from "../../utils/directorySearch";
import { CardGridSkeleton, SkeletonBlock } from "../ui/Skeleton.jsx";
import { ErrorBanner } from "../ui/ErrorBanner.jsx";
import { SizeDot } from "../ui/SizeDot.jsx";
import { Button, EmptyState, SafetyAlertChip } from "../ui/index.js";
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
            className={`shrink-0 w-7 h-7 max-md:w-9 max-md:h-9 rounded-md text-micro font-bold flex items-center justify-center transition-colors ${
              active
                ? "bg-brand-yellow text-brand-purple"
                : enabled
                  ? "text-slate-600 hover:bg-brand-purple/10 hover:text-brand-purple cursor-pointer"
                  : "text-slate-400 cursor-default"
            }`}
          >
            {letter}
          </button>
        );
      })}
    </nav>
  );
}

function UnarchiveButton({ onUnarchive }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onUnarchive();
      }}
      title="Unarchive this person"
      className="absolute top-2 right-2 z-[1] text-[11px] font-bold text-brand-purple bg-brand-purple/10 border border-brand-purple/30 px-2 py-0.5 rounded-md cursor-pointer hover:bg-brand-purple/20 transition-colors"
    >
      Unarchive
    </button>
  );
}

function DogChips({ dogs: dogList, max, dim }) {
  const visible = dogList.slice(0, max);
  const overflow = dogList.length - visible.length;
  if (visible.length === 0) {
    return <span className="text-xs text-ink-muted italic">No dogs</span>;
  }
  return (
    <>
      {visible.map((dog) => {
        const dogSize = dog.size || getSizeForBreed(dog.breed);
        return (
          <span key={dog.id} className="flex items-center gap-1.5 shrink-0">
            <SizeDot size={dogSize} dim={dim} />
            <span className="text-xs font-semibold text-slate-600">
              {titleCase(dog.name)}
              {dog.breed && <span className="font-medium text-ink-muted"> ({titleCase(dog.breed)})</span>}
            </span>
          </span>
        );
      })}
      {overflow > 0 && (
        <span aria-label={`${overflow} more dog${overflow === 1 ? "" : "s"}`} className="text-caption font-semibold text-ink-muted shrink-0">+{overflow}</span>
      )}
    </>
  );
}

// Dog-size colour language, shared by the size dots and each card's top strip,
// so a card's accent and its dots say the same thing. The strip takes the
// human's *largest* dog size; neutral when there's no size to show.
const SIZE_RANK = { small: 1, medium: 2, large: 3 };
const STRIP_COLOUR = {
  small: "var(--color-size-small)",
  medium: "var(--color-brand-teal)",
  large: "var(--color-brand-coral)",
};

function dominantSize(dogList) {
  let best = null;
  let bestRank = 0;
  for (const dog of dogList) {
    const size = dog.size || getSizeForBreed(dog.breed);
    const rank = SIZE_RANK[size] || 0;
    if (rank > bestRank) {
      bestRank = rank;
      best = size;
    }
  }
  return best;
}

// Key for the size dots — reuses SizeDot so the legend can never drift from the
// real colours. Decorative for screen readers (each dog already carries its own
// size label via SizeDot on the cards).
function SizeLegend({ className = "" }) {
  const items = [
    ["small", "Small"],
    ["medium", "Medium"],
    ["large", "Large"],
    [null, "Unknown"],
  ];
  return (
    <div
      aria-hidden="true"
      className={`flex items-center gap-x-3 gap-y-1 flex-wrap text-micro text-ink-muted ${className}`}
    >
      <span className="font-bold uppercase tracking-wide">Size</span>
      {items.map(([size, label]) => (
        <span key={label} className="inline-flex items-center gap-1">
          <SizeDot size={size} dim={12} />
          {label}
        </span>
      ))}
    </div>
  );
}

// One directory entry, rendered as a grid card or a dense list row. Both
// reuse the same tel:/wa.me link pattern (stopPropagation so the links don't
// open the profile) and stay keyboard-openable (role=button + Enter/Space).
function DirectoryItem({ human, mode, dogs, dogsByHumanId, showArchived, onOpenHuman, onUnarchive }) {
  const cleanSurname = normaliseSurname(human.surname);
  const fullName = human.fullName || `${human.name || ""} ${cleanSurname}`.trim();
  const humanDogs =
    dogsByHumanId?.[human.id] ||
    Object.values(dogs).filter(
      (dog) => dog._humanId === human.id || dog.humanId === fullName,
    );
  const open = () => onOpenHuman(human.id || fullName);
  const onKeyDown = (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      open();
    }
  };

  if (mode === "list") {
    return (
      <div
        role="button"
        tabIndex={0}
        aria-label={`Open ${titleCase(fullName)}'s profile`}
        onClick={open}
        onKeyDown={onKeyDown}
        className="group relative flex items-center gap-3 bg-white rounded-lg border border-slate-200 px-3 py-2 cursor-pointer transition-colors hover:border-brand-purple focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow-dark"
      >
        <div className="min-w-0 flex-1 sm:flex-none sm:max-w-[28rem]">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-bold text-slate-800 truncate">{titleCase(fullName)}</span>
            {human.historyFlag && <SafetyAlertChip items={[human.historyFlag]} className="shrink-0 max-w-[45%]" />}
          </div>
          <div
            className="flex items-center gap-2.5 text-micro text-slate-500 mt-0.5 min-w-0"
            onClick={(e) => e.stopPropagation()}
          >
            {human.phone ? (
              <>
                <a href={telLink(human.phone)} className="font-medium no-underline hover:text-brand-purple shrink-0 inline-block max-sm:py-1.5 max-sm:-my-1.5">
                  {human.phone}
                </a>
                <a
                  href={waLink(human.phone)}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Open in WhatsApp"
                  aria-label="Open in WhatsApp"
                  className="inline-flex items-center justify-center w-10 h-10 max-sm:w-11 max-sm:h-11 rounded-full text-emerald-600 bg-emerald-50 border border-emerald-200 no-underline hover:bg-emerald-100 shrink-0"
                >
                  <MessageCircle size={18} aria-hidden="true" />
                </a>
              </>
            ) : (
              <span className="italic text-ink-muted shrink-0">No phone</span>
            )}
            {human.email && <span className="truncate text-slate-400">· {human.email}</span>}
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-2 shrink-0 overflow-hidden">
          <DogChips dogs={humanDogs} max={3} dim={14} />
        </div>
        <div className="hidden sm:block flex-1" aria-hidden="true" />
        {showArchived && <UnarchiveButton onUnarchive={() => onUnarchive(human.id)} />}
      </div>
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Open ${titleCase(fullName)}'s profile`}
      onClick={open}
      onKeyDown={onKeyDown}
      className="group relative bg-white rounded-xl border border-slate-200 overflow-hidden cursor-pointer motion-safe:transition-all shadow-card-resting hover:-translate-y-0.5 hover:border-brand-purple hover:shadow-card-hover min-h-[112px] flex flex-col focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow-dark"
    >
      <div
        className="h-[3px] shrink-0"
        style={{ background: STRIP_COLOUR[dominantSize(humanDogs)] || "var(--color-slate-200)" }}
      />
      {showArchived && <UnarchiveButton onUnarchive={() => onUnarchive(human.id)} />}

      <div className="p-3.5 px-4 flex flex-col flex-1 min-h-0 gap-0.5">
        <div className="text-title font-extrabold text-slate-800 truncate">
          {titleCase(fullName)}
        </div>

        {human.phone ? (
          <div className="flex items-center gap-2.5 leading-snug" onClick={(e) => e.stopPropagation()}>
            <a href={telLink(human.phone)} className="text-body text-slate-500 font-medium no-underline hover:text-brand-purple truncate inline-block max-sm:py-1.5 max-sm:-my-1.5">
              {human.phone}
            </a>
            <a
              href={waLink(human.phone)}
              target="_blank"
              rel="noopener noreferrer"
              title="Open in WhatsApp"
              aria-label="Open in WhatsApp"
              className="inline-flex items-center justify-center w-10 h-10 max-sm:w-11 max-sm:h-11 rounded-full text-emerald-600 bg-emerald-50 border border-emerald-200 no-underline hover:bg-emerald-100 shrink-0"
            >
              <MessageCircle size={18} aria-hidden="true" />
            </a>
          </div>
        ) : (
          <div className="text-body text-ink-muted italic leading-snug">No phone</div>
        )}

        {human.email && (
          <div className="text-micro text-slate-400 truncate leading-snug" onClick={(e) => e.stopPropagation()}>
            <a href={`mailto:${human.email}`} className="no-underline hover:text-brand-purple">
              {human.email}
            </a>
          </div>
        )}

        {human.historyFlag && <SafetyAlertChip items={[human.historyFlag]} className="mt-1 self-start" />}

        {humanDogs.length === 0 && !showArchived ? (
          // Data-hygiene nudge: a one-off enquiry with no dog on file. Opens
          // the profile, where a dog can be added.
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              open();
            }}
            className="mt-1 self-start text-xs font-semibold italic text-brand-coral-text bg-transparent border-none p-0 cursor-pointer hover:text-brand-coral-text hover:underline underline-offset-2"
          >
            No dogs registered — add one
          </button>
        ) : (
          <div className="mt-1 flex items-center gap-2.5 flex-wrap overflow-hidden max-h-[26px]">
            <DogChips dogs={humanDogs} max={4} dim={16} />
          </div>
        )}
      </div>
    </div>
  );
}

const FILTER_CHIPS = [
  // New self-signups awaiting staff approval (approved_at NULL +
  // signup_submitted_at set). Surfaced first so it's easy to find.
  { key: "newCustomers", label: "New customers" },
  { key: "flagged", label: "Flagged" },
  { key: "noDogs", label: "No dogs" },
  { key: "noPhone", label: "No phone" },
  { key: "whatsapp", label: "WhatsApp" },
];

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
  filters = null,
  onToggleFilter,
}) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [archivedList, setArchivedList] = useState(null);
  const [archivedError, setArchivedError] = useState(null);
  const [viewMode, setViewModeState] = useState(() =>
    typeof localStorage !== "undefined" && localStorage.getItem("humansViewMode") === "list"
      ? "list"
      : "grid",
  );
  const setViewMode = useCallback((mode) => {
    setViewModeState(mode);
    try {
      localStorage.setItem("humansViewMode", mode);
    } catch {
      /* localStorage unavailable — non-fatal */
    }
  }, []);

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

  // Load the archived set the first time the toggle is switched on. On failure
  // we stash an error (instead of spinning on "Loading archived…" forever);
  // clearing it via the retry button re-runs this effect.
  useEffect(() => {
    if (!showArchived || archivedList !== null || archivedError || !fetchArchivedHumans) return;
    let cancelled = false;
    fetchArchivedHumans()
      .then((rows) => {
        if (!cancelled) setArchivedList(rows || []);
      })
      .catch(() => {
        if (!cancelled) setArchivedError("Couldn't load archived humans.");
      });
    return () => {
      cancelled = true;
    };
  }, [showArchived, archivedList, archivedError, fetchArchivedHumans]);

  const retryArchived = useCallback(() => setArchivedError(null), []);

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

  const activeFilters = FILTER_CHIPS.filter((c) => filters?.[c.key]).map((c) => c.label);
  const hasFilters = activeFilters.length > 0;
  const narrowed = hasSearchQuery || hasFilters || Boolean(activeLetter); // showing a subset, not the full list
  const filterSuffix = hasFilters ? ` · ${activeFilters.join(", ")}` : "";

  const headerCountText = showArchived
    ? `${archivedCount} archived`
    : narrowed
      ? `${total} matching human${total !== 1 ? "s" : ""}`
      : `${total} human${total !== 1 ? "s" : ""} registered`;
  const footerText = showArchived
    ? `${archivedCount} archived human${archivedCount !== 1 ? "s" : ""}`
    : hasSearchQuery
      ? `Showing ${loadedCount} of ${total} match${total !== 1 ? "es" : ""} for "${searchQuery.trim()}"${filterSuffix}`
      : `Showing ${loadedCount} of ${total} human${total !== 1 ? "s" : ""}${filterSuffix}`;

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
    <div className="relative animate-[fadeIn_0.2s_ease-in]">
      {/* Colourful dog-silhouette backdrop — same brand decor the dashboard
          uses (sits -z-10, shows through the gaps around cards). */}
      <FloatingDecor />
      {/* Header banner */}
      <div className="bg-gradient-to-br from-brand-purple to-brand-purple-light py-4 px-5 md:px-7 rounded-xl relative overflow-hidden mb-5">
        <svg className="absolute right-6 top-1 w-20 h-20 opacity-[0.06] -rotate-[15deg] pointer-events-none select-none" viewBox="0 0 24 24" fill="white"><ellipse cx="8" cy="6" rx="2.5" ry="3" /><ellipse cx="16" cy="6" rx="2.5" ry="3" /><ellipse cx="4.5" cy="12" rx="2" ry="2.5" /><ellipse cx="19.5" cy="12" rx="2" ry="2.5" /><ellipse cx="12" cy="16.5" rx="5" ry="4" /></svg>
        <div className="relative z-[1] flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-2xl md:text-display font-black text-white font-display">Humans Directory</div>
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
            <Button variant="primary" onClick={() => setShowAddModal(true)}>
              + Add Human
            </Button>
          </div>
        </div>
      </div>

      {/* Toolbar: filters + sort + view unified into one control row, with a
          size key beneath so the dot/strip colours read as dog size. */}
      <div className="mb-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          {showRailAndSort && onToggleFilter && (
            <>
              <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filters">
                {FILTER_CHIPS.map(({ key, label }) => {
                  const active = !!filters?.[key];
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => onToggleFilter(key)}
                      aria-pressed={active}
                      className={`text-micro font-bold px-3 py-1 rounded-full border transition-colors ${
                        active
                          ? "bg-brand-yellow text-brand-purple border-brand-yellow"
                          : "bg-white text-slate-500 border-slate-200 hover:border-brand-purple hover:text-brand-purple"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <span className="hidden sm:block h-5 w-px bg-slate-200" aria-hidden="true" />
            </>
          )}

          {showRailAndSort && (
            <div className="inline-flex items-center gap-2">
              <span className="text-label text-ink-muted">Sort</span>
              <div className="inline-flex rounded-control border border-slate-200 bg-white p-0.5">
                {[["first", "First name"], ["last", "Surname"]].map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => onSortModeChange?.(mode)}
                    aria-pressed={sortMode === mode}
                    className={`px-2.5 py-1 max-sm:px-3 max-sm:py-2 rounded-[6px] text-micro font-bold transition-colors ${
                      sortMode === mode
                        ? "bg-brand-yellow text-brand-purple"
                        : "text-slate-500 hover:text-brand-purple"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* View switcher pushed right; leading divider when controls precede it. */}
          {showRailAndSort && (
            <span className="hidden sm:block h-5 w-px bg-slate-200 ml-auto" aria-hidden="true" />
          )}
          <div className={`inline-flex items-center gap-2 ${showRailAndSort ? "" : "ml-auto"}`}>
            <span className="text-label text-ink-muted">View</span>
            <div className="inline-flex rounded-control border border-slate-200 bg-white p-0.5">
              {[["grid", "Grid"], ["list", "List"]].map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setViewMode(mode)}
                  aria-pressed={viewMode === mode}
                  className={`px-2.5 py-1 max-sm:px-3 max-sm:py-2 rounded-[6px] text-micro font-bold transition-colors ${
                    viewMode === mode
                      ? "bg-brand-yellow text-brand-purple"
                      : "text-slate-500 hover:text-brand-purple"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {displayList.length > 0 && <SizeLegend className="mt-2.5" />}
      </div>

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
          ) : showArchived && archivedList === null && archivedError ? (
            <ErrorBanner
              title="Couldn't load archived humans"
              message="Check your connection and try again."
              retry={retryArchived}
              retryLabel="Try again"
            />
          ) : showArchived && archivedList === null ? (
            <div className="py-12 text-center text-body text-slate-500 italic">
              Loading archived…
            </div>
          ) : (
            <div
              className={
                viewMode === "list"
                  ? "flex flex-col gap-1.5"
                  : "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-start"
              }
            >
              {displayList.map((human) => (
                <DirectoryItem
                  key={human.id}
                  human={human}
                  mode={viewMode}
                  dogs={dogs}
                  dogsByHumanId={dogsByHumanId}
                  showArchived={showArchived}
                  onOpenHuman={onOpenHuman}
                  onUnarchive={handleUnarchive}
                />
              ))}

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
                    action={
                      searchQuery ? (
                        <Button variant="ghost" onClick={() => onSearch("")}>
                          Clear search
                        </Button>
                      ) : null
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
            className="hidden md:flex md:flex-col gap-0.5 sticky top-24 self-start shrink-0 bg-white/80 backdrop-blur-sm rounded-full border border-slate-200 shadow-sm px-0.5 py-1.5"
          />
        )}
      </div>

      {/* Footer */}
      <div className="mt-5 flex items-center justify-between flex-wrap gap-2.5">
        <div role="status" aria-live="polite" className="text-body text-slate-500">
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
              className="text-body font-semibold text-slate-500 hover:text-brand-purple bg-transparent border-none cursor-pointer font-inherit underline-offset-2 hover:underline"
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
