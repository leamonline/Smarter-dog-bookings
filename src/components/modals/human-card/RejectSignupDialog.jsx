// "Reject this signup?" confirm for the Join the Pack approval flow.
// Owns the optional-reason textarea; the trimmed reason (or null) goes to
// onConfirm. Mounted fresh each time it opens, so the reason never leaks
// between rejections. While `busy`, dismissal is blocked so the in-flight
// reject can't be orphaned.
import { useState } from "react";
import { AccessibleModal } from "../../shared/AccessibleModal.tsx";

export function RejectSignupDialog({ busy, onCancel, onConfirm }) {
  const [reason, setReason] = useState("");

  return (
    <AccessibleModal
      onClose={() => (busy ? undefined : onCancel())}
      titleId="reject-signup-title"
      className="bg-white rounded-2xl shadow-xl mx-4 p-5 max-w-sm w-full animate-[toastIn_0.15s_ease-out]"
      zIndex={1100}
    >
      <h2
        id="reject-signup-title"
        className="text-base font-bold text-slate-800 m-0 mb-1"
      >
        Reject this signup?
      </h2>
      <p className="text-sm text-slate-600 m-0 mb-3 leading-relaxed">
        They'll be archived and won't be able to book. Add an optional note
        for your records (kept on their history flag).
      </p>
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason (optional)"
        aria-label="Rejection reason (optional)"
        rows={2}
        className="w-full text-sm bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 mb-4 outline-none font-inherit text-slate-700 resize-none focus:border-brand-teal"
      />
      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="btn btn-ghost"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => onConfirm(reason.trim() || null)}
          disabled={busy}
          className="btn btn-danger"
        >
          {busy ? "Rejecting…" : "Reject signup"}
        </button>
      </div>
    </AccessibleModal>
  );
}
