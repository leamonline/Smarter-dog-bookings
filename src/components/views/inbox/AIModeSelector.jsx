// ============================================================
// src/components/views/inbox/AIModeSelector.jsx
//
// One control to rule the three: replaces the two header toggles
// (AutoSendToggle, AutonomousBookingToggle) AND the Take over /
// Hand back button. Surface a single segmented control that lets
// staff pick how much agency the AI has on this conversation:
//
//   AI auto      — AI sends low-risk replies without asking AND
//                  (if the nested toggle is on) can create bookings
//                  on the customer's behalf. Highest agency.
//   AI drafts    — AI proposes replies; staff always approves first.
//                  No autonomous booking.
//   Human only   — AI is fully paused on this conversation. Staff
//                  drives every reply manually.
//
// The mapping to the DB columns is delegated to useWhatsAppInbox
// (setAIMode). This component is pure presentation + click handling.
// ============================================================

import { useMemo, useId } from "react";

// Derive the active mode from the conversation row. Mirrors the
// inverse of setAIMode in useWhatsAppInbox.js — keep these in sync.
//
// Post-Phase-G we're down to two modes (the "AI drafts" middle option
// is retired in favour of an on-demand Generate reply button). Default
// for new conversations is human_only.
export function deriveAIMode(conversation) {
  if (!conversation) return "human_only";
  if (conversation.state === "ai_handling" && conversation.auto_send_enabled) {
    return "ai_auto";
  }
  return "human_only";
}

const MODES = [
  {
    id: "human_only",
    label: "Human only",
    description:
      "AI is paused — messages just sit in the inbox until you click Generate reply. New customer messages don't get drafts automatically.",
  },
  {
    id: "ai_auto",
    label: "AI auto",
    description:
      "AI replies to low-risk customer messages without waiting for you. Anything risky still waits.",
  },
];

export function AIModeSelector({ conversation, onChange, disabled }) {
  const groupId = useId();
  const current = useMemo(() => deriveAIMode(conversation), [conversation]);
  const allowAutonomousBooking = !!conversation?.autonomous_booking_enabled;

  const handleSelect = (next) => {
    if (next === current && !(next === "ai_auto" && allowAutonomousBooking !== conversation?.autonomous_booking_enabled)) {
      return;
    }
    // Switching INTO ai_auto preserves the existing nested-toggle value
    // so a quick "human_only → ai_auto" round-trip doesn't reset the
    // autonomous-booking opt-in the user had set earlier.
    onChange?.(next, {
      allowAutonomousBooking: next === "ai_auto" ? allowAutonomousBooking : false,
    });
  };

  const handleToggleAutonomous = (checked) => {
    onChange?.("ai_auto", { allowAutonomousBooking: !!checked });
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div
        role="radiogroup"
        aria-label="AI mode for this conversation"
        className="inline-flex items-center bg-slate-100 rounded-full p-0.5 gap-0.5"
      >
        {MODES.map((mode) => {
          const isActive = mode.id === current;
          return (
            <button
              key={mode.id}
              type="button"
              role="radio"
              id={`${groupId}-${mode.id}`}
              aria-checked={isActive}
              title={mode.description}
              disabled={disabled}
              onClick={() => handleSelect(mode.id)}
              className={[
                "inline-flex items-center h-7 px-3 rounded-full text-[12px] font-semibold transition-colors cursor-pointer font-[inherit]",
                isActive
                  ? "bg-white text-brand-purple shadow-sm"
                  : "bg-transparent text-slate-600 hover:text-brand-purple",
                "disabled:opacity-50 disabled:cursor-not-allowed",
              ].join(" ")}
            >
              {mode.label}
            </button>
          );
        })}
      </div>

      {current === "ai_auto" && (
        <label className="inline-flex items-center gap-2 text-[11px] text-slate-700 cursor-pointer self-end pr-1">
          <input
            type="checkbox"
            checked={allowAutonomousBooking}
            onChange={(e) => handleToggleAutonomous(e.target.checked)}
            disabled={disabled}
            className="w-3.5 h-3.5 rounded border-slate-300 text-brand-purple focus:ring-brand-yellow"
          />
          <span title="With this on, the AI may create bookings directly when the customer asks — instead of just drafting them for you. Without it (and when the customer is recognised), the AI nudges them to the self-service portal at smarterdog.vercel.app/customer/login.">
            Allow autonomous bookings
          </span>
        </label>
      )}
    </div>
  );
}
