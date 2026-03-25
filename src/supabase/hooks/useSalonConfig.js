import { useState, useEffect, useCallback } from "react";
import { supabase } from "../client.js";
import { dbConfigToApp, appConfigToDb } from "../transforms.js";

export function useSalonConfig() {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    async function fetch() {
      const { data, error: err } = await supabase
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
    async (updaterOrValue) => {
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
        .not("id", "is", null); // update the single row
      if (err) {
        console.error("Failed to update config:", err);
        setConfig(prev);
      }
    },
    [config]
  );

  return { config, loading, error, updateConfig };
}
