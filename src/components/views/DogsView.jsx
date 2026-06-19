import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { SIZE_THEME, SIZE_FALLBACK } from "../../constants/index";
import { AlertTriangle, MessageCircle } from "lucide-react";
import { IconSearch } from "../icons/index.jsx";
import { FloatingDecor } from "../decor/index.jsx";
import { AddDogModal } from "../modals/AddDogModal.jsx";
import { useToast } from "../../contexts/ToastContext.jsx";
import { titleCase } from "../../utils/text";
import { formatOwnerLabel } from "../../utils/formatOwnerLabel.js";
import { filterDogsForDirectory } from "../../utils/directorySearch";
import { CardGridSkeleton, SkeletonBlock } from "../ui/Skeleton.jsx";
import { ErrorBanner } from "../ui/ErrorBanner.jsx";
import { SizeDot } from "../ui/SizeDot.jsx";
import { Button, Badge, EmptyState } from "../ui/index.js";
import { telLink, waLink } from "../modals/dog-card/helpers.js";

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
            className={`shrink-0 w-6 h-6 rounded-md text-micro font-bold flex items-center justify-center transition-colors ${
              active
                ? "bg-brand-yellow text-brand-purple"
                : enabled
                  ? "text-slate-600 hover:bg-brand-purple/10 hover:text-brand-purple cursor-pointer"
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

// A dog's alert(s), shown as visible (screen-reader-readable) text next to a
// coral warning icon. Truncated on the card; the profile shows them in full.
function AlertChip({ alerts, className = "" }) {
  if (!alerts?.length) return null;
  const text = alerts.length > 1 ? `${alerts[0]} +${alerts.length - 1}` : alerts[0];
  return (
    <span
      title={alerts.join(", ")}
      aria-label={alerts.join(", ")}
      className={`inline-flex items-center gap-1 max-w-full text-micro font-semibold text-brand-coral-text bg-brand-coral-light border border-brand-coral/20 px-1.5 py-0.5 rounded-md ${className}`}
    >
      <AlertTriangle size={12} aria-hidden="true" className="shrink-0" />
      <span className="truncate">{text}</span>
    </span>
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
      title="Unarchive this dog"
      className="absolute top-2 right-2 z-[1] text-[11px] font-bold text-brand-purple bg-brand-purple/10 border border-brand-purple/30 px-2 py-0.5 rounded-md cursor-pointer hover:bg-brand-purple/20 transition-colors"
    >
      Unarchive
    </button>
  );
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

// Owner phone + WhatsApp links (stopPropagation so they don't open the
// profile). Mirrors the contact links on the Humans cards.
function OwnerContact({ phone, className = "" }) {
  if (!phone) return null;
  return (
    <span className={`inline-flex items-center gap-2 ${className}`} onClick={(e) => e.stopPropagation()}>
      <a href={telLink(phone)} className="font-medium no-underline hover:text-brand-purple truncate inline-block max-sm:py-1.5 max-sm:-my-1.5">
        {phone}
      </a>
      <a
        href={waLink(phone)}
        target="_blank"
        rel="noopener noreferrer"
        title="Open in WhatsApp"
        aria-label="Open in WhatsApp"
        className="inline-flex items-center justify-center w-6 h-6 max-sm:w-9 max-sm:h-9 rounded-full text-emerald-600 bg-emerald-50 border border-emerald-200 no-underline hover:bg-emerald-100 shrink-0"
      >
        <MessageCircle size={12} aria-hidden="true" />
      </a>
    </span>
  );
}

// One directory entry, rendered as a grid card or a dense list row. Both stay
// keyboard-openable (role=button + Enter/Space) and reuse the same owner-resolve
// + tel/wa link pattern.
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
  const t = SIZE_THEME[dog.size] || SIZE_FALLBACK;
  const open = () => onOpenDog(dog.id || dog.name);
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
        aria-label={`Open ${titleCase(dog.name)}'s profile`}
        onClick={open}
        onKeyDown={onKeyDown}
        className="group relative flex items-center gap-3 bg-white rounded-lg border border-slate-200 px-3 py-2 cursor-pointer transition-colors hover:border-brand-cyan focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow-dark"
      >
        <div className="min-w-0 flex-1 sm:flex-none sm:max-w-[28rem]">
          <div className="flex items-center gap-1.5 min-w-0">
            <SizeDot size={dog.size} dim={14} />
            <span className="font-bold text-slate-800 truncate">{titleCase(dog.name)}</span>
            {incomplete && (
              <Badge tone="warning" size="xs" uppercase title="Missing size, breed or owner">
                Incomplete
              </Badge>
            )}
            {dog.alerts?.length > 0 && <AlertChip alerts={dog.alerts} className="shrink-0 max-w-[45%]" />}
          </div>
          <div className="flex items-center gap-2.5 text-micro text-slate-500 mt-0.5 min-w-0">
            <span className="truncate shrink-0">
              {titleCase(dog.breed) || <span className="italic text-ink-muted">No breed</span>}
              {age ? ` · ${age}` : ""}
            </span>
            {ownerSkeleton ? (
              <SkeletonBlock className="h-3 w-24" />
            ) : owner.missing ? (
              <span className="italic text-ink-muted truncate">· {owner.label}</span>
            ) : (
              <span className="flex items-center gap-2 min-w-0">
                <span className="truncate">· {titleCase(owner.label)}</span>
                <OwnerContact phone={owner.phone} />
              </span>
            )}
          </div>
        </div>
        <div className="hidden sm:block flex-1" aria-hidden="true" />
        {showArchived && <UnarchiveButton onUnarchive={() => onUnarchive(dog.id)} />}
      </div>
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Open ${titleCase(dog.name)}'s profile`}
      onClick={open}
      onKeyDown={onKeyDown}
      className="group relative bg-white rounded-xl border border-slate-200 overflow-hidden cursor-pointer motion-safe:transition-all shadow-card-resting hover:-translate-y-0.5 hover:border-brand-cyan hover:shadow-card-hover min-h-[112px] flex flex-col focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow-dark"
    >
      <div
        className="h-[3px] shrink-0"
        style={{ background: `linear-gradient(to right, ${t.gradient[0]}, ${t.gradient[1] || t.gradient[0]})` }}
      />
      {showArchived && <UnarchiveButton onUnarchive={() => onUnarchive(dog.id)} />}

      <div className="p-3.5 px-4 flex flex-col flex-1 min-h-0 gap-0.5">
        <div className="flex justify-between items-start gap-2">
          <div className="flex items-center gap-1.5 truncate">
            <SizeDot size={dog.size} dim={16} />
            <span className="text-title font-extrabold text-slate-800 truncate">
              {titleCase(dog.name)}
            </span>
          </div>
          {incomplete && (
            <Badge tone="warning" size="xs" uppercase title="Missing size, breed or owner">
              Incomplete
            </Badge>
          )}
        </div>

        <div className="text-body text-slate-500 font-semibold leading-snug truncate">
          {titleCase(dog.breed) || <span className="italic text-ink-muted">No breed</span>}{age ? ` · ${age}` : ""}
        </div>

        {dog.alerts?.length > 0 && <AlertChip alerts={dog.alerts} className="mt-1 self-start" />}

        {/* Owner — pushed to bottom. While humans are still loading we can't
            tell "missing owner" from "owner row hasn't arrived yet", so show a
            skeleton instead of the misleading "Unknown owner" flash. */}
        <div className="mt-auto text-xs font-semibold text-ink-muted truncate flex items-center gap-2 min-w-0">
          {ownerSkeleton ? (
            <SkeletonBlock className="h-3 w-24" />
          ) : owner.missing ? (
            <span className="italic">{owner.label}</span>
          ) : (
            <>
              <span className="truncate">{titleCase(owner.label)}</span>
              <OwnerContact phone={owner.phone} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const SIZE_FILTERS = [
  { value: "small", label: "Small" },
  { value: "medium", label: "Medium" },
  { value: "large", label: "Large" },
  { value: "unset", label: "Unset" },
];

export function DogsView({
  dogs,
  humans,
  onOpenDog,
  onAddDog,
  onAddHuman,
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
  const [showAddModal, setShowAddModal] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [archivedList, setArchivedList] = useState(null);
  const [viewMode, setViewModeState] = useState(() =>
    typeof localStorage !== "undefined" && localStorage.getItem("dogsViewMode") === "list"
      ? "list"
      : "grid",
  );
  const setViewMode = useCallback((mode) => {
    setViewModeState(mode);
    try {
      localStorage.setItem("dogsViewMode", mode);
    } catch {
      /* localStorage unavailable — non-fatal */
    }
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
  const narrowed = hasSearchQuery || hasFilters;
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
      {/* Header banner — Dogs keep their cyan section identity. */}
      <div className="bg-gradient-to-br from-brand-cyan-light to-brand-cyan-dark py-4 px-5 md:px-7 rounded-xl relative overflow-hidden mb-5">
        <svg aria-hidden="true" className="absolute right-6 top-1 w-20 h-20 opacity-[0.06] -rotate-[15deg] pointer-events-none select-none" viewBox="0 0 24 24" fill="white"><ellipse cx="8" cy="6" rx="2.5" ry="3" /><ellipse cx="16" cy="6" rx="2.5" ry="3" /><ellipse cx="4.5" cy="12" rx="2" ry="2.5" /><ellipse cx="19.5" cy="12" rx="2" ry="2.5" /><ellipse cx="12" cy="16.5" rx="5" ry="4" /></svg>
        <div className="relative z-[1] flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-2xl md:text-display font-black text-white font-display">Dogs Directory</div>
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
                aria-label="Search dogs by name, breed or owner"
                placeholder="Search by name, breed or owner..."
                value={searchQuery}
                onChange={(e) => onSearch(e.target.value)}
                className="w-full py-2.5 pl-10 pr-3.5 rounded-control border border-white/40 bg-white/25 text-sm font-inherit outline-none text-white placeholder:text-white/85 transition-colors focus:bg-white/35 focus:border-white/60"
              />
            </div>
            <button
              onClick={() => setShowAddModal(true)}
              className="bg-white text-brand-cyan border-none rounded-control px-4 py-2.5 text-[13px] font-bold cursor-pointer font-inherit whitespace-nowrap transition-all hover:bg-white/90 shadow-[0_2px_8px_rgba(0,0,0,0.1)]"
            >
              + Add Dog
            </button>
          </div>
        </div>
      </div>

      {/* Toolbar: size + alert/incomplete filters + sort + view unified into one
          control row, with a size key beneath. Active states use the shared
          yellow/purple language. */}
      <div className="mb-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          {showRailAndSort && onToggleFilter && (
            <>
              <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filters">
                {SIZE_FILTERS.map((s) => {
                  const active = filters?.size === s.value;
                  return (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() => onToggleFilter("size", s.value)}
                      aria-pressed={active}
                      aria-label={s.label}
                      className={`inline-flex items-center gap-1.5 text-micro font-bold px-3 py-1 rounded-full border transition-colors ${
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
                  className={`text-micro font-bold px-3 py-1 rounded-full border transition-colors ${
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
                  className={`text-micro font-bold px-3 py-1 rounded-full border transition-colors ${
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
            <div className="inline-flex items-center gap-2">
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
          title="Couldn't load the dogs directory"
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
                        ? "No archived dogs."
                        : searchQuery
                          ? `No dogs found matching "${searchQuery}"`
                          : narrowed
                            ? "No dogs match the active filters."
                            : "No dogs yet."
                    }
                    description={
                      !showArchived && narrowed
                        ? "Try clearing some filters or searching by breed or owner name."
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
            className="hidden md:flex md:flex-col gap-0.5 sticky top-24 self-start shrink-0 bg-white/80 backdrop-blur-sm rounded-full border border-slate-200 shadow-sm px-0.5 py-1.5"
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
