// Calendar-feed actions for the staff app (Debt #12), so the settings tab
// never imports the Supabase client directly. Same shared implementation as
// the customer hook, bound to the staff client and the "staff" feed.
import { useMemo } from "react";
import { supabase } from "../client";
import { createCalendarFeedActions } from "./calendarFeedActions";

export function useStaffCalendarFeed() {
  return useMemo(() => createCalendarFeedActions(supabase, "staff"), []);
}
