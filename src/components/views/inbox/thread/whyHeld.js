// ============================================================
// src/components/views/inbox/thread/whyHeld.js
//
// Pure helper: given a pending draft + its conversation, returns
// a single { tone, text } object explaining why the draft is held
// for staff approval rather than auto-sent.
//
// Lives in a .js sibling (rather than the .jsx component file) so
// the logic test runner can import it without trying to parse JSX
// at module load. The renderer in WhyHeldExplainer.jsx imports
// from here.
//
// Signals are ordered most-specific to least so the strongest
// reason wins:
//
//   1. draft.handoff_required        → AI explicitly asked for human
//   2. draft.risk_level === 'high'   → high-risk content
//   3. draft.risk_level === 'medium' → medium-risk content
//   4. conversation.state ===
//      'human_takeover'              → AI mode is Human only
//   5. !conversation.auto_send_enabled → AI mode is AI drafts
//   6. draft.auto_send_eligible
//      === false                     → intent off the allowlist
//   7. (fallback)                    → global auto-send setting off
// ============================================================

export function whyHeld(draft, conversation) {
  if (!draft) return null;

  if (draft.handoff_required) {
    return {
      tone: "high",
      text: "Held for human review — the AI flagged this conversation needs your eyes (complaints, medical, anything sensitive).",
    };
  }

  if (draft.risk_level === "high") {
    return {
      tone: "high",
      text: "Held because the draft is high-risk — staff always approve high-risk replies before they go out.",
    };
  }

  if (draft.risk_level === "medium") {
    return {
      tone: "medium",
      text: "Held because the draft carries some risk — review the wording before sending.",
    };
  }

  if (conversation?.state === "human_takeover") {
    return {
      tone: "info",
      text: "Held because the AI mode is 'Human only' — switch the selector above to 'AI auto' if you'd like low-risk replies to go automatically.",
    };
  }

  if (conversation?.auto_send_enabled === false) {
    return {
      tone: "info",
      text: "Held because the AI mode is 'AI drafts' — every reply waits for your nod. Flip the selector to 'AI auto' to let low-risk ones send themselves.",
    };
  }

  if (draft.auto_send_eligible === false) {
    return {
      tone: "info",
      text: `Held because the intent (${draft.intent ?? "unclassified"}) isn't on the auto-send allowlist. Bookings, time confirmations, and unusual asks always wait for you.`,
    };
  }

  // auto_send_eligible === true on a still-pending draft means the
  // global env flag (AI_AUTO_SEND_LOW_RISK) is off, OR the send is
  // mid-flight. We can't read the env flag from the client, so the
  // honest answer is "the global setting is off".
  return {
    tone: "info",
    text: "Eligible to auto-send — but the global auto-send setting is off, so every reply still waits for you. Anthropic's salon team can flip this when you're ready.",
  };
}
