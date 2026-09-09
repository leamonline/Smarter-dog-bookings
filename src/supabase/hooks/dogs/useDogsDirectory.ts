// useDogsDirectory — the paginated Dogs Directory surface, extracted from
// useDogs (the seam-review split, mirroring humans/useHumansData). Owns the
// dogsById / dogsByHumanId caches (and hands their setters to the mutation
// and lookup hooks), the server-driven directory list via the
// search_dogs_directory RPC, the realtime resync, the debounced search box,
// the sort / filter / letter controls and the archived-dogs read.
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { supabase } from "../../client";
import { CHANNELS, uniqueChannelName } from "../../realtimeChannels";
import { searchDogsDirectory } from "../../rpc";
import { dbDogsToMap, buildDogsById } from "../../transforms";
import { logger } from "../../../lib/logger";
import { safeGet, safeSet } from "../../../lib/storage";
import { PAGE_SIZE, buildDirectoryDogEntry } from "./helpers";
import type {
  DirFilters,
  DirSort,
  DirectoryDog,
  DirectoryDogRow,
  DirectoryQuery,
  DogRow,
  DogsByHumanIdMap,
  DogsByIdMap,
  HumansById,
  InvalidateHuman,
} from "./helpers";
import type {
  RealtimePostgresDeletePayload,
  RealtimePostgresInsertPayload,
  RealtimePostgresUpdatePayload,
} from "@supabase/supabase-js";

export function useDogsDirectory({
  humansById,
  startDirectoryFetch,
}: {
  humansById: HumansById;
  // Boot-path deferral (mirrors useHumansData): while startDirectoryFetch is
  // false, the page-0 directory fetch and the realtime-triggered refetches
  // are held back so the 50-row directory read stays off the dashboard's
  // boot path. Flipping it true runs the fetch with the current params.
  // `loading` stays true while deferred. Targeted hydration (useDogLookups)
  // is independent and never deferred.
  startDirectoryFetch: boolean;
}) {
  // Single source of truth for dog records: raw DB rows keyed by id.
  // The app-shaped `dogs` map is DERIVED from this below (Debt #14) —
  // the two can no longer drift because only one of them is state.
  const [dogsById, setDogsById] = useState<DogsByIdMap>({});
  const [dogsByHumanId, setDogsByHumanId] = useState<DogsByHumanIdMap>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);

  // Server-driven directory state (mirrors useHumans). directoryDogs is the
  // ordered / filtered / paginated list the grid renders; the dogs / dogsById
  // maps stay the lookup caches other views read. effectiveSearch is the
  // debounced term that actually drives the fetch; searchQuery mirrors the input.
  const [directoryDogs, setDirectoryDogs] = useState<DirectoryDog[]>([]);
  const [dogAvailableLetters, setDogAvailableLetters] = useState<string[]>([]);
  const [effectiveSearch, setEffectiveSearch] = useState("");
  const [dirSort, setDirSortState] = useState<DirSort>(() =>
    safeGet("local", "dogsDirSort") === "recent" ? "recent" : "name",
  );
  // Unlike humans, the size filter is an enum (small/medium/large/unset), not a
  // boolean — alert and incomplete are plain booleans.
  const [dirFilters, setDirFilters] = useState<DirFilters>({
    size: null,
    alert: false,
    incomplete: false,
  });
  const [dirLetter, setDirLetterState] = useState<string | null>(null);

  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchedHumanIdsRef = useRef<Set<string>>(new Set());
  const inflightHumanIdsRef = useRef<Set<string>>(new Set());

  // Refs of the loaded directory list (for load-more's offset) and the active
  // query (so realtime refetches and load-more reuse the current params).
  const directoryRef = useRef<DirectoryDog[]>([]);
  const queryRef = useRef<DirectoryQuery>({
    search: "",
    filters: { size: null, alert: false, incomplete: false },
    sort: "name",
    letter: null,
  });

  // The main fetch effect can't depend on humansById: every time
  // ensureHumansByIds (in useHumans) resolves a missing owner, the
  // humansById reference changes, which would re-run fetchDogs() and
  // wipe out any dogs that ensureDogsByIds had just merged in from the
  // tail of the paginated list. We keep a ref instead so realtime
  // INSERT/UPDATE handlers and on-demand fetches still see the latest
  // humans without re-triggering the effect.
  const humansByIdRef = useRef(humansById);
  useEffect(() => { humansByIdRef.current = humansById; }, [humansById]);

  // The app-shaped lookup map, derived from the raw rows. A rename (or any
  // other mutation) can't leave a stale app-shape entry behind because
  // there is nothing to keep in sync — dbDogsToMap re-derives on every
  // dogsById change. Owner display names resolve from whatever humans have
  // loaded at that point, matching the old write-time behaviour
  // (humansByIdRef is a ref, exempt from the deps rule by design).
  const dogs = useMemo(
    () => dbDogsToMap(Object.values(dogsById), humansByIdRef.current || {}),
    [dogsById],
  );

  const invalidateHuman = useCallback<InvalidateHuman>((humanId) => {
    if (!humanId) return;
    fetchedHumanIdsRef.current.delete(humanId);
    inflightHumanIdsRef.current.delete(humanId);
    setDogsByHumanId((prev) => {
      if (!(humanId in prev)) return prev;
      const next = { ...prev };
      delete next[humanId];
      return next;
    });
  }, []);

  // Keep the directory-list ref current for load-more's offset and the
  // once-mounted realtime handlers.
  useEffect(() => {
    directoryRef.current = directoryDogs;
  }, [directoryDogs]);

  // One server-side directory page via the search_dogs_directory RPC, which
  // returns { rows, total, letters } already filtered, sorted and paginated —
  // the client never holds or re-sorts the full set. Reset replaces the ordered
  // list; append (load-more) extends it. Rows always MERGE into the dogs /
  // dogsById caches (never evict) so booking and day views can resolve any dog
  // the directory has loaded. The rows carry joined owner_* fields, which
  // buildDirectoryDogEntry folds onto each entry for the card.
  const fetchDirectory = useCallback(
    async (params: DirectoryQuery, { append = false }: { append?: boolean } = {}) => {
      if (!supabase) {
        // Offline: searchDogs() has already flagged isSearching — reset it
        // here too, or a no-match query sits on "Searching..." forever
        // (the offline twin of UX audit #1).
        setIsSearching(false);
        setLoading(false);
        return;
      }
      queryRef.current = params;
      const offset = append ? directoryRef.current.length : 0;
      setError(null);
      if (!append) setLoading(true);

      const { data, error: err } = await searchDogsDirectory(supabase, {
        search: params.search || null,
        size: params.filters.size || null,
        alert: !!params.filters.alert,
        incomplete: !!params.filters.incomplete,
        letter: params.letter || null,
        sort: params.sort || "name",
        limit: PAGE_SIZE,
        offset,
      });

      setIsSearching(false);
      if (err) {
        setError(err.message);
        setLoading(false);
        return;
      }

      // The RPC returns Json; this is the shape search_dogs_directory builds.
      const result = (data || {}) as { rows?: DirectoryDogRow[]; total?: number; letters?: string[] };
      const rows = Array.isArray(result.rows) ? result.rows : [];
      const entries = rows.map((row) =>
        buildDirectoryDogEntry(row, humansByIdRef.current || {}),
      );

      // Merge bare dog rows into the lookup cache (never evict) so other
      // views keep resolving dogs the directory has loaded. The app-shaped
      // `dogs` map derives from this automatically.
      setDogsById((prev) => ({ ...prev, ...buildDogsById(rows) }));

      setDirectoryDogs((prev) => (append ? [...prev, ...entries] : entries));
      setTotalCount(result.total ?? 0);
      setDogAvailableLetters(result.letters || []);
      setHasMore(offset + rows.length < (result.total ?? 0));
      setLoading(false);
    },
    [],
  );

  // The realtime handlers below are registered once on mount but must see
  // the live deferral flag, so they read it through a ref.
  const startDirectoryFetchRef = useRef(startDirectoryFetch);
  useEffect(() => {
    startDirectoryFetchRef.current = startDirectoryFetch;
  }, [startDirectoryFetch]);

  // Refetch page 0 whenever the active query changes; also the initial load on
  // mount — unless deferred (startDirectoryFetch false); flipping the flag
  // true re-runs the effect with the current params. effectiveSearch is the
  // debounced search term (see searchDogs); filters / sort / letter apply
  // immediately.
  useEffect(() => {
    if (!startDirectoryFetch) return;
    fetchDirectory(
      { search: effectiveSearch, filters: dirFilters, sort: dirSort, letter: dirLetter },
      { append: false },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveSearch, dirFilters, dirSort, dirLetter, startDirectoryFetch]);

  // Real-time subscription for dogs. Insert/update refetch the current
  // directory page (which reseeds the caches); delete drops the row from the
  // caches and the directory list.
  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    const channel = supabase
      .channel(uniqueChannelName(CHANNELS.dogsRealtime))
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "dogs" },
        (payload: RealtimePostgresDeletePayload<DogRow>) => {
          // A DELETE payload carries only the old row's replica-identity
          // columns, so every field is optional; the id is all we need.
          const oldRow = payload.old;
          const oldId = oldRow?.id;
          if (!oldId) return;
          setDogsById((prev) => {
            const next = { ...prev };
            const cached = next[oldId];
            invalidateHuman(oldRow.human_id ?? cached?.human_id);
            delete next[oldId];
            return next;
          });
          setDirectoryDogs((prev) => prev.filter((d) => d.id !== oldId));
          setTotalCount((c) => Math.max(0, c - 1));
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "dogs" },
        (payload: RealtimePostgresInsertPayload<DogRow>) => {
          invalidateHuman(payload.new?.human_id);
          // While the directory fetch is deferred, skip the refetch — the
          // first fetch (with current params) runs when the flag flips.
          if (!startDirectoryFetchRef.current) return;
          fetchDirectory(queryRef.current, { append: false });
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "dogs" },
        (payload: RealtimePostgresUpdatePayload<DogRow>) => {
          invalidateHuman(payload.old?.human_id);
          invalidateHuman(payload.new?.human_id);
          if (!startDirectoryFetchRef.current) return;
          fetchDirectory(queryRef.current, { append: false });
        },
      )
      .subscribe();

    return () => {
      supabase!.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- realtime set up once on mount; handlers read fetchDirectory/invalidateHuman/queryRef via closure
  }, []);

  // Append the next page of the current directory query.
  const loadMore = useCallback(async () => {
    await fetchDirectory(queryRef.current, { append: true });
  }, [fetchDirectory]);

  // Reset the search box and let the directory effect refetch the unfiltered
  // page. Used by the new-booking modal's dog picker on open/close.
  const clearSearch = useCallback(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    setSearchQuery("");
    setIsSearching(false);
    setEffectiveSearch("");
  }, []);

  // Update the search box immediately, but debounce the term that drives the
  // fetch so typing doesn't fire a request per keystroke. Shared by the Dogs
  // Directory and the new-booking dog picker (which filters the merged dogs map
  // client-side); both just need matching dogs loaded into the cache.
  const searchDogs = useCallback((query: string) => {
    setSearchQuery(query);
    setIsSearching(true);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      setEffectiveSearch(query.trim());
    }, 300);
  }, []);

  // Sort toggle (name vs recently-added). Persisted so it sticks across reloads;
  // changing it re-runs the directory fetch effect.
  const setDirSort = useCallback((mode: DirSort) => {
    setDirSortState(mode);
    safeSet("local", "dogsDirSort", mode);
  }, []);

  // Filter chips. Size is an enum (small/medium/large/unset) so its toggle
  // takes a value and clears when the active value is re-selected; alert and
  // incomplete are plain booleans. Each change re-runs the fetch effect.
  const toggleDirFilter = useCallback(
    (key: "size" | "alert" | "incomplete", value?: string) => {
      setDirFilters((prev) =>
        key === "size"
          ? { ...prev, size: prev.size === value ? null : value ?? null }
          : { ...prev, [key]: !prev[key] },
      );
    },
    [],
  );

  // A–Z jump. Clicking the active letter again clears it (back to the full list).
  const setDirLetter = useCallback(
    (letter: string | null) =>
      setDirLetterState((prev) => (prev === letter ? null : letter)),
    [],
  );

  // Fetch the archived dogs for the directory's "Show archived" view. Returned
  // as a plain list (not merged into the active caches) so archived dogs never
  // leak into the grid, search or the lookup caches bookings read. The archived
  // set is small, so a single unpaginated read with the owner embedded is fine.
  const fetchArchivedDogs = useCallback(async (): Promise<DirectoryDog[]> => {
    if (!supabase) return [];
    const { data, error: err } = await supabase
      .from("dogs")
      .select("*, humans(name, surname, phone, whatsapp)")
      .not("archived_at", "is", null)
      .order("name")
      .limit(200);
    if (err) {
      logger.error("fetchArchivedDogs failed", err, {
        tags: { hook: "useDogs", op: "fetchArchivedDogs" },
      });
      return [];
    }
    return (data || []).map((row) =>
      buildDirectoryDogEntry(
        {
          ...row,
          owner_name: row.humans?.name,
          owner_surname: row.humans?.surname,
          owner_phone: row.humans?.phone,
          owner_whatsapp: row.humans?.whatsapp,
        },
        humansByIdRef.current || {},
      ),
    );
  }, []);

  return {
    // Caches + the setters the mutation / lookup hooks write through.
    dogs,
    dogsById,
    setDogsById,
    dogsByHumanId,
    setDogsByHumanId,
    invalidateHuman,
    fetchedHumanIdsRef,
    inflightHumanIdsRef,
    setError,
    setTotalCount,
    // Directory surface.
    loading,
    error,
    hasMore,
    totalCount,
    loadMore,
    searchDogs,
    clearSearch,
    searchQuery,
    isSearching,
    directoryDogs,
    dogAvailableLetters,
    dirSort,
    setDirSort,
    dirFilters,
    toggleDirFilter,
    dirLetter,
    setDirLetter,
    fetchArchivedDogs,
  };
}
