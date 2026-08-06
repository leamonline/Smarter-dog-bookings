// ============================================================
// src/components/dashboard/TomorrowRemindersCard.jsx
//
// Right-rail reminders card. Stateless / presentational w.r.t. tone:
// the hook stays owned here (the per-row tick list calls back into
// supabase.functions.invoke and the existing realtime subscription
// keeps the ticks in sync). The right-rail container passes the
// pre-computed `data` shape so the hook isn't subscribed twice; if
// no data is passed (UtilityTabs path), we fall back to owning the
// hook ourselves.
// ============================================================

import { useMemo, useState } from "react";
import { useTomorrowReminders } from "../../supabase/hooks/useTomorrowReminders.js";
import { useToast } from "../../contexts/ToastContext.jsx";
import { supabase } from "../../supabase/client";
import { CheckCircle2, Circle, Clock, Send } from "lucide-react";
import { RightRailCard } from "./RightRailCard.jsx";
import { resolveRemindersTone } from "./tone/reminders";
import { SendReminderModal } from "../modals/send-reminder/SendReminderModal.jsx";

function formatSlot(slot) {
  if (!slot) return "";
  const [h, m] = slot.split(":").map(Number);
  const period = h < 12 ? "am" : "pm";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, "0")}${period}`;
}

function formatSentTime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ReminderRow({ row, onOpen, busy }) {
  const sent = row.reminderStatus === "sent";
  const clickable = !busy;
  return (
    <button
      type="button"
      onClick={clickable ? onOpen : undefined}
      disabled={!clickable}
      title={
        sent
          ? `Reminder sent at ${formatSentTime(row.reminderSentAt)}${row.reminderChannel ? ` via ${row.reminderChannel}` : ""}${row.confirmed && row.reminderConfirmedAt ? ` — customer confirmed at ${new Date(row.reminderConfirmedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false })}` : ""} — click to view`
          : busy
            ? "Sending…"
            : "Click to choose a channel and send a reminder"
      }
      className={[
        "w-full text-left flex flex-col items-start gap-0.5 sm:flex-row sm:items-center sm:gap-2 px-2 py-1.5 rounded-lg transition-colors font-[inherit] text-[12px]",
        sent
          ? "bg-brand-green-50/80 text-brand-green-900 hover:bg-brand-green-100/80 cursor-pointer"
          : busy
            ? "bg-amber-100 text-amber-900"
            : "bg-white/70 hover:bg-white border border-amber-100 text-amber-900 cursor-pointer",
      ].join(" ")}
    >
      <span className="w-full sm:w-auto flex items-center gap-2 min-w-0">
      <span className="shrink-0 flex items-center gap-0.5">
        {sent ? (
          <>
            <CheckCircle2 size={16} className="text-brand-green-600" aria-label="Reminder sent" />
            {row.confirmed && (
              <CheckCircle2
                size={16}
                className="text-brand-green-700 fill-brand-green-100"
                aria-label={
                  row.reminderConfirmedAt
                    ? `Customer confirmed at ${new Date(row.reminderConfirmedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false })}`
                    : "Customer confirmed"
                }
              />
            )}
          </>
        ) : busy ? (
          <Send size={14} className="text-amber-600 animate-pulse" aria-label="Sending" />
        ) : (
          <Circle size={16} className="text-amber-400" aria-label="No reminder sent yet" />
        )}
      </span>
      <span className="flex-1 min-w-0 break-words sm:truncate">
        <span className="font-semibold">{row.customerName}</span>
        <span className="text-amber-800/70"> · {row.dogNamesDisplay}</span>
      </span>
      </span>
      <span className="shrink-0 pl-6 sm:pl-0 tabular-nums text-amber-800/70">
        {formatSlot(row.slot)}
        {row.multiSlot && (
          <span
            className="text-amber-500"
            title={row.slots.map(formatSlot).join(", ")}
          >
            {" "}
            +{row.slots.length - 1}
          </span>
        )}
      </span>
    </button>
  );
}

export function TomorrowRemindersCard({ bare = false, data, onOpen }) {
  const fallback = useTomorrowReminders();
  const { targetDate, rows, sentCount, totalCount, loading, error, refresh } =
    data ?? fallback;

  const toast = useToast();
  const [busyKeys, setBusyKeys] = useState(new Set());
  const [modalRow, setModalRow] = useState(null);

  const tone = useMemo(
    () => resolveRemindersTone({ targetDate, sentCount, totalCount }),
    [targetDate, sentCount, totalCount],
  );

  const handleSend = async (row) => {
    if (busyKeys.has(row.customerKey)) return;
    setBusyKeys((prev) => {
      const next = new Set(prev);
      next.add(row.customerKey);
      return next;
    });
    try {
      // One anchor booking_id — the edge function expands it to every dog
      // this customer has that day and sends a single combined reminder.
      const { data: result, error: invokeErr } =
        await supabase.functions.invoke("notify-booking-reminder", {
          body: { booking_id: row.anchorBookingId },
        });
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
      const anyFail = (result?.results ?? []).some((r) => !r.success);
      if (anyFail) {
        toast.show(
          `Couldn't send a reminder to ${row.customerName} — check their contact details.`,
          "error",
        );
      } else {
        toast.show(`Reminder sent to ${row.customerName} — nice one`, "success");
      }
      refresh?.();
    } catch (err) {
      toast.show(err instanceof Error ? err.message : String(err), "error");
    } finally {
      setBusyKeys((prev) => {
        const next = new Set(prev);
        next.delete(row.customerKey);
        return next;
      });
    }
  };

  const handleSendRemaining = async () => {
    const pending = (rows ?? []).filter((r) => r.reminderStatus !== "sent");
    for (const row of pending) {
      // Serial — the edge function rate-limits per WhatsApp send, and
      // staff don't expect a flood of toast notifications.
      await handleSend(row);
    }
  };

  const previewRows = useMemo(() => {
    return (rows ?? []).slice(0, 3);
  }, [rows]);

  const moreCount = Math.max(0, (rows ?? []).length - 3);

  const loudList = (
    <>
      {error && (
        <div
          role="alert"
          className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded-lg p-2 mb-2"
        >
          Couldn&apos;t load reminders.
          <button
            type="button"
            onClick={refresh}
            className="ml-2 underline font-semibold cursor-pointer bg-transparent border-none"
          >
            Retry
          </button>
        </div>
      )}
      <ul className="flex flex-col gap-1 overflow-hidden">
        {previewRows.map((r) => (
          <li key={r.customerKey}>
            <ReminderRow
              row={r}
              onOpen={() => setModalRow(r)}
              busy={busyKeys.has(r.customerKey)}
            />
          </li>
        ))}
        {moreCount > 0 && (
          <li className="text-[11px] text-slate-500 font-semibold px-2.5 py-1.5 list-none">
            +{moreCount} more
          </li>
        )}
      </ul>
      {onOpen && (
        <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-start">
          <button
            type="button"
            onClick={onOpen}
            className="inline-flex items-center justify-center py-1.5 px-3 rounded-md bg-slate-50 border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-100 cursor-pointer"
          >
            Review all {totalCount}
          </button>
        </div>
      )}
    </>
  );

  const ctaLabel =
    tone.tone === "calm"
      ? "View reminders"
      : busyKeys.size > 0
        ? "Sending…"
        : "Send remaining";

  return (
    <>
      <RightRailCard
        tone={tone.tone}
        accent="amber"
        heading={`Reminders for ${formatTargetDateShort(targetDate)}`}
        icon={Clock}
        pillLabel={tone.pillLabel}
        primaryNumber={tone.primaryNumber}
        primaryLine={tone.primaryLine}
        subtitle={tone.subtitle}
        progress={tone.progress}
        ariaLabel={tone.ariaSummary}
        loading={loading}
        bare={bare}
        loudChildren={tone.tone === "calm" ? null : loudList}
        cta={{
          label: ctaLabel,
          onClick: tone.tone === "calm" ? (onOpen ?? (() => {})) : handleSendRemaining,
        }}
      />
      {modalRow && (
        <SendReminderModal
          row={modalRow}
          targetDate={targetDate}
          onClose={() => setModalRow(null)}
          onSent={refresh}
        />
      )}
    </>
  );
}

function formatTargetDateShort(yyyyMmDd) {
  if (!yyyyMmDd) return "tomorrow";
  try {
    return new Date(`${yyyyMmDd}T12:00:00Z`).toLocaleDateString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
  } catch {
    return yyyyMmDd;
  }
}
