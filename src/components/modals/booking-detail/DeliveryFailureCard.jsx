import { useState } from "react";
import { AlertTriangle, Send } from "lucide-react";
import { supabase } from "../../../supabase/client.js";
import { useToast } from "../../../contexts/ToastContext.jsx";
import { normaliseUkMobile, formatPhoneForDisplay } from "../../../utils/phone.js";
import { triggerLabel } from "../../../supabase/hooks/useDeliveryFailures.js";

function relativeTime(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("en-GB", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

// Shown in the booking detail when a customer notification for this booking
// failed to deliver and hasn't since been resent successfully. Lets staff fix
// the number (reusing the staff updateHuman path, which bypasses the
// phone-edit guard) and resend.
export function DeliveryFailureCard({ booking, failures, primaryHuman, onUpdateHuman }) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [phoneDraft, setPhoneDraft] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [savingPhone, setSavingPhone] = useState(false);
  const [resending, setResending] = useState(false);

  if (!failures || failures.length === 0) return null;

  // Distinct trigger types that are currently failed (one resend per type).
  const triggers = [...new Set(failures.map((f) => f.trigger_type))];
  const currentPhone = primaryHuman?.phone || "";

  const startEdit = () => {
    setPhoneDraft(formatPhoneForDisplay(currentPhone));
    setPhoneError("");
    setEditing(true);
  };

  const handleSavePhone = async () => {
    const normalised = normaliseUkMobile(phoneDraft);
    if (!normalised) {
      setPhoneError("Enter a valid UK mobile (e.g. 07700 900 123).");
      return;
    }
    if (!primaryHuman || !onUpdateHuman) {
      setPhoneError("Can't update this customer's number here.");
      return;
    }
    setSavingPhone(true);
    try {
      const ownerKey = primaryHuman.fullName || primaryHuman.id;
      const saved = await onUpdateHuman(ownerKey, { phone: normalised });
      if (!saved) {
        toast.show("Couldn't save that number — give it another go", "error");
        return;
      }
      toast.show("Number updated — you can resend now", "success");
      setEditing(false);
    } finally {
      setSavingPhone(false);
    }
  };

  const handleResend = async () => {
    if (resending) return;
    setResending(true);
    let anyError = false;
    try {
      for (const trigger of triggers) {
        // One staff-callable function dispatches to the right notify function
        // server-side (its unchanged trigger path), so this card never needs
        // the webhook secret.
        const { error: invokeErr } = await supabase.functions.invoke(
          "resend-booking-notification",
          { body: { booking_id: booking.id, trigger_type: trigger } },
        );
        if (invokeErr) {
          anyError = true;
          let detail = invokeErr.message ?? "Resend failed";
          try {
            const body = await invokeErr.context?.json?.();
            if (body?.error) detail = body.error;
          } catch {
            /* non-JSON */
          }
          toast.show(`${triggerLabel(trigger)} resend failed: ${detail}`, "error");
        }
      }
      if (!anyError) {
        toast.show(
          "Resent. It'll clear here once it's confirmed delivered.",
          "success",
        );
      }
    } catch (err) {
      toast.show(err instanceof Error ? err.message : String(err), "error");
    } finally {
      setResending(false);
    }
  };

  return (
    <div
      role="alert"
      className="mb-3 rounded-xl border border-red-200 bg-red-50 p-3"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle size={16} className="text-red-600 shrink-0 mt-0.5" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-bold text-red-800">
            {triggers.length === 1
              ? `${triggerLabel(triggers[0])} didn't reach the customer`
              : "Some messages didn't reach the customer"}
          </div>
          <ul className="mt-1 space-y-0.5">
            {failures.map((f, i) => (
              <li key={`${f.trigger_type}-${i}`} className="text-[11px] text-red-700">
                <span className="font-semibold">{triggerLabel(f.trigger_type)}</span>
                {f.channel ? ` via ${f.channel}` : ""}
                {f.created_at ? ` · ${relativeTime(f.created_at)}` : ""}
                {f.error_message ? (
                  <span className="block text-red-500/90">{f.error_message}</span>
                ) : null}
              </li>
            ))}
          </ul>

          {/* Current number + inline fix */}
          <div className="mt-2 text-[12px] text-slate-700">
            <span className="font-semibold">Number on file:</span>{" "}
            {currentPhone ? formatPhoneForDisplay(currentPhone) : "none"}
          </div>

          {editing ? (
            <div className="mt-1.5">
              <div className="flex gap-2">
                <input
                  type="tel"
                  value={phoneDraft}
                  onChange={(e) => {
                    setPhoneDraft(e.target.value);
                    setPhoneError("");
                  }}
                  placeholder="07700 900 123"
                  aria-label="Correct mobile number"
                  aria-invalid={phoneError ? "true" : "false"}
                  aria-describedby={phoneError ? "delivery-phone-error" : undefined}
                  autoFocus
                  className={`flex-1 min-w-0 px-3 py-2 rounded-lg border text-[13px] outline-none font-inherit text-slate-800 box-border ${
                    phoneError
                      ? "border-red-400 bg-red-50 focus:border-red-500"
                      : "border-slate-300 focus:border-brand-teal"
                  }`}
                />
                <button
                  type="button"
                  onClick={handleSavePhone}
                  disabled={savingPhone}
                  className="shrink-0 px-3 py-2 rounded-lg border-none bg-brand-teal text-white text-[12px] font-bold cursor-pointer font-inherit disabled:opacity-60"
                >
                  {savingPhone ? "Saving…" : "Save number"}
                </button>
              </div>
              {phoneError && (
                <p id="delivery-phone-error" role="alert" className="mt-1 text-[11px] text-red-600 font-semibold">
                  {phoneError}
                </p>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={startEdit}
              className="mt-1 text-[12px] font-bold text-brand-teal underline cursor-pointer bg-transparent border-none p-0 font-inherit"
            >
              Fix the number
            </button>
          )}

          {/* Resend */}
          <div className="mt-2.5">
            <button
              type="button"
              onClick={handleResend}
              disabled={resending}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full border-[1.5px] border-red-300 bg-white text-red-700 text-[12px] font-bold cursor-pointer font-inherit hover:bg-red-100 transition-colors disabled:opacity-60"
            >
              <Send size={13} className={resending ? "animate-pulse" : ""} aria-hidden="true" />
              {resending
                ? "Resending…"
                : triggers.length === 1
                  ? "Resend message"
                  : "Resend all"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
