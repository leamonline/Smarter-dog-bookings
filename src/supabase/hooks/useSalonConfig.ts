import { useState, useEffect, useCallback } from "react";
import { supabase } from "../client.ts";
import { dbConfigToApp, appConfigToDb } from "../transforms.ts";
import { useToast } from "../../hooks/useToast.tsx";
import type { SalonConfig } from "../../types.ts";

export function useSalonConfig() {
  const [config, setConfig] = useState<SalonConfig | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const showToast = useToast();

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    async function fetch() {
      const { data, error: err } = await supabase!
        .from("salon_config")
        .select("*")
        .limit(1)
        .single();
      if (err) {
        setError(err.message);
      } else {
        setConfig(dbConfigToApp(data));
      }
      setLoading(false);
    }
    fetch();
  }, []);

  const updateConfig = useCallback(
    async (updaterOrValue: SalonConfig | ((prev: SalonConfig | null) => SalonConfig)) => {
      const newConfig =
        typeof updaterOrValue === "function"
          ? updaterOrValue(config)
          : updaterOrValue;
      const prev = config;
      setConfig(newConfig);

      if (!supabase) return;
      const { error: err } = await supabase
        .from("salon_config")
        .update(appConfigToDb(newConfig))
        .not("id", "is", null);
      if (err) {
        console.error("Failed to update config:", err);
        showToast?.("Failed to save settings", "error");
        setConfig(prev);
      }
    },
    [config, showToast]
  );

  return { config, loading, error, updateConfig };
}
