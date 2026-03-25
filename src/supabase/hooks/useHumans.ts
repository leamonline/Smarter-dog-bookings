import { useState, useEffect, useCallback } from "react";
import { supabase } from "../client.ts";
import { dbHumansToMap, buildHumansById } from "../transforms.ts";
import { useToast } from "../../hooks/useToast.tsx";
import type { Human, HumansMap, HumansById } from "../../types.ts";

export function useHumans() {
  const [humans, setHumans] = useState<HumansMap>({});
  const [humansById, setHumansById] = useState<HumansById>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const showToast = useToast();

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    async function fetch() {
      const { data: humanRows, error: err } = await supabase!
        .from("humans")
        .select("*")
        .order("name");
      if (err) { setError(err.message); setLoading(false); return; }

      const { data: trustedRows } = await supabase!
        .from("human_trusted_contacts")
        .select("human_id, trusted_id");

      const byId = buildHumansById(humanRows);
      setHumansById(byId);

      const trustedMap: Record<string, string[]> = {};
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
    async (humanKey: string, updates: Partial<Human>) => {
      const prev = humans;
      setHumans((p) => ({
        ...p,
        [humanKey]: { ...p[humanKey], ...updates },
      }));

      if (!supabase) return;

      const human = prev[humanKey];
      if (!human) return;
      const uuid = human.id;

      const dbUpdates: Record<string, unknown> = {};
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
          showToast?.("Failed to update contact", "error");
          setHumans(prev);
        }
      }

      if (updates.trustedIds !== undefined) {
        const trustedUuids = updates.trustedIds
          .map((name) => {
            const h = Object.values(humansById).find((v) => v.fullName === name);
            return h?.id;
          })
          .filter(Boolean);

        await supabase.from("human_trusted_contacts").delete().eq("human_id", uuid);
        if (trustedUuids.length > 0) {
          const { error: err } = await supabase.from("human_trusted_contacts").insert(
            trustedUuids.map((tid) => ({ human_id: uuid, trusted_id: tid }))
          );
          if (err) {
            console.error("Failed to update trusted contacts:", err);
            showToast?.("Failed to update trusted contacts", "error");
          }
        }
      }
    },
    [humans, humansById, showToast]
  );

  return { humans, humansById, loading, error, updateHuman };
}
