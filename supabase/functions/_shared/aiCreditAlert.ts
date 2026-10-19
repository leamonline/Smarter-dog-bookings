// _shared/aiCreditAlert.ts — tell #salon-today when the Anthropic account
// has run out of credit.
//
// WHY: on 19 Oct 2026 the account ran dry and every AI feature (Generate
// reply, inbound drafts, the Daily Brief summary) failed from at least 09:16.
// Nobody knew until staff tapped Generate reply mid-shift. Anthropic answers
// such calls with HTTP 400 "Your credit balance is too low…", which every
// caller already throws on; this lets each caller raise ONE Slack alert too.
//
// The alert goes through slack-alerts (mode "ai_credit"), never straight to
// Slack, so the kill switch, posting window and once-a-day dedupe all apply.
// Best effort by design: a failed report never changes how the caller fails.

const CREDIT_EXHAUSTED = /credit balance is too low/i;

/** True when an Anthropic error body says the account is out of credit. */
export function isCreditExhausted(errorBody: string): boolean {
  return CREDIT_EXHAUSTED.test(errorBody);
}

/**
 * Ask slack-alerts to post the out-of-credit alert. Never throws; gives up
 * after 3 seconds so a slow Slack path can't hold up the caller's own error.
 */
export async function reportAiCreditExhausted(source: string): Promise<void> {
  const url = Deno.env.get("SUPABASE_URL");
  const secret = Deno.env.get("WEBHOOK_SECRET");
  if (!url || !secret) return;
  try {
    await fetch(`${url}/functions/v1/slack-alerts`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
      body: JSON.stringify({ mode: "ai_credit", source }),
      signal: AbortSignal.timeout(3000),
    });
  } catch (e) {
    console.error(`ai credit alert failed: ${e instanceof Error ? e.message : e}`);
  }
}
