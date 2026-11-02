// ============================================================
// src/components/modals/collection-notice/CollectionNoticeModal.jsx
//
// Pops up when a booking transitions to "Ready for collection" (fired
// centrally from useBookings.updateBooking). Lets staff send a WhatsApp
// "ready for collection" template to the owner and/or any trusted
// contact, with a staff-entered ETA in minutes. Staff opt in before
// recipient data is loaded; each recipient then has its own Send button.
//
// Sending reuses the whatsapp-send edge function (Meta Cloud API
// template) — the same path the inbox compose-new flow uses — so the
// message goes out from the salon's WhatsApp Business number and is
// logged to the recipient's inbox thread. The ready_for_collection_v1
// template must be Approved in Meta before live sends succeed.
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { HeaderIconButton } from "../shell/index.js";
import { useStaffContacts } from "../../../supabase/hooks/useStaffContacts";
import { useStaffMessaging } from "../../../supabase/hooks/useStaffMessaging";
import { useToast } from "../../../contexts/ToastContext.jsx";
import { parseSupabaseFunctionError } from "../../../supabase/hooks/inbox/helpers";
import { normaliseUkMobile, formatPhoneForDisplay } from "../../../utils/phone.js";
import { WHATSAPP_TEMPLATES, buildTemplateParams } from "../../../constants/whatsappTemplates.js";
import { joinNames } from "../../../lib/reminders/templates.js";
import { titleCase } from "../../../utils/text";
import { collectionNoticeReadiness } from "../../../engine/collectionNotice";
import { Button, ModalShell } from "../../ui";

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
  const contacts = useStaffContacts();
  const messaging = useStaffMessaging();
  const [step, setStep] = useState("ask");
  const [recipients, setRecipients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [minutes, setMinutes] = useState("15");
  const [sendingId, setSendingId] = useState(null);
  const [sentIds, setSentIds] = useState(() => new Set());
  const [contactsUnavailable, setContactsUnavailable] = useState("");
  const [contactLoadError, setContactLoadError] = useState("");
  const [contactLoadAttempt, setContactLoadAttempt] = useState(0);

  const ownerId = booking?._ownerId ?? null;
  // One notice per owner, sent only once EVERY dog of theirs still in the
  // salon that day is ready (see engine/collectionNotice). If a sibling is
  // still being groomed the notice is held back: this modal closes itself
  // with a toast, and the last dog's Ready opens it again with all the names
  // ("Bella and Max"). Starts as just this booking's dog; the gate widens it.
  const [readyDogNames, setReadyDogNames] = useState(() =>
    [booking?.dogName].filter(Boolean),
  );
  const dogName = joinNames(readyDogNames.map((n) => titleCase(n))) || "Your dog";
  const isPlural = readyDogNames.length > 1;

  // "checking" renders nothing, so a held-back notice never flashes a modal.
  // Sample data, a booking with no owner, or a failed lookup skip the gate
  // ("send"): staff can still message, they just lose the sibling check.
  const needsGate = Boolean(contacts.connected && ownerId && booking?._bookingDate);
  const [gate, setGate] = useState(needsGate ? "checking" : "send");

  // The parent and the toast context hand us fresh function identities on
  // every render; read them through refs so they can't re-run the lookup.
  const onCloseRef = useRef(onClose);
  const toastRef = useRef(toast);
  useEffect(() => {
    onCloseRef.current = onClose;
    toastRef.current = toast;
  });

  // Escape, focus trap, scroll-lock and backdrop click are owned by
  // ModalShell/AccessibleModal — no hand-rolled key handler needed here.

  useEffect(() => {
    if (!needsGate) return undefined;
    let cancelled = false;
    setGate("checking");
    async function check() {
      let rows = null;
      try {
        const res = await contacts.listOwnerBookingsOnDate(booking._bookingDate, ownerId);
        if (!res.error) rows = res.data ?? [];
      } catch {
        rows = null;
      }
      if (cancelled) return;
      if (!rows) {
        setGate("send");
        return;
      }
      const { readyDogNames: ready, waitingDogNames: waiting } = collectionNoticeReadiness(
        rows,
        booking.id,
      );
      if (waiting.length > 0) {
        const justReady = joinNames((ready.length ? ready : [booking.dogName]).map(titleCase));
        const stillIn = joinNames(waiting.map(titleCase));
        toastRef.current.show(
          `${justReady} ready. Holding the message until ${stillIn} ${waiting.length > 1 ? "are" : "is"} ready too.`,
          "info",
        );
        setGate("hold");
        onCloseRef.current?.();
        return;
      }
      if (ready.length > 0) setReadyDogNames(ready);
      setGate("send");
    }
    check();
    return () => {
      cancelled = true;
    };
  }, [needsGate, contacts, ownerId, booking?.id, booking?.dogName, booking?._bookingDate]);

  useEffect(() => {
    if (step !== "compose") return undefined;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setContactsUnavailable("");
      setContactLoadError("");
      if (!contacts.connected) {
        setRecipients([]);
        setContactsUnavailable(
          "Collection messaging isn't available with sample data. Contact the customer directly.",
        );
        setLoading(false);
        return;
      }
      if (!ownerId) {
        setRecipients([]);
        setLoading(false);
        return;
      }
      try {
        const [ownerRes, linkRes] = await Promise.all([
          contacts.getContactCard(ownerId),
          contacts.listTrustedContactLinks(ownerId),
        ]);
        if (ownerRes.error || linkRes.error) {
          throw new Error("Contact query failed");
        }

        const links = linkRes.data ?? [];
        const trustedIds = links.map((r) => r.trusted_id).filter(Boolean);
        const relById = new Map(links.map((r) => [r.trusted_id, r.relationship]));

        let trusted = [];
        if (trustedIds.length) {
          const trustedRes = await contacts.listContactCards(trustedIds);
          if (trustedRes.error) throw new Error("Trusted contact query failed");
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
      } catch {
        if (cancelled) return;
        setRecipients([]);
        setContactLoadError(
          "We couldn’t load contact details. This booking is still marked Ready. Retry, or contact the customer directly.",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [step, ownerId, contactLoadAttempt, contacts]);

  const minutesValid = /^\d{1,3}$/.test(minutes.trim()) && Number(minutes.trim()) > 0;
  const previewText =
    READY_TEMPLATE?.preview({ dog_name: dogName, minutes: minutes.trim() || "__" }) ?? "";

  const handleSend = useCallback(
    async (recipient) => {
      if (sendingId) return;
      if (!minutesValid) {
        toast.show("Let us know how many minutes until collection", "error");
        return;
      }
      const phoneE164 = normaliseUkMobile(recipient.phone || "");
      if (!phoneE164) {
        toast.show("No valid mobile number for this contact.", "error");
        return;
      }
      if (!READY_TEMPLATE) {
        toast.show("The collection template isn't set up yet", "error");
        return;
      }
      setSendingId(recipient.id);
      try {
        const params = buildTemplateParams(READY_TEMPLATE, {
          dog_name: dogName,
          minutes: minutes.trim(),
        });
        const { data, error } = await messaging.sendWhatsAppTemplate({
          to: phoneE164,
          templateName: READY_TEMPLATE.name,
          language: READY_TEMPLATE.language,
          params,
          humanId: recipient.id,
        });
        if (error) throw new Error(await parseSupabaseFunctionError(error, "WhatsApp send failed"));
        if (data?.error) throw new Error(data.detail || data.error);
        setSentIds((prev) => new Set(prev).add(recipient.id));
        toast.show(`Collection notice sent to ${displayName(recipient)}.`, "success");
      } catch (err) {
        toast.show(err instanceof Error ? err.message : String(err), "error");
      } finally {
        setSendingId(null);
      }
    },
    [sendingId, minutesValid, dogName, minutes, toast, messaging],
  );

  const askBody = (
    <div className="flex flex-col gap-4">
      <p className="text-body text-slate-700">
        Would you like to message their humans to let them know they&apos;re nearly ready?
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Button
          className="min-h-11"
          variant="strong"
          fullWidth
          type="button"
          onClick={() => setStep("compose")}
        >
          Send message
        </Button>
        <Button
          className="min-h-11"
          variant="ghost"
          fullWidth
          type="button"
          onClick={() => onClose?.()}
        >
          Not now
        </Button>
      </div>
    </div>
  );

  if (gate !== "send") return null;

  return (
    <ModalShell
      onClose={() => onClose?.()}
      titleId="collection-notice-title"
      accent="#10B981"
      widthClass="w-[min(480px,95vw)]"
      maxHeightClass="max-h-[90vh]"
      bodyClassName="p-4 flex flex-col gap-3"
      rootClassName="bm-fields"
      zIndex={1100}
      header={
        <header className="flex items-start justify-between gap-3 px-5 pt-5 pb-4 bg-[var(--color-brand-paper)]">
          <div className="flex-1 min-w-0">
            <span className="text-label text-ink-muted">
              Ready for collection
            </span>
            <h2
              id="collection-notice-title"
              className="text-xl md:text-2xl font-bold font-display text-brand-ink leading-tight mt-1"
            >
              {dogName} {isPlural ? "are" : "is"} ready
            </h2>
          </div>
          <HeaderIconButton label="Close" onClick={() => onClose?.()}>
            <X size={16} strokeWidth={2.2} aria-hidden="true" />
          </HeaderIconButton>
        </header>
      }
      footer={step === "compose" ? (
        <div className="border-t border-slate-100 bg-white px-5 py-3 flex justify-end">
          <button
            type="button"
            onClick={() => onClose?.()}
            className="inline-flex items-center justify-center min-h-[44px] px-5 rounded-full text-sm font-bold font-[inherit] bg-white text-slate-600 border-[1.5px] border-slate-200 hover:bg-slate-50 cursor-pointer transition-colors"
          >
            {sentIds.size > 0 ? "Done" : contactLoadError ? "Not now" : contactsUnavailable ? "Close" : "No, close"}
          </button>
        </div>
      ) : null}
    >
      {step === "ask" ? askBody : (
        <>
          {/* Body */}
          <p className="text-body text-slate-600 m-0">
            Send a WhatsApp collection notice for <span className="font-semibold">{dogName}</span>?
            {isPlural && (
              <span className="block mt-1 text-xs text-slate-500">
                One message covers all of this owner's dogs that are ready.
              </span>
            )}
          </p>

          <label className="flex items-center gap-2 text-body text-slate-700">
            <span className="font-semibold">Ready in</span>
            <input
              type="number"
              min="1"
              max="999"
              inputMode="numeric"
              value={minutes}
              onChange={(e) => setMinutes(e.target.value.replace(/[^\d]/g, ""))}
              aria-label="Minutes until ready for collection"
              className="w-16 h-9 max-sm:h-11 rounded-lg border border-slate-300 px-2 text-center tabular-nums focus:outline-none focus:ring-2 focus:ring-brand-ink/40"
            />
            <span>mins</span>
          </label>

          {READY_TEMPLATE && (
            <div className="rounded-tile bg-slate-50 border border-slate-100 p-3 text-xs text-slate-600 italic">
              “{previewText}”
            </div>
          )}

          {contactLoadError ? (
            <div
              role="alert"
              className="rounded-tile border border-brand-coral/30 bg-brand-coral/[0.06] px-3 py-3 text-xs font-semibold text-brand-coral-dark"
            >
              <p>{contactLoadError}</p>
              <button
                type="button"
                onClick={() => setContactLoadAttempt((attempt) => attempt + 1)}
                className="mt-2 min-h-11 rounded-full border border-brand-coral/30 bg-white px-4 font-bold text-brand-coral-dark"
              >
                Retry
              </button>
            </div>
          ) : contactsUnavailable ? (
            <div className="rounded-tile border border-brand-mustard-tint bg-feedback-warning-tint px-3 py-3 text-xs font-semibold text-feedback-warning-ink">
              {contactsUnavailable}
            </div>
          ) : loading ? (
            <div className="text-xs text-slate-500 py-4 text-center" role="status">Loading contacts…</div>
          ) : recipients.length === 0 ? (
            <div className="text-xs text-slate-500 py-2">
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
                    className="flex items-center justify-between gap-3 rounded-tile border border-slate-100 bg-white p-2.5"
                  >
                    <div className="min-w-0">
                      <div className="text-body font-semibold text-brand-ink truncate">
                        {displayName(r)}
                        <span className="ml-1.5 text-caption font-medium text-slate-400">
                          {r.relationship}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 tabular-nums">
                        {avail.ok ? formatPhoneForDisplay(r.phone) : avail.reason}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSend(r)}
                      disabled={disabled}
                      title={avail.ok ? `Send WhatsApp to ${displayName(r)}` : avail.reason}
                      className={[
                        "shrink-0 inline-flex items-center justify-center h-9 max-sm:min-h-[44px] px-4 rounded-full text-body font-semibold font-[inherit] transition-colors",
                        isSent
                          ? "bg-emerald-100 text-emerald-700 cursor-default"
                          : disabled
                            ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                            : "bg-brand-ink text-white hover:bg-brand-ink/90 cursor-pointer",
                      ].join(" ")}
                    >
                      {isSent ? "Sent ✓" : isSending ? "Sending…" : "Send"}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </ModalShell>
  );
}
