// useHumans — the humans directory surface. Composes the focused sub-hooks
// in ./humans/ (Debt #5 split; same precedent as useWhatsAppInbox + inbox/*)
// and returns the exact public object App.jsx has always consumed:
//
//   useHumansData       — paginated directory fetch (search_humans_directory
//                         RPC), realtime resync, sort / filter / letter
//                         controls, archived fetch, and the shared
//                         humans / humansById caches + their setters.
//   useHumansSearch     — the debounced search-term state machine.
//   useTrustedContacts  — trusted-contact hydration bookkeeping and the
//                         replace-style linking write (known non-atomic;
//                         see the note in that file).
//   useHumanMutations   — optimistic add / update / delete.
//   useHumanLifecycle   — merge + signup approve / reject RPC actions.
//   useHumanLookups     — on-demand by-id / by-name / by-term / bulk-id
//                         lookups that hydrate the caches.
//
// The sub-hooks share state through the cache setters useHumansData returns,
// so callback identities behave exactly as the monolith's did: anything that
// read the maps still re-creates when humans / humansById change, everything
// else stays referentially stable.
import { useHumansSearch } from "./humans/useHumansSearch";
import { useTrustedContacts } from "./humans/useTrustedContacts";
import { useHumansData } from "./humans/useHumansData";
import { useHumanMutations } from "./humans/useHumanMutations";
import { useHumanLifecycle } from "./humans/useHumanLifecycle";
import { useHumanLookups } from "./humans/useHumanLookups";

export function useHumans(
  // startDirectoryFetch defers the page-0 directory fetch off the boot path
  // (see useHumansData); everything else is unaffected by the flag.
  { startDirectoryFetch = true }: { startDirectoryFetch?: boolean } = {},
) {
  const search = useHumansSearch();
  const trusted = useTrustedContacts();

  // The directory fetch re-runs when the debounced term changes, and clears
  // the search spinner once a page lands (finishSearching).
  const data = useHumansData({
    effectiveSearch: search.effectiveSearch,
    finishSearching: search.finishSearching,
    startDirectoryFetch,
  });

  const mutations = useHumanMutations({
    humans: data.humans,
    humansById: data.humansById,
    setHumans: data.setHumans,
    setHumansById: data.setHumansById,
    setError: data.setError,
    setTotalCount: data.setTotalCount,
    replaceTrustedLinks: trusted.replaceTrustedLinks,
  });

  const lifecycle = useHumanLifecycle({
    setHumans: data.setHumans,
    setHumansById: data.setHumansById,
    setTotalCount: data.setTotalCount,
    setDirectoryHumans: data.setDirectoryHumans,
  });

  const lookups = useHumanLookups({
    humans: data.humans,
    humansById: data.humansById,
    setHumans: data.setHumans,
    setHumansById: data.setHumansById,
    isTrustedHydrated: trusted.isTrustedHydrated,
    markTrustedHydrated: trusted.markTrustedHydrated,
  });

  return {
    humans: data.humans,
    humansById: data.humansById,
    loading: data.loading,
    error: data.error,
    updateHuman: mutations.updateHuman,
    addHuman: mutations.addHuman,
    deleteHuman: mutations.deleteHuman,
    mergeHumans: lifecycle.mergeHumans,
    approveSignup: lifecycle.approveSignup,
    rejectSignup: lifecycle.rejectSignup,
    fetchArchivedHumans: data.fetchArchivedHumans,
    fetchHumanById: lookups.fetchHumanById,
    findHumanByFullName: lookups.findHumanByFullName,
    searchHumansByTerm: lookups.searchHumansByTerm,
    ensureHumansByIds: lookups.ensureHumansByIds,
    hasMore: data.hasMore,
    totalCount: data.totalCount,
    loadMore: data.loadMore,
    searchHumans: search.searchHumans,
    searchQuery: search.searchQuery,
    isSearching: search.isSearching,
    // Server-driven directory list + controls
    directoryHumans: data.directoryHumans,
    availableLetters: data.availableLetters,
    dirSort: data.dirSort,
    setDirSort: data.setDirSort,
    dirFilters: data.dirFilters,
    toggleDirFilter: data.toggleDirFilter,
    dirLetter: data.dirLetter,
    setDirLetter: data.setDirLetter,
  };
}
