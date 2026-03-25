import { useState, useEffect, useCallback } from "react";
import { supabase } from "../client.js";
import { dbHumansToMap, buildHumansById } from "../transforms.js";

export function useHumans() {
  const [humans, setHumans] = useState({});
  const [humansById, setHumansById] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    async function fetch() {
      // Fetch humans
      const { data: humanRows, error: err } = await supabase
        .from("humans")
        .select("*")
        .order("name");
      if (err) { setError(err.message); setLoading(false); return; }

      // Fetch trusted contacts
      const { data: trustedRows } = await supabase
        .from("human_trusted_contacts")
        .select("human_id, trusted_id");

      const byId = buildHumansById(humanRows);
      setHumansById(byId);

      // Build trusted map: humanId -> [fullName, fullName, ...]
      const trustedMap = {};
      for (const tc of trustedRows || []) {
        if (!trustedMap[tc.human_id]) trustedMap[tc.human_id] = [];
        const trustedHuman = byId[tc.trusted_id];
        if (trustedHuman) trustedMap[tc.human_id].push(trustedHuman.fullName);
      }

      setHumans(dbHumansToMap(humanRows, trustedMap));
      setLoading(false);
    }
    fetch();
  }, []);

  const updateHuman = useCallback(
    async (humanKey, updates) => {
      const prev = humans;
      setHumans((p) => ({
        ...p,
        [humanKey]: { ...p[humanKey], ...updates },
      }));

      if (!supabase) return;

      const human = prev[humanKey];
      if (!human) return;
      const uuid = human.id;

      // Map component fields to DB columns
      const dbUpdates = {};
      if (updates.notes !== undefined) dbUpdates.notes = updates.notes;
      if (updates.phone !== undefined) dbUpdates.phone = updates.phone;
      if (updates.sms !== undefined) dbUpdates.sms = updates.sms;
      if (updates.whatsapp !== undefined) dbUpdates.whatsapp = updates.whatsapp;
      if (updates.email !== undefined) dbUpdates.email = updates.email;
      if (updates.address !== undefined) dbUpdates.address = updates.address;
      if (updates.historyFlag !== undefined) dbUpdates.history_flag = updates.historyFlag;

      if (Object.keys(dbUpdates).length > 0) {
        const { error: err } = await supabase.from("humans").update(dbUpdates).eq("id", uuid);
        if (err) {
          console.error("Failed to update human:", err);
          setHumans(prev);
        }
      }

      // Handle trusted contacts update
      if (updates.trustedIds !== undefined) {
        // Find UUIDs for the trusted names
        const trustedUuids = updates.trustedIds
          .map((name) => {
            const h = Object.values(humansById).find((v) => v.fullName === name);
            return h?.id;
          })
          .filter(Boolean);

        // Delete existing and re-insert
        await supabase.from("human_trusted_contacts").delete().eq("human_id", uuid);
        if (trustedUuids.length > 0) {
          await supabase.from("human_trusted_contacts").insert(
            trustedUuids.map((tid) => ({ human_id: uuid, trusted_id: tid }))
          );
        }
      }
    },
    [humans, humansById]
  );

  return { humans, humansById, loading, error, updateHuman };
}
