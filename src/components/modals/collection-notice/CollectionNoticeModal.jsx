// ============================================================
// src/components/modals/collection-notice/CollectionNoticeModal.jsx
//
// Pops up when a booking transitions to "Ready for pick-up" (fired
// centrally from useBookings.updateBooking). Lets staff send a WhatsApp
// "ready for collection" template to the owner and/or any trusted
// contact, with a staff-entered ETA in minutes. Each recipient has its
// own Send button; the footer "No, close" button dismisses without
// sending.
//
// Sending reuses the whatsapp-send edge function (Meta Cloud API
// template) — the same path the inbox compose-new flow uses — so the
// message goes out from the salon's WhatsApp Business number and is
// logged to the recipient's inbox thread. The ready_for_collection_v1
// template must be Approved in Meta before live sends succeed.
// ============================================================

import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../../supabase/client.js";
import { useToast } from "../../../contexts/ToastContext.jsx";
import { parseSupabaseFunctionError } from "../../../supabase/hooks/inbox/helpers.js";
import { normaliseUkMobile, formatPhoneForDisplay } from "../../../utils/phone.js";
import { WHATSAPP_TEMPLATES, buildTemplateParams } from "../../../constants/whatsappTemplates.js";
import { joinNames } from "../../../lib/reminders/templates.js";
import { titleCase } from "../../../utils/text";
import { BOOKING_STATUS } from "../../../constants/index";

const READY_TEMPLATE = WHATSAPP_TEMPLATES.find((t) => t.name === "ready_for_collection_v1");

function displayName(h) {
  return `${h?.name ?? ""} ${h?.surname ?? ""}`.trim() || "this contact";
}

// WhatsApp availability for a collection notice. Unlike the reminder
// flow we do NOT require the `whatsapp` preference boolean (it defaults
// to false on most rows, incl. trusted contacts) — a valid UK mobile
// that hasn't opted out is enough for an operational pickup template.
function whatsappAvailability(h) {
  if (!normaliseUkMobile(h?.phone || "")) {
    return { ok: false, reason: "No mobile number on file" };
  }
  if (h?.whatsapp_opted_out) {
    return { ok: false, reason: "Opted out of WhatsApp" };
  }
  return { ok: true, reason: "" };
}

export function CollectionNoticeModal({ booking, onClose }) {
  const toast = useToast();
  const [recipients, setRecipients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [minutes, setMinutes] = useState("15");
  const [sendingId, setSendingId] = useState(null);
  const [sentIds, setSentIds] = useState(() => new Set());

  const ownerId = booking?._ownerId ?? null;
  // The owner's other dogs booked the same day that are ALSO ready get
  // named in the one notice ("Bella and Max are ready"). Dogs still being
  // groomed are left out — their own notice fires when they're marked
  // ready. Starts as just this booking's dog; the effect below widens it.
  const [readyDogNames, setReadyDogNames] = useState(() =>
    [booking?.dogName].filter(Boolean),
  );
  const dogName = joinNames(readyDogNames.map((n) => titleCase(n))) || "Your dog";
  const isPlural = readyDogNames.length > 1;

  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose?.();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      if (!ownerId) {
        setRecipients([]);
        setLoading(false);
        return;
      }
      const ownerCols = "id, name, surname, phone, whatsapp_opted_out";
      const [ownerRes, linkRes, dayRes] = await Promise.all([
        supabase.from("humans").select(ownerCols).eq("id", ownerId).maybeSingle(),
        supabase
          .from("human_trusted_contacts")
          .select("trusted_id, relationship")
          .eq("human_id", ownerId),
        booking?._bookingDate
          ? supabase
              .from("bookings")
              .select("id, status, dog_name_snapshot, dogs!inner(human_id, name)")
              .eq("booking_date", booking._bookingDate)
              .eq("dogs.human_id", ownerId)
              .neq("status", "Cancelled")
          : Promise.resolve({ data: null }),
      ]);

      // Name every dog of this owner that's ready for pick-up today
      // (this booking's dog included regardless of how fresh its status
      // row is — the modal opens on the transition itself).
      const dayRows = dayRes?.data ?? [];
      const ready = dayRows.filter(
        (r) =>
          r.id === booking?.id ||
          r.status === BOOKING_STATUS.READY_FOR_PICKUP ||
          r.status === BOOKING_STATUS.COMPLETED,
      );
      if (ready.length > 0) {
        const names = [];
        for (const r of ready) {
          const dog = Array.isArray(r.dogs) ? r.dogs[0] : r.dogs;
          const name = dog?.name || r.dog_name_snapshot;
          if (name && !names.includes(name)) names.push(name);
        }
        if (!cancelled && names.length > 0) setReadyDogNames(names);
      }

      const links = linkRes.data ?? [];
      const trustedIds = links.map((r) => r.trusted_id).filter(Boolean);
      const relById = new Map(links.map((r) => [r.trusted_id, r.relationship]));

      let trusted = [];
      if (trustedIds.length) {
        const trustedRes = await supabase.from("humans").select(ownerCols).in("id", trustedIds);
        trusted = (trustedRes.data ?? []).map((h) => ({
          ...h,
          relationship: relById.get(h.id) || "Trusted contact",
          isOwner: false,
        }));
      }

      if (cancelled) return;
      const list = [];
      if (ownerRes.data) list.push({ ...ownerRes.data, relationship: "Owner", isOwner: true });
      list.push(...trusted);
      setRecipients(list);
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [ownerId, booking?.id, booking?._bookingDate]);

  const minutesValid = /^\d{1,3}$/.test(minutes.trim()) && Number(minutes.trim()) > 0;
  const previewText =
    READY_TEMPLATE?.preview({ dog_name: dogName, minutes: minutes.trim() || "__" }) ?? "";

  const handleSend = useCallback(
    async (recipient) => {
      if (sendingId) return;
      if (!minutesValid) {
        toast.show("Enter how many minutes until collection.", "error");
        return;
      }
      const phoneE164 = normaliseUkMobile(recipient.phone || "");
      if (!phoneE164) {
        toast.show("No valid mobile number for this contact.", "error");
        return;
      }
      if (!READY_TEMPLATE) {
        toast.show("The ready-for-collection template isn't configured yet.", "error");
        return;
      }
      setSendingId(recipient.id);
      try {
        const params = buildTemplateParams(READY_TEMPLATE, {
          dog_name: dogName,
          minutes: minutes.trim(),
        });
        const { data, error } = await supabase.functions.invoke("whatsapp-send", {
          body: {
            mode: "template",
            to: phoneE164,
            template_name: READY_TEMPLATE.name,
            language: READY_TEMPLATE.language,
            params,
            human_id: recipient.id,
          },
        });
        if (error) throw new Error(await parseSupabaseFunctionError(error, "WhatsApp send failed"));
        if (data?.error) throw new Error(data.detail || data.error);
        setSentIds((prev) => new Set(prev).add(recipient.id));
        toast.show(`Collection notice sent to ${displayName(recipient)}.`, "success");
      } catch (e) {
        toast.show(e instanceof Error ? e.message : String(e), "error");
      } finally {
        setSendingId(null);
      }
    },
    [sendingId, minutesValid, dogName, minutes, toast],
  );

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-start sm:items-center justify-center p-3 sm:p-6 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label="Send collection notice"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl flex flex-col max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-brand-paper">
          <h2 className="text-[15px] font-bold font-display text-brand-purple m-0">
            {dogName} {isPlural ? "are" : "is"} ready
          </h2>
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
          <p className="text-[13px] text-slate-600 m-0">
            Send a WhatsApp collection notice for <span className="font-semibold">{dogName}</span>?
            {isPlural && (
              <span className="block mt-1 text-[12px] text-slate-500">
                One message covers all of this owner's dogs that are ready.
              </span>
            )}
          </p>

          <label className="flex items-center gap-2 text-[13px] text-slate-700">
            <span className="font-semibold">Ready in</span>
            <input
              type="number"
              min="1"
              max="999"
              inputMode="numeric"
              value={minutes}
              onChange={(e) => setMinutes(e.target.value.replace(/[^\d]/g, ""))}
              aria-label="Minutes until ready for collection"
              className="w-16 h-9 rounded-lg border border-slate-300 px-2 text-center tabular-nums focus:outline-none focus:ring-2 focus:ring-brand-purple/40"
            />
            <span>mins</span>
          </label>

          {READY_TEMPLATE && (
            <div className="rounded-xl bg-slate-50 border border-slate-100 p-3 text-[12px] text-slate-600 italic">
              “{previewText}”
            </div>
          )}

          {loading ? (
            <div className="text-[12px] text-slate-500 py-4 text-center">Loading contacts…</div>
          ) : recipients.length === 0 ? (
            <div className="text-[12px] text-slate-500 py-2">
              This booking isn’t linked to a customer record, so there’s no contact to notify.
            </div>
          ) : (
            <ul className="flex flex-col gap-2 list-none p-0 m-0">
              {recipients.map((r) => {
                const avail = whatsappAvailability(r);
                const isSent = sentIds.has(r.id);
                const isSending = sendingId === r.id;
                const disabled = !avail.ok || isSent || isSending || !minutesValid || !!sendingId;
                return (
                  <li
                    key={r.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-white p-2.5"
                  >
                    <div className="min-w-0">
                      <div className="text-[13px] font-semibold text-brand-purple truncate">
                        {displayName(r)}
                        <span className="ml-1.5 text-[11px] font-medium text-slate-400">
                          {r.relationship}
                        </span>
                      </div>
                      <div className="text-[12px] text-slate-500 tabular-nums">
                        {avail.ok ? formatPhoneForDisplay(r.phone) : avail.reason}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSend(r)}
                      disabled={disabled}
                      title={avail.ok ? `Send WhatsApp to ${displayName(r)}` : avail.reason}
                      className={[
                        "shrink-0 inline-flex items-center h-8 px-4 rounded-full text-[13px] font-semibold font-[inherit] transition-colors",
                        isSent
                          ? "bg-emerald-100 text-emerald-700 cursor-default"
                          : disabled
                            ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                            : "bg-brand-purple text-white hover:bg-brand-purple/90 cursor-pointer",
                      ].join(" ")}
                    >
                      {isSent ? "Sent ✓" : isSending ? "Sending…" : "Send"}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="px-4 py-3 border-t border-slate-100 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center h-9 px-4 rounded-full text-[13px] font-semibold font-[inherit] bg-white text-slate-600 border border-slate-300 hover:bg-slate-50 cursor-pointer"
          >
            {sentIds.size > 0 ? "Done" : "No, close"}
          </button>
        </div>
      </div>
    </div>
  );
}
