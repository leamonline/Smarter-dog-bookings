// Messenger reply window for the staff inbox. The edge function in
// supabase/functions/_shared/messenger.ts is the send-time authority;
// keep the two decisions the same.

export const MESSENGER_STANDARD_WINDOW_MS = 24 * 60 * 60 * 1000;
export const MESSENGER_HUMAN_AGENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
export const MESSENGER_MAX_TEXT_LENGTH = 2000;

export type MessengerSender = "staff" | "ai";

export interface MessengerWindowDecision {
  mode: "standard" | "human_agent" | "closed";
  remainingMs: number;
  label: string | null;
}

export function formatReplyWindow(remainingMs: number): string | null {
  if (remainingMs <= 0) return null;
  const hours = Math.floor(remainingMs / 3_600_000);
  const mins = Math.floor((remainingMs % 3_600_000) / 60_000);
  if (hours === 0 && mins === 0) return "Reply window closes in under a minute";
  if (hours >= 1) return `Reply window closes in ${hours}h ${mins}m`;
  return `Reply window closes in ${mins}m`;
}

export function decideMessengerWindow(input: {
  lastInboundAt: string | null | undefined;
  nowMs: number;
  humanAgentEnabled: boolean;
  sender: MessengerSender;
}): MessengerWindowDecision {
  const at = input.lastInboundAt ? new Date(input.lastInboundAt).getTime() : Number.NaN;
  if (!Number.isFinite(at)) return { mode: "closed", remainingMs: 0, label: null };
  const age = Math.max(0, input.nowMs - at);
  const standardRemaining = MESSENGER_STANDARD_WINDOW_MS - age;
  if (standardRemaining > 0) {
    return {
      mode: "standard",
      remainingMs: standardRemaining,
      label: formatReplyWindow(standardRemaining),
    };
  }
  const humanRemaining = MESSENGER_HUMAN_AGENT_WINDOW_MS - age;
  if (input.sender === "staff" && input.humanAgentEnabled && humanRemaining > 0) {
    return {
      mode: "human_agent",
      remainingMs: humanRemaining,
      label: formatReplyWindow(humanRemaining),
    };
  }
  return { mode: "closed", remainingMs: 0, label: null };
}
