// Per-conversation gate for the customer-confirmed autonomous-booking
// path (migration 20260512140000). Same shape as AutoSendToggle but for
// the diary-writing flow rather than the message-sending one.

import { ConversationGateToggle } from "./ConversationGateToggle.jsx";

export function AutonomousBookingToggle({ conversation, onChange, disabled }) {
  return (
    <ConversationGateToggle
      conversation={conversation}
      field="autonomous_booking_enabled"
      onChange={onChange}
      disabled={disabled}
      label="Auto-book"
      accent="sky"
      titleOn="Autonomous booking is on for this conversation. AI may write to the diary on customer confirm (also requires AI_AUTONOMOUS_BOOKING_ENABLED=true at function level)."
      titleOff="Autonomous booking is off. AI booking proposals go to the staff approval queue."
      ariaLabelOn="Autonomous booking on for this conversation"
      ariaLabelOff="Autonomous booking off for this conversation"
    />
  );
}
