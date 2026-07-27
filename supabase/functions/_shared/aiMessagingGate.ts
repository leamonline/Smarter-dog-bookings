export interface BooleanRead {
  ok: boolean;
  value?: boolean;
}

export interface AiMessagingDecisionInput {
  aiInitiated: boolean;
  globalRead: BooleanRead;
  customerReadRequired: boolean;
  customerRead?: BooleanRead;
}

export type AiMessagingDecision =
  | { allowed: true; reason: "manual_staff_message" | "enabled" }
  | {
      allowed: false;
      reason:
        | "global_lookup_failed"
        | "global_disabled"
        | "customer_lookup_failed"
        | "customer_disabled";
    };

/**
 * Pure fail-closed decision for outbound WhatsApp sends.
 *
 * Manual staff messages deliberately bypass these AI-only controls. An
 * AI-initiated send needs explicit true values from every applicable durable
 * setting; missing, malformed or failed reads deny the send.
 */
export function decideAiMessagingSend(
  input: AiMessagingDecisionInput,
): AiMessagingDecision {
  if (!input.aiInitiated) {
    return { allowed: true, reason: "manual_staff_message" };
  }
  if (!input.globalRead.ok) {
    return { allowed: false, reason: "global_lookup_failed" };
  }
  if (input.globalRead.value !== true) {
    return { allowed: false, reason: "global_disabled" };
  }
  if (!input.customerReadRequired) {
    return { allowed: true, reason: "enabled" };
  }
  if (!input.customerRead?.ok) {
    return { allowed: false, reason: "customer_lookup_failed" };
  }
  if (input.customerRead.value !== true) {
    return { allowed: false, reason: "customer_disabled" };
  }
  return { allowed: true, reason: "enabled" };
}
