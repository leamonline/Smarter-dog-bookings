// ============================================================
// src/components/views/inbox/thread/AutoSendToggle.jsx
//
// AutoSendToggle — flips whatsapp_conversations.auto_send_enabled
// for the selected conversation. The per-conversation gate described
// in the README's "Turning auto-send on safely" section.
//
// Important UX caveats baked into the title text (not enforced here —
// staff need to be able to flip it on per-conversation BEFORE the
// global env flag goes live so the rollout is gradual):
//   - The global AI_AUTO_SEND_LOW_RISK env flag must also be 'true'
//     on the function for any draft to actually auto-send.
//   - Even when both are true, a draft only auto-sends when it's
//     low-risk + handoff-free + in the auto-send intent allowlist.
//   - human_takeover conversations don't get drafts at all, so the
//     toggle is moot in that state. We disable it then.
//
// Flipping ON requires an explicit confirmation (an irreversible-feeling
// action — drafts can go to customers without staff approval after this).
// Flipping OFF is one click.
// ============================================================

import { useState } from "react";
import { ConfirmDialog } from "../../../shared/ConfirmDialog.jsx";

export function AutoSendToggle({ conversation, onChange, disabled }) {
  const [confirming, setConfirming] = useState(false);
  if (!conversation) return null;
  const enabled = !!conversation.auto_send_enabled;
  const inHumanTakeover = conversation.state === "human_takeover";
  const isDisabled = !!disabled || inHumanTakeover;

  const title = inHumanTakeover
    ? "Auto-send is paused — staff are handling this conversation. Hand it back to the AI to re-enable."
    : enabled
      ? "Auto-send is on for this conversation. Low-risk drafts may send without staff approval (also requires AI_AUTO_SEND_LOW_RISK=true at function level)."
      : "Auto-send is off. Every AI draft waits for staff approval.";

  const handleClick = () => {
    if (enabled) {
      onChange(false);
      return;
    }
    setConfirming(true);
  };

  const handleConfirm = () => {
    setConfirming(false);
    onChange(true);
  };

  return (
    <>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label={`Auto-send AI drafts ${enabled ? "on" : "off"} for this conversation`}
        onClick={handleClick}
        disabled={isDisabled}
        title={title}
        className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[12px] font-bold border transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-[inherit] ${
          enabled
            ? "bg-emerald-100 border-emerald-300 text-emerald-900 hover:bg-emerald-200"
            : "bg-white border-slate-300 text-slate-700 hover:bg-slate-50"
        }`}
      >
        <span
          aria-hidden="true"
          className={`relative inline-block w-7 h-4 rounded-full transition-colors ${
            enabled ? "bg-emerald-500" : "bg-slate-300"
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white shadow-sm transition-transform ${
              enabled ? "translate-x-3" : "translate-x-0"
            }`}
          />
        </span>
        Auto-send {enabled ? "on" : "off"}
      </button>

      {confirming && (
        <ConfirmDialog
          title="Turn on auto-send for this conversation?"
          message="Auto-send will send low-risk replies to this customer without staff approval. Continue?"
          confirmLabel="Turn auto-send on"
          cancelLabel="Cancel"
          variant="primary"
          onConfirm={handleConfirm}
          onCancel={() => setConfirming(false)}
        />
      )}
    </>
  );
}
