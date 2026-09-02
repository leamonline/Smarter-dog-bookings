// Data hook for the Weekly Cash-Up sheet (Debt #12): binds the staff
// Supabase client to the three week-scoped reads useWeeklyCashUp used to
// run with the client directly. Raw PostgREST results; the cash-up hook
// keeps its own transform, grouping and error handling.
import { supabase } from "../client";
import { fetchBookingsWeek } from "../queries/bootQueries.js";
import { listCashUpDogs } from "../repositories/dogsRepo";
import { listCashUpHumans } from "../repositories/humansRepo";

type Client = NonNullable<typeof supabase>;

function requireClient(): Client {
  if (!supabase) throw new Error("Not connected");
  return supabase;
}

/** The week's bookings (with the notification_log embed), every dog and every human, in parallel. */
export function loadWeekSnapshot(startStr: string, endStr: string, signal?: AbortSignal) {
  const client = requireClient();
  return Promise.all([
    fetchBookingsWeek(client, startStr, endStr, signal),
    listCashUpDogs(client, signal),
    listCashUpHumans(client, signal),
  ] as const);
}

const weekSnapshot = {
  /** False in sample-data mode or before credentials exist; the loader throws. */
  get connected(): boolean {
    return Boolean(supabase);
  },
  loadWeekSnapshot,
};

export type StaffWeekSnapshot = typeof weekSnapshot;

/** The client is a module constant, so this is a stable singleton. */
export function useStaffWeekSnapshot(): StaffWeekSnapshot {
  return weekSnapshot;
}
