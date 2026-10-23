// WhatsApp's client-reported error notification: when a screen the endpoint
// returned fails on the customer's phone, WhatsApp POSTs
// { action, screen, flow_token, data: { error, error_message } } and expects a
// bare acknowledgement. The endpoint used to acknowledge it silently, so a
// customer stuck mid-Flow left nothing to diagnose from (October 2026). This
// turns the report into one log line. Only the first 8 characters of the flow
// token are kept: enough to find the session
// (whatsapp_flow_sessions.flow_token LIKE '<prefix>%'), not the whole key.

import type { DecryptedFlowRequest } from "../_shared/flowCrypto.ts";

const MAX_MESSAGE = 500;

/** The log line for a client error report, or null when `req` isn't one. */
export function clientErrorNotice(req: DecryptedFlowRequest): string | null {
  const data = req.data as Record<string, unknown> | undefined;
  if (!data || typeof data.error_message !== "string") return null;
  const token = req.flow_token ? `${req.flow_token.slice(0, 8)}…` : "none";
  const errorKey = typeof data.error === "string" && data.error ? data.error : "unknown";
  return `whatsapp-flow-endpoint: client reported an error: screen=${req.screen ?? "unknown"} action=${req.action} ` +
    `error=${errorKey} token=${token} message=${JSON.stringify(data.error_message.slice(0, MAX_MESSAGE))}`;
}
