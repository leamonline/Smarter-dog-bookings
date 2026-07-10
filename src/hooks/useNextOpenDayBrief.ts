// Closed-day brief data: resolve the next open day (day_settings override
// first, weekday default second — the same precedence isDateOpen documents)
// and fetch that day's non-cancelled bookings. Self-contained because
// useBookings only loads the current week and the next open day usually
// isn't in it. Read-only: rows carry just what the brief renders.
import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "../supabase/client.js";
import { BOOKING_STATUS } from "../constants/salon";
import { getDefaultOpenForDate } from "../engine/utils";
import { logger } from "../lib/logger";
import { addDaysStr } from "./useUnpaidFortnight";

export const LOOKAHEAD_DAYS = 10;

/**
 * Pure next-open-day resolution. `openByDate` holds explicit day_settings
 * overrides (true/false); an absent key falls back to the weekday default.
 * Searches tomorrow → today+lookahead; null when nothing is open.
 */
export function resolveNextOpenDay(
  todayStr: string,
  openByDate: Record<string, boolean | undefined>,
  lookaheadDays: number = LOOKAHEAD_DAYS,
): string | null {
  for (let i = 1; i <= lookaheadDays; i++) {
    const dateStr = addDaysStr(todayStr, i);
    const [y, m, d] = dateStr.split("-").map(Number);
    const open = openByDate[dateStr] ?? getDefaultOpenForDate(new Date(y, m - 1, d));
    if (open) return dateStr;
  }
  return null;
}

/** The minimal booking shape the read-only brief renders. */
export interface BriefBooking {
  id: string;
  slot?: string;
  service?: string;
  size?: string;
  status?: string;
  payment: string;
  addons: string[] | null;
  priceOverride: number | null;
  dogName: string;
  breed: string;
  owner: string;
  _dogId: string | null;
  _ownerId: null;
  _bookingDate: string;
}

interface DbBriefRow {
  id: string;
  slot: string | null;
  service: string | null;
  size: string | null;
  status: string | null;
  payment: string | null;
  addons: string[] | null;
  price_override: number | null;
  dog_name_snapshot: string | null;
  breed_snapshot: string | null;
  owner_name_snapshot: string | null;
  dog_id: string | null;
  booking_date: string;
}

const BRIEF_COLUMNS =
  "id, slot, service, size, status, payment, addons, price_override, dog_name_snapshot, breed_snapshot, owner_name_snapshot, dog_id, booking_date";

function rowToBriefBooking(row: DbBriefRow): BriefBooking {
  return {
    id: row.id,
    slot: row.slot ?? undefined,
    service: row.service ?? undefined,
    size: row.size ?? undefined,
    status: row.status ?? undefined,
    payment: row.payment || "Due at Pick-up",
    addons: row.addons ?? null,
    priceOverride: row.price_override ?? null,
    // Snapshots are the fallback; resolveBookingDisplay prefers the live
    // dog/owner rows via _dogId, same precedence as the main transform.
    dogName: row.dog_name_snapshot || "",
    breed: row.breed_snapshot || "",
    owner: row.owner_name_snapshot || "",
    _dogId: row.dog_id,
    _ownerId: null,
    _bookingDate: row.booking_date,
  };
}

export async function fetchNextOpenDayBrief(
  client: SupabaseClient,
  todayStr: string,
  signal: AbortSignal,
): Promise<{ dateStr: string | null; bookings: BriefBooking[] }> {
  const { data: dsRows, error: dsError } = await client
    .from("day_settings")
    .select("setting_date, is_open")
    .gt("setting_date", todayStr)
    .lte("setting_date", addDaysStr(todayStr, LOOKAHEAD_DAYS))
    .abortSignal(signal);
  if (dsError) throw new Error(dsError.message);

  const openByDate: Record<string, boolean | undefined> = {};
  for (const r of (dsRows ?? []) as Array<{ setting_date: string; is_open: boolean | null }>) {
    if (r.is_open != null) openByDate[r.setting_date] = r.is_open;
  }
  const dateStr = resolveNextOpenDay(todayStr, openByDate);
  if (!dateStr) return { dateStr: null, bookings: [] };

  const { data: rows, error } = await client
    .from("bookings")
    .select(BRIEF_COLUMNS)
    .eq("booking_date", dateStr)
    .neq("status", BOOKING_STATUS.CANCELLED)
    .order("slot")
    .abortSignal(signal);
  if (error) throw new Error(error.message);
  return { dateStr, bookings: ((rows ?? []) as DbBriefRow[]).map(rowToBriefBooking) };
}

interface NextOpenDayBrief {
  loading: boolean;
  /** false offline or on fetch error — the UI shows "couldn't load", never an asserted-empty diary. */
  available: boolean;
  dateStr: string | null;
  bookings: BriefBooking[];
  /** true when the lookahead found no open day at all. */
  noOpenDay: boolean;
  refresh: () => void;
}

const EMPTY: Omit<NextOpenDayBrief, "refresh"> = {
  loading: true, available: false, dateStr: null, bookings: [], noOpenDay: false,
};

export function useNextOpenDayBrief(todayStr: string, enabled: boolean): NextOpenDayBrief {
  const [state, setState] = useState<Omit<NextOpenDayBrief, "refresh">>(EMPTY);
  const [reloadKey, setReloadKey] = useState(0);
  const refresh = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    if (!enabled) return;
    if (!supabase) {
      // Offline: we can still NAME the next default-open day, but we cannot
      // verify its diary — available:false makes the UI say so honestly.
      setState({ loading: false, available: false, dateStr: resolveNextOpenDay(todayStr, {}), bookings: [], noOpenDay: false });
      return;
    }
    const controller = new AbortController();
    setState((s) => ({ ...s, loading: true }));
    fetchNextOpenDayBrief(supabase, todayStr, controller.signal)
      .then(({ dateStr, bookings }) => {
        if (controller.signal.aborted) return;
        setState({ loading: false, available: true, dateStr, bookings, noOpenDay: dateStr === null });
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        logger.error("useNextOpenDayBrief: failed to load the next open day", err);
        setState({ loading: false, available: false, dateStr: null, bookings: [], noOpenDay: false });
      });
    return () => controller.abort();
  }, [todayStr, enabled, reloadKey]);

  return { ...state, refresh };
}
