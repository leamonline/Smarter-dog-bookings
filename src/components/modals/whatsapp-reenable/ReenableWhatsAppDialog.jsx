// "Switch WhatsApp back on?" — the one way staff undo a WhatsApp opt-out.
// Staff see everything the re-enable covers (the number's STOPs and every
// switched-off record on it) before the form, record how the customer gave
// permission again, and confirm. useWhatsappNumberReenable owns the state;
// this is the shell, the copy and the field. Shared by the customer profile
// and the inbox thread (context "profile" | "inbox").
import { useId } from "react";
import { X } from "lucide-react";
import { HeaderIconButton, ModalShell, PanelShell } from "../shell/index.js";
import { Button, InlineError } from "../../ui/index.js";
import { useToast } from "../../../contexts/ToastContext.jsx";
import { useWhatsappNumberReenable } from "../../../supabase/hooks/useWhatsappNumberReenable";
import { isPermissionNoteLongEnough, optOutTimeLabel } from "../../../engine/whatsappReenable";
import { formatPhoneForDisplay } from "../../../utils/phone.js";
import { ReenableScopeList } from "./ReenableScopeList.jsx";

const FORM_STATES = new Set(["ready", "submitting", "verifying", "done"]);

const BLOCKED_COPY = {
  not_staff: "Only signed-in staff can switch WhatsApp back on. Sign out and back in, then try again.",
  not_deployed:
    "Switching WhatsApp back on isn’t ready yet — the database update it needs hasn’t gone live. Let the owner know.",
};

function blockedCopy(errorKind, context) {
  if (errorKind === "invalid_phone") {
    return context === "inbox"
      ? "This chat’s number doesn’t look right, so it can’t be checked."
      : "This number doesn’t look right, so it can’t be checked. Fix the number on the customer’s record first.";
  }
  return BLOCKED_COPY[errorKind] ?? BLOCKED_COPY.not_deployed;
}

function againSuffix(scope) {
  return scope.lastStopAt && scope.lastStopAt !== scope.numberStoppedAt
    ? ` It said STOP again on ${optOutTimeLabel(scope.lastStopAt)}.`
    : "";
}

const NOTICE_COPY = {
  scope_changed: "Something changed on this number while you were looking, so nothing was switched on. Check the list again, then confirm.",
  busy: "Something else was changing this number at the same moment, so nothing was switched on. Here’s the latest — check it, then confirm.",
  unconfirmed: "We couldn’t confirm whether WhatsApp was switched back on. Check again before doing anything else.",
  not_applied: "Nothing was switched on — we couldn’t reach the database. Check your connection and try again.",
  note_required: "Add how they gave permission again — at least 10 characters.",
  unknown: "Couldn’t switch WhatsApp back on. Nothing was changed — give it another go?",
};

function Alert({ children, action, onAction }) {
  return (
    <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-[13px] leading-snug text-rose-800">
      {children}
      {action && <Button variant="ghost" size="sm" className="mt-2" onClick={onAction}>{action}</Button>}
    </div>
  );
}

function Notice({ notice, onReload }) {
  if (!notice) return null;
  const body =
    notice.kind === "new_stop"
      ? `This number said STOP again on ${optOutTimeLabel(notice.at)}, after you opened this. Nothing was switched on. Only switch it back on if they’ve given permission since then.`
      : NOTICE_COPY[notice.kind === "submit_error" ? notice.error : notice.kind];
  const { added = [], removed = [] } = notice.diff ?? {};
  return (
    <Alert action={notice.kind === "unconfirmed" ? "Check again" : null} onAction={onReload}>
      <p className="m-0">{body}</p>
      {added.length > 0 && <p className="m-0 mt-1">Now also switched off: {added.join(", ")}.</p>}
      {removed.length > 0 && <p className="m-0 mt-1">No longer switched off: {removed.join(", ")}.</p>}
    </Alert>
  );
}

export function ReenableWhatsAppDialog({
  phone,
  context,
  currentHumanId = null,
  currentHumanName = "",
  observedLastStopAt = null,
  linkedElsewhere = null,
  onOpenHuman,
  onReenabled,
  onClose,
}) {
  const toast = useToast();
  const titleId = useId();
  const noteId = useId();
  const helperId = useId();
  const errorId = useId();
  const hintId = useId();
  const shownPhone = formatPhoneForDisplay(phone) || phone;
  const reenable = useWhatsappNumberReenable({
    phone,
    context,
    currentHumanId,
    observedLastStopAt,
    onReenabled: (result, outcome) => {
      if (outcome === "done") toast.show(`WhatsApp is back on for ${shownPhone}.`, "success");
      onReenabled?.(result);
      if (outcome === "done") onClose();
    },
  });
  const { status, scope, note } = reenable;
  const busy = status === "submitting" || status === "verifying";
  const close = () => (busy ? undefined : onClose());
  const openProfile = onOpenHuman
    ? (id) => {
        onClose();
        onOpenHuman(id);
      }
    : undefined;
  const isForm = FORM_STATES.has(status) && scope;
  const noteShort = !isPermissionNoteLongEnough(note);
  const showNoteError = reenable.noteTouched && noteShort;
  const showHint = status === "ready" && noteShort;

  const message = {
    unavailable: "Switching WhatsApp back on needs the live database — you’re on sample data. Nothing has been changed.",
    load_error: "Couldn’t check this number — give it another go?",
    blocked: blockedCopy(reenable.errorKind, context),
    already_on:
      reenable.alreadyOnReason === "someone_else"
        ? "Someone has already switched WhatsApp back on for this number. There’s nothing left to do."
        : "WhatsApp is already on for this number — there’s nothing to switch back on.",
  }[status];

  return (
    <ModalShell
      onClose={close}
      dismissOnEscape={!busy}
      titleId={titleId}
      accent="var(--color-brand-teal)"
      widthClass="w-[min(560px,95vw)]"
      mobilePresentation="sheet"
      rootClassName="bm-fields"
      zIndex={1100}
      bodyClassName="px-5 pb-4 flex flex-col gap-3 text-[13px] leading-relaxed text-slate-700"
      header={
        <header className="flex items-start justify-between gap-3 px-5 pt-5 pb-4 bg-[var(--color-brand-paper)]">
          <div className="flex-1 min-w-0">
            <span className="text-label text-ink-muted">WhatsApp</span>
            <h2 id={titleId} className="text-xl md:text-2xl font-bold font-display text-brand-purple leading-tight mt-1">
              Switch WhatsApp back on?
            </h2>
            <p className="m-0 mt-1 text-[13px] font-semibold text-slate-500">{shownPhone}</p>
          </div>
          <HeaderIconButton label="Close" onClick={close}>
            <X size={16} strokeWidth={2.2} aria-hidden="true" />
          </HeaderIconButton>
        </header>
      }
      footer={
        <div className="flex max-sm:flex-col-reverse sm:justify-end gap-2 px-5 py-3 border-t border-slate-200/70 bg-[var(--color-brand-paper)]">
          {isForm ? (
            <>
              <Button variant="ghost" onClick={close} disabled={busy}>Keep it off</Button>
              <Button
                variant="primary"
                loading={status === "submitting"}
                disabled={!reenable.canSubmit}
                aria-describedby={showHint ? hintId : undefined}
                onClick={() => void reenable.submit()}
              >
                {status === "submitting" ? "Switching back on…" : "Switch WhatsApp back on"}
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={close}>Close</Button>
              {status === "load_error" && (
                <Button variant="primary" onClick={() => void reenable.reload()}>Try again</Button>
              )}
            </>
          )}
        </div>
      }
    >
      {status === "loading" && <p role="status" className="m-0">Checking everything on this number…</p>}
      {message && <p role={status === "load_error" ? "alert" : "status"} className="m-0">{message}</p>}
      {isForm && (
        <>
          {reenable.liveNewStop && (
            <Alert action="Reload" onAction={() => void reenable.reload()}>
              <p className="m-0">This number has just said STOP again. Reload to see the latest before switching it back on.</p>
            </Alert>
          )}
          <Notice notice={reenable.notice} onReload={() => void reenable.reload()} />
          {status === "verifying" && (
            <p role="status" className="m-0 font-semibold">We couldn’t reach the database. Checking whether it went through…</p>
          )}
          <p className="m-0 font-semibold text-brand-purple">
            {scope.numberStoppedAt
              ? `This number said STOP on ${optOutTimeLabel(scope.numberStoppedAt)}.${againSuffix(scope)}`
              : "This number hasn’t said STOP, but WhatsApp is switched off on the records below."}
          </p>
          <PanelShell eyebrow={`Switched off on this number (${scope.records.length})`} accent="amber">
            <ReenableScopeList scope={scope} currentHumanId={currentHumanId} onOpenProfile={openProfile} />
          </PanelShell>
          {linkedElsewhere && (
            <div className="m-0">
              <p className="m-0">
                {linkedElsewhere.name || "The linked customer"} is linked to this chat but saved with a different
                number, so this won’t switch them back on. Review it on their profile.
              </p>
              {openProfile && (
                <Button variant="ghost" size="sm" className="mt-1.5" onClick={() => openProfile(linkedElsewhere.id)}>
                  {linkedElsewhere.name ? `Open ${linkedElsewhere.name}’s profile` : "Open their profile"}
                </Button>
              )}
            </div>
          )}
          {reenable.staleProfile && (
            <p className="m-0">
              {currentHumanName || "This customer"} isn’t switched off on this number any more — their record may
              have changed. Refresh the page to see the latest before switching anything back on.
            </p>
          )}
          <p className="m-0">
            Switching it back on lets the salon, reminders and booking messages reach this number on WhatsApp again.
            Nothing is sent now. The assistant stays on drafts for staff to approve — auto-send isn’t switched back on.
          </p>
          {scope.numberStoppedAt && (
            <p className="m-0">
              A message from them since their STOP isn’t permission on its own. Only switch it back on if they’ve asked
              for WhatsApp messages again.
            </p>
          )}
          {context === "inbox" && (
            <p className="m-0">
              Anything waiting for approval in this chat stays waiting. If the automatic STOP reply is still there,
              reject it — it tells them messages have stopped.
            </p>
          )}
          <div>
            <label htmlFor={noteId} className="block text-[12px] font-bold text-slate-600 mb-1">
              How and when did they give permission again?
            </label>
            <textarea
              id={noteId}
              rows={3}
              maxLength={500}
              value={note}
              disabled={busy}
              onChange={(event) => reenable.setNote(event.target.value)}
              aria-invalid={showNoteError || undefined}
              aria-describedby={showNoteError ? `${helperId} ${errorId}` : helperId}
              className="w-full py-2 px-2.5 rounded-lg border border-slate-200 text-sm text-slate-800 bg-white outline-none resize-y focus:border-brand-teal"
            />
            <p id={helperId} className="m-0 mt-1 text-[12px] text-slate-500">
              For example: “Rang the salon on 14 Oct and asked for WhatsApp reminders again.” At least 10 characters.
              It’s kept in the audit log and other staff can see it, so leave out health or payment details.
            </p>
            <InlineError id={errorId} message={showNoteError ? "Add a little more — at least 10 characters." : ""} />
            {showHint && (
              <p id={hintId} className="m-0 mt-1.5 text-[12px] text-slate-400">
                Write how they gave permission again to switch WhatsApp back on.
              </p>
            )}
          </div>
        </>
      )}
    </ModalShell>
  );
}
