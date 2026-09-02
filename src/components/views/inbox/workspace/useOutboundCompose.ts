/**
 * useOutboundCompose — the "New message" composer's open state and send
 * handlers (Debt 10). Extracted from InboxWorkspaceController.jsx.
 *
 * The composer is the outbound entry point: it opens from the header button
 * or from a `?human=` deep link with no existing thread. After a successful
 * send it closes and selects the freshly-upserted conversation so staff land
 * straight in the thread; if the row hasn't arrived yet, realtime brings it.
 */
import { useCallback, useState } from "react";
import type { Toast } from "./useInboxActionHandlers";

export interface OutboundConversation {
  id: string;
  phone_e164?: string | null;
  channel?: string | null;
}

export interface OutboundPayload {
  phoneE164?: string | null;
  [key: string]: unknown;
}

export interface OutboundSendResult {
  ok?: boolean;
  reason?: string | null;
  /** The refreshed list the send returned, when it did. */
  conversations?: OutboundConversation[];
}

type SendResult = OutboundSendResult | null | undefined | void;

export interface UseOutboundComposeOptions<T extends OutboundConversation> {
  conversations: T[];
  selectConversation: (id: string) => unknown;
  sendOutboundTemplate(payload: OutboundPayload): Promise<SendResult>;
  sendOutboundSMS(payload: OutboundPayload): Promise<SendResult>;
  toast: Toast;
}

function digitsOf(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

export function useOutboundCompose<T extends OutboundConversation>({
  conversations,
  selectConversation,
  sendOutboundTemplate,
  sendOutboundSMS,
  toast,
}: UseOutboundComposeOptions<T>) {
  const [composeOpen, setComposeOpen] = useState(false);
  // Pre-target the composer at a specific customer (deep-link from "Message
  // owner" when they have no existing thread).
  const [composeInitialHumanId, setComposeInitialHumanId] = useState<string | null>(null);
  // Bumped to ask the reply box to focus after a deep-link opens a thread.
  const [composeFocusSignal, setComposeFocusSignal] = useState(0);

  const openCompose = useCallback((humanId: string | null = null) => {
    setComposeInitialHumanId(humanId);
    setComposeOpen(true);
  }, []);
  const closeCompose = useCallback(() => {
    setComposeOpen(false);
    setComposeInitialHumanId(null);
  }, []);
  const focusComposer = useCallback(() => setComposeFocusSignal((n) => n + 1), []);

  // The composer found an existing thread for the customer: open it instead.
  const openConversationFromCompose = useCallback(
    (id: string) => {
      selectConversation(id);
      closeCompose();
    },
    [selectConversation, closeCompose],
  );

  const landInThread = useCallback(
    (payload: OutboundPayload, res: OutboundSendResult, channel: "whatsapp" | "sms") => {
      setComposeOpen(false);
      const phoneDigits = digitsOf(payload.phoneE164);
      const refreshed: OutboundConversation[] = res.conversations ?? conversations;
      const match = refreshed.find(
        (c) =>
          digitsOf(c.phone_e164) === phoneDigits &&
          (channel === "whatsapp" ? (c.channel ?? "whatsapp") === "whatsapp" : c.channel === "sms"),
      );
      const sent = channel === "whatsapp" ? "Template sent" : "SMS sent";
      if (match) {
        toast.show(`${sent} — opening the thread.`, "success");
        selectConversation(match.id);
      } else {
        toast.show(`${sent}. The thread will appear in the inbox shortly.`, "success");
      }
    },
    [conversations, selectConversation, toast],
  );

  const handleComposeSent = useCallback(async (payload: OutboundPayload) => {
    const res = await sendOutboundTemplate(payload);
    if (res?.ok) landInThread(payload, res, "whatsapp");
    else if (res?.reason) toast.show(`Could not send: ${res.reason}`, "error");
    return res;
  }, [sendOutboundTemplate, landInThread, toast]);

  const handleComposeSMSSent = useCallback(async (payload: OutboundPayload) => {
    const res = await sendOutboundSMS(payload);
    if (res?.ok) landInThread(payload, res, "sms");
    else if (res?.reason) toast.show(`Could not send SMS: ${res.reason}`, "error");
    return res;
  }, [sendOutboundSMS, landInThread, toast]);

  return {
    composeOpen,
    composeInitialHumanId,
    composeFocusSignal,
    openCompose,
    closeCompose,
    focusComposer,
    openConversationFromCompose,
    handleComposeSent,
    handleComposeSMSSent,
  };
}
