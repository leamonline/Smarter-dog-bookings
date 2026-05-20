// ============================================================
// src/components/dashboard/TomorrowRemindersCard.jsx
//
// Dashboard panel listing every booking on the next salon-open day
// with a tick box per row. Clicking an unticked row triggers a
// one-shot reminder via the notify-booking-reminder edge function
// (staff-JWT path, added in the same change set). Already-ticked
// rows are read-only — they show the time the reminder went out.
//
// Realtime: useTomorrowReminders subscribes to notification_log so
// the tick state stays in sync with the nightly cron AND any other
// device the staff is using.
// ============================================================

import { useState } from "react";
import { useTomorrowReminders } from "../../supabase/hooks/useTomorrowReminders.js";
import { useToast } from "../../contexts/ToastContext.jsx";
import { supabase } from "../../supabase/client.js";
import { CheckCircle2, Circle, Clock, Send } from "lucide-react";

function formatSlot(slot) {
  if (!slot) return "";
  const [h, m] = slot.split(":").map(Number);
  const period = h < 12 ? "am" : "pm";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")}${period}`;
}

function formatTargetDate(yyyyMmDd) {
  if (!yyyyMmDd) return "";
  return new Date(`${yyyyMmDd}T12:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function formatSentTime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export function TomorrowRemindersCard() {
  const { targetDate, rows, sentCount, totalCount, loading, error, refresh } = useTomorrowReminders();
  const toast = useToast();
  const [busyBookingIds, setBusyBookingIds] = useState(new Set());

  const handleSend = async (booking) => {
    if (busyBookingIds.has(booking.bookingId)) return;
    setBusyBookingIds((prev) => {
      const next = new Set(prev);
      next.add(booking.bookingId);
      return next;
    });
    try {
      const { data, error: invokeErr } = await supabase.functions.invoke(
        "notify-booking-reminder",
        { body: { booking_id: booking.bookingId } },
      );
      if (invokeErr) {
        let detail = invokeErr.message ?? "Reminder failed";
        try {
          const errorBody = await invokeErr.context?.json?.();
          if (errorBody?.error) detail = errorBody.error;
        } catch {
          /* fall through */
        }
        throw new Error(detail);
      }
      // Function returns { results: [{ success, channel }] }. Surface failures.
      const anyFail = (data?.results ?? []).some((r) => !r.success);
      if (anyFail) {
        toast.show(
          `Could not send reminder to ${booking.customerName} — check the customer's contact preferences.`,
          "error",
        );
      } else {
        toast.show(`Reminder sent to ${booking.customerName}.`, "success");
      }
      // Realtime will update the tick automatically; manual refresh as a belt-and-braces fallback.
      refresh();
    } catch (err) {
      toast.show(err instanceof Error ? err.message : String(err), "error");
    } finally {
      setBusyBookingIds((prev) => {
        const next = new Set(prev);
        next.delete(booking.bookingId);
        return next;
      });
    }
  };

  return (
    <section
      aria-label="Tomorrow's reminders"
      className="rounded-2xl border border-amber-200 shadow-[0_2px_8px_rgba(245,158,11,0.06)] overflow-hidden bg-gradient-to-br from-amber-50 to-white"
    >
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-[10px] font-bold text-amber-700/70 uppercase tracking-wider">
              Reminders for {formatTargetDate(targetDate)}
            </h2>
            <div className="text-[11px] text-amber-700/80 mt-0.5">
              {loading
                ? "Loading…"
                : `${sentCount} of ${totalCount} sent`}
            </div>
          </div>
          <span className="w-7 h-7 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center">
            <Clock size={14} strokeWidth={2.4} aria-hidden="true" />
          </span>
        </div>

        {error && (
          <div role="alert" className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded-lg p-2 mb-2">
            Couldn&apos;t load reminders.
            <button type="button" onClick={refresh} className="ml-2 underline font-semibold cursor-pointer">
              Retry
            </button>
          </div>
        )}

        {!loading && rows.length === 0 && !error && (
          <p className="text-[12px] text-amber-800/80 italic">
            No bookings on {formatTargetDate(targetDate)}.
          </p>
        )}

        <ul className="flex flex-col gap-1">
          {rows.map((r) => {
            const sent = r.reminderStatus === "sent";
            const busy = busyBookingIds.has(r.bookingId);
            const isClickable = !sent && !busy;
            return (
              <li key={r.bookingId}>
                <button
                  type="button"
                  onClick={isClickable ? () => handleSend(r) : undefined}
                  disabled={!isClickable}
                  title={
                    sent
                      ? `Reminder sent at ${formatSentTime(r.reminderSentAt)}${r.reminderChannel ? ` via ${r.reminderChannel}` : ""}`
                      : busy
                        ? "Sending…"
                        : "Click to send a reminder to this customer now"
                  }
                  className={[
                    "w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors font-[inherit] text-[12px]",
                    sent
                      ? "bg-emerald-50/80 text-emerald-900 cursor-default"
                      : busy
                        ? "bg-amber-100 text-amber-900"
                        : "bg-white/70 hover:bg-white border border-amber-100 text-amber-900 cursor-pointer",
                  ].join(" ")}
                >
                  <span className="shrink-0">
                    {sent ? (
                      <CheckCircle2 size={16} className="text-emerald-600" aria-label="Reminder sent" />
                    ) : busy ? (
                      <Send size={14} className="text-amber-600 animate-pulse" aria-label="Sending" />
                    ) : (
                      <Circle size={16} className="text-amber-400" aria-label="No reminder sent yet" />
                    )}
                  </span>
                  <span className="flex-1 truncate">
                    <span className="font-semibold">{r.customerName}</span>
                    <span className="text-amber-800/70"> · {r.dogName}</span>
                  </span>
                  <span className="shrink-0 tabular-nums text-amber-800/70">
                    {formatSlot(r.slot)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
