// ============================================================
// src/components/modals/collection-notice/CollectionNoticeModal.jsx
//
// Pops up when a booking transitions to "Ready for collection" (fired
// centrally from useBookings.updateBooking). Lets staff send a
// "ready for collection" notice to the owner and/or any trusted
// contact, with a staff-entered ETA in minutes. Staff opt in before
// recipient data is loaded; each recipient then has its own Send button.
//
// WhatsApp is the default: the whatsapp-send edge function (Meta Cloud API
// template, the same path the inbox compose-new flow uses) sends from the
// salon's WhatsApp Business number and logs to the recipient's inbox thread.
// The ready_for_collection_v2 template must be Approved in Meta before live
// sends succeed.
//
// When WhatsApp can't reach someone (their number looks like it isn't on
// WhatsApp, or they replied STOP to it) the same button sends the same words
// as an SMS through sms-send instead. Which channel, and who may not be
// messaged at all, is decided in engine/collectionNotice.ts.
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { HeaderIconButton } from "../shell/index.js";
import { useStaffContacts } from "../../../supabase/hooks/useStaffContacts";
import { useStaffMessaging } from "../../../supabase/hooks/useStaffMessaging";
import { useUnreachableHumans } from "../../../supabase/hooks/useDeliveryFailures";
import { useToast } from "../../../contexts/ToastContext.jsx";
import { parseSupabaseFunctionError } from "../../../supabase/hooks/inbox/helpers";
import { normaliseUkMobile, formatPhoneForDisplay } from "../../../utils/phone.js";
import { WHATSAPP_TEMPLATES, buildTemplateParams } from "../../../constants/whatsappTemplates.js";
import { joinNames, renderSmsCollectionNotice } from "../../../lib/reminders/templates.js";
import { titleCase } from "../../../utils/text";
import { collectionNoticeReadiness, collectionNoticeRoute } from "../../../engine/collectionNotice";
import { Button, ModalShell } from "../../ui";

const READY_TEMPLATE = WHATSAPP_TEMPLATES.find((t) => t.name === "ready_for_collection_v2");
// Audit name written into the inbox thread beside the SMS ("[template:…] text").
const SMS_TEMPLATE_NAME = "ready_for_collection_sms";

function displayName(h) {
  return `${h?.name ?? ""} ${h?.surname ?? ""}`.trim() || "this contact";
}

// What the row says under the name: the number when WhatsApp will do, and
// when it won't, why this one goes by SMS (or can't be messaged at all).
function routeNote(route, phone) {
  if (route.channel === null) return route.reason;
  const number = formatPhoneForDisplay(phone);
  if (route.channel === "whatsapp") return number;
  return route.because === "whatsapp_opted_out"
    ? `${number} · Opted out of WhatsApp, will send as SMS`
    : `${number} · Not on WhatsApp, will send as SMS`;
}

export function CollectionNoticeModal({ booking, onClose }) {
  const toast = useToast();
  const contacts = useStaffContacts();
  const messaging = useStaffMessaging();
  // Customers whose recent WhatsApp sends all bounced: the same signal the
  // Today card uses for "Not on WhatsApp". Empty until it has loaded, in which
  // case everyone simply goes by WhatsApp as before.
  const unreachableHumans = useUnreachableHumans();
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
    // Depends on the booking OBJECT, not just its id. Every open request
    // arrives as a fresh object, so a notice reopened for the same booking
    // (its holder was cancelled, say) re-runs the check and cancels the one
    // still in flight, whose late "still waiting" result must not close the
    // modal that was just reopened.
  }, [needsGate, contacts, ownerId, booking]);

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

  // One channel decision per recipient, shared by the row, the button and the
  // SMS preview so they can't disagree.
  const routes = new Map(
    recipients.map((r) => [
      r.id,
      collectionNoticeRoute(r, { whatsappUnreachable: unreachableHumans.has(r.id) }),
    ]),
  );
  const anySms = [...routes.values()].some((route) => route.channel === "sms");

  const minutesValid = /^\d{1,3}$/.test(minutes.trim()) && Number(minutes.trim()) > 0;
  const previewText =
    READY_TEMPLATE?.preview({ dog_name: dogName, minutes: minutes.trim() || "__" }) ?? "";

  // The SMS wording is plain text, so it is built from the names, not from the
  // WhatsApp preview (which carries emoji).
  const smsText = renderSmsCollectionNotice({
    dogNames: readyDogNames.map((n) => titleCase(n)),
    minutes: minutes.trim() || "__",
  });

  const handleSend = useCallback(
    async (recipient) => {
      if (sendingId) return;
      if (!minutesValid) {
        toast.show("Let us know how many minutes until collection", "error");
        return;
      }
      // Decided here, at send time, from the same rule that drew the button,
      // so a stale click can never reach an opted-out number.
      const route = collectionNoticeRoute(recipient, {
        whatsappUnreachable: unreachableHumans.has(recipient.id),
      });
      if (!route.channel) {
        toast.show(route.reason, "error");
        return;
      }
      const phoneE164 = normaliseUkMobile(recipient.phone || "");
      if (!phoneE164) {
        toast.show("No valid mobile number for this contact.", "error");
        return;
      }
      const viaSms = route.channel === "sms";
      if (!viaSms && !READY_TEMPLATE) {
        toast.show("The collection template isn't set up yet", "error");
        return;
      }
      setSendingId(recipient.id);
      try {
        let result;
        if (viaSms) {
          result = await messaging.sendSmsTemplate({
            to: phoneE164,
            text: smsText,
            templateName: SMS_TEMPLATE_NAME,
            humanId: recipient.id,
          });
        } else {
          const params = buildTemplateParams(READY_TEMPLATE, {
            dog_name: dogName,
            minutes: minutes.trim(),
          });
          result = await messaging.sendWhatsAppTemplate({
            to: phoneE164,
            templateName: READY_TEMPLATE.name,
            language: READY_TEMPLATE.language,
            params,
            humanId: recipient.id,
          });
        }
        const { data, error } = result;
        if (error) {
          throw new Error(
            await parseSupabaseFunctionError(error, viaSms ? "SMS send failed" : "WhatsApp send failed"),
          );
        }
        if (data?.error) throw new Error(data.detail || data.error);
        setSentIds((prev) => new Set(prev).add(recipient.id));
        toast.show(
          `Collection notice sent to ${displayName(recipient)}${viaSms ? " by SMS" : ""}.`,
          "success",
        );
      } catch (err) {
        toast.show(err instanceof Error ? err.message : String(err), "error");
      } finally {
        setSendingId(null);
      }
    },
    [sendingId, minutesValid, dogName, minutes, smsText, unreachableHumans, toast, messaging],
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
            Send a collection notice for <span className="font-semibold">{dogName}</span>?
            <span className="block mt-1 text-xs text-slate-500">
              By WhatsApp, or by SMS where they aren&apos;t on WhatsApp.
            </span>
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
            <>
            {anySms && (
              <div className="rounded-tile bg-sky-50 border border-sky-100 p-3 text-xs text-sky-900">
                <span className="font-semibold not-italic">SMS version, for those not on WhatsApp</span>
                <span className="block mt-1 italic">“{smsText}”</span>
              </div>
            )}
            <ul className="flex flex-col gap-2 list-none p-0 m-0">
              {recipients.map((r) => {
                const route = routes.get(r.id);
                const sendable = route.channel !== null;
                const viaSms = route.channel === "sms";
                const isSent = sentIds.has(r.id);
                const isSending = sendingId === r.id;
                const disabled = !sendable || isSent || isSending || !minutesValid || !!sendingId;
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
                        {routeNote(route, r.phone)}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSend(r)}
                      disabled={disabled}
                      title={sendable ? `Send ${viaSms ? "SMS" : "WhatsApp"} to ${displayName(r)}` : route.reason}
                      className={[
                        "shrink-0 inline-flex items-center justify-center h-9 max-sm:min-h-[44px] px-4 rounded-full text-body font-semibold font-[inherit] transition-colors",
                        isSent
                          ? "bg-emerald-100 text-emerald-700 cursor-default"
                          : disabled
                            ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                            : "bg-brand-ink text-white hover:bg-brand-ink/90 cursor-pointer",
                      ].join(" ")}
                    >
                      {isSent ? "Sent ✓" : isSending ? "Sending…" : viaSms ? "Send SMS" : "Send"}
                    </button>
                  </li>
                );
              })}
            </ul>
            </>
          )}
        </>
      )}
    </ModalShell>
  );
}
