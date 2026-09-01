// Action hook for the staff messaging Edge Functions (Debt #12): binds the
// staff Supabase client to the three staff-callable functions the dashboard
// and booking modals invoke — resend a booking notification, broadcast a
// day-closure message, send tomorrow's reminder — so those components never
// import the client themselves. Each action returns the raw invoke result
// (`{ data, error }`, with `error.context` holding the Response on a non-2xx)
// so the components keep their own error-payload parsing and toast copy.
import { supabase } from "../client";

type Client = NonNullable<typeof supabase>;

function requireClient(): Client {
  if (!supabase) throw new Error("Not connected");
  return supabase;
}

export type NotificationTrigger = string;

/** resend-booking-notification: dispatches server-side to the right notify function. */
export async function resendBookingNotification(bookingId: string, triggerType: NotificationTrigger) {
  return requireClient().functions.invoke("resend-booking-notification", {
    body: { booking_id: bookingId, trigger_type: triggerType },
  });
}

/** broadcast-message: message every customer booked on a date (dry run previews). */
export async function broadcastMessage(input: { bookingDate: string; reason: string; dryRun: boolean }) {
  return requireClient().functions.invoke("broadcast-message", {
    body: { booking_date: input.bookingDate, reason: input.reason, dry_run: input.dryRun },
  });
}

/** notify-booking-reminder: one anchor booking id; the function expands it to the customer's dogs that day. */
export async function sendBookingReminder(anchorBookingId: string) {
  return requireClient().functions.invoke("notify-booking-reminder", {
    body: { booking_id: anchorBookingId },
  });
}

/** whatsapp-send in template mode: one approved Meta template to one number, logged to the inbox. */
export async function sendWhatsAppTemplate(input: {
  to: string;
  templateName: string;
  language: string;
  params: unknown;
  humanId: string;
}) {
  return requireClient().functions.invoke("whatsapp-send", {
    body: {
      mode: "template",
      to: input.to,
      template_name: input.templateName,
      language: input.language,
      params: input.params,
      human_id: input.humanId,
    },
  });
}

/** reminder-send: the staff-composed reminder on the chosen channel for one anchor booking. */
export async function sendReminder(anchorBookingId: string, channelPayload: Record<string, unknown>) {
  return requireClient().functions.invoke("reminder-send", {
    body: { booking_id: anchorBookingId, ...channelPayload },
  });
}

const messaging = {
  /** False in sample-data mode or before credentials exist; the actions throw. */
  get connected(): boolean {
    return Boolean(supabase);
  },
  resendBookingNotification,
  broadcastMessage,
  sendBookingReminder,
  sendWhatsAppTemplate,
  sendReminder,
};

export type StaffMessaging = typeof messaging;

/** The client is a module constant, so this is a stable singleton. */
export function useStaffMessaging(): StaffMessaging {
  return messaging;
}
