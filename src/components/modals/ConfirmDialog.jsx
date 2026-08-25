// A small in-product confirmation built on ModalShell — replaces the native
// window.confirm() the modal standard forbids, so a clinical "skip a care
// step?" question speaks in the product's voice, traps focus, and keeps its
// destructive/primary option visually ranked.
import { useId } from "react";
import { ModalShell } from "./shell/ModalShell.jsx";

export function ConfirmDialog({
  title,
  body,
  confirmLabel = "Continue",
  cancelLabel = "Cancel",
  tone = "neutral",
  onConfirm,
  onClose,
  zIndex,
}) {
  const titleId = useId();
  const confirmClass = tone === "danger"
    ? "min-h-11 rounded-control bg-brand-coral px-4 text-[13px] font-bold text-white hover:bg-brand-coral-dark"
    : "min-h-11 rounded-control bg-brand-yellow px-4 text-[13px] font-bold text-brand-purple hover:bg-brand-yellow-dark";

  return (
    <ModalShell
      onClose={onClose}
      titleId={titleId}
      accent={tone === "danger" ? "var(--color-brand-coral)" : "var(--color-brand-yellow)"}
      widthClass="w-[min(440px,94vw)]"
      maxHeightClass="max-h-[min(90vh,360px)]"
      mobilePresentation="sheet"
      zIndex={zIndex}
      header={(
        <div className="border-b border-brand-paper-line px-5 py-4">
          <h2 id={titleId} className="font-display text-[20px] font-bold leading-tight text-brand-purple">
            {title}
          </h2>
        </div>
      )}
      footer={(
        <div className="flex flex-col-reverse gap-2 border-t border-brand-paper-line bg-white px-5 py-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-control px-4 text-[13px] font-bold text-slate-600 hover:bg-slate-100"
          >
            {cancelLabel}
          </button>
          <button type="button" onClick={onConfirm} className={confirmClass}>
            {confirmLabel}
          </button>
        </div>
      )}
    >
      {body ? (
        <p className="px-5 py-4 text-[14px] leading-6 text-slate-700">{body}</p>
      ) : null}
    </ModalShell>
  );
}
