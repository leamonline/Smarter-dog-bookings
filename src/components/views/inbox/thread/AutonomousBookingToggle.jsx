// ============================================================
// src/components/views/inbox/thread/AutonomousBookingToggle.jsx
//
// Per-conversation gate for the customer-confirmed autonomous-booking
// path (migration 20260512140000). Same shape as AutoSendToggle but
// for the diary-writing flow rather than the message-sending one.
// ============================================================

export function AutonomousBookingToggle({ conversation, onChange, disabled }) {
  if (!conversation) return null;
  const enabled = !!conversation.autonomous_booking_enabled;
  const isDisabled = !!disabled;

  const title = enabled
    ? "Autonomous booking is on for this conversation. AI may write to the diary on customer confirm (also requires AI_AUTONOMOUS_BOOKING_ENABLED=true at function level)."
    : "Autonomous booking is off. AI booking proposals go to the staff approval queue.";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={`Autonomous booking ${enabled ? "on" : "off"} for this conversation`}
      onClick={() => onChange(!enabled)}
      disabled={isDisabled}
      title={title}
      className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-[12px] font-bold border transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-[inherit] ${
        enabled
          ? "bg-sky-100 border-sky-300 text-sky-900 hover:bg-sky-200"
          : "bg-white border-slate-300 text-slate-700 hover:bg-slate-50"
      }`}
    >
      <span
        aria-hidden="true"
        className={`relative inline-block w-7 h-4 rounded-full transition-colors ${
          enabled ? "bg-sky-500" : "bg-slate-300"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white shadow-sm transition-transform ${
            enabled ? "translate-x-3" : "translate-x-0"
          }`}
        />
      </span>
      Auto-book {enabled ? "on" : "off"}
    </button>
  );
}
