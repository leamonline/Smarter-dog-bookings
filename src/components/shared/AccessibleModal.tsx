// src/components/shared/AccessibleModal.tsx
import { useRef, useEffect, type ReactNode } from "react";
import { FocusScope, useDialog } from "react-aria";

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
}

export function AccessibleModal({
  children,
  onClose,
  titleId,
  className = "",
  backdropClass = "bg-black/35",
  zIndex = 1000,
  dismissOnEscape = true,
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

  // Scroll lock
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <div
      className={`fixed inset-0 ${backdropClass} flex items-center justify-center`}
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
    </div>
  );
}
