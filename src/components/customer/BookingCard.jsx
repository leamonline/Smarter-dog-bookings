import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { customerSupabase as supabase } from "../../supabase/customerClient.js";
import { cancelCustomerBooking, getDepositSettings } from "../../supabase/repositories/bookingsRepo";
import { isAwaitingDeposit } from "../../engine/deposits";
import { ConfirmDialog } from "../shared/ConfirmDialog.jsx";
import { AddToCalendarButton } from "./AddToCalendarButton.tsx";
import { ArrowRight, PawPrint, RefreshCw, Scissors, X } from "lucide-react";
import { SERVICE_LABELS, formatSlot, formatDate } from "./dashboardConstants.js";

/**
 * Single source of truth for the dashboard's next-action block.
 *
 * Two states:
 *   1. **Empty** — no upcoming groom. "Ready to book {dogName} in?" + green CTA.
 *   2. **Booked** — has an upcoming groom. Date, time, service, dog;
 *      Reschedule (modal-confirmed: carries the original booking ID in the
 *      URL; ordinary visits move atomically, while staff-overridden visits
 *      become a request that leaves the diary unchanged until staff decide)
 *      and Cancel (inline reason form) as low-emphasis links.
 *
 * Replaces the old "Upcoming appointments empty state" + "Time for another
 * groom?" rebook block in AppointmentsSection — they duplicated each other
 * and used different visual languages.
 */

function dayLabel(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((d - today) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays < 7) return d.toLocaleDateString("en-GB", { weekday: "long" });
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

function friendlyCancellationError(error) {
  if (error?.code === "SDC01") {
    return "Online cancellation is currently unavailable. Please contact us and we’ll help.";
  }
  if (error?.code === "SDC02") {
    return "It’s too close to your appointment to cancel online. Please contact us and we’ll help.";
  }
  return "We couldn’t cancel your booking. Please try again, or contact us if it keeps happening.";
}

function formatDueBy(dueBy) {
  if (!dueBy) return null;
  return new Date(dueBy).toLocaleString("en-GB", {
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function BookingCard({ upcomingBookings, dogs, onBook, onBookingChanged }) {
  const navigate = useNavigate();
  const [confirmingReschedule, setConfirmingReschedule] = useState(false);
  const [depositBank, setDepositBank] = useState(null);

  // Raw snake_case row → the shape isAwaitingDeposit reads.
  const nextBooking = upcomingBookings[0];
  const awaitingDeposit = nextBooking
    ? isAwaitingDeposit({
        depositRequired: nextBooking.deposit_required === true,
        depositReceivedAt: nextBooking.deposit_received_at ?? null,
        payment: nextBooking.payment ?? null,
        status: nextBooking.status ?? null,
      })
    : false;

  useEffect(() => {
    if (!awaitingDeposit || !supabase) return undefined;
    let cancelled = false;
    getDepositSettings(supabase).then((s) => {
      if (!cancelled) setDepositBank(s.bank);
    });
    return () => {
      cancelled = true;
    };
  }, [awaitingDeposit]);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");
  const [otherReason, setOtherReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [cancelError, setCancelError] = useState(null);
  const [cancellationCommitted, setCancellationCommitted] = useState(false);

  const next = upcomingBookings[0];
  const dogName = next?.dogs?.name || dogs[0]?.name || "your pup";
  const requiresStaffApproval = upcomingBookings.some((booking) => {
    const sameVisit =
      next?.visit_id && booking.visit_id && booking.visit_id === next.visit_id;
    const sameLegacyGroup =
      next?.group_id &&
      booking.group_id === next.group_id &&
      booking.booking_date === next.booking_date;
    return (
      booking.staff_capacity_override === true &&
      (booking.id === next?.id || sameVisit || sameLegacyGroup)
    );
  });

  // ----- Empty state -----
  if (!next) {
    const friendlyName = dogs[0]?.name || "your pup";
    return (
      <div className="portal-booking-card portal-booking-card--empty portal-section--full">
        <h2 className="portal-booking-card-title">
          Ready to book {friendlyName} in?
        </h2>
        <p className="portal-booking-card-body">
          Pick a date that suits you.
        </p>
        <div className="portal-booking-card-actions">
          <button className="portal-btn portal-btn--cta" onClick={onBook}>
            <PawPrint size={18} aria-hidden="true" />
            Book a groom
            <ArrowRight size={18} aria-hidden="true" className="portal-btn-arrow" />
          </button>
        </div>
      </div>
    );
  }

  // ----- Booked state -----
  const day = dayLabel(next.booking_date);
  const dateStr = formatDate(next.booking_date);
  const timeStr = formatSlot(next.slot);

  const handleRescheduleConfirm = () => {
    // Keep the authoritative booking ID in the URL so refresh/auth navigation
    // cannot turn this into a second ordinary booking. Route state supplies
    // display labels only.
    setConfirmingReschedule(false);
    const approvalQuery = requiresStaffApproval ? "&approval=request" : "";
    navigate(
      `/customer/book?reschedule=${encodeURIComponent(next.id)}${approvalQuery}`,
      {
        state: {
          rescheduleFrom: {
            id: next.id,
            dateLabel: dateStr,
            timeLabel: timeStr,
            dogName,
          },
        },
      },
    );
  };

  const startCancel = () => {
    setCancelling(true);
    setReason("");
    setOtherReason("");
    setCancelError(null);
    setCancellationCommitted(false);
  };

  const handleCancelConfirm = async () => {
    const rawReason = reason === "Other" ? otherReason.trim() : reason;
    const cleaned = rawReason.replace(/<[^>]*>/g, "").slice(0, 500);
    if (!cleaned) return;
    setSaving(true);
    setCancelError(null);
    try {
      if (!supabase) {
        setCancelError(
          "We couldn’t cancel your booking. Please try again, or contact us if it keeps happening.",
        );
        return;
      }

      const { receipt, error } = await cancelCustomerBooking(supabase, {
        bookingId: next.id,
        reason: cleaned,
      });
      if (error || !receipt) {
        setCancelError(friendlyCancellationError(error));
        return;
      }

      setCancellationCommitted(true);
      try {
        await onBookingChanged?.();
      } catch {
        setCancelError(
          "Your cancellation was saved, but we couldn't refresh your bookings. Refresh the page to see the latest status.",
        );
        return;
      }

      setCancelling(false);
      setReason("");
      setOtherReason("");
      setCancelError(null);
      setCancellationCommitted(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="portal-booking-card portal-booking-card--booked portal-section--full">
        <div className="flex items-center gap-2">
          <span className="portal-card-iconbadge portal-card-iconbadge--mint">
            <Scissors size={18} aria-hidden="true" />
          </span>
          <h2 className="portal-booking-card-title">
            Next groom: {day}, {timeStr}
          </h2>
        </div>
        <p className="portal-booking-card-body">
          Drop off time is {timeStr}, please ring the doorbell on arrival. We&apos;ll text you when {dogName}&apos;s ready.
          {next.service && (
            <>
              {" "}
              <span className="text-[var(--sd-ink-light)]">
                · {SERVICE_LABELS[next.service] || next.service} for {dogName}
              </span>
            </>
          )}
        </p>

        {awaitingDeposit && (
          <div
            role="status"
            aria-label="Deposit needed"
            className="mt-1 mb-2 p-3.5 rounded-xl border-l-[3px] border-l-amber-400 bg-amber-50 text-[13px] text-[var(--sd-navy)]"
          >
            <strong>Deposit needed to hold this booking.</strong>{" "}
            Send £{next.deposit_amount ?? 10}
            {depositBank ? (
              <>
                {" "}to {depositBank.accountName} (sort code {depositBank.sortCode}, account{" "}
                {depositBank.accountNumber})
              </>
            ) : null}{" "}
            with reference <strong>{next.deposit_reference}</strong>
            {next.deposit_due_by ? <> by {formatDueBy(next.deposit_due_by)}</> : null}.{" "}
            Your booking is confirmed once your deposit arrives. Deposits are
            non-refundable and can&apos;t be transferred to another date if you
            don&apos;t show.
          </div>
        )}

        {!cancelling && (
          <div
            className={`portal-booking-card-actions ${
              requiresStaffApproval
                ? "portal-booking-card-actions--request"
                : ""
            }`}
          >
            <AddToCalendarButton bookingId={next.id} pill />
            <button
              type="button"
              className="portal-booking-action"
              onClick={() => setConfirmingReschedule(true)}
              disabled={saving}
            >
              <RefreshCw size={14} aria-hidden="true" />
              {requiresStaffApproval ? "Request a change" : "Reschedule"}
            </button>
            <button
              type="button"
              className="portal-booking-action portal-booking-action--danger"
              onClick={startCancel}
              disabled={saving}
            >
              <X size={14} aria-hidden="true" />
              Cancel
            </button>
          </div>
        )}

        {cancelling && (
          <div
            className="mt-1 p-3.5 rounded-xl border-l-[3px] border-l-brand-coral bg-pink-50"
            role="region"
            aria-label="Cancel booking"
          >
            <div className="text-sm font-semibold text-[var(--sd-navy)] mb-2.5">
              Why are you cancelling?
            </div>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="portal-input mb-2.5"
            >
              <option value="">Select a reason…</option>
              <option value="Changed plans">Changed plans</option>
              <option value="Dog unwell">Dog unwell</option>
              <option value="Found another date">Found another date</option>
              <option value="Other">Other</option>
            </select>
            {reason === "Other" && (
              <input
                type="text"
                value={otherReason}
                onChange={(e) => setOtherReason(e.target.value)}
                placeholder="Please tell us why…"
                className="portal-input mb-2.5"
              />
            )}
            {cancelError && (
              <div role="alert" className="portal-inline-error mb-2.5">
                {cancelError}
              </div>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                className="portal-btn portal-btn--danger flex-1 text-[13px]"
                onClick={handleCancelConfirm}
                disabled={saving || cancellationCommitted || !reason || (reason === "Other" && !otherReason.trim())}
              >
                {saving
                  ? "Cancelling…"
                  : cancellationCommitted
                    ? "Cancellation saved"
                    : "Confirm cancellation"}
              </button>
              <button
                type="button"
                className="portal-btn portal-btn--secondary portal-btn--small"
                onClick={() => {
                  if (!cancellationCommitted) setCancelling(false);
                }}
                disabled={saving || cancellationCommitted}
              >
                <X size={14} aria-hidden="true" />
                Back
              </button>
            </div>
          </div>
        )}
      </div>

      {confirmingReschedule && (
        <ConfirmDialog
          title={
            requiresStaffApproval
              ? "Request a different time?"
              : "Reschedule this groom?"
          }
          message={
            requiresStaffApproval
              ? "Choose the time you’d prefer. Your current appointment stays booked unless the team approves the change."
              : "Pick your new time and we'll swap you over once you confirm."
          }
          confirmLabel={
            requiresStaffApproval
              ? "Choose a preferred time"
              : "Pick a new time"
          }
          cancelLabel="Keep this slot"
          variant="primary"
          onConfirm={handleRescheduleConfirm}
          onCancel={() => setConfirmingReschedule(false)}
        />
      )}
    </>
  );
}
