import type { ReactNode } from "react";
import { AccessibleModal } from "./AccessibleModal";

interface DrawerShellProps {
  children: ReactNode;
  onClose: () => void;
  /** id of the heading inside children — wired to aria-labelledby. */
  titleId?: string;
  /** Edge the panel is anchored to. Default "right". */
  side?: "left" | "right";
  /** Tailwind max-width for the panel (full-width below sm). */
  widthClass?: string;
  /** Extra classes for the panel container. */
  panelClassName?: string;
  /** Backdrop overlay classes. */
  backdropClass?: string;
  /** z-index for the overlay — default 1000. */
  zIndex?: number;
  /** Set false to disable Escape-to-close. */
  dismissOnEscape?: boolean;
  /** Default true. False = non-modal live panel — see AccessibleModal. */
  modal?: boolean;
}

// Side-anchored drawer / slide-over. Reuses AccessibleModal for ALL
// behaviour — focus trap, Escape, reference-counted body scroll-lock,
// portal-to-body, role/aria-modal/aria-labelledby, backdrop click — and
// swaps only the centred-box layout for a full-height panel pinned to one
// edge. The caller supplies its own header + scrolling body as children.
//
// This is the "drawer variant" of ModalShell: it brings the three side
// panels (OverviewDrawer, DaySettingsDrawer, SlideOverPanel) onto one
// reference-counted scroll-lock and focus trap instead of three
// hand-rolled copies, and gives them the gold-standard paper surface +
// branded shadow.
export function DrawerShell({
  children,
  onClose,
  titleId,
  side = "right",
  widthClass = "max-w-md",
  panelClassName = "",
  backdropClass = "bg-[rgba(45,0,75,0.45)] animate-overlay-fade",
  zIndex = 1000,
  dismissOnEscape = true,
  modal = true,
}: DrawerShellProps) {
  return (
    <AccessibleModal
      onClose={onClose}
      titleId={titleId}
      zIndex={zIndex}
      dismissOnEscape={dismissOnEscape}
      backdropClass={backdropClass}
      overlayClassName={side === "left" ? "flex justify-start" : "flex justify-end"}
      className={`relative h-full w-full ${widthClass} max-sm:max-w-none bg-[var(--color-brand-paper)] shadow-[0_18px_50px_-12px_rgba(45,0,75,0.28)] flex flex-col overflow-hidden animate-[fadeInUp_220ms_cubic-bezier(0.16,1,0.3,1)] ${panelClassName}`}
      modal={modal}
    >
      {children}
    </AccessibleModal>
  );
}
