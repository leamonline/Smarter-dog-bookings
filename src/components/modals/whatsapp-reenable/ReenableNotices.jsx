// The rose alerts inside "Switch WhatsApp back on?": what happened when staff
// confirmed or reloaded, and a new STOP seen on the live list. Each can take
// focus (tabIndex -1), so the dialog can move focus to the outcome when the
// control staff used is disabled or removed. A notice can also carry the
// records that left the number without being proven back on (`moved`, from
// ReenableMovedRecords), with or without a notice of its own.
import { forwardRef } from "react";
import { Button } from "../../ui/index.js";
import { optOutTimeLabel } from "../../../engine/whatsappReenable";

// What to do next, for the notices that end in "then confirm". Left off while
// confirm is held (`held`): the line that holds it says what to do instead.
const NEXT_STEP = {
  scope_changed: " Check the list again, then confirm.",
  busy: " Here’s the latest — check it, then confirm.",
};

const NOTICE_COPY = {
  scope_changed: "Something changed on this number while you were looking, so nothing was switched on.",
  busy: "Something else was changing this number at the same moment, so nothing was switched on.",
  unconfirmed: "We couldn’t confirm whether WhatsApp was switched back on. Check again before doing anything else.",
  changed_since: "Your change went through, but this number has changed since. Here’s the latest — check it before switching anything else back on.",
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

function noticeBody(notice, held) {
  if (Object.hasOwn(NEXT_STEP, notice.kind)) return NOTICE_COPY[notice.kind] + (held ? "" : NEXT_STEP[notice.kind]);
  if (notice.kind === "new_stop") {
    return `This number said STOP again on ${optOutTimeLabel(notice.at)}, after you opened this. Nothing was switched on. Only switch it back on if they’ve given permission since then.`;
  }
  if (notice.kind === "stopped_again") {
    return `Your change went through, but this number said STOP again on ${optOutTimeLabel(notice.at)}. WhatsApp is off again.`;
  }
  return NOTICE_COPY[notice.kind === "submit_error" ? notice.error : notice.kind];
}

export const ReenableNotice = forwardRef(function ReenableNotice(
  { notice, moved = null, held = false, onReload },
  ref,
) {
  if (!notice && !moved) return null;
  const { added = [], removed = [] } = notice?.diff ?? {};
  return (
    <ReenableAlert ref={ref} action={notice?.kind === "unconfirmed" ? "Check again" : null} onAction={onReload}>
      {notice && <p className="m-0">{noticeBody(notice, held)}</p>}
      {added.length > 0 && <p className="m-0 mt-1">Now also switched off: {added.join(", ")}.</p>}
      {removed.length > 0 && <p className="m-0 mt-1">No longer switched off: {removed.join(", ")}.</p>}
      {moved && <div className={notice ? "mt-1" : undefined}>{moved}</div>}
    </ReenableAlert>
  );
});
