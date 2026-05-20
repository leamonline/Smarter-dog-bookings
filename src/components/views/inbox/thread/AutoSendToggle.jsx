// AutoSendToggle — flips whatsapp_conversations.auto_send_enabled for the
// selected conversation. The per-conversation gate described in the
// README's "Turning auto-send on safely" section.
//
// UX caveats baked into the title text (not enforced here — staff need to
// be able to flip it on per-conversation BEFORE the global env flag goes
// live so the rollout is gradual):
//   - The global AI_AUTO_SEND_LOW_RISK env flag must also be 'true' on
//     the function for any draft to actually auto-send.
//   - Even when both are true, a draft only auto-sends when it's
//     low-risk + handoff-free + in the auto-send intent allowlist.
//   - human_takeover conversations don't get drafts at all, so the
//     toggle is moot in that state. We disable it then.
//
// Flipping ON requires explicit confirmation (drafts can go to customers
// without staff approval after this). Flipping OFF is one click.

import { ConversationGateToggle } from "./ConversationGateToggle.jsx";

export function AutoSendToggle({ conversation, onChange, disabled }) {
  const inHumanTakeover = conversation?.state === "human_takeover";
  return (
    <ConversationGateToggle
      conversation={conversation}
      field="auto_send_enabled"
      onChange={onChange}
      disabled={disabled}
      label="Auto-send"
      accent="emerald"
      titleOn="Auto-send is on for this conversation. Low-risk drafts may send without staff approval (also requires AI_AUTO_SEND_LOW_RISK=true at function level)."
      titleOff="Auto-send is off. Every AI draft waits for staff approval."
      ariaLabelOn="Auto-send AI drafts on for this conversation"
      ariaLabelOff="Auto-send AI drafts off for this conversation"
      forceDisabledTitle={
        inHumanTakeover
          ? "Auto-send is paused — staff are handling this conversation. Hand it back to the AI to re-enable."
          : undefined
      }
      confirm={{
        title: "Turn on auto-send for this conversation?",
        message: "Auto-send will send low-risk replies to this customer without staff approval. Continue?",
        confirmLabel: "Turn auto-send on",
      }}
    />
  );
}
