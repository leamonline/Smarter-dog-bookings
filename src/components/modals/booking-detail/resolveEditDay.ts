// Which day is this booking being edited on, and what does that day look
// like? Extracted from BookingDetailModal (Debt 9) as a pure derivation so
// the modal composes it instead of recomputing it inline on every render.
//
// Open/closed precedence, exactly as the inline code had it: an explicit
// day_settings row supplies the day's settings; the App-level pre-resolved
// dayOpenState map wins for "is it open" because it already folds in the
// month-level overrides a bare row may not carry; the weekday default is
// the last resort. This mirrors what it replaced — it is not a new rule.
//
// Cancelled rows free their seat, so they are excluded before the
// reschedule slot-picker (canBookSlot / getSeatStatesForSlot) and
// useSlotAvailability treat the day as occupied — otherwise a cancelled
// booking phantom-blocks an open slot. The booking being edited is excluded
// too: it must not compete with itself for its own seat.
import { getDefaultOpenForDate } from "../../../engine/utils";
import { excludeCancelled } from "../../../engine/occupancy";
import { toDateStr } from "../../../supabase/transforms";
import type { Booking, DaySettings } from "../../../types/index";

/** A stored day_settings row, or the synthesised default for a day without one. */
export type EditDaySettings = Pick<DaySettings, "isOpen" | "overrides" | "extraSlots"> &
  Partial<DaySettings>;

export interface ResolveEditDayInput<B extends Pick<Booking, "id" | "status">> {
  /** The date currently chosen in the edit form. */
  editDate: Date;
  /** The booking being edited — never counted against its own day. */
  bookingId: string;
  daySettings?: Record<string, EditDaySettings | undefined> | null;
  dayOpenState?: Record<string, boolean | undefined> | null;
  bookingsByDate: Record<string, readonly B[] | undefined>;
}

export interface ResolvedEditDay<B> {
  editDateStr: string;
  editSettings: EditDaySettings;
  editDayOpen: boolean;
  /** The other non-cancelled bookings on the edit day. */
  otherBookings: B[];
}

export function resolveEditDay<B extends Pick<Booking, "id" | "status">>({
  editDate,
  bookingId,
  daySettings,
  dayOpenState,
  bookingsByDate,
}: ResolveEditDayInput<B>): ResolvedEditDay<B> {
  const editDateStr = toDateStr(editDate);
  const explicitOpen = dayOpenState?.[editDateStr];
  const editSettings: EditDaySettings = daySettings?.[editDateStr] || {
    isOpen: explicitOpen !== undefined ? explicitOpen : getDefaultOpenForDate(editDate),
    overrides: {},
    extraSlots: [],
  };
  const editDayOpen = explicitOpen !== undefined ? explicitOpen : editSettings.isOpen;
  const otherBookings = excludeCancelled(bookingsByDate[editDateStr] || []).filter(
    (b) => b.id !== bookingId,
  );
  return { editDateStr, editSettings, editDayOpen, otherBookings };
}
