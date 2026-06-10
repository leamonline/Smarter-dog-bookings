// useHumansData — the server-driven humans directory: paginated fetch via
// the search_humans_directory RPC, realtime resync, load-more, sort / filter /
// letter controls, the archived-humans read, and the two shared lookup caches
// (humans / humansById) every other humans sub-hook writes into. Extracted
// from useHumans (Debt #5); the setters are returned so the sibling hooks
// (mutations, lifecycle, lookups) can keep the caches coherent.
import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../../client.js";
import { searchHumansDirectory } from "../../rpc";
import { logger } from "../../../lib/logger";
import { buildHumanMapEntry } from "./helpers";
import type { HumansMap } from "./helpers";

const PAGE_SIZE = 50;

export type DirFilters = {
  flagged: boolean;
  noDogs: boolean;
  noPhone: boolean;
  whatsapp: boolean;
  newCustomers: boolean;
};

export function useHumansData({
  effectiveSearch,
  finishSearching,
}: {
  // The debounced search term from useHumansSearch — changing it re-runs
  // the fetch effect below.
  effectiveSearch: string;
  // Clears useHumansSearch's isSearching flag once a directory page lands.
  finishSearching: () => void;
}) {
  const [humans, setHumans] = useState<HumansMap>({});
  const [humansById, setHumansById] = useState<HumansMap>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);

  // Server-driven directory state. directoryHumans is the ordered,
  // filtered list the directory grid renders (distinct from the humans /
  // humansById lookup caches, which other views inject owners into).
  const [directoryHumans, setDirectoryHumans] = useState<any[]>([]);
  const [availableLetters, setAvailableLetters] = useState<string[]>([]);
  const [dirSort, setDirSortState] = useState<"first" | "last">(() =>
    typeof localStorage !== "undefined" &&
    localStorage.getItem("humansDirSort") === "last"
      ? "last"
      : "first",
  );
  const [dirFilters, setDirFilters] = useState<DirFilters>({
    flagged: false,
    noDogs: false,
    noPhone: false,
    whatsapp: false,
    newCustomers: false,
  });
  const [dirLetter, setDirLetterState] = useState<string | null>(null);

  const directoryRef = useRef<any[]>([]);
  const queryRef = useRef<{
    search: string;
    filters: DirFilters;
    sort: "first" | "last";
    letter: string | null;
  }>({
    search: "",
    filters: { flagged: false, noDogs: false, noPhone: false, whatsapp: false, newCustomers: false },
    sort: "first",
    letter: null,
  });

  // Keep refs of the loaded list (for load-more's offset) and the active
  // query (so realtime refetches and load-more reuse the current
  // search / filters / sort / letter).
  useEffect(() => {
    directoryRef.current = directoryHumans;
  }, [directoryHumans]);

  // One server-side directory page via the search_humans_directory RPC,
  // which returns { rows, total, letters } already filtered, sorted and
  // paginated — the client never holds or re-sorts the full ~800-row set.
  // Reset replaces the ordered list; append (load-more) extends it. Rows
  // always merge into the humans / humansById caches (never evict) so owner
  // lookups elsewhere keep resolving. Trusted contacts aren't hydrated here;
  // the profile modal does that on open via fetchHumanById.
  const fetchDirectory = useCallback(
    async (
      params: {
        search: string;
        filters: DirFilters;
        sort: "first" | "last";
        letter: string | null;
      },
      { append = false }: { append?: boolean } = {},
    ) => {
      if (!supabase) {
        setLoading(false);
        return;
      }
      queryRef.current = params;
      const offset = append ? directoryRef.current.length : 0;
      setError(null);
      if (!append) setLoading(true);

      const { data, error: err } = await searchHumansDirectory(supabase, {
        search: params.search || null,
        flagged: !!params.filters.flagged,
        noDogs: !!params.filters.noDogs,
        noPhone: !!params.filters.noPhone,
        whatsapp: !!params.filters.whatsapp,
        pending: !!params.filters.newCustomers,
        letter: params.letter || null,
        sort: params.sort || "first",
        limit: PAGE_SIZE,
        offset,
      });

      finishSearching();
      if (err) {
        setError(err.message);
        setLoading(false);
        return;
      }

      const result = (data || {}) as { rows?: any[]; total?: number; letters?: string[] };
      const rows = Array.isArray(result.rows) ? result.rows : [];
      const entries = rows.map((row) => buildHumanMapEntry(row));

      const byId: Record<string, any> = {};
      const byName: Record<string, any> = {};
      for (const e of entries) {
        byId[e.id] = e;
        byName[e.fullName || e.id] = e;
      }
      setHumansById((prev) => ({ ...prev, ...byId }));
      setHumans((prev) => {
        // Keep the map name-keyed; drop any stale UUID-keyed copies of these
        // ids so HumansView never renders the same human twice.
        const next: Record<string, any> = {};
        for (const [k, v] of Object.entries(prev)) {
          if (!byId[k]) next[k] = v;
        }
        return { ...next, ...byName };
      });
      setDirectoryHumans((prev) => (append ? [...prev, ...entries] : entries));
      setTotalCount(result.total ?? 0);
      setAvailableLetters(result.letters || []);
      setHasMore(offset + rows.length < (result.total ?? 0));
      setLoading(false);
    },
    [finishSearching],
  );

  // Refetch page 0 whenever the active query changes. effectiveSearch is the
  // debounced search term (see useHumansSearch); filters / sort / letter apply
  // immediately. Also performs the initial load on mount.
  useEffect(() => {
    fetchDirectory(
      { search: effectiveSearch, filters: dirFilters, sort: dirSort, letter: dirLetter },
      { append: false },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveSearch, dirFilters, dirSort, dirLetter]);

  // Real-time subscription for humans. Insert/update refetch the current
  // page set; delete drops the row from the caches and the visible list.
  useEffect(() => {
    if (!supabase) {
      setHumans({});
      setHumansById({});
      setLoading(false);
      return;
    }

    const channel = supabase
      .channel(`humans-realtime-${Date.now()}-${Math.random()}`)
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "humans" },
        (payload: any) => {
          const oldRow = payload.old;
          if (!oldRow?.id) return;
          setHumansById((prev) => {
            const next = { ...prev };
            delete next[oldRow.id];
            return next;
          });
          setHumans((prev) => {
            const next = { ...prev };
            const entry = Object.entries(next).find(
              ([, human]: [string, any]) => human.id === oldRow.id,
            );
            if (entry) delete next[entry[0]];
            return next;
          });
          setDirectoryHumans((prev) => prev.filter((h) => h.id !== oldRow.id));
          setTotalCount((c) => Math.max(0, c - 1));
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "humans" },
        () => {
          fetchDirectory(queryRef.current, { append: false });
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "humans" },
        () => {
          fetchDirectory(queryRef.current, { append: false });
        },
      )
      .subscribe();

    return () => {
      supabase!.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Append the next page of the current directory query.
  const loadMore = useCallback(async () => {
    await fetchDirectory(queryRef.current, { append: true });
  }, [fetchDirectory]);

  // Sort toggle (first-name vs surname). Persisted so it sticks across
  // reloads; changing it re-runs the fetch effect.
  const setDirSort = useCallback((mode: "first" | "last") => {
    setDirSortState(mode);
    try {
      localStorage.setItem("humansDirSort", mode);
    } catch {
      /* localStorage unavailable (private mode) — non-fatal */
    }
  }, []);

  // Filter chips combine with each other and with search; each toggle
  // re-runs the fetch effect with the new flags.
  const toggleDirFilter = useCallback(
    (key: "flagged" | "noDogs" | "noPhone" | "whatsapp" | "newCustomers") => {
      setDirFilters((prev) => ({ ...prev, [key]: !prev[key] }));
    },
    [],
  );

  // A–Z jump. Clicking the active letter again clears it (back to the full
  // alphabetical list).
  const setDirLetter = useCallback((letter: string | null) => {
    setDirLetterState((prev) => (prev === letter ? null : letter));
  }, []);

  /**
   * Fetch the archived humans for the directory's "Show archived" view.
   * Returned as a plain list (not merged into the active maps) so archived
   * records never leak into the directory grid or search; the archived set
   * is small, so a single unpaginated read is fine.
   */
  const fetchArchivedHumans = useCallback(async (): Promise<any[]> => {
    if (!supabase) return [];
    const { data, error: err } = await supabase
      .from("humans")
      .select("*")
      .not("archived_at", "is", null)
      .order("name")
      .order("surname")
      .limit(200);
    if (err) {
      logger.error("fetchArchivedHumans failed", err, {
        tags: { hook: "useHumans", op: "fetchArchivedHumans" },
      });
      return [];
    }
    return (data || []).map((row: any) => buildHumanMapEntry(row));
  }, []);

  return {
    humans,
    humansById,
    loading,
    error,
    hasMore,
    totalCount,
    directoryHumans,
    availableLetters,
    dirSort,
    dirFilters,
    dirLetter,
    loadMore,
    setDirSort,
    toggleDirFilter,
    setDirLetter,
    fetchArchivedHumans,
    // Cache setters shared with the sibling humans sub-hooks so optimistic
    // CRUD, merges and on-demand lookups all write into the same maps.
    setHumans,
    setHumansById,
    setError,
    setTotalCount,
    setDirectoryHumans,
  };
}
