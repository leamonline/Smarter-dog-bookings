import { operationalChannelAvailable } from "../../supabase/functions/_shared/channelPolicy";
import { isUnknownOutcomeLogMessage } from "../../supabase/functions/_shared/sendOutcome";
import { isDeliveryUnconfirmed } from "../../supabase/functions/_shared/twilioDelivery";
import type { ConfirmationContact, ConfirmationLog, ConfirmationSnapshot } from "../supabase/repositories/bookingConfirmationRepo";

export const confirmationServiceLabel = (service: string | null | undefined): string =>
  service === "whatsapp" ? "WhatsApp" : service === "sms" ? "SMS" : service === "email" ? "Email" : "not set";

function policyContact(contact: ConfirmationContact) {
  return {
    phone: contact.phone, whatsapp: contact.whatsapp, email: contact.email,
    whatsapp_opted_out: contact.whatsappOptedOut, sms_opted_out: contact.smsOptedOut,
    email_opted_out: contact.emailOptedOut,
  };
}

export function preferredServiceAvailable(contact: ConfirmationContact | null): boolean {
  if (!contact?.preferredService) return true;
  return operationalChannelAvailable(policyContact(contact), contact.preferredService);
}

// An explicit WhatsApp, SMS or email choice is blocked only when this owner's
// saved contact record shows that channel cannot be used. Auto and "don't
// send" stay selectable. A missing record does not invent a block: the server
// still checks eligibility and opt-outs when it sends.
export function confirmationChoiceAvailable(contact: ConfirmationContact | null, channel: string): boolean {
  if (channel === "none" || channel === "auto") return true;
  if (channel !== "whatsapp" && channel !== "sms" && channel !== "email") return true;
  if (!contact) return true;
  return operationalChannelAvailable(policyContact(contact), channel);
}

export type ConfirmationState = "pending" | "accepted" | "delivered" | "failed" | "unknown";
export interface ConfirmationOutcome {
  state: ConfirmationState;
  retryBookingIds: string[];
}

// A send row is not a delivery receipt. Unknown outcomes block recovery for
// the whole receipt, even if another recipient has a definite failure.
export function confirmationOutcome(snapshot: ConfirmationSnapshot, bookingIds: string[], humanIds: string[]): ConfirmationOutcome {
  const latest = new Map<string, ConfirmationLog>();
  for (const log of snapshot.logs) {
    if (!bookingIds.includes(log.bookingId)) continue;
    const key = `${log.bookingId}|${log.humanId}|${log.trigger}`;
    const previous = latest.get(key);
    if (!previous || (log.createdAt ?? "") > (previous.createdAt ?? "")) latest.set(key, log);
  }
  const statuses: ConfirmationState[] = [];
  const retries = new Map<string, string>();
  const rowState = (log: ConfirmationLog): ConfirmationState => {
    const delivery = snapshot.deliveries.find((r) => r.providerId === log.providerId && r.channel === log.channel);
    if (delivery?.status === "delivered" || delivery?.status === "read") return "delivered";
    if (delivery?.status === "failed" || delivery?.status === "undelivered") return "failed";
    if (isUnknownOutcomeLogMessage(log.error) || isDeliveryUnconfirmed(log.error)) return "unknown";
    if (log.status === "failed" && delivery) return "unknown";
    if (log.status === "failed") return "failed";
    return log.status === "sent" ? "accepted" : "pending";
  };
  for (const bookingId of bookingIds) {
    // Unknown recipients cannot establish that everybody was informed.
    const recipients = humanIds.length ? humanIds : [null];
    for (const humanId of recipients) {
      const original = latest.get(`${bookingId}|${humanId}|confirmed`);
      const fallback = latest.get(`${bookingId}|${humanId}|confirmed_sms_fallback`);
      // Unknown stays unknown. A delivered or still-open attempt (pending or
      // accepted) is not replaced by the other attempt's failure, so an older
      // failed SMS fallback cannot hide a newer confirmation retry.
      const attemptStates = [original, fallback].flatMap((log) => log ? [rowState(log)] : []);
      const state: ConfirmationState = attemptStates.includes("unknown") ? "unknown"
        : attemptStates.includes("delivered") ? "delivered"
        : attemptStates.includes("pending") || !attemptStates.length ? "pending"
        : attemptStates.includes("accepted") ? "accepted"
        : "failed";
      statuses.push(state);
      if (state === "failed" && original?.status === "failed") retries.set(original.groupId || bookingId, bookingId);
    }
  }
  const state: ConfirmationState = statuses.includes("unknown") ? "unknown"
    : statuses.includes("pending") || !statuses.length ? "pending"
    : statuses.includes("failed") ? "failed"
    : statuses.includes("accepted") ? "accepted" : "delivered";
  // Pending/accepted sends and missing logs must be reconciled first.
  const inconsistent = [...latest.values()].some((log) => log.status === "failed" && rowState(log) === "delivered");
  const safe = !inconsistent && !statuses.some((s) => s === "unknown" || s === "pending" || s === "accepted");
  return { state, retryBookingIds: safe ? [...retries.values()] : [] };
}
