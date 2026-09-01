import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { supabase } from "../client";
import { CHANNELS, uniqueChannelName } from "../realtimeChannels";
import { searchDogsDirectory } from "../rpc";
import {
  dbDogsToMap,
  buildDogsById,
  findHumanByIdOrName,
} from "../transforms";
import { sanitiseFieldValue } from "../../utils/sanitiseFieldValue";
import { logger } from "../../lib/logger";
import { safeGet, safeSet } from "../../lib/storage";
import type { Database } from "../database.types";
import type { DbDogRow } from "../transforms";
import type { HumanCacheEntry } from "./humans/helpers";
import type { Dog, DogSize } from "../../types/index";
import type {
  RealtimePostgresDeletePayload,
  RealtimePostgresInsertPayload,
  RealtimePostgresUpdatePayload,
} from "@supabase/supabase-js";

const PAGE_SIZE = 50;

type DogRow = Database["public"]["Tables"]["dogs"]["Row"];
type DogUpdate = Database["public"]["Tables"]["dogs"]["Update"];

/** The owner lookup map useHumans maintains (see humans/helpers for its two shapes). */
export type HumansById = Record<string, HumanCacheEntry>;

/** A search_dogs_directory row: a dog row plus the joined owner_* fields. */
interface DirectoryDogRow extends DbDogRow {
  owner_name?: string | null;
  owner_surname?: string | null;
  owner_phone?: string | null;
  owner_whatsapp?: boolean | null;
}

/** App-shaped patch accepted by updateDog (camelCase, any subset). */
export type DogPatch = Partial<Omit<Dog, "id" | "_humanId">> & {
  /** Soft-archive marker: an ISO timestamp to archive, null to unarchive. */
  archivedAt?: string | null;
};

/** What the Add Dog modal / New client wizard hand to addDog. */
export interface NewDogInput {
  name: string;
  breed: string;
  age?: string | null;
  dob?: string | null;
  /** The modal's field name; stored as `sex`. */
  gender?: string | null;
  microchip?: string | null;
  neutered?: boolean | null;
  vet?: string | null;
  colour?: string | null;
  size?: DogSize | null;
  /** Owner id or display name, resolved via findHumanByIdOrName. */
  humanId?: string | null;
  alerts?: string[];
  groomNotes?: string | null;
  /** The New client wizard's freshly-created owner, before humansById re-renders. */
  _ownerOverride?: { id: string; fullName?: string } | null;
}

// Build a Dogs Directory entry from a search_dogs_directory row. Mirrors
// dbDogsToMap's dog shape but also folds on the joined owner_* fields the RPC
// returns, so the card can render the owner name + tel/WhatsApp links without
// depending on the paginated humansById map. Owner placeholders ("Null" etc.)
// are stripped via sanitiseFieldValue, same as the rest of the directory.
function buildDirectoryDogEntry(row: DirectoryDogRow, humansById: HumansById) {
  const owner = humansById?.[row.human_id || ""];
  const ownerName = sanitiseFieldValue(row.owner_name);
  const ownerSurname = sanitiseFieldValue(row.owner_surname);
  const ownerFullName =
    [ownerName, ownerSurname].filter(Boolean).join(" ") || owner?.fullName || "";
  return {
    id: row.id,
    name: row.name,
    breed: sanitiseFieldValue(row.breed),
    age: row.age || "",
    size: (row.size as DogSize | null) || null,
    humanId: ownerFullName || row.human_id || "",
    _humanId: row.human_id || null,
    alerts: row.alerts || [],
    groomNotes: row.groom_notes || "",
    customPrice: row.custom_price ?? undefined,
    // Server-resolved owner display fields (from the RPC's join), read by DogsView.
    ownerFullName,
    ownerPhone: row.owner_phone || "",
    ownerWhatsapp: row.owner_whatsapp || false,
  };
}

export type DirectoryDog = ReturnType<typeof buildDirectoryDogEntry>;

export function useDogs(
  humansById: HumansById,
  // Boot-path deferral (mirrors useHumansData): while startDirectoryFetch is
  // false, the page-0 directory fetch and the realtime-triggered refetches
  // are held back so the 50-row directory read stays off the dashboard's
  // boot path. Flipping it true runs the fetch with the current params.
  // `loading` stays true while deferred. Targeted hydration (ensureDogsByIds
  // / ensureDogsForHumans / fetchDogById) is independent and never deferred.
  { startDirectoryFetch = true }: { startDirectoryFetch?: boolean } = {},
) {
  // Single source of truth for dog records: raw DB rows keyed by id.
  // The app-shaped `dogs` map is DERIVED from this below (Debt #14) —
  // the two can no longer drift because only one of them is state.
  const [dogsById, setDogsById] = useState<Record<string, DbDogRow>>({});
  const [dogsByHumanId, setDogsByHumanId] = useState<Record<string, Dog[]>>({});
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
  const [dirSort, setDirSortState] = useState<"name" | "recent">(() =>
    safeGet("local", "dogsDirSort") === "recent" ? "recent" : "name",
  );
  // Unlike humans, the size filter is an enum (small/medium/large/unset), not a
  // boolean — alert and incomplete are plain booleans.
  const [dirFilters, setDirFilters] = useState<{
    size: string | null;
    alert: boolean;
    incomplete: boolean;
  }>({ size: null, alert: false, incomplete: false });
  const [dirLetter, setDirLetterState] = useState<string | null>(null);

  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchedHumanIdsRef = useRef<Set<string>>(new Set());
  const inflightHumanIdsRef = useRef<Set<string>>(new Set());
  const fetchedDogIdsRef = useRef<Set<string>>(new Set());
  const inflightDogIdsRef = useRef<Set<string>>(new Set());

  // Refs of the loaded directory list (for load-more's offset) and the active
  // query (so realtime refetches and load-more reuse the current params).
  const directoryRef = useRef<DirectoryDog[]>([]);
  const queryRef = useRef<{
    search: string;
    filters: { size: string | null; alert: boolean; incomplete: boolean };
    sort: "name" | "recent";
    letter: string | null;
  }>({
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

  const invalidateHuman = useCallback((humanId: string | null | undefined) => {
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
    async (
      params: {
        search: string;
        filters: { size: string | null; alert: boolean; incomplete: boolean };
        sort: "name" | "recent";
        letter: string | null;
      },
      { append = false }: { append?: boolean } = {},
    ) => {
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
  const setDirSort = useCallback((mode: "name" | "recent") => {
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

  const updateDog = useCallback(
    async (dogIdentifier: string, updates: DogPatch) => {
      const existingDog =
        dogsById[dogIdentifier] ||
        dogs[dogIdentifier] ||
        Object.values(dogs).find(
          (dog) => dog.id === dogIdentifier || dog.name === dogIdentifier,
        );

      if (!existingDog) return;

      const updatedDog = {
        ...existingDog,
        ...updates,
      };

      // Translate the app-shape patch to row shape FIRST: the optimistic
      // write goes into dogsById (the single source of truth) and the
      // derived `dogs` map picks it up on the same render.
      const dbUpdates: DogUpdate = {};
      if (updates.name !== undefined) dbUpdates.name = updates.name;
      if (updates.breed !== undefined) dbUpdates.breed = updates.breed;
      if (updates.age !== undefined) dbUpdates.age = updates.age;
      if (updates.dob !== undefined) dbUpdates.dob = updates.dob;
      if (updates.sex !== undefined) dbUpdates.sex = updates.sex;
      if (updates.microchip !== undefined) dbUpdates.microchip = updates.microchip;
      if (updates.neutered !== undefined) dbUpdates.neutered = updates.neutered;
      // is_pregnant is NOT NULL in the schema; a null patch means "not pregnant".
      if (updates.isPregnant !== undefined) dbUpdates.is_pregnant = updates.isPregnant ?? false;
      if (updates.vet !== undefined) dbUpdates.vet = updates.vet;
      if (updates.colour !== undefined) dbUpdates.colour = updates.colour;
      if (updates.groomNotes !== undefined)
        dbUpdates.groom_notes = updates.groomNotes;
      if (updates.alerts !== undefined) dbUpdates.alerts = updates.alerts;
      if (updates.customPrice !== undefined)
        dbUpdates.custom_price = updates.customPrice;
      if (updates.size !== undefined) dbUpdates.size = updates.size;
      // Soft-archive marker. Handles both archive ({ archivedAt: <iso> }) and
      // unarchive ({ archivedAt: null }); the realtime UPDATE then refetches the
      // directory, which excludes archived dogs.
      if (updates.archivedAt !== undefined) dbUpdates.archived_at = updates.archivedAt;

      if (updates.humanId !== undefined) {
        const owner = findHumanByIdOrName(humansById, updates.humanId);
        if (!owner?.id) {
          logger.error(
            "Failed to update dog owner: owner not found",
            undefined,
            {
              tags: { hook: "useDogs", op: "updateDog" },
              extra: { humanId: updates.humanId },
            },
          );
          // Nothing has been written yet, so there is nothing to roll back.
          return null;
        }
        dbUpdates.human_id = owner.id;
      }

      const prevDogsById = dogsById;
      setDogsById((prev) => ({
        ...prev,
        [existingDog.id]: {
          ...(prev[existingDog.id] || {}),
          ...dbUpdates,
        },
      }));

      if (!supabase) return updatedDog;

      if (Object.keys(dbUpdates).length === 0) {
        return updatedDog;
      }

      const { data, error: err } = await supabase
        .from("dogs")
        .update(dbUpdates)
        .eq("id", existingDog.id)
        .select("*")
        .single();

      if (err) {
        logger.error("Failed to update dog", err, {
          tags: { hook: "useDogs", op: "updateDog" },
        });
        setDogsById(prevDogsById);
        return null;
      }

      const savedRow = data || {
        ...(prevDogsById[existingDog.id] || {}),
        ...dbUpdates,
        id: existingDog.id,
      };
      const owner = humansById?.[savedRow.human_id];
      const savedDog = {
        id: savedRow.id,
        name: savedRow.name,
        breed: savedRow.breed,
        age: savedRow.age || "",
        dob: savedRow.dob || "",
        sex: savedRow.sex || null,
        microchip: savedRow.microchip || null,
        neutered: savedRow.neutered ?? null,
        vet: savedRow.vet || null,
        colour: savedRow.colour || null,
        size: savedRow.size || null,
        humanId: owner ? owner.fullName : savedRow.human_id,
        _humanId: savedRow.human_id || owner?.id || null,
        alerts: savedRow.alerts || [],
        groomNotes: savedRow.groom_notes || "",
        customPrice: savedRow.custom_price,
      };

      setDogsById((prev) => ({ ...prev, [savedRow.id]: savedRow }));
      invalidateHuman(prevDogsById[existingDog.id]?.human_id);
      invalidateHuman(savedRow.human_id);

      return savedDog;
    },
    [dogs, dogsById, humansById, invalidateHuman],
  );

  const addDog = useCallback(
    async (dogData: NewDogInput) => {
      // Normally resolve the owner from the live map. The New client wizard
      // creates a human + dog in the same tick, before humansById has
      // re-rendered with the new owner, so it hands the freshly-created owner
      // in via `_ownerOverride` — without it the lookup misses and the dog
      // would never save. Other callers don't pass it and behave as before.
      const owner = dogData._ownerOverride?.id
        ? dogData._ownerOverride
        : findHumanByIdOrName(humansById, dogData.humanId ?? null);

      if (!owner?.id) {
        logger.error("Owner not found", undefined, {
          tags: { hook: "useDogs", op: "addDog" },
          extra: { humanId: dogData.humanId },
        });
        return null;
      }

      const optimisticDog = {
        name: dogData.name,
        breed: dogData.breed,
        age: dogData.age || "",
        dob: dogData.dob || "",
        sex: dogData.gender || null,
        microchip: dogData.microchip || null,
        neutered: dogData.neutered ?? null,
        vet: dogData.vet || null,
        colour: dogData.colour || null,
        size: dogData.size || null,
        humanId: owner.fullName || dogData.humanId,
        alerts: dogData.alerts || [],
        groomNotes: dogData.groomNotes || "",
        customPrice: undefined,
      };

      if (!supabase) {
        const offlineDog = {
          id: `temp-${Date.now()}`,
          ...optimisticDog,
          _humanId: owner.id,
        };
        // Write the raw pseudo-row only; the derived map reproduces the
        // app shape from it.
        setDogsById((prev) => ({
          ...prev,
          [offlineDog.id]: {
            id: offlineDog.id,
            name: offlineDog.name,
            breed: offlineDog.breed,
            age: offlineDog.age,
            dob: offlineDog.dob || null,
            sex: offlineDog.sex,
            microchip: offlineDog.microchip,
            neutered: offlineDog.neutered,
            vet: offlineDog.vet,
            colour: offlineDog.colour,
            size: offlineDog.size,
            human_id: owner.id,
            alerts: offlineDog.alerts,
            groom_notes: offlineDog.groomNotes,
            custom_price: undefined,
          },
        }));
        invalidateHuman(owner.id);
        return offlineDog;
      }

      setError(null);

      const { data, error: err } = await supabase
        .from("dogs")
        .insert({
          name: dogData.name,
          breed: dogData.breed,
          age: dogData.age || "",
          size: dogData.size || null,
          human_id: owner.id,
          groom_notes: dogData.groomNotes || "",
          // Persist alerts chosen at creation (behaviour flags + any
          // "Allergic to …" note). The modal sends an array or undefined.
          alerts: dogData.alerts || [],
          // The Add Dog modal passes gender → sex; dob is "YYYY-MM" or "".
          // The remaining optional fields are only sent when present.
          sex: dogData.gender || null,
          dob: dogData.dob || null,
          microchip: dogData.microchip || null,
          neutered: dogData.neutered ?? null,
          vet: dogData.vet || null,
          colour: dogData.colour || null,
        })
        .select("*")
        .single();

      if (err) {
        logger.error("Failed to add dog", err, {
          tags: { hook: "useDogs", op: "addDog" },
        });
        setError(err.message);
        return null;
      }

      const savedDog = {
        id: data.id,
        name: data.name,
        breed: data.breed,
        age: data.age || "",
        dob: data.dob || "",
        sex: data.sex || null,
        microchip: data.microchip || null,
        neutered: data.neutered ?? null,
        vet: data.vet || null,
        colour: data.colour || null,
        size: data.size || null,
        humanId: owner.fullName || dogData.humanId,
        _humanId: data.human_id || owner.id,
        alerts: data.alerts || [],
        groomNotes: data.groom_notes || "",
        customPrice: data.custom_price,
      };

      setDogsById((prev) => ({ ...prev, [data.id]: data }));
      invalidateHuman(data.human_id);

      return savedDog;
    },
    [humansById, invalidateHuman],
  );

  const deleteDog = useCallback(
    async (dogId: string): Promise<{ ok: true } | { ok: false; error: string }> => {
      if (!dogId) return { ok: false, error: "Missing dog id" };

      const existing = dogsById[dogId];
      if (!existing) return { ok: false, error: "Dog not found" };

      const prevDogsById = dogsById;

      // Optimistic remove
      setDogsById((prev) => {
        const next = { ...prev };
        delete next[dogId];
        return next;
      });

      if (!supabase) return { ok: true };

      const { error: err } = await supabase.from("dogs").delete().eq("id", dogId);

      if (err) {
        // Rollback on failure
        setDogsById(prevDogsById);
        const friendly =
          err.code === "23503"
            ? "This dog can't be deleted — it's still referenced by other records."
            : err.message || "Failed to delete dog";
        return { ok: false, error: friendly };
      }

      setTotalCount((c) => Math.max(0, c - 1));
      invalidateHuman(existing.human_id);
      return { ok: true };
    },
    [dogsById, invalidateHuman],
  );

  const fetchDogById = useCallback(async (dogId: string) => {
    if (!dogId) return null;

    // Check local cache first
    if (dogsById[dogId]) {
      const row = dogsById[dogId];
      const owner = humansById?.[row.human_id || ""];
      return {
        id: row.id,
        name: row.name,
        breed: sanitiseFieldValue(row.breed),
        age: row.age || "",
        size: (row.size as DogSize | null) || null,
        humanId: owner ? owner.fullName : (row.human_id || ""),
        _humanId: row.human_id || null,
        alerts: row.alerts || [],
        groomNotes: row.groom_notes || "",
        customPrice: row.custom_price,
        dob: row.dob || "",
        sex: row.sex || null,
        microchip: row.microchip || null,
        neutered: row.neutered ?? null,
        vet: row.vet || null,
        colour: row.colour || null,
      };
    }

    if (!supabase) return null;

    const { data, error: err } = await supabase
      .from("dogs")
      .select("*")
      .eq("id", dogId)
      .single();

    if (err || !data) return null;

    // Merge into local caches so subsequent lookups are instant
    setDogsById((prev) => ({ ...prev, [data.id]: data }));
    const owner = humansById?.[data.human_id || ""];
    const dogObj = {
      id: data.id,
      name: data.name,
      breed: data.breed,
      age: data.age || "",
      size: (data.size as DogSize | null) || null,
      humanId: owner ? owner.fullName : (data.human_id || ""),
      _humanId: data.human_id || null,
      alerts: data.alerts || [],
      groomNotes: data.groom_notes || "",
      customPrice: data.custom_price,
      dob: data.dob || "",
      sex: data.sex || null,
      microchip: data.microchip || null,
      neutered: data.neutered ?? null,
      vet: data.vet || null,
      colour: data.colour || null,
    };
    return dogObj;
  }, [dogsById, humansById]);

  const ensureDogsForHumans = useCallback(async (humanIds: string[]) => {
    if (!supabase || !humanIds?.length) return;
    const missing = humanIds.filter(
      (id) =>
        id &&
        !fetchedHumanIdsRef.current.has(id) &&
        !inflightHumanIdsRef.current.has(id),
    );
    if (missing.length === 0) return;

    missing.forEach((id) => inflightHumanIdsRef.current.add(id));

    const { data, error: err } = await supabase
      .from("dogs")
      .select("*")
      .in("human_id", missing);

    missing.forEach((id) => {
      inflightHumanIdsRef.current.delete(id);
      fetchedHumanIdsRef.current.add(id);
    });

    if (err) {
      logger.error("ensureDogsForHumans failed", err, {
        tags: { hook: "useDogs", op: "ensureDogsForHumans" },
      });
      missing.forEach((id) => fetchedHumanIdsRef.current.delete(id));
      return;
    }

    const rows = data || [];
    const grouped: Record<string, Dog[]> = {};
    for (const id of missing) grouped[id] = [];
    for (const row of rows) {
      const hid = row.human_id;
      if (!hid) continue;
      const dog = {
        id: row.id,
        name: row.name,
        breed: sanitiseFieldValue(row.breed),
        age: row.age || "",
        dob: row.dob || "",
        sex: row.sex || null,
        microchip: row.microchip || null,
        neutered: row.neutered ?? null,
        vet: row.vet || null,
        colour: row.colour || null,
        size: (row.size as DogSize | null) || null,
        humanId: humansById?.[hid]?.fullName || hid,
        _humanId: hid,
        alerts: row.alerts || [],
        groomNotes: row.groom_notes || "",
        customPrice: row.custom_price ?? undefined,
      };
      (grouped[hid] = grouped[hid] || []).push(dog);
    }

    setDogsByHumanId((prev) => ({ ...prev, ...grouped }));
  }, [humansById]);

  // Mirrors ensureHumansByIds in useHumans: when a booking references a
  // dog whose row sits past the paginated dogs window, the booking grid
  // and detail modal would render "Unknown" because dogsById has no
  // entry to resolve booking.dog_id against. Fetch the missing rows on
  // demand and merge them into both maps so the next render resolves
  // the dog name, breed, size and alerts.
  const ensureDogsByIds = useCallback(
    async (ids: (string | null | undefined)[]) => {
      if (!supabase || !ids?.length) return;
      const missing = Array.from(
        new Set(
          ids.filter(
            (id): id is string =>
              typeof id === "string" &&
              id.length > 0 &&
              !dogsById[id] &&
              !inflightDogIdsRef.current.has(id) &&
              !fetchedDogIdsRef.current.has(id),
          ),
        ),
      );
      if (missing.length === 0) return;

      missing.forEach((id) => inflightDogIdsRef.current.add(id));

      const { data, error: err } = await supabase
        .from("dogs")
        .select("*")
        .in("id", missing);

      missing.forEach((id) => {
        inflightDogIdsRef.current.delete(id);
        fetchedDogIdsRef.current.add(id);
      });

      if (err) {
        logger.error("ensureDogsByIds failed", err, {
          tags: { hook: "useDogs", op: "ensureDogsByIds" },
        });
        missing.forEach((id) => fetchedDogIdsRef.current.delete(id));
        return;
      }

      const rows = data || [];
      if (rows.length === 0) return;

      const byIdAdditions: Record<string, DogRow> = {};
      for (const row of rows) {
        byIdAdditions[row.id] = row;
      }

      setDogsById((prev) => ({ ...prev, ...byIdAdditions }));
    },
    [dogsById],
  );

  return {
    dogs,
    dogsById,
    dogsByHumanId,
    ensureDogsForHumans,
    ensureDogsByIds,
    loading,
    error,
    updateDog,
    addDog,
    deleteDog,
    fetchDogById,
    hasMore,
    totalCount,
    loadMore,
    searchDogs,
    clearSearch,
    searchQuery,
    isSearching,
    // Server-driven directory list + controls
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
