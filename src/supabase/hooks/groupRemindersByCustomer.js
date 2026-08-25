// ============================================================
// src/supabase/hooks/groupRemindersByCustomer.js
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

function joinNamesAmp(names) {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  return names.slice(0, -1).join(", ") + " & " + names[names.length - 1];
}

/**
 * @param {Array<object>} bookings - rows ordered by slot ascending, each with
 *   { id, slot, dog_id, dog_name_snapshot, owner_name_snapshot, dogs?: { human_id, name } }
 * @param {Map<string, { status, sent_at, channel }>} sentMap - reminder log keyed by booking_id
 * @returns {Array<object>} one row per customer
 */
export function groupRemindersByCustomer(bookings, sentMap = new Map()) {
  const groups = new Map();

  for (const b of bookings ?? []) {
    const humanId = b.dogs?.human_id ?? null;
    const key = humanId ?? `orphan:${b.id}`;

    let group = groups.get(key);
    if (!group) {
      group = {
        customerKey: key,
        customerName: b.owner_name_snapshot || "Unknown customer",
        dogsById: new Map(), // dog_id -> display name; first (earliest slot) wins
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
    let sentChannel = null;
    let pendingChannel = null;
    let latestSentAt = null;
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
    const reminderStatus = allSent ? "sent" : anyPending ? "pending" : null;

    // The row shows one aggregated tick, so the LATEST confirmation's source
    // decides the wording ('customer' | 'staff'; null-source legacy rows read
    // as customer — WhatsApp was the only confirm path before the source).
    let confirmed = false;
    let latestConfirmedAt = null;
    let latestConfirmedBy = null;
    for (const b of bookings ?? []) {
      const groupKey = (b.dogs?.human_id ?? null) ?? `orphan:${b.id}`;
      if (groupKey !== g.customerKey) continue;
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
