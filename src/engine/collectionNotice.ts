// ============================================================
// src/engine/collectionNotice.ts
//
// Pure rule for the "ready for collection" WhatsApp notice when one owner
// has several dogs in on the same day.
//
// One message per owner, sent only once EVERY dog of theirs that is still in
// the salon is ready. Until then the notice is held back, so the owner is not
// told "Bella is ready" and then "Bella and Max are ready" an hour apart.
//
//   ready    – Ready for collection (this booking counts as ready: the modal
//              opens on the transition itself, before the row is re-read)
//   gone     – Completed (already collected). Never blocks the notice and is
//              never named: that dog is already home.
//   ignored  – Cancelled / No-show. Never coming, so never waited for.
//   waiting  – anything else (Booked, Reconfirmed, Arrived). Blocks the notice.
// ============================================================

import { BOOKING_STATUS } from "../constants/salon";
import { normaliseUkMobile } from "../utils/phone.js";

export interface CollectionContact {
  phone?: string | null;
  whatsapp_opted_out?: boolean | null;
  sms?: boolean | null;
  sms_opted_out?: boolean | null;
}

export type CollectionRoute =
  | { channel: "whatsapp" }
  | { channel: "sms"; because: "whatsapp_unreachable" | "whatsapp_opted_out" }
  | { channel: null; reason: string };

/**
 * Which channel a collection notice goes out on for one recipient.
 *
 * WhatsApp first. It falls back to SMS when WhatsApp cannot reach them:
 *
 *   - the number looks like it isn't on WhatsApp (`whatsappUnreachable`: the
 *     last few WhatsApp sends were all undeliverable). Text it. A pickup notice
 *     is an operational message, so, like the WhatsApp path, it doesn't need the
 *     "SMS reminders" preference ticked (`humans.sms` defaults to false, so
 *     requiring it would leave almost everyone unreachable).
 *   - they replied STOP to WhatsApp. That is an explicit request, so SMS is used
 *     only if they have chosen SMS (`sms`). The same rule as the reminder
 *     fallback (recipients.ts channelAvailableFor).
 *
 * An SMS opt-out always wins, and no usable mobile means no notice at all.
 * sms-send does not check opt-outs itself, so this is where they are enforced.
 */
export function collectionNoticeRoute(
  contact: CollectionContact | null | undefined,
  opts: { whatsappUnreachable?: boolean } = {},
): CollectionRoute {
  if (!normaliseUkMobile(contact?.phone || "")) {
    return { channel: null, reason: "No mobile number on file" };
  }
  const whatsappOptedOut = Boolean(contact?.whatsapp_opted_out);
  const unreachable = Boolean(opts.whatsappUnreachable);

  if (!whatsappOptedOut && !unreachable) return { channel: "whatsapp" };

  if (contact?.sms_opted_out) {
    return {
      channel: null,
      reason: whatsappOptedOut ? "Opted out of WhatsApp and SMS" : "Not on WhatsApp, and opted out of SMS",
    };
  }
  if (whatsappOptedOut) {
    return contact?.sms
      ? { channel: "sms", because: "whatsapp_opted_out" }
      : { channel: null, reason: "Opted out of WhatsApp" };
  }
  return { channel: "sms", because: "whatsapp_unreachable" };
}

export interface OwnerDayRow {
  id: string;
  status?: string | null;
  dog_name_snapshot?: string | null;
  dogs?: { name?: string | null } | Array<{ name?: string | null }> | null;
}

export interface CollectionNoticeReadiness {
  /** Dogs to name in the message, in the order they were given. */
  readyDogNames: string[];
  /** Dogs still in the salon and not yet ready. Non-empty means hold the notice. */
  waitingDogNames: string[];
}

/**
 * True for a booking that is still to be groomed or in the salon, i.e. one
 * whose owner's notice must wait for it. Ready, collected, cancelled and
 * no-show bookings never hold a notice.
 */
export function blocksCollectionNotice(status: string | null | undefined): boolean {
  return (
    status !== BOOKING_STATUS.READY_FOR_COLLECTION &&
    status !== BOOKING_STATUS.COMPLETED &&
    status !== BOOKING_STATUS.CANCELLED &&
    status !== BOOKING_STATUS.NO_SHOW
  );
}

export interface NoticeHoldView {
  status?: string | null;
  ownerId?: string | null;
  date?: string | null;
}

/**
 * Did this change stop a booking from holding its owner's notice back?
 *
 * A held notice is not stored anywhere: it is simply not opened. So when the
 * booking that was holding it leaves (cancelled, no-show, collected, moved to
 * another day or owner, or deleted) the caller must re-open the notice for
 * the owner's Ready dog, or it is stranded. `after` is null for a delete.
 * A booking moving INTO Ready is excluded: that transition opens its own
 * notice.
 */
export function releasesHeldNotice(before: NoticeHoldView, after: NoticeHoldView | null): boolean {
  if (!blocksCollectionNotice(before.status)) return false;
  if (!after) return true;
  if (after.status === BOOKING_STATUS.READY_FOR_COLLECTION) return false;
  return (
    !blocksCollectionNotice(after.status) ||
    (after.ownerId ?? null) !== (before.ownerId ?? null) ||
    (after.date ?? null) !== (before.date ?? null)
  );
}

function dogNameOf(row: OwnerDayRow): string {
  const dog = Array.isArray(row.dogs) ? row.dogs[0] : row.dogs;
  return (dog?.name || row.dog_name_snapshot || "").trim();
}

function pushUnique(list: string[], name: string) {
  if (name && !list.includes(name)) list.push(name);
}

export function collectionNoticeReadiness(
  rows: readonly OwnerDayRow[],
  currentBookingId: string | null | undefined,
): CollectionNoticeReadiness {
  const readyDogNames: string[] = [];
  const waitingDogNames: string[] = [];

  for (const row of rows) {
    const status = row.status ?? "";
    if (row.id === currentBookingId || status === BOOKING_STATUS.READY_FOR_COLLECTION) {
      pushUnique(readyDogNames, dogNameOf(row));
    } else if (blocksCollectionNotice(status)) {
      pushUnique(waitingDogNames, dogNameOf(row));
    }
  }

  return { readyDogNames, waitingDogNames };
}
