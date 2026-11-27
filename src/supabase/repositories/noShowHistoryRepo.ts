import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "../client";

/** One no-show appointment: a group of dogs on one date counts once. */
export interface NoShowItem {
  bookingDate: string;
  slot: string | null;
  dogNames: string[];
  /** True when the customer cancelled on the day; false when staff marked it. */
  customerCancelled: boolean;
  reason: string | null;
}

export interface NoShowHistory {
  /** No-show appointments in the last 12 months, counted from `since`. */
  count: number;
  /** How many no-shows require a deposit. The database owns the number (ADR 015). */
  threshold: number;
  /** The day the two-no-show rule started; earlier no-shows do not count. */
  since: string | null;
  items: NoShowItem[];
}

const UNAVAILABLE = "No-show history unavailable";

/** Staff-only read of `staff_customer_no_show_history` (migration 20261124200000). */
export async function getNoShowHistory(humanId: string, client: SupabaseClient | null = supabase): Promise<NoShowHistory> {
  if (!client) throw new Error(UNAVAILABLE);
  const { data, error } = await client.rpc("staff_customer_no_show_history", { p_human_id: humanId });
  if (error) throw error;
  const row = data as unknown as {
    count: unknown; threshold: unknown; windowMonths: unknown; since: unknown;
    items: Array<{ bookingDate: unknown; slot: unknown; dogNames: unknown; customerCancelled: unknown; reason: unknown }>;
  } | null;
  if (
    !row || !Number.isInteger(row.count) || (row.count as number) < 0
    || !Number.isInteger(row.threshold) || (row.threshold as number) < 1
    || row.windowMonths !== 12 || (row.since !== null && typeof row.since !== "string") || !Array.isArray(row.items)
  ) throw new Error(UNAVAILABLE);
  if (row.items.some((i) => !i || typeof i.bookingDate !== "string"
    || (i.slot !== null && typeof i.slot !== "string")
    || !Array.isArray(i.dogNames) || (i.dogNames as unknown[]).some((n) => n !== null && typeof n !== "string")
    || typeof i.customerCancelled !== "boolean"
    || (i.reason !== null && typeof i.reason !== "string"))) throw new Error(UNAVAILABLE);
  return {
    count: row.count as number,
    threshold: row.threshold as number,
    since: row.since as string | null,
    items: row.items.map((i) => ({
      bookingDate: i.bookingDate as string,
      slot: i.slot as string | null,
      dogNames: (i.dogNames as Array<string | null>).filter((n): n is string => typeof n === "string" && n.trim() !== ""),
      customerCancelled: i.customerCancelled as boolean,
      reason: i.reason as string | null,
    })),
  };
}
