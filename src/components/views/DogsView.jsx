import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { MessageCircle, Plus } from "lucide-react";
import { FloatingDecor } from "../decor/index.jsx";
import { AddDogModal } from "../modals/AddDogModal.jsx";
import { useToast } from "../../contexts/ToastContext.jsx";
import { titleCase } from "../../utils/text";
import { formatOwnerLabel } from "../../utils/formatOwnerLabel.js";
import { filterDogsForDirectory } from "../../utils/directorySearch";
import { safeGet, safeSet } from "../../lib/storage";
import { CardGridSkeleton, SkeletonBlock } from "../ui/Skeleton.jsx";
import { ErrorBanner } from "../ui/ErrorBanner.jsx";
import { SizeDot } from "../ui/SizeDot.jsx";
import {
  Badge,
  Button,
  EmptyState,
  PageHeader,
  PageHeaderAction,
  PageHeaderPill,
  PageHeaderSearch,
  PageHeaderSegmented,
  SafetyAlertChip,
} from "../ui/index.js";
import { telLink, waLink } from "../modals/dog-card/helpers.js";
import { DogSizeMark, ProfileArrow } from "./directory/IdentityMarker.jsx";
import { DirectoryHeaderKey } from "./directory/DirectoryHeaderKey.jsx";
import { useSalon } from "../../contexts/SalonContext";

const AZ_LETTERS = [
  "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M",
  "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z", "#",
];

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

// A–Z jump rail. Letters with no matches under the current query are disabled.
// The same component renders as a vertical sticky rail on desktop and a
// horizontal scroll strip on mobile (caller sets the layout classes).
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

function UnarchiveButton({ onUnarchive, inline = false }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onUnarchive();
      }}
      title="Unarchive this dog"
      className={inline
        ? "min-h-11 min-w-11 px-3 py-2 rounded-full text-xs font-bold text-brand-purple bg-white border border-brand-purple/30 cursor-pointer hover:bg-brand-purple/10 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow-dark"
        : "absolute top-2 right-2 z-[1] min-h-11 min-w-11 text-[11px] font-bold text-brand-purple bg-brand-purple/10 border border-brand-purple/30 px-2 py-0.5 rounded-md cursor-pointer hover:bg-brand-purple/20 transition-colors"}
    >
      Unarchive
    </button>
  );
}

// Resolve an owner for display. Directory entries from the RPC carry server-
// resolved owner fields (ownerFullName/ownerPhone); the offline fallback
// resolves against the loaded humans map via formatOwnerLabel.
function resolveOwner(dog, humans) {
  if (dog.ownerFullName !== undefined) {
    const name = (dog.ownerFullName || "").trim();
    return { label: name || "Unknown owner", phone: dog.ownerPhone || "", missing: !name, server: true };
  }
  const fb = formatOwnerLabel(dog, humans);
  return { label: fb.label, phone: fb.phone, missing: fb.missing, server: false };
}

// Owner phone + WhatsApp links mirror the contact links on the Humans cards.
function OwnerContact({ phone, className = "" }) {
  if (!phone) return null;
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <a href={telLink(phone)} className="inline-flex min-h-11 min-w-11 items-center truncate font-medium no-underline hover:text-brand-purple">
        {phone}
      </a>
      <a
        href={waLink(phone)}
        target="_blank"
        rel="noopener noreferrer"
        title="Open in WhatsApp"
        aria-label="Open in WhatsApp"
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 text-emerald-600 no-underline hover:bg-emerald-100"
      >
        <MessageCircle size={18} aria-hidden="true" />
      </a>
    </span>
  );
}

function OwnerLine({ owner, skeleton }) {
  return (
    <div
      data-testid="dog-card-contact"
      className="mt-auto flex min-h-11 w-full min-w-0 items-center gap-2 border-t border-slate-100 pt-2 text-xs font-semibold text-ink-muted"
    >
      {skeleton ? (
        <SkeletonBlock className="h-3 w-24" />
      ) : owner.missing ? (
        <span className="truncate italic">{owner.label}</span>
      ) : (
        <>
          <span className="min-w-0 flex-1 truncate">{titleCase(owner.label)}</span>
          <OwnerContact phone={owner.phone} className="ml-auto" />
        </>
      )}
    </div>
  );
}

// One directory entry, rendered as a grid card or a dense list row. Owner
// contacts and the profile action remain separate, explicit controls.
function DirectoryItem({ dog, mode, humans, showArchived, onOpenDog, onUnarchive }) {
  const owner = resolveOwner(dog, humans);
  const ownerSkeleton = owner.missing && !owner.server && Object.keys(humans || {}).length === 0;
  // Incomplete = missing size or blank breed (matches the RPC's incomplete
  // filter). We deliberately don't flag "owner not in the humans map" here: a
  // dog always has a NOT NULL owner FK and directory entries resolve the owner
  // via the server join, so the old humans-map check was a pagination false
  // positive (the very thing the server query fixes).
  const incomplete = !dog.size || !(dog.breed && dog.breed.trim());
  const age = computeAge(dog);
  const open = () => onOpenDog(dog.id || dog.name);

  const gridCardClass =
    "group relative flex min-h-[154px] flex-col items-start gap-2 rounded-xl border border-brand-paper-line bg-white p-4 shadow-card-resting transition-colors hover:border-brand-purple/30 hover:shadow-card-hover";
  const listCardClass =
    "group relative flex flex-col items-start gap-2 rounded-xl border border-brand-paper-line bg-white px-4 py-3 transition-colors hover:border-brand-purple/30";

  return (
    <article
      aria-label={titleCase(dog.name)}
      className={mode === "list" ? listCardClass : gridCardClass}
    >
      <div data-testid="dog-card-primary" className="flex w-full min-w-0 items-start gap-3">
        <DogSizeMark size={dog.size} decorative />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-title font-extrabold text-brand-purple">
              {titleCase(dog.name)}
            </span>
            {incomplete && (
              <Badge tone="warning" size="xs" uppercase title="Missing size, breed or owner">
                Incomplete
              </Badge>
            )}
          </div>

          <p className="truncate text-body font-semibold text-slate-600">
            {titleCase(dog.breed) || <span className="italic text-ink-muted">No breed</span>}{age ? ` · ${age}` : ""}
          </p>
          <p className="mt-1 inline-flex items-center gap-1.5 text-caption font-semibold text-ink-muted">
            <SizeDot size={dog.size} dim={16} />
            <span data-testid="dog-size-label">
              {dog.size ? titleCase(dog.size) : "Size unknown"}
            </span>
          </p>
          {dog.alerts?.length > 0 && (
            <SafetyAlertChip items={dog.alerts} className="mt-1 min-h-11 min-w-11 max-w-full" />
          )}
        </div>
        <ProfileArrow label={`View profile for ${titleCase(dog.name)}`} onClick={open} visibleLabel />
      </div>
      <OwnerLine owner={owner} skeleton={ownerSkeleton} />
      {showArchived && (
        <div data-testid="dog-card-secondary-actions" className="flex w-full justify-end">
          <UnarchiveButton inline onUnarchive={() => onUnarchive(dog.id)} />
        </div>
      )}
    </article>
  );
}

const SIZE_FILTERS = [
  { value: "small", label: "Small" },
  { value: "medium", label: "Medium" },
  { value: "large", label: "Large" },
  { value: "unset", label: "Unset" },
];

const VIEW_OPTIONS = [
  { value: "grid", label: "Grid" },
  { value: "list", label: "List" },
];

export function DogsView({
  hasMore,
  totalCount,
  loadMore,
  onSearch,
  searchQuery,
  isSearching,
  isInitialLoading = false,
  loadError = null,
  // Server-driven directory (null when offline → client fallback below)
  directoryDogs = null,
  availableLetters = [],
  sortMode = "name",
  onSortModeChange,
  filters = null,
  onToggleFilter,
  activeLetter = null,
  onLetterChange,
  fetchArchivedDogs,
  onUpdateDog,
}) {
  // Shared salon data + actions come from SalonContext (Debt 11). onUpdateDog
  // stays a prop: the directory edits through the raw Supabase updater.
  const { dogs, humans, onOpenDog, onAddDog, onAddHuman, isOnline = true } = useSalon();
  const [showAddModal, setShowAddModal] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [archivedList, setArchivedList] = useState(null);
  const [viewMode, setViewModeState] = useState(() =>
    safeGet("local", "dogsViewMode") === "list" ? "list" : "grid",
  );
  const setViewMode = useCallback((mode) => {
    setViewModeState(mode);
    safeSet("local", "dogsViewMode", mode);
  }, []);
  useToast(); // wired for child modals; cards no longer surface toasts directly

  // When offline the directory RPC can't run, so fall back to filtering the
  // cached dogs map on the client (the historical behaviour).
  const online = directoryDogs != null && isOnline;
  const hasSearchQuery = Boolean(searchQuery?.trim());

  const offlineList = useMemo(() => {
    const base = hasSearchQuery
      ? filterDogsForDirectory(dogs, humans, searchQuery)
      : Object.values(dogs);
    return base
      .filter((dog) => {
        if (filters?.size) {
          const dogSize = dog.size || "unset";
          if (dogSize !== filters.size) return false;
        }
        if (filters?.alert && !(dog.alerts?.length)) return false;
        if (filters?.incomplete && !isIncompleteDogProfile(dog, humans)) return false;
        return true;
      })
      .filter((dog) => !dog.archivedAt)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [dogs, humans, hasSearchQuery, searchQuery, filters]);

  // Load the archived set the first time the toggle is switched on.
  useEffect(() => {
    if (!showArchived || archivedList !== null || !fetchArchivedDogs) return;
    let cancelled = false;
    fetchArchivedDogs().then((rows) => {
      if (!cancelled) setArchivedList(rows || []);
    });
    return () => {
      cancelled = true;
    };
  }, [showArchived, archivedList, fetchArchivedDogs]);

  const handleUnarchive = async (dogId) => {
    if (!onUpdateDog) return;
    await onUpdateDog(dogId, { archivedAt: null });
    setArchivedList((prev) => (prev || []).filter((d) => d.id !== dogId));
  };

  const displayList = useMemo(() => {
    if (showArchived) return archivedList || [];
    return online ? directoryDogs : offlineList;
  }, [showArchived, archivedList, online, directoryDogs, offlineList]);

  const loadedCount = displayList.length;
  const archivedCount = (archivedList || []).length;
  const total = showArchived
    ? archivedCount
    : online
      ? totalCount
      : offlineList.length;

  const FILTER_LABELS = {
    size: filters?.size ? titleCase(filters.size) : null,
    alert: filters?.alert ? "Has alert" : null,
    incomplete: filters?.incomplete ? "Incomplete" : null,
  };
  const activeFilters = Object.values(FILTER_LABELS).filter(Boolean);
  const hasFilters = activeFilters.length > 0;
  const narrowed = hasSearchQuery || hasFilters || Boolean(activeLetter);
  const filterSuffix = hasFilters ? ` · ${activeFilters.join(", ")}` : "";

  const headerCountText = showArchived
    ? `${archivedCount} archived`
    : narrowed
      ? `${total} matching dog${total !== 1 ? "s" : ""}`
      : `${total} dog${total !== 1 ? "s" : ""} registered`;
  const footerText = showArchived
    ? `${archivedCount} archived dog${archivedCount !== 1 ? "s" : ""}`
    : hasSearchQuery
      ? `Showing ${loadedCount} of ${total} match${total !== 1 ? "es" : ""} for "${searchQuery.trim()}"${filterSuffix}`
      : `Showing ${loadedCount} of ${total} dog${total !== 1 ? "s" : ""}${filterSuffix}`;

  // Infinite scroll. A sentinel below the grid triggers loadMore when it
  // scrolls into view; the "Load more" button stays as the fallback for no-JS
  // and reduced-motion users.
  const canPage = hasMore && !showArchived && online && !hasSearchQuery;
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
      {/* The shared toolbar carries the primary directory tasks. */}
      <section
        data-testid="dogs-directory-shell"
        aria-label="Dogs directory controls"
      >
        <PageHeader title="Dogs Directory">
          <PageHeaderSegmented
            value={viewMode}
            onChange={setViewMode}
            options={VIEW_OPTIONS}
            ariaLabel="Directory view"
          />
          <PageHeaderPill className="hidden lg:inline-flex">
            {isInitialLoading && displayList.length === 0 ? (
              <SkeletonBlock className="h-4 w-32 bg-brand-purple/10" />
            ) : (
              headerCountText
            )}
          </PageHeaderPill>
          <div className="hidden flex-1 md:block" />
          <PageHeaderSearch
            value={searchQuery}
            onChange={(event) => onSearch(event.target.value)}
            onClear={() => onSearch("")}
            ariaLabel="Search dogs by name, breed or owner"
            placeholder="Search by name, breed or owner..."
          />
          <DirectoryHeaderKey />
          <PageHeaderAction
            icon={Plus}
            onClick={() => setShowAddModal(true)}
            aria-label="Add dog"
          >
            Add dog
          </PageHeaderAction>
        </PageHeader>

        {showRailAndSort && (
        <div className="mb-4 rounded-xl border border-brand-paper-line bg-white px-5 py-3 md:px-6">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          {showRailAndSort && onToggleFilter && (
            <>
              <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter dogs">
                {SIZE_FILTERS.map((s) => {
                  const active = filters?.size === s.value;
                  return (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() => onToggleFilter("size", s.value)}
                      aria-pressed={active}
                      aria-label={s.label}
                      className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-caption font-bold transition-colors ${
                        active
                          ? "bg-brand-yellow text-brand-purple border-brand-yellow"
                          : "bg-white text-slate-500 border-slate-200 hover:border-brand-purple hover:text-brand-purple"
                      }`}
                    >
                      <SizeDot size={s.value === "unset" ? null : s.value} dim={12} />
                      {s.label}
                    </button>
                  );
                })}
                <span className="h-5 w-px bg-slate-200" aria-hidden="true" />
                <button
                  type="button"
                  onClick={() => onToggleFilter("alert")}
                  aria-pressed={!!filters?.alert}
                  className={`min-h-11 rounded-full border px-3 text-caption font-bold transition-colors ${
                    filters?.alert
                      ? "bg-brand-yellow text-brand-purple border-brand-yellow"
                      : "bg-white text-slate-500 border-slate-200 hover:border-brand-purple hover:text-brand-purple"
                  }`}
                >
                  Has alert
                </button>
                <button
                  type="button"
                  onClick={() => onToggleFilter("incomplete")}
                  aria-pressed={!!filters?.incomplete}
                  className={`min-h-11 rounded-full border px-3 text-caption font-bold transition-colors ${
                    filters?.incomplete
                      ? "bg-brand-yellow text-brand-purple border-brand-yellow"
                      : "bg-white text-slate-500 border-slate-200 hover:border-brand-purple hover:text-brand-purple"
                  }`}
                >
                  Incomplete profile
                </button>
              </div>
              <span className="hidden sm:block h-5 w-px bg-slate-200" aria-hidden="true" />
            </>
          )}

          {showRailAndSort && (
            <div className="inline-flex items-center gap-2" role="group" aria-label="Sort dogs">
              <span className="text-label text-ink-muted">Sort</span>
              <div className="inline-flex rounded-control border border-slate-200 bg-white p-0.5">
                {[["name", "Name"], ["recent", "Recently added"]].map(([mode, label]) => (
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

          </div>
        </div>
        )}
      </section>

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
          title="Couldn't load the dogs directory"
          message="Check your connection, then try again"
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
              Loading archived dogs…
            </div>
          ) : (
            <div
              className={
                viewMode === "list"
                  ? "flex flex-col gap-1.5"
                  : "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-start"
              }
            >
              {displayList.map((dog) => (
                <DirectoryItem
                  key={dog.id}
                  dog={dog}
                  mode={viewMode}
                  humans={humans}
                  showArchived={showArchived}
                  onOpenDog={onOpenDog}
                  onUnarchive={handleUnarchive}
                />
              ))}

              {displayList.length === 0 && !isSearching && !loadError && (
                <div className="col-span-full">
                  <EmptyState
                    icon={showArchived ? "🗄️" : "🐾"}
                    title={
                      showArchived
                        ? "No archived dogs here"
                        : searchQuery
                          ? `No dogs matching "${searchQuery}"`
                          : narrowed
                            ? "No dogs match those filters"
                            : "No dogs just yet"
                    }
                    description={
                      !showArchived && narrowed
                        ? "Try clearing some filters, or search by breed or owner name"
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
            // top-4, not top-24: the 96px offset was clearing the toolbar and
            // page header back when the document scrolled and they scrolled
            // with it. <main> is the scroll container now and the chrome sits
            // outside it, so 96px would just be a gap.
            className="hidden md:flex md:flex-col gap-0.5 sticky top-4 self-start shrink-0 bg-white/80 backdrop-blur-sm rounded-full border border-slate-200 shadow-sm px-0.5 py-1.5"
          />
        )}
      </div>

      {/* Footer */}
      <div className="mt-5 flex items-center justify-between flex-wrap gap-2.5">
        <div className="text-body text-slate-500">
          {isSearching ? (
            <span className="italic">Searching…</span>
          ) : (
            <span>{footerText}</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {fetchArchivedDogs && !hasSearchQuery && (
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
