import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { customerSupabase as supabase } from "../../supabase/customerClient.js";
import { ConfirmDialog } from "../shared/ConfirmDialog.jsx";
import { ArrowRight, Calendar, PawPrint, X } from "lucide-react";
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

function slotPlus30(slot) {
  const [h, m] = slot.split(":").map(Number);
  const total = h * 60 + m + 30;
  const hh = Math.floor(total / 60) % 24;
  const mm = total % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function dropOffWindowLabel(slot) {
  return `${formatSlot(slot)}–${formatSlot(slotPlus30(slot))}`;
}

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
  const ids = booking.group_id
    ? (await supabase.from("bookings").select("id").eq("group_id", booking.group_id)).data?.map((r) => r.id) ?? [booking.id]
    : [booking.id];
  await supabase
    .from("bookings")
    .update({ status: "Cancelled", cancel_reason: reason })
    .in("id", ids);
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
          Pick a date that suits you — drop off in the morning, collected by tea.
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
          dateLabel: `${day} ${dateStr}`,
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
        <h2 className="portal-booking-card-title">
          Next groom: {day} {dateStr}, {timeStr}
        </h2>
        <p className="portal-booking-card-body">
          Drop-off is from {dropOffWindowLabel(next.slot)}. We&apos;ll text you when {dogName}&apos;s ready.
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
            <button
              type="button"
              className="portal-booking-card-secondary"
              onClick={() => setConfirmingReschedule(true)}
              disabled={saving}
            >
              <Calendar size={14} aria-hidden="true" />
              Reschedule
            </button>
            <button
              type="button"
              className="portal-booking-card-secondary portal-booking-card-secondary--danger"
              onClick={startCancel}
              disabled={saving}
            >
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
          title="Pick a new time?"
          message={`We'll open the booking flow so you can pick a new slot for ${dogName}. Your current ${day} ${dateStr}, ${timeStr} booking stays held until you confirm a new one — cancel out and nothing changes.`}
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
