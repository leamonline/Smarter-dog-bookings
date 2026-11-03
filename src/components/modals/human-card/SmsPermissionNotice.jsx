// "Texts are paused": the customer card's notice for a customer who replied STOP
// on WhatsApp (docs/messaging-policy.md). A STOP is never overridden
// automatically, so automatic texts (reminders, confirmations, cancellations,
// collection notices) are paused until staff have checked which channels the
// customer allows. This is where staff record that texts are fine, or take that
// back. Every decision is written to an audit table by the database (who, when,
// why); there is no plain tickbox and no database edit.
//
// Sits beside WhatsAppStopNotice: WhatsApp stays off either way, because SMS and
// WhatsApp permission are separate decisions.
import { useEffect, useId, useState } from "react";
import { X } from "lucide-react";
import { HeaderIconButton } from "../shell/index.js";
import { Button, InlineError, ModalShell } from "../../ui";
import { useToast } from "../../../contexts/ToastContext.jsx";
import { useSmsPermission } from "../../../supabase/hooks/useSmsPermission";
import {
  SMS_REASON_MIN_LENGTH,
  checkReason,
  currentConfirmation,
  describeSmsPermissionRow,
  smsPermissionErrorMessage,
  smsPermissionState,
} from "../../../engine/smsPermission";
import { optOutTimeLabel } from "../../../engine/whatsappReenable";

const COPY = {
  confirm: {
    eyebrow: "Texts",
    title: "Confirm texts are fine?",
    label: "How did they tell you texts are fine?",
    example: "“Rang her on 3 Nov. She said WhatsApp stays off but texts about bookings are fine.”",
    action: "Confirm texts are fine",
    busy: "Saving…",
    done: "Texts confirmed. Automatic texts can go to this customer again.",
  },
  withdraw: {
    eyebrow: "Texts",
    title: "Pause texts again?",
    label: "Why are texts being paused again?",
    example: "“She said she doesn’t want any more messages on her phone.”",
    action: "Pause texts again",
    busy: "Saving…",
    done: "Texts paused again. Automatic texts won’t go to this customer.",
  },
};

function ReasonDialog({ kind, human, onClose, onSaved }) {
  const sms = useSmsPermission();
  const copy = COPY[kind];
  const ids = { title: useId(), field: useId(), helper: useId(), error: useId() };
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState("");
  const check = checkReason(reason, kind);
  const showReasonError = touched && !check.ok;

  async function submit() {
    setTouched(true);
    if (!check.ok || saving) return;
    setSaving(true);
    setServerError("");
    const result = kind === "confirm"
      ? await sms.confirm(human.id, check.reason)
      : await sms.withdraw(human.id, check.reason);
    setSaving(false);
    if (!result.ok) {
      setServerError(smsPermissionErrorMessage(result.error));
      return;
    }
    onSaved(kind);
  }

  return (
    <ModalShell
      onClose={onClose}
      dismissOnEscape={!saving}
      titleId={ids.title}
      accent="var(--color-brand-teal)"
      widthClass="w-[min(520px,95vw)]"
      mobilePresentation="sheet"
      rootClassName="bm-fields"
      zIndex={1100}
      bodyClassName="px-5 pb-4 flex flex-col gap-3 text-body leading-relaxed text-slate-700"
      header={
        <header className="flex items-start justify-between gap-3 px-5 pt-5 pb-4 bg-[var(--color-brand-paper)]">
          <div className="flex-1 min-w-0">
            <span className="text-label text-slate-600">{copy.eyebrow}</span>
            <h2 id={ids.title} className="text-xl md:text-2xl font-bold font-display text-brand-ink leading-tight mt-1">
              {copy.title}
            </h2>
          </div>
          <HeaderIconButton label="Close" onClick={onClose} disabled={saving}>
            <X size={16} strokeWidth={2.2} aria-hidden="true" />
          </HeaderIconButton>
        </header>
      }
      footer={
        <div className="border-t border-slate-100 bg-white px-5 py-3 flex justify-end gap-2">
          <Button variant="ghost" type="button" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="strong" type="button" onClick={submit} disabled={saving}>
            {saving ? copy.busy : copy.action}
          </Button>
        </div>
      }
    >
      {kind === "confirm" ? (
        <>
          <p className="m-0">
            They replied STOP on WhatsApp, so we can’t tell whether they meant texts too. Only confirm once you’ve
            checked with them.
          </p>
          <p className="m-0">
            WhatsApp stays off either way. This only lets automatic texts go to their mobile again.
          </p>
        </>
      ) : (
        <p className="m-0">
          Automatic texts to this customer will stop again until someone confirms they’re fine.
        </p>
      )}
      <div>
        <label htmlFor={ids.field} className="block text-xs font-bold text-slate-600 mb-1">
          {copy.label}
        </label>
        <textarea
          id={ids.field}
          rows={3}
          maxLength={500}
          value={reason}
          disabled={saving}
          onChange={(event) => setReason(event.target.value)}
          onBlur={() => setTouched(true)}
          aria-invalid={showReasonError || undefined}
          aria-describedby={showReasonError ? `${ids.helper} ${ids.error}` : ids.helper}
          className="w-full py-2 px-2.5 rounded-lg border border-slate-200 text-sm text-slate-800 bg-white outline-none resize-y focus:border-brand-teal"
        />
        <p id={ids.helper} className="m-0 mt-1 text-xs text-slate-600">
          For example: {copy.example} At least {SMS_REASON_MIN_LENGTH} characters. It’s kept in the audit log with your
          name and the time, and other staff can see it, so leave out health or payment details.
        </p>
        <InlineError id={ids.error} message={showReasonError ? check.error : ""} />
        <InlineError message={serverError} />
      </div>
    </ModalShell>
  );
}

function History({ rows }) {
  if (rows.length === 0) return null;
  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-xs font-semibold">History ({rows.length})</summary>
      <ul className="list-none p-0 m-0 mt-1.5 flex flex-col gap-1.5">
        {rows.map((row) => {
          const line = describeSmsPermissionRow(row);
          return (
            <li key={row.id} className="text-xs leading-snug">
              <span className="font-semibold">{line.label}</span> · {line.by} · {optOutTimeLabel(row.createdAt)}
              <span className="block italic">“{line.reason}”</span>
            </li>
          );
        })}
      </ul>
    </details>
  );
}

export function SmsPermissionNotice({ human, onChanged }) {
  const sms = useSmsPermission();
  const toast = useToast();
  const [dialog, setDialog] = useState(null);
  const [history, setHistory] = useState([]);
  const [reload, setReload] = useState(0);
  const state = smsPermissionState(human);
  const hasPhone = (human?.phone || "").trim() !== "";
  const watching = state === "paused" || state === "confirmed";

  useEffect(() => {
    if (!watching || !human?.id || !sms.connected) {
      setHistory([]);
      return undefined;
    }
    let cancelled = false;
    sms.history(human.id).then((result) => {
      if (!cancelled) setHistory(result.ok ? result.rows : []);
    });
    return () => {
      cancelled = true;
    };
  }, [watching, human?.id, sms, reload]);

  if (state === "not_applicable") return null;

  function saved(kind) {
    onChanged?.(human.id, kind === "confirm" ? "sms" : null);
    toast.show(COPY[kind].done, "success");
    setDialog(null);
    setReload((n) => n + 1);
  }

  const confirmation = currentConfirmation(history);
  const who = confirmation ? describeSmsPermissionRow(confirmation) : null;

  return (
    <>
      {state === "opted_out" && (
        <div role="status" className="mb-3 rounded-tile border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-body leading-snug text-slate-800">
          <p className="m-0 font-bold">Texts are off — they opted out.</p>
          <p className="m-0 mt-0.5">
            Nothing is sent to this customer by SMS, and that can’t be changed from here.
          </p>
        </div>
      )}
      {state === "paused" && (
        <div role="status" className="mb-3 rounded-tile border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-body leading-snug text-amber-950">
          <p className="m-0 font-bold">Texts are paused — they said STOP on WhatsApp.</p>
          <p className="m-0 mt-0.5">
            Reminders, confirmations, cancellations and collection notices won’t be texted to them until you’ve checked
            which channels they’re happy with. Ring them, then record what they said.
          </p>
          {hasPhone ? (
            <Button variant="ghost" size="sm" className="mt-2" onClick={() => setDialog("confirm")}>
              Confirm texts are fine…
            </Button>
          ) : (
            <p className="m-0 mt-1.5">There’s no mobile number on this record. Add one first.</p>
          )}
          <History rows={history} />
        </div>
      )}
      {state === "confirmed" && (
        <div role="status" className="mb-3 rounded-tile border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-body leading-snug text-emerald-950">
          <p className="m-0 font-bold">Texts are on — confirmed with them after their STOP.</p>
          <p className="m-0 mt-0.5">
            {who
              ? `${who.by} · ${optOutTimeLabel(confirmation.createdAt)} — “${who.reason}”`
              : "WhatsApp stays off. Automatic texts can go to this customer."}
          </p>
          <Button variant="ghost" size="sm" className="mt-2" onClick={() => setDialog("withdraw")}>
            Pause texts again…
          </Button>
          <History rows={history} />
        </div>
      )}
      {dialog && <ReasonDialog kind={dialog} human={human} onClose={() => setDialog(null)} onSaved={saved} />}
    </>
  );
}
