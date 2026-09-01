// Calendar-feed actions for the customer portal (Debt #12), so the calendar
// button and the subscribe modal never import the Supabase client directly.
// The implementation is shared with the staff hook via calendarFeedActions.
import { useMemo } from "react";
import { customerSupabase } from "../customerClient";
import { createCalendarFeedActions } from "./calendarFeedActions";

export function useCustomerCalendarFeed() {
  return useMemo(
    () => createCalendarFeedActions(customerSupabase, "customer"),
    [],
  );
}
