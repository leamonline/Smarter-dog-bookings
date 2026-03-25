import { useState, useEffect, useCallback } from "react";
import { supabase } from "../client.js";
import { dbDogsToMap, buildDogsById } from "../transforms.js";

export function useDogs(humansById) {
  const [dogs, setDogs] = useState({});
  const [dogsById, setDogsById] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!supabase || !humansById || Object.keys(humansById).length === 0) {
      setLoading(false);
      return;
    }
    async function fetch() {
      const { data, error: err } = await supabase
        .from("dogs")
        .select("*")
        .order("name");
      if (err) { setError(err.message); setLoading(false); return; }

      const byId = buildDogsById(data);
      setDogsById(byId);
      setDogs(dbDogsToMap(data, humansById));
      setLoading(false);
    }
    fetch();
  }, [humansById]);

  const updateDog = useCallback(
    async (dogName, updates) => {
      const prev = dogs;
      setDogs((p) => ({
        ...p,
        [dogName]: { ...p[dogName], ...updates },
      }));

      if (!supabase) return;

      const dog = prev[dogName];
      if (!dog) return;

      const dbUpdates = {};
      if (updates.groomNotes !== undefined) dbUpdates.groom_notes = updates.groomNotes;
      if (updates.alerts !== undefined) dbUpdates.alerts = updates.alerts;
      if (updates.customPrice !== undefined) dbUpdates.custom_price = updates.customPrice;

      if (Object.keys(dbUpdates).length > 0) {
        const { error: err } = await supabase.from("dogs").update(dbUpdates).eq("id", dog.id);
        if (err) {
          console.error("Failed to update dog:", err);
          setDogs(prev);
        }
      }
    },
    [dogs]
  );

  return { dogs, dogsById, loading, error, updateDog };
}
