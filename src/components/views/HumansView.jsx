import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { getSizeForBreed } from "../../constants/index";
import { Mail, MessageCircle, MessageSquareText, PawPrint, Phone, Plus } from "lucide-react";
import { FloatingDecor } from "../decor/index.jsx";
import { titleCase, normaliseSurname } from "../../utils/text";
import { filterHumansForDirectory, getDogsForHuman } from "../../utils/directorySearch";
import { CardGridSkeleton, SkeletonBlock } from "../ui/Skeleton.jsx";
import { ErrorBanner } from "../ui/ErrorBanner.jsx";
import { safeGet, safeSet } from "../../lib/storage";
import {
  Button,
  EmptyState,
  PageHeader,
  PageHeaderAction,
  PageHeaderPill,
  PageHeaderSearch,
  PageHeaderSegmented,
  SafetyAlertChip,
} from "../ui/index.js";
import { normalisePhoneDigits, telLink, waLink } from "../modals/dog-card/helpers.js";
import { HumanInitials, ProfileArrow } from "./directory/IdentityMarker.jsx";
import { DirectoryHeaderKey } from "./directory/DirectoryHeaderKey.jsx";
import { SignupApprovalQueue } from "./humans/SignupApprovalQueue";
import { useSalon } from "../../contexts/SalonContext";

const AZ_LETTERS = [
  "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M",
  "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z", "#",
];

const DOG_SIZE_TONES = new Set(["small", "medium", "large"]);
const DOG_FIGURE_LABELS = {
  small: "small dog",
  medium: "medium dog",
  large: "large dog",
  unknown: "dog with size to confirm",
};

function getDogSizeTone(dog) {
  const size = String(dog?.size || getSizeForBreed(dog?.breed) || "").toLowerCase();
  return DOG_SIZE_TONES.has(size) ? size : "unknown";
}

function getPackTone(dogList) {
  if (dogList.length === 0) return "none";
  const sizes = new Set(dogList.map(getDogSizeTone));
  return sizes.size > 1 ? "mixed" : getDogSizeTone(dogList[0]);
}

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
      className="min-h-11 min-w-11 rounded-full border border-brand-purple/30 bg-white px-3 py-2 text-xs font-bold text-brand-purple transition-colors hover:bg-brand-purple/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-yellow-dark"
    >
      Unarchive
    </button>
  );
}

function PackSpectrum({ dogList }) {
  const sizes = [...new Set(dogList.map(getDogSizeTone))];

  return (
    <span className="human-pack-spectrum" aria-hidden="true">
      {sizes.length > 0 ? (
        sizes.map((size) => (
          <span
            className={`human-pack-spectrum__part human-pack-spectrum__part--${size}`}
            key={size}
          />
        ))
      ) : (
        <span className="human-pack-spectrum__part human-pack-spectrum__part--none" />
      )}
    </span>
  );
}

function DogFigures({ dogList, composition }) {
  return (
    <div
      data-testid="human-pack-figures"
      className={`human-pack-figures human-pack-figures--${composition}`}
    >
      {dogList.map((dog, index) => {
        const size = getDogSizeTone(dog);
        const dogName = titleCase(dog.name) || "Unnamed dog";
        return (
          <span
            data-testid="human-pack-dog"
            data-size-tone={size}
            className={`human-pack-dog human-pack-dog--${size}`}
            role="img"
            aria-label={`${dogName}, ${DOG_FIGURE_LABELS[size]}`}
            key={dog.id || `${dog.name || "dog"}-${dog.breed || "unknown"}-${index}`}
          />
        );
      })}
    </div>
  );
}

function DogRoster({ dogList }) {
  return (
    <ul
      role="list"
      aria-label={`${dogList.length} linked dog${dogList.length === 1 ? "" : "s"}`}
      className="human-pack-roster"
    >
      {dogList.map((dog, index) => {
        const size = getDogSizeTone(dog);
        const dogName = titleCase(dog.name) || "Unnamed dog";
        const breed = titleCase(dog.breed);
        return (
          <li key={dog.id || `${dog.name || "dog"}-${dog.breed || "unknown"}-${index}`}>
            <span
              className={`human-pack-roster__dot human-pack-roster__dot--${size}`}
              aria-hidden="true"
            />
            <strong className="human-pack-roster__label">
              {breed ? `${dogName} - ${breed}` : dogName}
            </strong>
          </li>
        );
      })}
    </ul>
  );
}

function HumanDogPanel({ dogList, historyFlag, archived, onOpen }) {
  const composition =
    dogList.length === 1 ? "single" : dogList.length > 1 ? "multiple" : "empty";

  return (
    <div
      data-testid="human-dog-panel"
      className={`human-dog-panel human-dog-panel--${composition}`}
    >
      <div
        data-testid="human-pack-stage"
        className={`human-pack-stage human-pack-stage--${composition}`}
      >
        {dogList.length > 0 ? (
          <DogFigures dogList={dogList} composition={composition} />
        ) : (
          <PawPrint className="human-pack-stage__empty-mark" aria-hidden="true" strokeWidth={2.2} />
        )}
      </div>

      <div className="human-pack-details">
        {historyFlag && (
          <SafetyAlertChip
            items={[historyFlag]}
            className="human-pack-safety min-h-11 min-w-11 w-full shrink-0"
          />
        )}
        {dogList.length > 0 ? (
          <DogRoster dogList={dogList} />
        ) : archived ? (
          <div className="human-empty-pack human-empty-pack--archived">
            <strong>No dogs linked</strong>
          </div>
        ) : (
          <button
            type="button"
            onClick={onOpen}
            className="human-empty-pack min-h-11 min-w-11"
          >
            <span>
              <strong>No dogs linked yet</strong>
              <small>Add their first dog</small>
            </span>
            <Plus aria-hidden="true" strokeWidth={2.5} />
          </button>
        )}
      </div>
    </div>
  );
}

function ContactLines({ human, mode }) {
  return (
    <div
      data-testid="human-contact-strip"
      className="human-directory-card__contact-strip flex-wrap"
    >
      {human.phone ? (
        <span className="human-directory-card__phone">{human.phone}</span>
      ) : (
        <span className="human-directory-card__phone italic">No phone</span>
      )}
      {human.email && mode === "list" ? (
        <span className="human-directory-card__email" title={human.email}>
          {human.email}
        </span>
      ) : human.email ? (
        <a
          href={`mailto:${human.email}`}
          className="inline-flex min-h-11 min-w-11 basis-full items-center break-all whitespace-normal no-underline"
        >
          {human.email}
        </a>
      ) : null}
    </div>
  );
}

function ContactActions({ human, fullName, mode }) {
  const isList = mode === "list";
  const name = titleCase(fullName);
  const iconSize = isList ? 22 : 18;
  const smsDigits = normalisePhoneDigits(human.phone);

  return (
    <div
      data-testid="human-contact-actions"
      className="human-directory-card__contact-actions"
      aria-label={`Contact ${name}`}
    >
      {human.phone && (
        <>
          <a
            href={telLink(human.phone)}
            title={`Call ${name} on ${human.phone}`}
            aria-label={`Call ${name}`}
            className="human-directory-card__contact-action--call size-11"
          >
            <Phone size={iconSize} strokeWidth={2.35} aria-hidden="true" />
          </a>
          <a
            href={waLink(human.phone)}
            target="_blank"
            rel="noopener noreferrer"
            title="Open in WhatsApp"
            aria-label="Open in WhatsApp"
            className="human-directory-card__contact-action--whatsapp size-11"
          >
            <MessageCircle size={iconSize} strokeWidth={2.35} aria-hidden="true" />
          </a>
          {isList && (
            <a
              href={smsDigits ? `sms:+${smsDigits}` : "#"}
              title={`Send SMS to ${name}`}
              aria-label={`Send SMS to ${name}`}
              className="human-directory-card__contact-action--sms size-11"
            >
              <MessageSquareText size={iconSize} strokeWidth={2.35} aria-hidden="true" />
            </a>
          )}
        </>
      )}
      {isList && human.email && (
        <a
          href={`mailto:${human.email}`}
          title={`Email ${name} at ${human.email}`}
          aria-label={`Email ${name}`}
          className="human-directory-card__contact-action--email size-11"
        >
          <Mail size={iconSize} strokeWidth={2.35} aria-hidden="true" />
        </a>
      )}
    </div>
  );
}

// One directory entry, rendered as a grid card or a dense list row. Contact
// links and the profile action remain separate, explicit controls.
function DirectoryItem({ human, mode, dogs, dogsByHumanId, showArchived, onOpenHuman, onUnarchive }) {
  const cleanSurname = normaliseSurname(human.surname);
  const fullName = human.fullName || `${human.name || ""} ${cleanSurname}`.trim();
  const humanDogs = getDogsForHuman(human, dogs, dogsByHumanId);
  const open = () => onOpenHuman(human.id || fullName);
  const packTone = getPackTone(humanDogs);
  const packComposition =
    humanDogs.length === 1 ? "single" : humanDogs.length > 1 ? "multiple" : "empty";
  const cardClass = [
    "human-directory-card",
    `human-directory-card--${mode}`,
    `human-directory-card--${packTone}`,
    showArchived ? "human-directory-card--archived" : "",
    "group flex flex-col",
  ].filter(Boolean).join(" ");

  return (
    <article
      aria-label={titleCase(fullName)}
      data-pack-composition={packComposition}
      className={cardClass}
    >
      <PackSpectrum dogList={humanDogs} />
      <div
        data-testid="human-card-primary"
        className="human-directory-card__inner w-full min-w-0"
      >
        <div className="human-directory-card__identity">
          {mode !== "list" && (
            <HumanInitials fullName={fullName} className="human-directory-card__avatar" />
          )}
          <div
            data-testid="human-owner-details"
            className="human-directory-card__identity-copy"
          >
            <div className="human-directory-card__name-row">
              <span className="human-directory-card__name">
                {titleCase(fullName)}
              </span>
            </div>
            <ContactLines human={human} mode={mode} />
          </div>
        </div>

        <ContactActions human={human} fullName={fullName} mode={mode} />
        <HumanDogPanel
          dogList={humanDogs}
          historyFlag={human.historyFlag}
          archived={showArchived}
          onOpen={open}
        />

        <div className="human-directory-card__profile">
          <ProfileArrow
            label={`View profile for ${titleCase(fullName)}`}
            onClick={open}
            visibleLabel
          />
        </div>
      </div>
      {showArchived && (
        <div
          data-testid="human-card-secondary-actions"
          className="human-directory-card__secondary-actions flex w-full justify-end"
        >
          <UnarchiveButton onUnarchive={() => onUnarchive(human.id)} />
        </div>
      )}
    </article>
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

const VIEW_OPTIONS = [
  { value: "grid", label: "Grid" },
  { value: "list", label: "List" },
];

export function HumansView({
  onNewClient,
  onApproveSignup,
  fetchArchivedHumans,
  hasMore,
  totalCount,
  loadMore,
  onSearch,
  searchQuery,
  isSearching,
  isInitialLoading = false,
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
  // Shared salon data + actions come from SalonContext (Debt 11).
  const {
    humans,
    dogs,
    dogsByHumanId,
    ensureDogsForHumans,
    onOpenHuman,
    onUpdateHuman,
    isOnline = true,
  } = useSalon();
  const [loadingMore, setLoadingMore] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [archivedList, setArchivedList] = useState(null);
  const [archivedError, setArchivedError] = useState(null);
  const [viewMode, setViewModeState] = useState(() =>
    safeGet("local", "humansViewMode") === "list" ? "list" : "grid",
  );
  const setViewMode = useCallback((mode) => {
    setViewModeState(mode);
    safeSet("local", "humansViewMode", mode);
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
      {/* Page identity and directory controls share a compact two-row system. */}
      <section
        data-testid="humans-directory-shell"
        aria-label="Humans directory controls"
      >
        <PageHeader title="Humans Directory">
          <PageHeaderSegmented
            value={viewMode}
            onChange={setViewMode}
            options={VIEW_OPTIONS}
            ariaLabel="Human directory view"
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
            ariaLabel="Search humans"
            placeholder="Search clients..."
          />
          <DirectoryHeaderKey />
          {onNewClient && (
            <PageHeaderAction icon={Plus} onClick={onNewClient} aria-label="Add client">
              Add client
            </PageHeaderAction>
          )}
        </PageHeader>

        {/* Less frequent filters and sorting stay below the primary toolbar. */}
        {showRailAndSort && (
        <div className="mb-4 rounded-xl border border-brand-paper-line bg-white px-5 py-3 md:px-6">
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
                      className={`min-h-11 rounded-full border px-3 text-micro font-bold transition-colors ${
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

          </div>
        </div>
        )}
      </section>

      {onApproveSignup && <SignupApprovalQueue enabled={isOnline} onApprove={onApproveSignup} />}

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
          ) : showArchived && archivedList === null && archivedError ? (
            <ErrorBanner
              title="Couldn't load archived humans"
              message="Check your connection, then try again"
              retry={retryArchived}
              retryLabel="Try again"
            />
          ) : showArchived && archivedList === null ? (
            <div className="py-12 text-center text-body text-slate-500 italic">
              Loading archived humans…
            </div>
          ) : (
            <div
              data-testid="humans-directory-grid"
              className={
                viewMode === "list"
                  ? "flex flex-col gap-1.5"
                  : "grid auto-rows-fr grid-cols-1 items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-3"
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
                        ? "No archived humans here"
                        : searchQuery
                          ? `No humans matching "${searchQuery}"`
                          : "No humans just yet"
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
        <div role="status" aria-live="polite" className="text-body text-slate-500">
          {isSearching ? (
            <span className="italic">Searching…</span>
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
    </div>
  );
}
