// Data hook for the staff messaging modals' contact reads (Debt #12): binds
// the staff Supabase client to the humans/bookings repository reads that
// CollectionNoticeModal, SendReminderModal and ComposeNewModal need, so none imports the
// client. Raw repository results; the modals keep their own composition and
// error handling.
import { supabase } from "../client";
import {
  getContactCard,
  getHumanById,
  getReminderContact,
  listContactCards,
  listTrustedContactLinks,
  searchHumansAndDogs,
} from "../repositories/humansRepo";
import { listOwnerBookingsOnDate, listServicesForBookings } from "../repositories/bookingsRepo";
import { listForHuman } from "../repositories/dogsRepo";

type Client = NonNullable<typeof supabase>;

function requireClient(): Client {
  if (!supabase) throw new Error("Not connected");
  return supabase;
}

const contacts = {
  /** False in sample-data mode or before credentials exist; the loaders throw. */
  get connected(): boolean {
    return Boolean(supabase);
  },
  getContactCard: (humanId: string) => getContactCard(requireClient(), humanId),
  listContactCards: (humanIds: string[]) => listContactCards(requireClient(), humanIds),
  listTrustedContactLinks: (humanId: string) => listTrustedContactLinks(requireClient(), humanId),
  listOwnerBookingsOnDate: (date: string, ownerId: string) =>
    listOwnerBookingsOnDate(requireClient(), date, ownerId),
  getReminderContact: (humanId: string) => getReminderContact(requireClient(), humanId),
  listServicesForBookings: (bookingIds: string[]) =>
    listServicesForBookings(requireClient(), bookingIds),
  // Compose-new picker (Tier 1.1f): search, deep-link target, and the
  // picked customer's dogs for the template auto-fill.
  getHumanById: (humanId: string) => getHumanById(requireClient(), humanId),
  searchHumansAndDogs: (query: string) => searchHumansAndDogs(requireClient(), query),
  listDogsForHuman: (input: Parameters<typeof listForHuman>[1]) =>
    listForHuman(requireClient(), input),
};

export type StaffContacts = typeof contacts;

/** The client is a module constant, so this is a stable singleton. */
export function useStaffContacts(): StaffContacts {
  return contacts;
}
