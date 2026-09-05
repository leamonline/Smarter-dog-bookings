import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../../client";
import { CHANNELS, uniqueChannelName } from "../../realtimeChannels";
import { listPendingSignups, SIGNUP_PAGE_SIZE, type SignupPage } from "../../repositories/signupApprovalRepo";

export function useSignupApprovalQueue(enabled: boolean) {
  const [page, setPage] = useState(0);
  const [data, setData] = useState<SignupPage>({ customers: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const request = useRef(0);
  const invalidate = useCallback(() => { request.current++; }, []);
  const refresh = useCallback(async () => {
    const id = ++request.current;
    if (!enabled || !supabase) { setLoading(false); return; }
    setLoading(true);
    try {
      const result = await listPendingSignups(supabase, page);
      if (id !== request.current) return;
      if (page > 0 && page * SIGNUP_PAGE_SIZE >= result.total) { setPage(page - 1); return; }
      setData(result);
      setError(null);
    } catch (err) {
      if (id === request.current) setError(err instanceof Error ? err.message : "Couldn't load approvals.");
    } finally {
      if (id === request.current) setLoading(false);
    }
  }, [enabled, page]);
  useEffect(() => {
    void refresh();
    return invalidate;
  }, [refresh, invalidate]);
  useEffect(() => {
    if (!enabled || !supabase) return;
    const client = supabase;
    const channel = client.channel(uniqueChannelName(CHANNELS.signupApprovalQueue))
      .on("postgres_changes", { event: "*", schema: "public", table: "humans" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "dogs" }, refresh).subscribe();
    const onFocus = () => { void refresh(); };
    window.addEventListener("focus", onFocus);
    return () => { void client.removeChannel(channel); window.removeEventListener("focus", onFocus); };
  }, [enabled, refresh]);
  return { ...data, page, setPage, loading, error, refresh };
}
