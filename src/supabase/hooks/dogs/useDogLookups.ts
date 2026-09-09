// useDogLookups — on-demand hydration of dogs the paginated directory
// window hasn't loaded, extracted from useDogs (the seam-review split,
// mirroring humans/useHumanLookups). fetchDogById resolves one dog
// (cache first), ensureDogsForHumans fills dogsByHumanId for a set of
// owners, and ensureDogsByIds merges missing rows into dogsById so booking
// views stop rendering "Unknown". None of these are deferred by the
// directory's startDirectoryFetch flag.
import { useCallback, useRef } from "react";
import { supabase } from "../../client";
import { sanitiseFieldValue } from "../../../utils/sanitiseFieldValue";
import { logger } from "../../../lib/logger";
import type { MutableRefObject } from "react";
import type { Dog, DogSize } from "../../../types/index";
import type {
  DogRow,
  DogsByIdMap,
  HumansById,
  SetDogsByHumanIdMap,
  SetDogsByIdMap,
} from "./helpers";

export function useDogLookups({
  dogsById,
  humansById,
  setDogsById,
  setDogsByHumanId,
  fetchedHumanIdsRef,
  inflightHumanIdsRef,
}: {
  dogsById: DogsByIdMap;
  humansById: HumansById;
  setDogsById: SetDogsByIdMap;
  setDogsByHumanId: SetDogsByHumanIdMap;
  // Owned by useDogsDirectory because invalidateHuman (called from the
  // realtime handlers + mutations) clears them alongside dogsByHumanId.
  fetchedHumanIdsRef: MutableRefObject<Set<string>>;
  inflightHumanIdsRef: MutableRefObject<Set<string>>;
}) {
  const fetchedDogIdsRef = useRef<Set<string>>(new Set());
  const inflightDogIdsRef = useRef<Set<string>>(new Set());

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
  }, [dogsById, humansById, setDogsById]);

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
  }, [humansById, setDogsByHumanId, fetchedHumanIdsRef, inflightHumanIdsRef]);

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
    [dogsById, setDogsById],
  );

  return { fetchDogById, ensureDogsForHumans, ensureDogsByIds };
}
