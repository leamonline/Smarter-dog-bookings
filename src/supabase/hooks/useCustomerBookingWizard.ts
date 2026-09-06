// Data hook for the customer booking wizard (Debt #12): binds the customer
// Supabase client to the repository and RPC functions BookingWizard.tsx used
// to call with the client directly, so the component never imports the
// client itself. Each method returns the raw repository result on purpose —
// the wizard keeps its own error handling, denial mapping and funnel
// telemetry, which is where the domain reasoning (and its tests) live.
import { customerSupabase } from "../customerClient";
import {
  createMany,
  getDepositSettings,
  joinWaitlist,
  listBlockedSeats,
  listDepositStamps,
  listImmediateSlots,
  listOnDateForCapacity,
  requestCustomerOverrideReschedule,
  rescheduleCustomerBooking,
} from "../repositories/bookingsRepo";
import { listForHuman } from "../repositories/dogsRepo";
import { getBookingRules } from "../repositories/humansRepo";
import {
  resolveChangeDeadlinePreview,
  resolveCustomerPortalPolicy,
} from "../customerBookingRules";
import { logBookingDenial, logFunnelEvent } from "../rpc";

type Client = NonNullable<typeof customerSupabase>;

function requireClient(): Client {
  if (!customerSupabase) throw new Error("Not connected");
  return customerSupabase;
}

/** The confirm step's re-check: the same three reads the slot picker used. */
export async function loadConfirmAvailability(date: string) {
  const client = requireClient();
  return Promise.all([
    listOnDateForCapacity(client, date),
    listBlockedSeats(client, date, date),
    listImmediateSlots(client),
  ] as const);
}

const wizardData = {
  /** False in sample-data mode or before credentials exist; the methods throw. */
  get connected(): boolean {
    return Boolean(customerSupabase);
  },
  resolvePortalPolicy(onRpcError?: Parameters<typeof resolveCustomerPortalPolicy>[1]) {
    return resolveCustomerPortalPolicy(requireClient(), onRpcError);
  },
  /**
   * Is the slot the customer is about to take already past the point where
   * they could change or cancel it online? The server answers from the
   * settings the cancellation gate enforces; the client never works it out.
   */
  resolveChangeDeadlinePreview(
    params: Parameters<typeof resolveChangeDeadlinePreview>[1],
    onRpcError?: Parameters<typeof resolveChangeDeadlinePreview>[2],
  ) {
    return resolveChangeDeadlinePreview(requireClient(), params, onRpcError);
  },
  getBookingRules(humanId: string) {
    return getBookingRules(requireClient(), humanId);
  },
  listDogs(input: Parameters<typeof listForHuman>[1]) {
    return listForHuman(requireClient(), input);
  },
  /** Fire-and-forget telemetry; callers swallow the returned promise's rejection. */
  logDenial(input: Parameters<typeof logBookingDenial>[1]) {
    return logBookingDenial(requireClient(), input);
  },
  logFunnel(input: Parameters<typeof logFunnelEvent>[1]) {
    return logFunnelEvent(requireClient(), input);
  },
  loadConfirmAvailability,
  requestOverrideReschedule(input: Parameters<typeof requestCustomerOverrideReschedule>[1]) {
    return requestCustomerOverrideReschedule(requireClient(), input);
  },
  reschedule(input: Parameters<typeof rescheduleCustomerBooking>[1]) {
    return rescheduleCustomerBooking(requireClient(), input);
  },
  createBookings(inputs: Parameters<typeof createMany>[1]) {
    return createMany(requireClient(), inputs);
  },
  listDepositStamps(bookingIds: string[]) {
    return listDepositStamps(requireClient(), bookingIds);
  },
  getDepositSettings() {
    return getDepositSettings(requireClient());
  },
  joinWaitlist(input: Parameters<typeof joinWaitlist>[1]) {
    return joinWaitlist(requireClient(), input);
  },
};

export type CustomerBookingWizardData = typeof wizardData;

/**
 * The client is a module constant, so the returned object is a stable
 * singleton — safe to list in effect dependency arrays.
 */
export function useCustomerBookingWizard(): CustomerBookingWizardData {
  return wizardData;
}
