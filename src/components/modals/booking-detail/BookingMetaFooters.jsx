import { useStaffName } from "../../../supabase/hooks/useStaffName.js";

/**
 * Audit footers shown under the booking cards: a customer-confirmation
 * note when the WhatsApp reminder was acknowledged, and a capacity
 * override note when staff forced the booking past the capacity engine.
 * Both render only when their timestamp/flag is present on the booking.
 */
export function BookingMetaFooters({ booking }) {
  return (
    <>
      {booking.reminderConfirmedAt && (
        <ConfirmedByCustomerFooter at={booking.reminderConfirmedAt} />
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

function ConfirmedByCustomerFooter({ at }) {
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
      Customer confirmed via WhatsApp on {when}.
    </div>
  );
}
