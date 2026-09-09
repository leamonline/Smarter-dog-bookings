// useDogMutations — optimistic update / add / delete for dogs rows,
// extracted from useDogs (the seam-review split, mirroring
// humans/useHumanMutations). Each mutation writes the raw row into the
// shared dogsById cache first (the derived `dogs` map picks it up on the
// same render), then reconciles or rolls back once the write settles.
import { useCallback } from "react";
import { supabase } from "../../client";
import { findHumanByIdOrName } from "../../transforms";
import { logger } from "../../../lib/logger";
import type { Dispatch, SetStateAction } from "react";
import type { Dog } from "../../../types/index";
import type {
  DogPatch,
  DogUpdate,
  DogsByIdMap,
  HumansById,
  InvalidateHuman,
  NewDogInput,
  SetDogsByIdMap,
} from "./helpers";

export function useDogMutations({
  dogs,
  dogsById,
  humansById,
  setDogsById,
  setError,
  setTotalCount,
  invalidateHuman,
}: {
  dogs: Record<string, Dog>;
  dogsById: DogsByIdMap;
  humansById: HumansById;
  setDogsById: SetDogsByIdMap;
  setError: Dispatch<SetStateAction<string | null>>;
  setTotalCount: Dispatch<SetStateAction<number>>;
  invalidateHuman: InvalidateHuman;
}) {
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
    [dogs, dogsById, humansById, setDogsById, invalidateHuman],
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
    [humansById, setDogsById, setError, invalidateHuman],
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
    [dogsById, setDogsById, setTotalCount, invalidateHuman],
  );

  return { updateDog, addDog, deleteDog };
}
