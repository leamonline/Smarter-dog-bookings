// The dashboard booking card's "next free slot" preview. Reads one 28-day page
// of availability — the same reads the wizard's date step makes — and hands it
// to the pure findNextAvailableSlot engine.
//
// It fails CLOSED: if the open-days, occupancy or blocked-seat read fails, the
// card shows no time at all rather than one the wizard (or the database) would
// then refuse. Holiday closures need no separate read here: a public holiday
// notice is only published when the live diary is closed for those days, so
// get_open_days already reports them closed.
import { useEffect, useState } from "react";
import { useCustomerAvailability } from "./useCustomerAvailability";
import {
  findNextAvailableSlot,
  isOnlineBookableDog,
  type NextAvailableDog,
  type NextAvailableSlot,
} from "../../engine/nextAvailableSlot";
import { getDefaultOpenForDate } from "../../engine/utils";
import { logger } from "../../lib/logger";
import type { SlotOverrides } from "../../types/index";

/** How far ahead the preview looks: one wizard date page. */
export const NEXT_SLOT_WINDOW_DAYS = 28;

export type NextAvailableState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "found"; slot: NextAvailableSlot }
  | { status: "none" }
  | { status: "unavailable" };

function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Tomorrow through the end of the window, device-local like the wizard. */
export function nextSlotWindow(today: Date = new Date(), days = NEXT_SLOT_WINDOW_DAYS): string[] {
  const dates: string[] = [];
  for (let offset = 1; offset <= days; offset += 1) {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset);
    dates.push(toLocalDateStr(date));
  }
  return dates;
}

/**
 * @param dog     the dog to find a slot for; null (or a dog the wizard would
 *                grey out) leaves the hook idle.
 * @param humanId the owner, for their blocked-slot rules.
 * @param enabled false while the dashboard does not need a preview (e.g. a
 *                groom is already booked) — no reads are made.
 */
export function useNextAvailableSlot(
  dog: NextAvailableDog | null,
  humanId: string | undefined,
  enabled = true,
): NextAvailableState {
  const availability = useCustomerAvailability();
  const [state, setState] = useState<NextAvailableState>({ status: "idle" });
  const dogId = dog?.id ?? null;
  const dogSize = dog?.size ?? null;
  const dogPregnant = dog?.isPregnant === true;

  useEffect(() => {
    const candidate = dogId ? { id: dogId, size: dogSize, isPregnant: dogPregnant } : null;
    if (!enabled || !isOnlineBookableDog(candidate) || !availability.connected) {
      setState({ status: "idle" });
      return;
    }

    let cancelled = false;
    setState({ status: "loading" });
    const dates = nextSlotWindow();
    void (async () => {
      try {
        const [[openRes, occRes, blockedResults], rules] = await Promise.all([
          availability.loadPageAvailability(dates[0], dates[dates.length - 1]),
          humanId ? availability.loadBookingRules(humanId) : Promise.resolve(null),
        ]);
        if (cancelled) return;

        const blockedFailed = blockedResults.some((result) => result.error);
        if (openRes.error || occRes.error || blockedFailed) {
          setState({ status: "unavailable" });
          return;
        }

        const openByDate = new Map<string, boolean>();
        for (const row of (openRes.data || []) as Array<{ setting_date: string; is_open: boolean }>) {
          openByDate.set(row.setting_date, row.is_open);
        }
        const blockedByDate: Record<string, Record<string, SlotOverrides>> = {};
        for (const result of blockedResults) Object.assign(blockedByDate, result.byDate);

        const slot = findNextAvailableSlot({
          dates,
          dog: candidate,
          isOpen: (date) =>
            openByDate.get(date) ?? getDefaultOpenForDate(new Date(`${date}T00:00:00`)),
          occupancyByDate: occRes.byDate,
          blockedByDate,
          rules,
        });
        setState(slot ? { status: "found", slot } : { status: "none" });
      } catch (error) {
        logger.error("Failed to work out the next free slot", error, {
          tags: { component: "useNextAvailableSlot", op: "get_page_availability" },
        });
        if (!cancelled) setState({ status: "unavailable" });
      }
    })();

    return () => { cancelled = true; };
  }, [availability, dogId, dogSize, dogPregnant, enabled, humanId]);

  return state;
}
