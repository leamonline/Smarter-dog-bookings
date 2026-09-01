import { useStaffName } from "../../../supabase/hooks/useStaffName";

/**
 * Audit footers shown under the booking cards: a customer-confirmation
 * note when the WhatsApp reminder was acknowledged, and a capacity
 * override note when staff forced the booking past the capacity engine.
 * Both render only when their timestamp/flag is present on the booking.
 */
export function BookingMetaFooters({ booking }) {
  return (
    <>
      {booking.createdByName && (
        <CreatedByFooter
          name={booking.createdByName}
          role={booking.createdByRole}
          at={booking.createdAt}
        />
      )}

      {booking.reminderConfirmedAt && (
        <ConfirmedFooter
          at={booking.reminderConfirmedAt}
          by={booking.reminderConfirmedBy}
        />
      )}

      {booking.staffCapacityOverride && (
        <OverrideAuditFooter
          by={booking.staffCapacityOverrideBy}
          at={booking.staffCapacityOverrideAt}
        />
      )}
    </>
  );
}

function formatWhen(at) {
  if (!at) return "";
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return "";
  const date = d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  return date;
}

/**
 * Who created this booking + when, denormalised onto the row at insert. The AI
 * name ("Smarter Dog AI") already reads as a role, so we only add a "(staff)" /
 * "(customer)" qualifier for those. Renders only when the creator is known
 * (legacy rows predate attribution and stay unlabelled).
 */
function CreatedByFooter({ name, role, at }) {
  if (!name) return null;
  const roleSuffix =
    role === "staff" ? " (staff)" : role === "customer" ? " (customer)" : "";
  const when = formatWhen(at);
  return (
    <div className="px-3 py-2.5 mb-3 bg-slate-50 border border-slate-200 text-slate-600 rounded-xl text-[12px] font-semibold leading-snug">
      <span className="uppercase text-[10px] font-extrabold tracking-wider mr-1 text-ink-muted">Booked</span>
      Booked by {name}{roleSuffix}{when ? ` on ${when}` : ""}.
    </div>
  );
}

/**
 * Small footer surfaced on bookings where staff overrode a capacity rule.
 * The `_by` UUID is resolved to a display name via useStaffName; while
 * the fetch is in-flight or if the staff profile no longer exists we
 * fall back to "a staff member" so the row is still informative.
 */
function OverrideAuditFooter({ by, at }) {
  const { name } = useStaffName(by);
  const who = name || "a staff member";
  const when = (() => {
    if (!at) return "";
    const d = new Date(at);
    if (Number.isNaN(d.getTime())) return at;
    const date = d.toLocaleDateString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
    const time = d.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    return ` on ${date} at ${time}`;
  })();

  return (
    <div className="px-3 py-2.5 mb-3 bg-amber-50 border border-amber-300 text-amber-900 rounded-xl text-[12px] font-semibold leading-snug shadow-sm">
      <span className="uppercase text-[10px] font-extrabold tracking-wider mr-1">Override</span>
      Capacity overridden by {who}{when}.
    </div>
  );
}

// `by` is the confirmation source token ('customer' | 'staff'). Rows stamped
// before the source existed carry 'customer' (backfilled — WhatsApp was the
// only confirm path then), so the customer wording is also the fallback.
function ConfirmedFooter({ at, by }) {
  if (!at) return null;
  const when = (() => {
    const d = new Date(at);
    if (Number.isNaN(d.getTime())) return at;
    const date = d.toLocaleDateString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
    const time = d.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    return `${date} at ${time}`;
  })();

  return (
    <div className="px-3 py-2.5 mb-3 bg-brand-green-50 border border-brand-green-200 text-brand-green-800 rounded-xl text-[12px] font-semibold leading-snug shadow-sm">
      <span className="uppercase text-[10px] font-extrabold tracking-wider mr-1">Confirmed</span>
      {by === "staff"
        ? `Confirmed by staff on ${when}.`
        : `Customer confirmed via WhatsApp on ${when}.`}
    </div>
  );
}
