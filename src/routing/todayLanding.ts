// The staff app lands on Today once per browser-tab session: the first time a
// tab opens the staff root (`/staff`, the calendar), it moves to `/staff/today`.
// A link that means the calendar, such as the iPhone app's More → Calendar,
// adds `?calendar` so that first visit stays on the calendar.

/** The query flag that asks for the calendar itself on a tab's first visit. */
export const CALENDAR_ENTRY_PARAM = "calendar";

/**
 * Should this first page of the tab session move to Today? Only the bare staff
 * root does, and only without the calendar flag. Every other path is a page
 * someone asked for and is left alone.
 */
export function landsOnToday(pathname: string, search: string): boolean {
  if (pathname !== "/") return false;
  return !new URLSearchParams(search).has(CALENDAR_ENTRY_PARAM);
}
