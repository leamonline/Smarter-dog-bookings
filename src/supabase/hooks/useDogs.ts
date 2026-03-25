import { useState, useEffect, useCallback } from "react";
import { supabase } from "../client.ts";
import { dbDogsToMap, buildDogsById } from "../transforms.ts";
import { useToast } from "../../hooks/useToast.tsx";
import type { Dog, DogsMap, DogsById, HumansById } from "../../types.ts";

export function useDogs(humansById: HumansById | null) {
  const [dogs, setDogs] = useState<DogsMap>({});
  const [dogsById, setDogsById] = useState<DogsById>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const showToast = useToast();

  useEffect(() => {
    if (!supabase || !humansById || Object.keys(humansById).length === 0) {
      setLoading(false);
      return;
    }
    async function fetch() {
      const { data, error: err } = await supabase!
        .from("dogs")
        .select("*")
        .order("name");
      if (err) { setError(err.message); setLoading(false); return; }

      const byId = buildDogsById(data);
      setDogsById(byId);
      setDogs(dbDogsToMap(data, humansById!));
      setLoading(false);
    }
    fetch();
  }, [humansById]);

  const updateDog = useCallback(
    async (dogName: string, updates: Partial<Dog>) => {
      const prev = dogs;
      setDogs((p) => ({
        ...p,
        [dogName]: { ...p[dogName], ...updates },
      }));

      if (!supabase) return;

      const dog = prev[dogName];
      if (!dog) return;

      const dbUpdates: Record<string, unknown> = {};
      if (updates.groomNotes !== undefined) dbUpdates.groom_notes = updates.groomNotes;
      if (updates.alerts !== undefined) dbUpdates.alerts = updates.alerts;
      if (updates.customPrice !== undefined) dbUpdates.custom_price = updates.customPrice;

      if (Object.keys(dbUpdates).length > 0) {
        const { error: err } = await supabase.from("dogs").update(dbUpdates).eq("id", dog.id);
        if (err) {
          console.error("Failed to update dog:", err);
          showToast?.("Failed to update dog", "error");
          setDogs(prev);
        }
      }
    },
    [dogs, showToast]
  );

  return { dogs, dogsById, loading, error, updateDog };
}
