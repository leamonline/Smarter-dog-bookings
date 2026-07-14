// src/components/shared/AccessibleModal.tsx
import { useRef, useEffect, type ReactNode } from "react";
import {
  FocusScope,
  mergeProps,
  OverlayContainer,
  useDialog,
  useModal,
} from "react-aria";

interface AccessibleModalProps {
  children: ReactNode;
  onClose: () => void;
  titleId?: string;
  /** Tailwind classes for the modal container (white box) */
  className?: string;
  /** Tailwind classes for the backdrop overlay */
  backdropClass?: string;
  /** z-index for the overlay — default 1000 */
  zIndex?: number;
  /** Set false to disable Escape-to-close (e.g. ExitConfirmDialog) */
  dismissOnEscape?: boolean;
  /**
   * Tailwind classes that position the dialog within the full-screen
   * overlay. Defaults to centring the box; a side drawer overrides this
   * (e.g. `flex justify-end`) to anchor the panel to one edge. Additive —
   * existing centred modals keep the default and are unaffected.
   */
  overlayClassName?: string;
  /**
   * Default true — a classic modal (backdrop, focus trap, scroll lock,
   * aria-modal, backdrop-click close). Set false for a non-modal panel
   * (the live booking drawer): the page behind stays scrollable and
   * clickable, focus moves freely, Escape and the close button dismiss.
   */
  modal?: boolean;
}

interface ModalDialogProps {
  children: ReactNode;
  titleId?: string;
  className: string;
  modal: boolean;
}

// Reference-counted body scroll lock. Counting (rather than save/restore
// per modal) means stacked or rapidly-opened modals can't leave the body
// stuck at overflow:hidden — the lock only lifts when the LAST modal
// closes. This prevents the "page won't scroll" leak.
let scrollLockCount = 0;
let savedBodyOverflow = "";
function lockBodyScroll() {
  if (typeof document === "undefined") return;
  if (scrollLockCount === 0) {
    savedBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  scrollLockCount += 1;
}
function unlockBodyScroll() {
  if (typeof document === "undefined") return;
  scrollLockCount = Math.max(0, scrollLockCount - 1);
  if (scrollLockCount === 0) {
    document.body.style.overflow = savedBodyOverflow;
  }
}

// Mounted-dialog stack (module-level, mirrors the scroll-lock refcount).
// Escape must only dismiss the TOPMOST dialog: every instance registers on
// mount, and the keydown handler bails unless it is last in the stack —
// otherwise stacked dialogs (e.g. a ConfirmDialog over the non-modal
// booking drawer) would all close on one Escape, discarding drafts.
const dialogStack: symbol[] = [];

function ModalDialog({
  children,
  titleId,
  className,
  modal,
}: ModalDialogProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { dialogProps } = useDialog(
    { role: "dialog", "aria-labelledby": titleId },
    ref,
  );
  const { modalProps } = useModal({ isDisabled: !modal });
  const mergedDialogProps = mergeProps(dialogProps, modalProps);

  return (
    <div
      {...mergedDialogProps}
      ref={ref}
      aria-modal={modal ? "true" : undefined}
      className={`${modal ? "" : "pointer-events-auto"} ${className}`}
      onClick={(event) => event.stopPropagation()}
    >
      {children}
    </div>
  );
}

export function AccessibleModal({
  children,
  onClose,
  titleId,
  className = "",
  backdropClass = "bg-black/35",
  zIndex = 1000,
  dismissOnEscape = true,
  overlayClassName = "flex items-center justify-center",
  modal = true,
}: AccessibleModalProps) {
  const stackIdRef = useRef<symbol | undefined>(undefined);
  if (!stackIdRef.current) stackIdRef.current = Symbol("dialog");

  // Register in the dialog stack for the lifetime of the mount.
  useEffect(() => {
    const id = stackIdRef.current as symbol;
    dialogStack.push(id);
    return () => {
      const i = dialogStack.indexOf(id);
      if (i !== -1) dialogStack.splice(i, 1);
    };
  }, []);

  // Escape key
  useEffect(() => {
    if (!dismissOnEscape) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Only the topmost mounted dialog responds — see dialogStack above.
      if (dialogStack[dialogStack.length - 1] !== stackIdRef.current) return;
      e.stopPropagation();
      onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose, dismissOnEscape]);

  // Scroll lock (reference-counted — see above). Non-modal panels leave the
  // page scrollable — that's the point of them.
  useEffect(() => {
    if (!modal) return;
    lockBodyScroll();
    return () => unlockBodyScroll();
  }, [modal]);

  if (typeof document === "undefined") return null;

  // OverlayContainer portals to <body> so the fixed-position overlay is
  // always relative to the viewport. It also participates in React Aria's
  // modal isolation, hiding background content from assistive technology.
  return (
    <OverlayContainer>
      <div
        className={`fixed inset-0 ${modal ? backdropClass : "pointer-events-none"} ${overlayClassName}`}
        style={{ zIndex }}
        onClick={modal ? onClose : undefined}
      >
        <FocusScope contain={modal} restoreFocus autoFocus>
          <ModalDialog titleId={titleId} className={className} modal={modal}>
            {children}
          </ModalDialog>
        </FocusScope>
      </div>
    </OverlayContainer>
  );
}
