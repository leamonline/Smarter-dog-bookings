import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../client.js";
import {
  dbDogsToMap,
  buildDogsById,
  findHumanByIdOrName,
} from "../transforms.js";

const PAGE_SIZE = 50;

export function useDogs(humansById: Record<string, any>) {
  const [dogs, setDogs] = useState<Record<string, any>>({});
  const [dogsById, setDogsById] = useState<Record<string, any>>({});
  const [dogsByHumanId, setDogsByHumanId] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);

  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchedHumanIdsRef = useRef<Set<string>>(new Set());
  const inflightHumanIdsRef = useRef<Set<string>>(new Set());

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

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function fetchDogs(limit = PAGE_SIZE) {
      setLoading(true);
      setError(null);

      const { count, error: countErr } = await supabase!
        .from("dogs")
        .select("*", { count: "exact", head: true });

      if (cancelled) return;

      if (countErr) {
        setError(countErr.message);
        setLoading(false);
        return;
      }

      setTotalCount(count ?? 0);

      const { data, error: err } = await supabase!
        .from("dogs")
        .select("*")
        .order("name")
        .limit(limit);

      if (cancelled) return;

      if (err) {
        setError(err.message);
        setLoading(false);
        return;
      }

      const rows = data || [];
      setDogsById(buildDogsById(rows));
      setDogs(dbDogsToMap(rows, humansById || {}));
      setHasMore(rows.length >= limit);
      setLoading(false);
    }

    fetchDogs();

    // Real-time subscription for dogs
    const channel = supabase!
      .channel(`dogs-realtime-${Date.now()}-${Math.random()}`)
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "dogs" },
        (payload: any) => {
          const oldRow = payload.old;
          if (!oldRow.id) return;
          setDogsById((prev) => {
            const next = { ...prev };
            const cached = next[oldRow.id];
            invalidateHuman(oldRow.human_id ?? cached?.human_id);
            delete next[oldRow.id];
            return next;
          });
          setDogs((prev) => {
            const next = { ...prev };
            delete next[oldRow.id];
            return next;
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "dogs" },
        (payload: any) => {
          invalidateHuman(payload.new?.human_id);
          fetchDogs();
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "dogs" },
        (payload: any) => {
          invalidateHuman(payload.old?.human_id);
          invalidateHuman(payload.new?.human_id);
          fetchDogs();
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase!.removeChannel(channel);
    };
  }, [humansById]);

  const loadMore = useCallback(async () => {
    if (!supabase) return;

    const currentCount = Object.keys(dogsById).length;

    const { data, error: err } = await supabase
      .from("dogs")
      .select("*")
      .order("name")
      .range(currentCount, currentCount + PAGE_SIZE - 1);

    if (err) {
      setError(err.message);
      return;
    }

    const rows = data || [];
    const newDogsById = buildDogsById(rows);
    const newDogs = dbDogsToMap(rows, humansById || {});

    setDogsById((prev) => ({ ...prev, ...newDogsById }));
    setDogs((prev) => ({ ...prev, ...newDogs }));
    setHasMore(rows.length >= PAGE_SIZE);
  }, [dogsById, humansById]);

  const clearSearch = useCallback(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    setSearchQuery("");
    setIsSearching(false);

    if (!supabase) return;

    (async () => {
      const { count } = await supabase!
        .from("dogs")
        .select("*", { count: "exact", head: true });

      setTotalCount(count ?? 0);

      const { data, error: err } = await supabase!
        .from("dogs")
        .select("*")
        .order("name")
        .limit(PAGE_SIZE);

      if (err) {
        setError(err.message);
        return;
      }

      const rows = data || [];
      setDogsById(buildDogsById(rows));
      setDogs(dbDogsToMap(rows, humansById || {}));
      setHasMore(rows.length >= PAGE_SIZE);
    })();
  }, [humansById]);

  const searchDogs = useCallback(
    (query: string) => {
      setSearchQuery(query);

      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }

      if (!query.trim()) {
        clearSearch();
        return;
      }

      searchTimeoutRef.current = setTimeout(async () => {
        if (!supabase) return;

        setIsSearching(true);

        const { data, error: err } = await supabase
          .from("dogs")
          .select("*")
          .ilike("name", `%${query}%`)
          .order("name");

        setIsSearching(false);

        if (err) {
          setError(err.message);
          return;
        }

        const rows = data || [];
        setDogsById(buildDogsById(rows));
        setDogs(dbDogsToMap(rows, humansById || {}));
        setHasMore(false);
      }, 300);
    },
    [humansById, clearSearch],
  );

  const updateDog = useCallback(
    async (dogIdentifier: string, updates: Record<string, any>) => {
      const existingDog =
        dogsById[dogIdentifier] ||
        dogs[dogIdentifier] ||
        Object.values(dogs).find(
          (dog: any) => dog.id === dogIdentifier || dog.name === dogIdentifier,
        );

      if (!existingDog) return;

      const prevDogs = dogs;
      const prevDogsById = dogsById;

      const updatedDog = {
        ...existingDog,
        ...updates,
      };

      setDogs((prev) => ({
        ...prev,
        [existingDog.id]: {
          ...(prev[existingDog.id] || existingDog),
          ...updates,
        },
      }));

      setDogsById((prev) => ({
        ...prev,
        [existingDog.id]: {
          ...(prev[existingDog.id] || {}),
          ...updates,
        },
      }));

      if (!supabase) return updatedDog;

      const dbUpdates: Record<string, any> = {};
      if (updates.name !== undefined) dbUpdates.name = updates.name;
      if (updates.breed !== undefined) dbUpdates.breed = updates.breed;
      if (updates.age !== undefined) dbUpdates.age = updates.age;
      if (updates.dob !== undefined) dbUpdates.dob = updates.dob;
      if (updates.groomNotes !== undefined)
        dbUpdates.groom_notes = updates.groomNotes;
      if (updates.alerts !== undefined) dbUpdates.alerts = updates.alerts;
      if (updates.customPrice !== undefined)
        dbUpdates.custom_price = updates.customPrice;
      if (updates.size !== undefined) dbUpdates.size = updates.size;

      if (updates.humanId !== undefined) {
        const owner = findHumanByIdOrName(humansById, updates.humanId);
        if (!owner?.id) {
          console.error(
            "Failed to update dog owner: owner not found",
            updates.humanId,
          );
          setDogs(prevDogs);
          setDogsById(prevDogsById);
          return null;
        }
        dbUpdates.human_id = owner.id;
      }

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
        console.error("Failed to update dog:", err);
        setDogs(prevDogs);
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
        size: savedRow.size || null,
        humanId: owner ? owner.fullName : savedRow.human_id,
        _humanId: savedRow.human_id || owner?.id || null,
        alerts: savedRow.alerts || [],
        groomNotes: savedRow.groom_notes || "",
        customPrice: savedRow.custom_price,
      };

      setDogsById((prev) => ({ ...prev, [savedRow.id]: savedRow }));
      setDogs((prev) => ({ ...prev, [savedDog.id]: savedDog }));
      invalidateHuman(prevDogsById[existingDog.id]?.human_id);
      invalidateHuman(savedRow.human_id);

      return savedDog;
    },
    [dogs, dogsById, humansById, invalidateHuman],
  );

  const addDog = useCallback(
    async (dogData: Record<string, any>) => {
      const owner = findHumanByIdOrName(humansById, dogData.humanId);

      if (!owner?.id) {
        console.error("Owner not found:", dogData.humanId);
        return null;
      }

      const optimisticDog = {
        name: dogData.name,
        breed: dogData.breed,
        age: dogData.age || "",
        size: dogData.size || null,
        humanId: owner.fullName || dogData.humanId,
        alerts: [],
        groomNotes: dogData.groomNotes || "",
        customPrice: undefined,
      };

      if (!supabase) {
        const offlineDog = {
          id: `temp-${Date.now()}`,
          ...optimisticDog,
          _humanId: owner.id,
        };
        setDogs((prev) => ({ ...prev, [offlineDog.id]: offlineDog }));
        setDogsById((prev) => ({
          ...prev,
          [offlineDog.id]: {
            id: offlineDog.id,
            name: offlineDog.name,
            breed: offlineDog.breed,
            age: offlineDog.age,
            size: offlineDog.size,
            human_id: owner.id,
            alerts: [],
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
        })
        .select("*")
        .single();

      if (err) {
        console.error("Failed to add dog:", err);
        setError(err.message);
        return null;
      }

      const savedDog = {
        id: data.id,
        name: data.name,
        breed: data.breed,
        age: data.age || "",
        size: data.size || null,
        humanId: owner.fullName || dogData.humanId,
        _humanId: data.human_id || owner.id,
        alerts: data.alerts || [],
        groomNotes: data.groom_notes || "",
        customPrice: data.custom_price,
      };

      setDogs((prev) => ({ ...prev, [savedDog.id]: savedDog }));
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

      const prevDogs = dogs;
      const prevDogsById = dogsById;

      // Optimistic remove
      setDogsById((prev) => {
        const next = { ...prev };
        delete next[dogId];
        return next;
      });
      setDogs((prev) => {
        const next = { ...prev };
        delete next[dogId];
        return next;
      });

      if (!supabase) return { ok: true };

      const { error: err } = await supabase.from("dogs").delete().eq("id", dogId);

      if (err) {
        // Rollback on failure
        setDogs(prevDogs);
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
    [dogs, dogsById, invalidateHuman],
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
        breed: row.breed,
        age: row.age || "",
        size: (row.size as any) || null,
        humanId: owner ? owner.fullName : (row.human_id || ""),
        _humanId: row.human_id || null,
        alerts: row.alerts || [],
        groomNotes: row.groom_notes || "",
        customPrice: row.custom_price,
        dob: row.dob || "",
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
      size: (data.size as any) || null,
      humanId: owner ? owner.fullName : (data.human_id || ""),
      _humanId: data.human_id || null,
      alerts: data.alerts || [],
      groomNotes: data.groom_notes || "",
      customPrice: data.custom_price,
      dob: data.dob || "",
    };
    setDogs((prev) => ({ ...prev, [data.id]: dogObj }));

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
      console.error("ensureDogsForHumans failed:", err);
      missing.forEach((id) => fetchedHumanIdsRef.current.delete(id));
      return;
    }

    const rows = data || [];
    const grouped: Record<string, any[]> = {};
    for (const id of missing) grouped[id] = [];
    for (const row of rows) {
      const hid = row.human_id;
      if (!hid) continue;
      const dog = {
        id: row.id,
        name: row.name,
        breed: row.breed,
        age: row.age || "",
        size: row.size || null,
        humanId: humansById?.[hid]?.fullName || hid,
        _humanId: hid,
        alerts: row.alerts || [],
        groomNotes: row.groom_notes || "",
        customPrice: row.custom_price,
      };
      (grouped[hid] = grouped[hid] || []).push(dog);
    }

    setDogsByHumanId((prev) => ({ ...prev, ...grouped }));
  }, [humansById]);

  return {
    dogs,
    dogsById,
    dogsByHumanId,
    ensureDogsForHumans,
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
  };
}
