// ============================================================
// src/components/views/inbox/customer-context/SlideOverPanel.jsx
//
// Right-anchored slide-over used by the inbox CustomerContextPanel below
// the xl breakpoint. Now a thin pass-through to the shared DrawerShell
// (built on AccessibleModal) so it gets the same focus trap, Escape,
// reference-counted scroll-lock, portal and role/aria as every other
// modal — instead of the previous hand-rolled copy whose scroll-lock
// could leak when stacked. The public API (children/onClose/titleId/
// panelClassName/zIndex) is unchanged.
// ============================================================

import { DrawerShell } from "../../../shared/DrawerShell";

export function SlideOverPanel({
  children,
  onClose,
  titleId,
  panelClassName = "",
  zIndex = 1000,
}) {
  return (
    <DrawerShell
      side="right"
      onClose={onClose}
      titleId={titleId}
      zIndex={zIndex}
      panelClassName={panelClassName}
    >
      {children}
    </DrawerShell>
  );
}
