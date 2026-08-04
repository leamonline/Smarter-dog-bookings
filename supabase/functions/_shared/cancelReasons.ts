// Shared cancel_reason string constants. Centralised so a writer (the RPC
// call sites in whatsapp-flow-endpoint) and a reader (notify-booking-cancelled,
// deciding whether to suppress the "has been cancelled" message) can't drift
// from each other by editing one copy and forgetting the other.

/** The exact cancel_reason stamped on the old rows of a WhatsApp Flow reschedule.
 *  Must match `p_reason` default in
 *  supabase/migrations/20260723090000_whatsapp_atomic_reschedule.sql:80. */
export const WHATSAPP_RESCHEDULE_CANCEL_REASON = "Rescheduled via WhatsApp";
