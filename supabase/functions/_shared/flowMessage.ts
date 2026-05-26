// ============================================================
// supabase/functions/_shared/flowMessage.ts
//
// Builds the Meta Cloud API interactive "flow" message — the message
// that delivers a WhatsApp Flow to a customer. Pure builder, mirroring
// _shared/confirmButtons.ts (buildConfirmButtonsMetaBody) so it can be
// unit-tested and reused by the whatsapp-send "flow" mode.
//
// We send with flow_action = "navigate" and an inline flow_action_payload
// (screen + data) so the first screen renders WITHOUT an endpoint round
// trip. Every subsequent screen transition is a data_exchange handled by
// whatsapp-flow-endpoint.
// ============================================================

export interface FlowMessageParams {
  toDigits: string; // recipient, digits only
  flowId: string; // Meta Flow id (from publish)
  flowToken: string; // our opaque per-session token
  bodyText: string; // message body shown with the CTA
  ctaLabel: string; // button label, e.g. "Book appointment"
  initialScreen: string; // first screen id, e.g. "WELCOME"
  initialData?: Record<string, unknown>; // data the first screen binds to
  headerText?: string;
  footerText?: string;
  // "published" for the live Flow, "draft" to test an unpublished one.
  mode?: "published" | "draft";
}

// Meta limits (interactive message text fields).
export const FLOW_BODY_MAX = 1024;
export const FLOW_CTA_MAX = 30;
export const FLOW_HEADER_MAX = 60;
export const FLOW_FOOTER_MAX = 60;

export function buildFlowMetaBody(p: FlowMessageParams): unknown {
  const parameters: Record<string, unknown> = {
    flow_message_version: "3",
    flow_token: p.flowToken,
    flow_id: p.flowId,
    flow_cta: p.ctaLabel.slice(0, FLOW_CTA_MAX),
    flow_action: "navigate",
    flow_action_payload: {
      screen: p.initialScreen,
      data: p.initialData ?? {},
    },
  };
  // Only send mode when explicitly "draft"; omitting it defaults to the
  // published Flow on Meta's side.
  if (p.mode === "draft") parameters.mode = "draft";

  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: p.toDigits,
    type: "interactive",
    interactive: {
      type: "flow",
      ...(p.headerText
        ? { header: { type: "text", text: p.headerText.slice(0, FLOW_HEADER_MAX) } }
        : {}),
      body: { text: p.bodyText.slice(0, FLOW_BODY_MAX) },
      ...(p.footerText ? { footer: { text: p.footerText.slice(0, FLOW_FOOTER_MAX) } } : {}),
      action: { name: "flow", parameters },
    },
  };
}

export function validateFlowMessageParams(
  p: Partial<FlowMessageParams>,
): { ok: true } | { ok: false; reason: string } {
  if (!p.toDigits) return { ok: false, reason: "toDigits is required" };
  if (!p.flowId) return { ok: false, reason: "flowId is required" };
  if (!p.flowToken) return { ok: false, reason: "flowToken is required" };
  if (!p.bodyText) return { ok: false, reason: "bodyText is required" };
  if (!p.ctaLabel) return { ok: false, reason: "ctaLabel is required" };
  if (!p.initialScreen) return { ok: false, reason: "initialScreen is required" };
  return { ok: true };
}
