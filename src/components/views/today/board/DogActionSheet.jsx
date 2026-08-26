// The phone-sized action panel: a bottom sheet, not a radial menu.
//
// The mental model is identical to the desktop popover — tap a dog, get that
// dog's actions — so only the physical presentation changes. Everything here
// is sized for a thumb: full-width rows at 44px+, no horizontal scroll at
// 320px, long dog and owner names truncate rather than push the layout wide.
//
// Focus trap, Escape and scroll lock come from ModalShell/AccessibleModal, so
// this sheet behaves like every other sheet in the app.
import { X } from "lucide-react";
import { ModalShell, HeaderIconButton } from "../../../modals/shell/index.js";
import { DogActionList } from "./DogActionList.jsx";

export function DogActionSheet({
  token,
  dogName,
  ownerName,
  serviceLabel,
  paymentLabel,
  confirmationLabel = null,
  onTheWayLabel = null,
  welfareFacts = [],
  actions,
  busy = false,
  onSelect,
  onClose,
}) {
  const titleId = `dog-sheet-${token.booking.id}`;

  return (
    <ModalShell
      onClose={onClose}
      titleId={titleId}
      mobilePresentation="sheet"
      widthClass="w-[min(420px,95vw)]"
      maxHeightClass="max-h-[min(80vh,640px)]"
      header={
        <div className="flex items-start gap-3 px-4 pb-3 pt-4">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="truncate font-display text-[19px] font-bold leading-tight text-brand-purple">
              {dogName}
            </h2>
            <p className="mt-0.5 text-[13px] font-semibold leading-snug text-slate-600">{token.statusText}</p>
            <p className="mt-0.5 truncate text-[13px] leading-snug text-slate-500">
              {[serviceLabel, ownerName].filter(Boolean).join(" · ")}
            </p>
            {paymentLabel ? (
              <p className="mt-0.5 text-[13px] font-semibold leading-snug text-slate-700 tabular-nums">{paymentLabel}</p>
            ) : null}
            {confirmationLabel ? (
              <p className="mt-0.5 text-[13px] font-semibold leading-snug text-emerald-700">{confirmationLabel}</p>
            ) : null}
            {onTheWayLabel ? (
              <p className="mt-0.5 text-[13px] font-semibold leading-snug text-brand-teal-text">{onTheWayLabel}</p>
            ) : null}
          </div>
          <HeaderIconButton label={`Close ${dogName}'s actions`} onClick={onClose}>
            <X size={18} aria-hidden="true" />
          </HeaderIconButton>
        </div>
      }
    >
      <div className="px-4 pb-5">
        {welfareFacts.length > 0 ? (
          <p className="mb-3 rounded-lg bg-brand-coral-light px-3 py-2 text-[12px] font-semibold leading-snug text-brand-coral-text">
            {welfareFacts.join(" · ")}
          </p>
        ) : null}
        <div className="flex flex-col gap-2">
          <DogActionList
            actions={actions}
            onSelect={onSelect}
            dogName={dogName}
            busy={busy}
            itemRole="button"
          />
        </div>
      </div>
    </ModalShell>
  );
}
