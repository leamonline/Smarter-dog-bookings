import { useCallback, useEffect, useState } from "react";
import { supabase } from "../supabase/client";
import { getDogGroomingIntervals } from "../supabase/rpc";
import {
  computeRetentionCandidates,
  type RetentionInterval,
  type RetentionDog,
  type RetentionHuman,
  type RetentionMark,
  type RetentionCandidate,
} from "../engine/reportsAnalytics";
import { logger } from "../lib/logger";

/** A dog whose owner was messaged within this many days counts as recently
 *  contacted (so the report can de-prioritise them). */
const RECENT_CONTACT_DAYS = 14;

interface RetentionResult {
  loading: boolean;
  available: boolean; // false offline / on error — the report shows an honest note
  candidates: RetentionCandidate[];
  excludedCount: number;
  overdueCount: number;
}

interface UseRetentionData extends RetentionResult {
  refresh: () => void;
  /** Snooze or exclude a dog from retention prompts (writes retention_marks). */
  mark: (dogId: string, kind: "snoozed" | "excluded", reason?: string, until?: string | null) => Promise<boolean>;
}

const EMPTY: RetentionResult = { loading: true, available: false, candidates: [], excludedCount: 0, overdueCount: 0 };

export function useRetentionData(): UseRetentionData {
  const [result, setResult] = useState<RetentionResult>(EMPTY);
  const [reloadKey, setReloadKey] = useState(0);
  const refresh = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      if (!supabase) {
        // Offline / sample data has no completed-booking history to model.
        setResult({ ...EMPTY, loading: false, available: false });
        return;
      }
      setResult((r) => ({ ...r, loading: true }));

      const sinceContact = new Date();
      sinceContact.setDate(sinceContact.getDate() - RECENT_CONTACT_DAYS);

      try {
        const [iv, dg, hm, mk, nl] = await Promise.all([
          getDogGroomingIntervals(supabase).abortSignal(controller.signal),
          supabase.from("dogs").select("id, name, size, human_id, archived_at").abortSignal(controller.signal),
          supabase
            .from("humans")
            .select("id, name, archived_at, sms_opted_out, whatsapp_opted_out, email_opted_out")
            .abortSignal(controller.signal),
          supabase.from("retention_marks").select("dog_id, kind, until, created_at").order("created_at", { ascending: true }).abortSignal(controller.signal),
          supabase
            .from("notification_log")
            .select("human_id, sent_at")
            .eq("status", "sent")
            .gte("sent_at", sinceContact.toISOString())
            .abortSignal(controller.signal),
        ]);

        if (controller.signal.aborted) return;
        if (iv.error) throw new Error(iv.error.message);

        const intervals: Record<string, RetentionInterval> = {};
        ((iv.data || []) as Array<{
          dog_id: string;
          visit_count: number;
          median_interval_days: number | null;
          last_groomed_date: string | null;
          last_service: string | null;
        }>).forEach((r) => {
          intervals[r.dog_id] = {
            visitCount: r.visit_count,
            medianIntervalDays: r.median_interval_days,
            lastGroomedDate: r.last_groomed_date,
            lastService: r.last_service,
          };
        });

        const dogs: Record<string, RetentionDog> = {};
        ((dg.data || []) as Array<{ id: string; name: string; size: string | null; human_id: string; archived_at: string | null }>).forEach((d) => {
          dogs[d.id] = { id: d.id, name: d.name, size: d.size ?? undefined, humanId: d.human_id, archivedAt: d.archived_at };
        });

        const humans: Record<string, RetentionHuman> = {};
        ((hm.data || []) as Array<{ id: string; name: string; archived_at: string | null; sms_opted_out: boolean | null; whatsapp_opted_out: boolean | null; email_opted_out: boolean | null }>).forEach((h) => {
          humans[h.id] = {
            id: h.id,
            name: h.name,
            archivedAt: h.archived_at,
            smsOptedOut: !!h.sms_opted_out,
            whatsappOptedOut: !!h.whatsapp_opted_out,
            emailOptedOut: !!h.email_opted_out,
          };
        });

        const marks: RetentionMark[] = ((mk.data || []) as Array<{ dog_id: string; kind: "snoozed" | "excluded"; until: string | null; created_at: string | null }>).map((m) => ({
          dog_id: m.dog_id,
          kind: m.kind,
          until: m.until,
          createdAt: m.created_at,
        }));

        // Recent contact is by owner (notification_log has no dog_id). Map the
        // most recent send per human, then attribute to that human's dogs.
        const contactByHuman: Record<string, string> = {};
        ((nl.data || []) as Array<{ human_id: string | null; sent_at: string | null }>).forEach((row) => {
          if (!row.human_id || !row.sent_at) return;
          if (!contactByHuman[row.human_id] || row.sent_at > contactByHuman[row.human_id]) {
            contactByHuman[row.human_id] = row.sent_at;
          }
        });
        const recentContactByDog: Record<string, string | null> = {};
        Object.values(dogs).forEach((d) => {
          recentContactByDog[d.id] = contactByHuman[d.humanId] ?? null;
        });

        const { candidates, excludedCount, overdueCount } = computeRetentionCandidates({
          intervals,
          dogs,
          humans,
          marks,
          recentContactByDog,
          today: new Date(),
        });

        setResult({ loading: false, available: true, candidates, excludedCount, overdueCount });
      } catch (err) {
        if (!controller.signal.aborted) {
          logger.error("useRetentionData: failed to load retention data", err);
          setResult({ ...EMPTY, loading: false, available: false });
        }
      }
    }

    load();
    return () => controller.abort();
  }, [reloadKey]);

  const mark = useCallback(
    async (dogId: string, kind: "snoozed" | "excluded", reason?: string, until?: string | null): Promise<boolean> => {
      if (!supabase) return false;
      const { error } = await supabase.from("retention_marks").insert({ dog_id: dogId, kind, reason: reason ?? null, until: until ?? null });
      if (error) {
        logger.error("useRetentionData: failed to save retention mark", error);
        return false;
      }
      refresh();
      return true;
    },
    [refresh],
  );

  return { ...result, refresh, mark };
}
