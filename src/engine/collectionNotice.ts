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
    } else if (
      status === BOOKING_STATUS.COMPLETED ||
      status === BOOKING_STATUS.CANCELLED ||
      status === BOOKING_STATUS.NO_SHOW
    ) {
      continue;
    } else {
      pushUnique(waitingDogNames, dogNameOf(row));
    }
  }

  return { readyDogNames, waitingDogNames };
}
