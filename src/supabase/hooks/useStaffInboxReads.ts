// Data hook for the inbox's side-panel reads (Debt #12): binds the staff
// Supabase client to the repository queries that useCustomerContext,
// useInboxMessageSearch and useSlotCapacityPreview used to run with the
// client directly. Raw PostgREST results on purpose — the hooks keep their
// own shaping, timeouts and error handling.
import { supabase } from "../client";
import { listRecentPastForOwner, listSeatsOnDate } from "../repositories/bookingsRepo";
import { listCustomerContextDogs } from "../repositories/dogsRepo";
import { getCustomerContextProfile, listTrustedContactsWithNames } from "../repositories/humansRepo";
import { searchMessageConversationIds } from "../repositories/whatsappRepo";

type Client = NonNullable<typeof supabase>;

function requireClient(): Client {
  if (!supabase) throw new Error("Not connected");
  return supabase;
}

/** Everything the customer-context panel reads for one owner, in parallel. */
export function loadCustomerContext(
  humanId: string,
  { before, signal }: { before: string; signal?: AbortSignal },
) {
  const client = requireClient();
  return Promise.all([
    getCustomerContextProfile(client, humanId, signal),
    listCustomerContextDogs(client, humanId, signal),
    listRecentPastForOwner(client, { humanId, before }, signal),
    listTrustedContactsWithNames(client, humanId, signal),
  ] as const);
}

const inboxReads = {
  /** False in sample-data mode or before credentials exist; the loaders throw. */
  get connected(): boolean {
    return Boolean(supabase);
  },
  loadCustomerContext,
  searchMessageConversationIds: (query: string, limit: number) =>
    searchMessageConversationIds(requireClient(), query, limit),
  listSeatsOnDate: (date: string) => listSeatsOnDate(requireClient(), date),
};

export type StaffInboxReads = typeof inboxReads;

/** The client is a module constant, so this is a stable singleton. */
export function useStaffInboxReads(): StaffInboxReads {
  return inboxReads;
}
