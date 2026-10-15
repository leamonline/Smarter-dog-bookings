// The rose alerts inside "Switch WhatsApp back on?": what happened when staff
// confirmed or reloaded, and a new STOP seen on the live list. Each can take
// focus (tabIndex -1), so the dialog can move focus to the outcome when the
// control staff used is disabled or removed.
import { forwardRef } from "react";
import { Button } from "../../ui/index.js";
import { optOutTimeLabel } from "../../../engine/whatsappReenable";

const NOTICE_COPY = {
  scope_changed: "Something changed on this number while you were looking, so nothing was switched on. Check the list again, then confirm.",
  busy: "Something else was changing this number at the same moment, so nothing was switched on. Here’s the latest — check it, then confirm.",
  unconfirmed: "We couldn’t confirm whether WhatsApp was switched back on. Check again before doing anything else.",
  not_applied: "Nothing was switched on — we couldn’t reach the database. Check your connection and try again.",
  note_required: "Add how they gave permission again — at least 10 characters.",
  unknown: "Couldn’t switch WhatsApp back on. Nothing was changed — give it another go?",
};

export const ReenableAlert = forwardRef(function ReenableAlert({ children, action, onAction }, ref) {
  return (
    <div
      ref={ref}
      role="alert"
      tabIndex={-1}
      className="rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-[13px] leading-snug text-rose-800 focus:outline-none"
    >
      {children}
      {action && <Button variant="ghost" size="sm" className="mt-2" onClick={onAction}>{action}</Button>}
    </div>
  );
});

export const ReenableNotice = forwardRef(function ReenableNotice({ notice, onReload }, ref) {
  if (!notice) return null;
  const body =
    notice.kind === "new_stop"
      ? `This number said STOP again on ${optOutTimeLabel(notice.at)}, after you opened this. Nothing was switched on. Only switch it back on if they’ve given permission since then.`
      : NOTICE_COPY[notice.kind === "submit_error" ? notice.error : notice.kind];
  const { added = [], removed = [] } = notice.diff ?? {};
  return (
    <ReenableAlert ref={ref} action={notice.kind === "unconfirmed" ? "Check again" : null} onAction={onReload}>
      <p className="m-0">{body}</p>
      {added.length > 0 && <p className="m-0 mt-1">Now also switched off: {added.join(", ")}.</p>}
      {removed.length > 0 && <p className="m-0 mt-1">No longer switched off: {removed.join(", ")}.</p>}
    </ReenableAlert>
  );
});
