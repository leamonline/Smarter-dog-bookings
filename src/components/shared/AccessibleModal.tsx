// src/components/shared/AccessibleModal.tsx
import { useRef, useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useDialog, FocusScope } from "react-aria";

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

export function AccessibleModal({
  children,
  onClose,
  titleId,
  className = "",
  backdropClass = "bg-black/35",
  zIndex = 1000,
  dismissOnEscape = true,
  overlayClassName = "flex items-center justify-center",
}: AccessibleModalProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { dialogProps } = useDialog(
    { role: "dialog", "aria-labelledby": titleId },
    ref,
  );

  // Escape key
  useEffect(() => {
    if (!dismissOnEscape) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose, dismissOnEscape]);

  // Scroll lock (reference-counted — see above).
  useEffect(() => {
    lockBodyScroll();
    return () => unlockBodyScroll();
  }, []);

  if (typeof document === "undefined") return null;

  // Portal to <body> so the fixed-position overlay is always relative to
  // the viewport. Rendered inline, a `position: fixed` overlay is trapped
  // by any ancestor with a transform/filter (e.g. the portal cards' entry
  // animation keeps a translateY(0)), which would confine the modal to
  // that card instead of covering the screen.
  return createPortal(
    <div
      className={`fixed inset-0 ${backdropClass} ${overlayClassName}`}
      style={{ zIndex }}
      onClick={onClose}
    >
      <FocusScope contain restoreFocus autoFocus>
        <div
          {...dialogProps}
          ref={ref}
          aria-modal="true"
          className={className}
          onClick={(e) => e.stopPropagation()}
        >
          {children}
        </div>
      </FocusScope>
    </div>,
    document.body,
  );
}
