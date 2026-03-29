import { useState, useEffect, useCallback } from "react";
import { supabase } from "../client.js";
import {
  dbDogsToMap,
  buildDogsById,
  findHumanByIdOrName,
} from "../transforms.js";

export function useDogs(humansById) {
  const [dogs, setDogs] = useState({});
  const [dogsById, setDogsById] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function fetchDogs() {
      setLoading(true);
      setError(null);

      const { data, error: err } = await supabase
        .from("dogs")
        .select("*")
        .order("name");

      if (cancelled) return;

      if (err) {
        setError(err.message);
        setLoading(false);
        return;
      }

      const rows = data || [];
      setDogsById(buildDogsById(rows));
      setDogs(dbDogsToMap(rows, humansById || {}));
      setLoading(false);
    }

    fetchDogs();

    // Real-time subscription for dogs
    const channel = supabase
      .channel(`dogs-realtime-${Date.now()}-${Math.random()}`)
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "dogs" },
        (payload) => {
          const oldRow = payload.old;
          if (!oldRow.id) return;
          setDogsById((prev) => {
            const next = { ...prev };
            delete next[oldRow.id];
            return next;
          });
          setDogs((prev) => {
            const next = { ...prev };
            const entry = Object.entries(next).find(
              ([, dog]) => dog.id === oldRow.id,
            );
            if (entry) delete next[entry[0]];
            return next;
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "dogs" },
        () => {
          fetchDogs();
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "dogs" },
        () => {
          fetchDogs();
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [humansById]);

  const updateDog = useCallback(
    async (dogIdentifier, updates) => {
      const existingDog =
        dogs[dogIdentifier] ||
        dogsById[dogIdentifier] ||
        Object.values(dogs).find(
          (dog) => dog.id === dogIdentifier || dog.name === dogIdentifier,
        );

      if (!existingDog) return;

      const prevDogs = dogs;
      const prevDogsById = dogsById;

      const updatedDog = {
        ...existingDog,
        ...updates,
      };

      setDogs((prev) => {
        const next = { ...prev };
        const previousKey = existingDog.name;
        const nextKey = updatedDog.name || existingDog.name;

        if (previousKey !== nextKey) {
          delete next[previousKey];
        }

        next[nextKey] = {
          ...(next[previousKey] || existingDog),
          ...updates,
        };

        return next;
      });

      setDogsById((prev) => ({
        ...prev,
        [existingDog.id]: {
          ...(prev[existingDog.id] || {}),
          ...updates,
        },
      }));

      if (!supabase) return updatedDog;

      const dbUpdates = {};
      if (updates.name !== undefined) dbUpdates.name = updates.name;
      if (updates.breed !== undefined) dbUpdates.breed = updates.breed;
      if (updates.age !== undefined) dbUpdates.age = updates.age;
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
      setDogs((prev) => {
        const next = { ...prev };
        delete next[existingDog.name];
        next[savedDog.name] = savedDog;
        return next;
      });

      return savedDog;
    },
    [dogs, dogsById, humansById],
  );

  const addDog = useCallback(
    async (dogData) => {
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
        setDogs((prev) => ({ ...prev, [offlineDog.name]: offlineDog }));
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

      setDogs((prev) => ({ ...prev, [savedDog.name]: savedDog }));
      setDogsById((prev) => ({ ...prev, [data.id]: data }));

      return savedDog;
    },
    [humansById],
  );

  return { dogs, dogsById, loading, error, updateDog, addDog };
}
