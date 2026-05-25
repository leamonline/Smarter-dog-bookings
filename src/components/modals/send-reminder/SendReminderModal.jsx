// ============================================================
// src/components/modals/send-reminder/SendReminderModal.jsx
//
// "Send Reminder" modal launched from the dashboard's tomorrow-
// reminders panel. Shows the booking summary, three channel pills
// (WhatsApp / SMS / Email) gated by the customer's contact details +
// opt-out flags, and the selected channel's composer. Sending goes
// through the reminder-send edge function, which marks the booking
// Sent (notification_log) and logs to the inbox. An already-sent row
// opens a read-only view.
// ============================================================

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../supabase/client.js";
import { useToast } from "../../../contexts/ToastContext.jsx";
import { parseSupabaseFunctionError } from "../../../supabase/hooks/inbox/helpers.js";
import { normaliseUkMobile, formatPhoneForDisplay } from "../../../utils/phone.js";
import { formatDateShort, formatTime } from "../../../lib/reminders/templates.js";
import { SERVICES } from "../../../constants/salon.ts";
import { WhatsAppComposer } from "./WhatsAppComposer.jsx";
import { SmsComposer } from "./SmsComposer.jsx";
import { EmailComposer } from "./EmailComposer.jsx";

const CHANNEL_LABEL = { whatsapp: "WhatsApp", sms: "SMS", email: "Email" };

function serviceName(id) {
  return SERVICES.find((s) => s.id === id)?.name ?? id;
}

// Mirror of the server-side validation in reminder-send so the pills
// reflect what will actually be allowed. The server re-checks; this is UX.
function computeAvailability(human) {
  if (!human) {
    const reason = "No customer linked to this booking";
    return {
      whatsapp: { ok: false, reason },
      sms: { ok: false, reason },
      email: { ok: false, reason },
    };
  }
  const phoneValid = !!normaliseUkMobile(human.phone || "");
  return {
    whatsapp: !phoneValid
      ? { ok: false, reason: "No WhatsApp number on file" }
      : !human.whatsapp
        ? { ok: false, reason: "Customer isn't set up for WhatsApp" }
        : human.whatsapp_opted_out
          ? { ok: false, reason: "Customer opted out of WhatsApp" }
          : { ok: true, reason: "" },
    sms: !phoneValid
      ? { ok: false, reason: "No mobile number on file" }
      : !human.sms
        ? { ok: false, reason: "Customer isn't set up for SMS" }
        : human.sms_opted_out
          ? { ok: false, reason: "Customer opted out of SMS" }
          : { ok: true, reason: "" },
    email: !human.email
      ? { ok: false, reason: "No email on file" }
      : human.email_opted_out
        ? { ok: false, reason: "Customer opted out of email" }
        : { ok: true, reason: "" },
  };
}

function ChannelPill({ channel, available, active, onSelect }) {
  return (
    <button
      type="button"
      onClick={available.ok ? () => onSelect(channel) : undefined}
      disabled={!available.ok}
      title={available.ok ? `Send via ${CHANNEL_LABEL[channel]}` : available.reason}
      aria-pressed={active}
      className={[
        "inline-flex items-center h-8 px-4 rounded-full text-[13px] font-semibold font-[inherit] transition-colors",
        !available.ok
          ? "bg-slate-100 text-slate-400 cursor-not-allowed"
          : active
            ? "bg-brand-purple text-white cursor-pointer"
            : "bg-white text-brand-purple border border-brand-purple/30 hover:bg-brand-purple/10 cursor-pointer",
      ].join(" ")}
    >
      {CHANNEL_LABEL[channel]}
    </button>
  );
}

export function SendReminderModal({ row, targetDate, onClose, onSent }) {
  const toast = useToast();
  const [human, setHuman] = useState(null);
  const [serviceIds, setServiceIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedChannel, setSelectedChannel] = useState(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  const isSent = row?.reminderStatus === "sent";
  const isOrphan = !row?.customerKey || String(row.customerKey).startsWith("orphan:");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const humanId = isOrphan ? null : row.customerKey;
      const [humanRes, bookingsRes] = await Promise.all([
        humanId
          ? supabase
              .from("humans")
              .select(
                "id, name, surname, phone, whatsapp, sms, email, whatsapp_opted_out, sms_opted_out, email_opted_out",
              )
              .eq("id", humanId)
              .maybeSingle()
          : Promise.resolve({ data: null }),
        supabase.from("bookings").select("id, service").in("id", row?.bookingIds ?? []),
      ]);
      if (cancelled) return;
      setHuman(humanRes.data ?? null);
      setServiceIds([
        ...new Set((bookingsRes.data ?? []).map((b) => b.service).filter(Boolean)),
      ]);
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [row, isOrphan]);

  const availability = useMemo(() => computeAvailability(human), [human]);

  // Auto-select the first available channel once data loads.
  useEffect(() => {
    if (loading || isSent || selectedChannel) return;
    const first = ["whatsapp", "sms", "email"].find((c) => availability[c].ok);
    if (first) setSelectedChannel(first);
  }, [loading, isSent, selectedChannel, availability]);

  const firstName =
    human?.name?.trim()?.split(/\s+/)[0] || row?.customerName?.split(/\s+/)[0] || "";
  const slot = row?.slot || (row?.slots ?? [])[0] || "";
  const dogNames = row?.dogNames ?? [];
  const serviceForTemplate = serviceIds.length === 1 ? serviceName(serviceIds[0]) : null;

  async function handleSend(channelPayload) {
    if (sending) return;
    setSending(true);
    setError(null);
    try {
      const { data, error: invokeErr } = await supabase.functions.invoke("reminder-send", {
        body: { booking_id: row.anchorBookingId, ...channelPayload },
      });
      if (invokeErr) throw new Error(await parseSupabaseFunctionError(invokeErr, "Reminder failed"));
      if (data?.error) throw new Error(data.detail || data.error);
      toast.show(
        `Reminder sent to ${row.customerName} via ${CHANNEL_LABEL[channelPayload.channel]}.`,
        "success",
      );
      onSent?.();
      onClose?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  }

  const whenLine = `${formatDateShort(targetDate)} · ${(row?.slots ?? [row?.slot])
    .filter(Boolean)
    .map(formatTime)
    .join(", ")}`;
  const serviceLine =
    serviceIds.length > 0 ? serviceIds.map(serviceName).join(", ") : null;

  const composerProps = {
    firstName,
    dogNames,
    date: targetDate,
    slot,
    service: serviceForTemplate,
    onSend: handleSend,
    sending,
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-start sm:items-center justify-center p-3 sm:p-6 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label="Send reminder"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl flex flex-col max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-brand-paper">
          <h2 className="text-[15px] font-bold font-display text-brand-purple m-0">Send Reminder</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-slate-500 hover:text-slate-700 w-7 h-7 rounded-full hover:bg-slate-100 transition-colors text-[16px] cursor-pointer bg-transparent border-none"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
          {/* Booking summary */}
          <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">
            <div className="text-[14px] font-bold text-brand-purple">{row?.customerName}</div>
            <div className="text-[12px] text-slate-600">{row?.dogNamesDisplay}</div>
            <div className="text-[12px] text-slate-500 mt-1 tabular-nums">{whenLine}</div>
            {serviceLine && <div className="text-[12px] text-slate-500">{serviceLine}</div>}
          </div>

          {error && (
            <div role="alert" className="p-2 rounded-lg bg-red-50 border border-red-200 text-[12px] text-red-900">
              {error}
            </div>
          )}

          {isSent ? (
            <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-[13px] text-emerald-900">
              Reminder already sent
              {row.reminderChannel ? ` via ${CHANNEL_LABEL[row.reminderChannel] ?? row.reminderChannel}` : ""}
              {row.reminderSentAt
                ? ` at ${new Date(row.reminderSentAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`
                : ""}
              .
            </div>
          ) : loading ? (
            <div className="text-[12px] text-slate-500 py-4 text-center">Loading customer…</div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                {["whatsapp", "sms", "email"].map((c) => (
                  <ChannelPill
                    key={c}
                    channel={c}
                    available={availability[c]}
                    active={selectedChannel === c}
                    onSelect={setSelectedChannel}
                  />
                ))}
              </div>

              {selectedChannel === "whatsapp" && <WhatsAppComposer {...composerProps} />}
              {selectedChannel === "sms" && (
                <SmsComposer {...composerProps} phoneDisplay={formatPhoneForDisplay(human?.phone)} />
              )}
              {selectedChannel === "email" && (
                <EmailComposer {...composerProps} emailTo={human?.email} />
              )}
              {!selectedChannel && (
                <div className="text-[12px] text-slate-500 py-2">
                  {isOrphan
                    ? "This booking isn't linked to a customer record, so there's no contact channel. Open the booking to link a customer."
                    : "No contact channel is available for this customer. Add a phone or email on their profile."}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
