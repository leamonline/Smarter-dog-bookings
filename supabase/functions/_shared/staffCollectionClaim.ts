import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

type Reply = (body: Record<string, unknown>, status?: number) => Response;
type MarkAccepted = (providerId: string | null) => Promise<void>;

export const collectionClaimUnknown = {
  ok: false,
  outcome: "unknown",
  code: "collection_notice_unconfirmed",
  error: "A collection notice may already have been sent. Check the Inbox and reconcile the attempt before sending again.",
};

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

export async function withStaffCollectionClaim(
  db: SupabaseClient,
  input: { bookingId?: string; recipientId?: string | null; phone: string; channel: "whatsapp" | "sms" },
  reply: Reply,
  send: (markAccepted: MarkAccepted) => Promise<Response>,
): Promise<Response> {
  if (!uuid.test(input.bookingId ?? "") || !uuid.test(input.recipientId ?? "") ||
      !/^\+447[0-9]{9}$/.test(input.phone)) {
    return reply({ ok: false, outcome: "not_sent", error: "The booking or recipient is invalid." }, 400);
  }
  const { data, error } = await db.rpc("claim_staff_collection_notice", {
    p_booking_id: input.bookingId,
    p_recipient_id: input.recipientId,
    p_phone: input.phone,
    p_channel: input.channel,
  });
  if (error) return reply(collectionClaimUnknown, 503);
  if (data?.state === "accepted") {
    return reply({ ok: true, recorded: data.recorded === true, replayed: true });
  }
  if (data?.state === "ineligible") {
    return reply({
      ok: false, outcome: "not_sent",
      error: "The contact details changed or the dogs are no longer ready for collection.",
    }, 409);
  }
  if (data?.state !== "claimed" || typeof data.attempt_id !== "string") {
    return reply(collectionClaimUnknown, 409);
  }

  const attemptId = data.attempt_id;
  let knownProviderId: string | null = null;
  async function settle(state: string, recorded = false): Promise<boolean> {
    const { data, error } = await db.rpc("settle_staff_collection_notice", {
      p_attempt_id: attemptId,
      p_state: state,
      p_provider_id: knownProviderId,
      p_recorded: recorded,
    });
    return !error && data === true;
  }

  try {
    const result = await send(async (providerId) => {
      if (!providerId) throw new Error("Collection provider ID missing");
      knownProviderId = providerId;
      // Record provider acceptance before conversation or Inbox work.
      if (!await settle("accepted")) throw new Error("Collection receipt was not persisted");
    });
    const body = await result.clone().json();
    if (knownProviderId) {
      if (result.ok && body.recorded === true) {
        await settle("accepted", true).catch(() => false);
      }
      return result;
    }
    const definiteRefusal = body.outcome === "not_sent" ||
      (body.outcome == null && [400, 409].includes(result.status));
    await settle(definiteRefusal ? "not_sent" : "unknown");
    return definiteRefusal ? result : reply(collectionClaimUnknown, 502);
  } catch {
    // A failed persistence response can follow a successful commit. Never
    // reset the claim. The next request will replay a committed receipt.
    if (!knownProviderId) await settle("unknown").catch(() => false);
    return reply(collectionClaimUnknown, 502);
  }
}
