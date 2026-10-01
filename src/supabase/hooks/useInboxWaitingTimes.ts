import { useEffect, useState } from "react";
import { supabase } from "../client";
import { fetchInboxWorkingSchedule } from "../repositories/inboxWorkingSchedule";
import { londonDateStr } from "../../engine/londonTime";
import { workingHoursSince, type WorkingSchedule } from "../../engine/workingHoursSince";
import { unansweredRequestSince, type RequestTail } from "../../lib/whatsapp/unansweredRequest";

export function useInboxWaitingTimes(conversations: (RequestTail & { id: string })[]) {
  const [now, setNow] = useState(() => new Date());
  const [loaded, setLoaded] = useState<{ key: string; schedule: WorkingSchedule } | null>(null);
  const to = londonDateStr(now);
  const starts = conversations.map(unansweredRequestSince).filter((v): v is string => !!v).sort();
  // Bounded read: older requests are explicitly unavailable, never rounded down.
  const floor = londonDateStr(new Date(now.getTime() - 365 * 86400000));
  const from = starts.length ? (londonDateStr(new Date(starts[0])) < floor ? floor : londonDateStr(new Date(starts[0]))) : to;
  const key = `${from}/${to}`;
  useEffect(() => {
    let alive = true;
    let generation = 0;
    const refresh = async () => {
      const request = ++generation;
      setLoaded(null);
      if (!supabase) return;
      try {
        const schedule = await fetchInboxWorkingSchedule(supabase, from, to);
        if (alive && request === generation) setLoaded({ key, schedule });
      } catch { /* Unknown is displayed rather than retaining stale opening claims. */ }
    };
    void refresh();
    const timer = window.setInterval(() => { setNow(new Date()); void refresh(); }, 60000);
    const focus = () => { setNow(new Date()); void refresh(); };
    window.addEventListener("focus", focus);
    return () => { alive = false; clearInterval(timer); window.removeEventListener("focus", focus); };
  }, [from, to, key]);
  const schedule = loaded?.key === key ? loaded.schedule : null;
  return Object.fromEntries(conversations.map((c) => {
    const start = unansweredRequestSince(c);
    if (!start) return [c.id, null];
    const hours = workingHoursSince(start, schedule, now);
    const minutes = hours === null ? null : Math.floor(hours * 60);
    return [c.id, minutes === null ? "Waiting time unavailable" : `Waiting ${Math.floor(minutes / 60)}h ${minutes % 60}m working time`];
  }));
}
