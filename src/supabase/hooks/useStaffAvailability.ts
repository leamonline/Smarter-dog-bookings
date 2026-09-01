// Data hook for staff-side availability reads (Debt #12): binds the staff
// Supabase client to the occupancy repository so RescheduleModal never
// imports the client itself. Mirrors useCustomerAvailability on the customer
// side; returns raw repository results.
import { supabase } from "../client";
import { listOnDateForCapacity } from "../repositories/bookingsRepo";

type Client = NonNullable<typeof supabase>;

function requireClient(): Client {
  if (!supabase) throw new Error("Not connected");
  return supabase;
}

/** Every booking on a date, via the get_slot_occupancy RPC, for the capacity engine. */
export async function loadDayOccupancy(date: string) {
  return listOnDateForCapacity(requireClient(), date);
}

const availability = {
  /** False in sample-data mode or before credentials exist; the loaders throw. */
  get connected(): boolean {
    return Boolean(supabase);
  },
  loadDayOccupancy,
};

export type StaffAvailability = typeof availability;

/** The client is a module constant, so this is a stable singleton. */
export function useStaffAvailability(): StaffAvailability {
  return availability;
}
