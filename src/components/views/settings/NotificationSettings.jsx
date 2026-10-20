import { Card, CardHead, CardBody } from "./shared.jsx";

// Read-only on purpose (#1000). The old tab offered twelve channel switches
// and a "follow-up" row, and nothing read any of them: what is sent is fixed
// by the notify-* functions, and the channel by the customer's own record
// (`_shared/recipients.ts`). This card describes what actually happens.
const MESSAGES = [
  {
    label: "Booking confirmation",
    when: "As soon as a booking is made, unless staff chose not to send one for that booking, or a deposit is still owed.",
  },
  {
    label: "Reminder",
    when: "At 15:00 the day before, with a second pass at 19:00 for bookings added after that.",
  },
  {
    label: "Collection notice",
    when: "Only when staff choose to send one, from the dog's card on the day.",
  },
  {
    label: "Cancellation",
    when: "When a booking is cancelled. Not when it is cancelled as part of a reschedule: the new appointment's confirmation goes instead.",
  },
];

export function NotificationSettings() {
  return (
    <Card id="settings-notifs">
      <CardHead variant="yellow" title="What we send and when" desc="Set by the system, not by a switch here" />
      <CardBody>
        <ul className="m-0 p-0 list-none">
          {MESSAGES.map((row, idx) => (
            <li
              key={row.label}
              className={`py-3.5 ${idx < MESSAGES.length - 1 ? "border-b border-slate-200" : ""}`}
            >
              <div className="text-sm font-semibold text-slate-800">{row.label}</div>
              <div className="text-xs text-slate-500 mt-0.5">{row.when}</div>
            </li>
          ))}
        </ul>
        <p className="text-xs text-slate-500 mt-3 mb-0">
          The channel (WhatsApp, text or email) is chosen from the customer's
          preferences on their profile, unless staff picked a channel for that
          booking when making it. Nothing goes to a channel the customer has
          opted out of, or to a number that has said STOP.
        </p>
      </CardBody>
    </Card>
  );
}
