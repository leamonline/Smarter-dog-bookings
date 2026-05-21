// ============================================================
// src/components/views/inbox/customer-context/SlideOverPanel.jsx
//
// Right-anchored slide-over modal. Reuses react-aria's FocusScope +
// useDialog the same way AccessibleModal does, but with right-side
// layout (full-height on mobile, max-w-md panel slid in from the
// right on tablet) instead of a centred card. Used by the inbox
// CustomerContextPanel below the xl breakpoint.
// ============================================================

import { useEffect, useRef } from "react";
import { useDialog, FocusScope } from "react-aria";

export function SlideOverPanel({
  children,
  onClose,
  titleId,
  panelClassName = "",
  zIndex = 1000,
}) {
  const ref = useRef(null);
  const { dialogProps } = useDialog(
    { role: "dialog", "aria-labelledby": titleId },
    ref,
  );

  // Escape to close.
  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  // Scroll lock — mirrors AccessibleModal so the page behind doesn't
  // double-scroll when the panel is open on mobile.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <div
      className="fixed inset-0 bg-black/35 flex justify-end"
      style={{ zIndex }}
      onClick={onClose}
    >
      <FocusScope contain restoreFocus autoFocus>
        <div
          {...dialogProps}
          ref={ref}
          aria-modal="true"
          className={`h-full w-full sm:max-w-md bg-white shadow-xl flex flex-col overflow-hidden animate-[slideIn_0.18s_ease-out] ${panelClassName}`}
          onClick={(e) => e.stopPropagation()}
        >
          {children}
        </div>
      </FocusScope>
    </div>
  );
}
