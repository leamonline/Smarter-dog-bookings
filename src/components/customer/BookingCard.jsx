import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { customerSupabase as supabase } from "../../supabase/customerClient.js";
import { cancelMany, listIdsInGroup } from "../../supabase/repositories/bookingsRepo";
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
 *      Reschedule (modal-confirmed: navigates to /customer/book with route
 *      state — the wizard cancels the original *after* a new booking is
 *      successfully created, so abandoning the wizard preserves the slot)
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

async function cancelBookingIds({ booking, reason, onChanged }) {
  if (!supabase) return;
  const ids = await listIdsInGroup(supabase, {
    groupId: booking.group_id,
    fallbackId: booking.id,
  });
  await cancelMany(supabase, { ids, reason });
  onChanged?.();
}

export function BookingCard({ upcomingBookings, dogs, onBook, onBookingChanged }) {
  const navigate = useNavigate();
  const [confirmingReschedule, setConfirmingReschedule] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");
  const [otherReason, setOtherReason] = useState("");
  const [saving, setSaving] = useState(false);

  const next = upcomingBookings[0];
  const dogName = next?.dogs?.name || dogs[0]?.name || "your pup";

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
    // Don't cancel anything yet — pass the booking context to the wizard via
    // route state. The wizard cancels this booking only *after* a new one is
    // successfully created, so abandoning the wizard preserves the slot.
    setConfirmingReschedule(false);
    navigate("/customer/book", {
      state: {
        rescheduleFrom: {
          id: next.id,
          groupId: next.group_id || null,
          dateLabel: dateStr,
          timeLabel: timeStr,
          dogName,
        },
      },
    });
  };

  const startCancel = () => {
    setCancelling(true);
    setReason("");
    setOtherReason("");
  };

  const handleCancelConfirm = async () => {
    const rawReason = reason === "Other" ? otherReason.trim() : reason;
    const cleaned = rawReason.replace(/<[^>]*>/g, "").slice(0, 500);
    if (!cleaned) return;
    setSaving(true);
    try {
      await cancelBookingIds({ booking: next, reason: cleaned, onChanged: onBookingChanged });
    } finally {
      setSaving(false);
      setCancelling(false);
      setReason("");
      setOtherReason("");
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

        {!cancelling && (
          <div className="portal-booking-card-actions">
            <AddToCalendarButton bookingId={next.id} pill />
            <button
              type="button"
              className="portal-booking-action"
              onClick={() => setConfirmingReschedule(true)}
              disabled={saving}
            >
              <RefreshCw size={14} aria-hidden="true" />
              Reschedule
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
            <div className="flex gap-2">
              <button
                type="button"
                className="portal-btn portal-btn--danger flex-1 text-[13px]"
                onClick={handleCancelConfirm}
                disabled={saving || !reason || (reason === "Other" && !otherReason.trim())}
              >
                {saving ? "Cancelling…" : "Confirm cancellation"}
              </button>
              <button
                type="button"
                className="portal-btn portal-btn--secondary portal-btn--small"
                onClick={() => setCancelling(false)}
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
          title="Reschedule this groom?"
          message="Pick your new time and we'll swap you over once you confirm."
          confirmLabel="Pick a new time"
          cancelLabel="Keep this slot"
          variant="primary"
          onConfirm={handleRescheduleConfirm}
          onCancel={() => setConfirmingReschedule(false)}
        />
      )}
    </>
  );
}
