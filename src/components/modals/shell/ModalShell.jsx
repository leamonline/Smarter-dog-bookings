import { AccessibleModal } from "../../shared/AccessibleModal.tsx";

// Shared visual shell for the three entity modals (human / dog /
// booking). AccessibleModal keeps owning behaviour (focus trap, Escape,
// scroll lock, backdrop click); this standardises the chrome:
//   • 4px accent bar — teal for humans, size colour for dogs, status
//     colour for bookings
//   • paper surface, rounded, centred floating box on ≥sm
//   • full-screen slide-up sheet below sm — header and footer render
//     outside the scrolling body so they stay pinned, and the footer
//     picks up iOS safe-area padding
export function ModalShell({
  onClose,
  titleId,
  accent,
  header,
  footer,
  children,
  widthClass = "w-[min(820px,95vw)]",
  maxHeightClass = "max-h-[min(90vh,760px)]",
  backdropClass = "bg-[rgba(45,0,75,0.45)] animate-overlay-fade",
  dismissOnEscape = true,
  zIndex,
  bodyClassName = "",
  // Extra classes for the modal container (the outer box). Lets a single
  // modal opt into a marker class (e.g. `.bm-fields` for the iOS zoom fix)
  // without changing the shared chrome for the other entity modals.
  rootClassName = "",
}) {
  return (
    <AccessibleModal
      onClose={onClose}
      titleId={titleId}
      dismissOnEscape={dismissOnEscape}
      zIndex={zIndex}
      backdropClass={backdropClass}
      className={`bg-[var(--color-brand-paper)] flex flex-col overflow-hidden animate-shell-in rounded-[20px] shadow-[0_18px_50px_-12px_rgba(45,0,75,0.28)] ${widthClass} ${maxHeightClass} max-sm:w-full max-sm:max-w-none max-sm:h-[100dvh] max-sm:max-h-none max-sm:rounded-none ${rootClassName}`}
    >
      {accent ? (
        <div aria-hidden="true" className="h-1 shrink-0" style={{ background: accent }} />
      ) : null}
      {header ? <div className="shrink-0">{header}</div> : null}
      <div className={`flex-1 min-h-0 overflow-y-auto overscroll-contain ${bodyClassName}`}>
        {children}
      </div>
      {footer ? (
        <div className="shrink-0 max-sm:pb-[env(safe-area-inset-bottom)]">{footer}</div>
      ) : null}
    </AccessibleModal>
  );
}
