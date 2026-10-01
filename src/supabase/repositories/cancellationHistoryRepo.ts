import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "../client";

export interface LateCancellation {
  id: string;
  bookingDate: string;
  requestedAt: string;
  reason: string;
  actorScope: string;
  waivedAt: string | null;
  waiverReason: string | null;
}
export interface CancellationHistory {
  count: number;
  reviewRequired: boolean;
  items: LateCancellation[];
}
export async function getCancellationHistory(humanId: string, client: SupabaseClient | null = supabase): Promise<CancellationHistory> {
  if (!client) throw new Error("Cancellation history unavailable");
  const { data, error } = await client.rpc("staff_customer_cancellation_history", { p_human_id: humanId });
  if (error) throw error;
  const row = data as unknown as { count: number; reviewRequired: boolean; windowMonths: number; items: Array<{ id: string; booking_date: string; requested_at: string; reason: string; actor_scope: string; waived_at: string | null; waiver_reason: string | null }> };
  if (!row || !Number.isInteger(row.count) || row.count < 0 || typeof row.reviewRequired !== "boolean" || row.windowMonths !== 12 || !Array.isArray(row.items)) throw new Error("Cancellation history unavailable");
  if (row.items.some((i) => !i || typeof i.id !== "string" || typeof i.booking_date !== "string" || typeof i.requested_at !== "string" || !Number.isFinite(Date.parse(i.requested_at)) || typeof i.reason !== "string" || typeof i.actor_scope !== "string" || (i.waived_at !== null && typeof i.waived_at !== "string") || (i.waiver_reason !== null && typeof i.waiver_reason !== "string"))) throw new Error("Cancellation history unavailable");
  return { count: row.count, reviewRequired: row.reviewRequired, items: row.items.map((i) => ({ id: i.id, bookingDate: i.booking_date, requestedAt: i.requested_at, reason: i.reason, actorScope: i.actor_scope, waivedAt: i.waived_at, waiverReason: i.waiver_reason })) };
}
export async function waiveCancellation(incidentId: string, reason: string, client: SupabaseClient | null = supabase) {
  if (!client) throw new Error("Cancellation history unavailable");
  const { error } = await client.rpc("waive_late_cancellation", { p_incident_id: incidentId, p_reason: reason });
  if (error) throw error;
}
