// useDogs — the dogs directory surface. Composes the focused sub-hooks in
// ./dogs/ (the 2 September 2026 seam-review split; same precedent as
// useHumans + humans/*) and returns the exact public object
// useStaffAppData has always consumed:
//
//   useDogsDirectory  — the dogsById / dogsByHumanId caches (+ the derived
//                       app-shaped `dogs` map), the paginated directory
//                       fetch (search_dogs_directory RPC), realtime resync,
//                       debounced search, sort / filter / letter controls
//                       and the archived-dogs read.
//   useDogMutations   — optimistic updateDog / addDog / deleteDog.
//   useDogLookups     — on-demand by-id hydration (fetchDogById,
//                       ensureDogsForHumans, ensureDogsByIds) that fills
//                       the caches for rows past the paginated window.
//
// The sub-hooks share state through the cache setters useDogsDirectory
// returns, so callback identities behave exactly as the monolith's did:
// anything that read the maps still re-creates when dogs / dogsById /
// humansById change, everything else stays referentially stable.
import { useDogsDirectory } from "./dogs/useDogsDirectory";
import { useDogMutations } from "./dogs/useDogMutations";
import { useDogLookups } from "./dogs/useDogLookups";
import type { HumansById } from "./dogs/helpers";

export type { DirectoryDog, DogPatch, HumansById, NewDogInput } from "./dogs/helpers";

export function useDogs(
  humansById: HumansById,
  // Boot-path deferral (see useDogsDirectory): while startDirectoryFetch is
  // false the page-0 directory fetch is held back; targeted hydration via
  // useDogLookups is never deferred.
  { startDirectoryFetch = true }: { startDirectoryFetch?: boolean } = {},
) {
  const directory = useDogsDirectory({ humansById, startDirectoryFetch });

  const mutations = useDogMutations({
    dogs: directory.dogs,
    dogsById: directory.dogsById,
    humansById,
    setDogsById: directory.setDogsById,
    setError: directory.setError,
    setTotalCount: directory.setTotalCount,
    invalidateHuman: directory.invalidateHuman,
  });

  const lookups = useDogLookups({
    dogsById: directory.dogsById,
    humansById,
    setDogsById: directory.setDogsById,
    setDogsByHumanId: directory.setDogsByHumanId,
    fetchedHumanIdsRef: directory.fetchedHumanIdsRef,
    inflightHumanIdsRef: directory.inflightHumanIdsRef,
  });

  return {
    dogs: directory.dogs,
    dogsById: directory.dogsById,
    dogsByHumanId: directory.dogsByHumanId,
    ensureDogsForHumans: lookups.ensureDogsForHumans,
    ensureDogsByIds: lookups.ensureDogsByIds,
    loading: directory.loading,
    error: directory.error,
    updateDog: mutations.updateDog,
    addDog: mutations.addDog,
    deleteDog: mutations.deleteDog,
    fetchDogById: lookups.fetchDogById,
    hasMore: directory.hasMore,
    totalCount: directory.totalCount,
    loadMore: directory.loadMore,
    searchDogs: directory.searchDogs,
    clearSearch: directory.clearSearch,
    searchQuery: directory.searchQuery,
    isSearching: directory.isSearching,
    // Server-driven directory list + controls
    directoryDogs: directory.directoryDogs,
    dogAvailableLetters: directory.dogAvailableLetters,
    dirSort: directory.dirSort,
    setDirSort: directory.setDirSort,
    dirFilters: directory.dirFilters,
    toggleDirFilter: directory.toggleDirFilter,
    dirLetter: directory.dirLetter,
    setDirLetter: directory.setDirLetter,
    fetchArchivedDogs: directory.fetchArchivedDogs,
  };
}
