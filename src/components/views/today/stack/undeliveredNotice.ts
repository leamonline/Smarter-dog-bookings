// The words the Today card uses for a booking whose WhatsApp confirmation or
// reminder never reached the customer. Kept apart from StackCard so the
// wording can be tested without rendering the stack.
import { baseTrigger, triggerLabel, type FailureInfo } from "../../../../supabase/hooks/useDeliveryFailures";

export interface UndeliveredNotice {
  /** Short enough for the header's safety row. */
  chip: string;
  /** The full sentence for the expanded card, ending in what to do. */
  detail: string;
  /**
   * Whether the owner's number is the one to ring. Notifications are per
   * recipient and can go to a trusted contact instead; offering the owner's
   * number for a contact's missed reminder would ring the wrong person.
   */
  callOwner: boolean;
  /** The recipient whose failure the notice is about, for the unreachable check. */
  humanId: string | null;
}

export function undeliveredNotice(
  failures: readonly Pick<FailureInfo, "trigger_type" | "human_id">[] | null | undefined,
  ownerId: string | null | undefined,
  isUnreachable: (humanId: string | null) => boolean = () => false,
): UndeliveredNotice | null {
  if (!failures || failures.length === 0) return null;
  // The owner's own failure comes first when there is one: that is the
  // person staff can ring from this card.
  const ownerFailures = ownerId ? failures.filter((f) => f.human_id === ownerId) : [];
  const relevant = ownerFailures.length > 0 ? ownerFailures : failures;
  const callOwner = ownerFailures.length > 0;
  const humanId = relevant[0].human_id ?? null;

  const kinds = [...new Set(relevant.map((f) => baseTrigger(f.trigger_type)))];
  // The reminder is the one that tells them to turn up, so name it first.
  const lead = kinds.includes("reminder") ? "reminder" : kinds[0];
  const what = triggerLabel(lead).toLowerCase();
  const who = callOwner ? "them" : "the contact on this booking";
  const act = callOwner ? "Give them a ring" : "Check who that is in the booking before ringing";

  if (isUnreachable(humanId)) {
    return {
      chip: "Not on WhatsApp",
      detail: `Our WhatsApp ${what} didn't reach ${who}, and nor did the messages before it, so this number may not be on WhatsApp. ${act}.`,
      callOwner,
      humanId,
    };
  }
  return {
    chip: `${triggerLabel(lead)} not delivered`,
    detail: `Our WhatsApp ${what} didn't reach ${who}. ${act} to check they know.`,
    callOwner,
    humanId,
  };
}
