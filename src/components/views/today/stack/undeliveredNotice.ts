// The words the Today card uses for a booking whose WhatsApp confirmation or
// reminder never reached the customer. Kept apart from StackCard so the
// wording can be tested without rendering the stack.
import { triggerLabel, type FailureInfo } from "../../../../supabase/hooks/useDeliveryFailures";

export interface UndeliveredNotice {
  /** Short enough for the header's safety row. */
  chip: string;
  /** The full sentence for the expanded card, ending in what to do. */
  detail: string;
}

export function undeliveredNotice(
  failures: readonly Pick<FailureInfo, "trigger_type">[] | null | undefined,
  unreachable: boolean,
): UndeliveredNotice | null {
  if (!failures || failures.length === 0) return null;
  const kinds = [...new Set(failures.map((f) => f.trigger_type))];
  // The reminder is the one that tells them to turn up, so name it first.
  const lead = kinds.includes("reminder") ? "reminder" : kinds[0];
  const what = triggerLabel(lead);
  if (unreachable) {
    return {
      chip: "Not on WhatsApp",
      detail: `Our WhatsApp ${what.toLowerCase()} didn't reach them, and nor did the messages before it, so this number may not be on WhatsApp. Give them a ring.`,
    };
  }
  return {
    chip: `${what} not delivered`,
    detail: `Our WhatsApp ${what.toLowerCase()} didn't reach them. Give them a ring to check they know.`,
  };
}
