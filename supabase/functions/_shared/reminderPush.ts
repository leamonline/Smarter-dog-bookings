// ============================================================
// supabase/functions/_shared/reminderPush.ts
//
// How a reminder function talks to apns-send, and how it reads the answer.
//
// fallback means Apple definitely did not deliver: the request never left,
// or Apple refused it for a reason that is not a dead device token (a bad
// key, a wrong topic). WhatsApp, then SMS, then email, is safe.
// outcomeUnknown means a push might already be on its way, so the same
// request must not also text or WhatsApp the customer.
// ============================================================

export interface PushAttempt {
  sent: boolean;
  providerId: string | null;
  outcomeUnknown: boolean;
  fallback: boolean;
}

export function interpretApnsSend(args: {
  networkError: boolean;
  body: Record<string, unknown> | null;
}): PushAttempt {
  if (args.networkError || args.body == null) {
    return { sent: false, providerId: null, outcomeUnknown: true, fallback: false };
  }
  const sentCount = typeof args.body.sent === "number" ? args.body.sent : 0;
  const providerId = typeof args.body.apns_id === "string" ? args.body.apns_id : null;
  if (sentCount > 0) {
    return { sent: true, providerId, outcomeUnknown: false, fallback: false };
  }
  if (args.body.outcome_unknown === true) {
    return { sent: false, providerId: null, outcomeUnknown: true, fallback: false };
  }
  if (args.body.fallback === true) {
    return { sent: false, providerId: null, outcomeUnknown: false, fallback: true };
  }
  // These refusals happen before any request to Apple. A reminder must not
  // go silent just because the token list was too long or badly shaped.
  if (args.body.error === "invalid_tokens" || args.body.error === "invalid_body") {
    return { sent: false, providerId: null, outcomeUnknown: false, fallback: true };
  }
  // A reply we do not understand might have been accepted. Do not double-send.
  return { sent: false, providerId: null, outcomeUnknown: true, fallback: false };
}

export interface ApnsSendToken {
  id: string;
  apns_token: string;
  environment: "sandbox" | "production";
  bundle_id: string;
}

export const REMINDER_PUSH_TITLE = "Smarter Dog Grooming";

/** The words on the lock screen. Explicit text wins, then a ready-made reminder, then the WhatsApp template's three parameters. */
export function reminderPushBody(input: {
  explicit?: string | null;
  message?: string | null;
  whatsappParams?: string[] | null;
}): string | null {
  const clip = (value: string) => value.trim().slice(0, 2000);
  if (input.explicit?.trim()) return clip(input.explicit);
  if (input.message?.trim()) return clip(input.message);
  const params = (input.whatsappParams ?? []).map((part) => part.trim()).filter(Boolean);
  if (params.length >= 3) {
    return clip(
      `Hi ${params[0]}, a reminder that ${params[1]} is booked in at ${params[2]}. See you at Smarter Dog Grooming.`,
    );
  }
  return null;
}

export async function postApnsSend(
  args: {
    supabaseUrl: string;
    serviceRoleKey: string;
    internalSecret: string;
    tokens: ApnsSendToken[];
    body: string;
    collapseId: string;
  },
  fetchImpl: typeof fetch = fetch,
): Promise<PushAttempt> {
  try {
    const res = await fetchImpl(`${args.supabaseUrl}/functions/v1/apns-send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": args.internalSecret,
        Authorization: `Bearer ${args.serviceRoleKey}`,
      },
      body: JSON.stringify({
        tokens: args.tokens,
        title: REMINDER_PUSH_TITLE,
        body: args.body,
        collapse_id: args.collapseId,
      }),
    });
    let parsed: Record<string, unknown> | null = null;
    try {
      parsed = await res.json();
    } catch {
      parsed = null;
    }
    return interpretApnsSend({ networkError: false, body: parsed });
  } catch (err) {
    console.error("apns-send call failed:", err instanceof Error ? err.message : String(err));
    return interpretApnsSend({ networkError: true, body: null });
  }
}
