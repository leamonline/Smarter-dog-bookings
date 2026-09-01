// ============================================================
// src/supabase/hooks/groupRemindersByCustomer.ts
//
// Pure grouping for the "Tomorrow's reminders" panel. Collapses a flat
// list of bookings into one row per customer, so a customer with several
// dogs booked the same day shows once and gets a single combined
// reminder. Kept dependency-free so it's unit-testable without a running
// Supabase.
//
// Grouping keys on human_id (a stable UUID), NEVER the display name:
// two different customers can share a first name, and
// owner_name_snapshot is sometimes only a first name. Orphaned bookings
// (dog deleted) get a per-booking key so they never merge with anyone.
// ============================================================

/** The booking columns the grouping reads, as useTomorrowReminders selects them. */
export interface ReminderBookingRow {
  id: string;
  slot: string;
  dog_id?: string | null;
  dog_name_snapshot?: string | null;
  owner_name_snapshot?: string | null;
  reminder_confirmed_at?: string | null;
  /** 'customer' | 'staff'; null on legacy rows, which read as customer. */
  reminder_confirmed_source?: string | null;
  /** Embedded dogs(human_id, name); null when the dog was deleted. */
  dogs?: { human_id: string | null; name?: string | null } | null;
}

/** One notification_log row per booking, keyed by booking_id in the sentMap. */
export interface ReminderLogEntry {
  status?: string | null;
  sent_at?: string | null;
  channel?: string | null;
}

export type ReminderStatus = "sent" | "pending" | null;

/** One row per customer on the reminders panel. */
export interface CustomerReminderRow {
  customerKey: string;
  customerName: string;
  dogNames: string[];
  dogNamesDisplay: string;
  bookingIds: string[];
  anchorBookingId: string;
  slots: string[];
  slot: string | null;
  multiSlot: boolean;
  reminderStatus: ReminderStatus;
  reminderSentAt: string | null;
  reminderChannel: string | null;
  confirmed: boolean;
  reminderConfirmedAt: string | null;
  reminderConfirmedBy: string | null;
}

interface CustomerGroup {
  customerKey: string;
  customerName: string;
  /** dog_id -> display name; first (earliest slot) wins */
  dogsById: Map<string, string>;
  bookingIds: string[];
  slots: Set<string>;
}

function joinNamesAmp(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  return names.slice(0, -1).join(", ") + " & " + names[names.length - 1];
}

function groupKeyFor(b: ReminderBookingRow): string {
  return b.dogs?.human_id ?? `orphan:${b.id}`;
}

/**
 * @param bookings rows ordered by slot ascending
 * @param sentMap reminder log keyed by booking_id
 * @returns one row per customer
 */
export function groupRemindersByCustomer(
  bookings: ReadonlyArray<ReminderBookingRow> | null | undefined,
  sentMap: ReadonlyMap<string, ReminderLogEntry> = new Map(),
): CustomerReminderRow[] {
  const groups = new Map<string, CustomerGroup>();

  for (const b of bookings ?? []) {
    const key = groupKeyFor(b);

    let group = groups.get(key);
    if (!group) {
      group = {
        customerKey: key,
        customerName: b.owner_name_snapshot || "Unknown customer",
        dogsById: new Map(),
        bookingIds: [],
        slots: new Set(),
      };
      groups.set(key, group);
    }

    group.bookingIds.push(b.id);
    group.slots.add(b.slot);
    const dogId = b.dog_id ?? b.id;
    if (!group.dogsById.has(dogId)) {
      group.dogsById.set(dogId, b.dogs?.name || b.dog_name_snapshot || "Unknown dog");
    }
  }

  return [...groups.values()].map((g) => {
    const dogNames = [...g.dogsById.values()];
    const slots = [...g.slots].sort();

    // Derived reminder status across ALL the customer's bookings:
    //   sent    — every booking has a 'sent' log row
    //   pending — at least one booking is mid-send ('pending')
    //   null    — otherwise (clickable)
    let allSent = g.bookingIds.length > 0;
    let anyPending = false;
    let sentChannel: string | null = null;
    let pendingChannel: string | null = null;
    let latestSentAt: string | null = null;
    for (const bid of g.bookingIds) {
      const log = sentMap.get(bid);
      if (log?.status === "sent") {
        if (log.sent_at && (!latestSentAt || log.sent_at > latestSentAt)) {
          latestSentAt = log.sent_at;
        }
        if (!sentChannel) sentChannel = log.channel ?? null;
      } else {
        allSent = false;
        if (log?.status === "pending") {
          anyPending = true;
          if (!pendingChannel) pendingChannel = log.channel ?? null;
        }
      }
    }
    const reminderStatus: ReminderStatus = allSent ? "sent" : anyPending ? "pending" : null;

    // The row shows one aggregated tick, so the LATEST confirmation's source
    // decides the wording ('customer' | 'staff'; null-source legacy rows read
    // as customer — WhatsApp was the only confirm path before the source).
    let confirmed = false;
    let latestConfirmedAt: string | null = null;
    let latestConfirmedBy: string | null = null;
    for (const b of bookings ?? []) {
      if (groupKeyFor(b) !== g.customerKey) continue;
      if (b.reminder_confirmed_at) {
        confirmed = true;
        if (!latestConfirmedAt || b.reminder_confirmed_at > latestConfirmedAt) {
          latestConfirmedAt = b.reminder_confirmed_at;
          latestConfirmedBy = b.reminder_confirmed_source ?? "customer";
        }
      }
    }

    return {
      customerKey: g.customerKey,
      customerName: g.customerName,
      dogNames,
      dogNamesDisplay: joinNamesAmp(dogNames),
      bookingIds: g.bookingIds,
      anchorBookingId: g.bookingIds[0],
      slots,
      slot: slots[0] ?? null,
      multiSlot: slots.length > 1,
      reminderStatus,
      reminderSentAt: latestSentAt,
      reminderChannel: sentChannel ?? pendingChannel ?? null,
      confirmed,
      reminderConfirmedAt: latestConfirmedAt,
      reminderConfirmedBy: latestConfirmedBy,
    };
  });
}
