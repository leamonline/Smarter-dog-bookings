// The contextual action panel for pointer-and-keyboard widths.
//
// Deliberately NOT a radial/fan menu. A dog can offer anywhere from three to
// nine actions and several labels are long ("Take £52 payment"), so arc-placed
// targets would either collide or shrink below a comfortable hit area, and the
// reading order a screen reader gets would stop matching the visual one. What
// survives from the radial idea is what actually mattered: the panel belongs
// to THIS dog, appears immediately beside it, and grows out of it — the
// transform-origin is set to the token's edge, so the motion reads as the
// token opening rather than a dialog arriving from nowhere.
//
// Contract: role="menu", first item focused on open, arrows/Home/End traverse,
// Escape closes and returns focus to the token, outside click and scroll
// dismiss. Identical to the Daily Brief's existing MoreMenu, so the keyboard
// habit transfers.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DogActionList } from "./DogActionList.jsx";

const PANEL_WIDTH = 248;
const GAP = 10;
const EDGE = 8;

/**
 * Place the panel beside the token when there is room, otherwise below or
 * above it. Never off-screen: every branch is clamped to the viewport.
 */
function place(anchorRect, panelHeight) {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const spaceRight = viewportWidth - anchorRect.right;
  const spaceLeft = anchorRect.left;

  let left;
  let origin;
  if (spaceRight >= PANEL_WIDTH + GAP + EDGE) {
    left = anchorRect.right + GAP;
    origin = "left";
  } else if (spaceLeft >= PANEL_WIDTH + GAP + EDGE) {
    left = anchorRect.left - PANEL_WIDTH - GAP;
    origin = "right";
  } else {
    left = Math.min(
      Math.max(EDGE, anchorRect.left + anchorRect.width / 2 - PANEL_WIDTH / 2),
      viewportWidth - PANEL_WIDTH - EDGE,
    );
    origin = "center";
  }

  const height = panelHeight || 0;
  let top = anchorRect.top;
  if (origin === "center") top = anchorRect.bottom + GAP;
  if (height > 0) {
    top = Math.min(Math.max(EDGE, top), Math.max(EDGE, viewportHeight - height - EDGE));
  }

  return { top, left, origin };
}

export function DogActionMenu({
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
  const panelRef = useRef(null);
  const [position, setPosition] = useState(null);
  // The panel anchors to the token's own button, found by booking id rather
  // than a ref threaded down through the zone — the token may re-render (or
  // move zone) between opening and placing, and the id survives that.
  const anchorFor = useCallback(
    () => document.querySelector(`[data-booking-id="${token.booking.id}"] [data-dog-token]`),
    [token.booking.id],
  );

  // Two passes: place from the anchor, then re-clamp once the real height is
  // known. Measuring first avoids a visible jump on tall panels.
  useLayoutEffect(() => {
    const anchor = anchorFor();
    if (!anchor) return;
    setPosition(place(anchor.getBoundingClientRect(), 0));
  }, [anchorFor]);

  useLayoutEffect(() => {
    const anchor = anchorFor();
    if (!position || !panelRef.current || !anchor) return;
    const height = panelRef.current.getBoundingClientRect().height;
    const next = place(anchor.getBoundingClientRect(), height);
    if (next.top !== position.top || next.left !== position.left) setPosition(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one corrective pass; re-running on every position write would loop
  }, [position?.origin, actions.length]);

  useEffect(() => {
    if (!position) return;
    const panel = panelRef.current;
    panel?.querySelector('[role="menuitem"]:not(:disabled)')?.focus({ preventScroll: true });

    const onDocumentPointerDown = (event) => {
      if (panelRef.current?.contains(event.target)) return;
      if (anchorFor()?.contains(event.target)) return;
      onClose(false);
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose(true);
      }
    };
    const dismiss = () => onClose(false);
    document.addEventListener("mousedown", onDocumentPointerDown);
    document.addEventListener("keydown", onKeyDown, true);
    // A beat before arming scroll-dismiss: the focus/scroll that can precede
    // the opening press must not instantly close what it just opened.
    const armScroll = setTimeout(() => window.addEventListener("scroll", dismiss, true), 150);
    window.addEventListener("resize", dismiss);
    return () => {
      document.removeEventListener("mousedown", onDocumentPointerDown);
      document.removeEventListener("keydown", onKeyDown, true);
      clearTimeout(armScroll);
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("resize", dismiss);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- wire once the panel is placed
  }, [position === null]);

  const moveFocus = (delta, edge = null) => {
    const items = [...(panelRef.current?.querySelectorAll('[role="menuitem"]:not(:disabled)') || [])];
    if (items.length === 0) return;
    if (edge === "start") return items[0].focus();
    if (edge === "end") return items[items.length - 1].focus();
    const index = items.indexOf(document.activeElement);
    items[index === -1 ? 0 : (index + delta + items.length) % items.length].focus();
  };

  const onPanelKeyDown = (event) => {
    if (event.key === "ArrowDown") { event.preventDefault(); moveFocus(1); }
    else if (event.key === "ArrowUp") { event.preventDefault(); moveFocus(-1); }
    else if (event.key === "Home") { event.preventDefault(); moveFocus(0, "start"); }
    else if (event.key === "End") { event.preventDefault(); moveFocus(0, "end"); }
    else if (event.key === "Tab") onClose(false);
  };

  if (!position) return null;

  const transformOrigin =
    position.origin === "left" ? "left center" : position.origin === "right" ? "right center" : "top center";

  return createPortal(
    <div
      ref={panelRef}
      role="menu"
      data-dog-action-menu
      aria-label={`Actions for ${dogName}`}
      onKeyDown={onPanelKeyDown}
      style={{ top: position.top, left: position.left, width: PANEL_WIDTH, transformOrigin }}
      className="fixed z-[1200] max-h-[calc(100dvh-16px)] overflow-y-auto rounded-2xl border border-brand-paper-line bg-white p-2 shadow-[0_16px_40px_-12px_rgba(45,0,75,0.26)] motion-safe:animate-token-menu-in"
    >
      {/* Progressive disclosure: everything the token deliberately does not
          print — service, owner, money, the full safety text — lives here, one
          press away, instead of on every dog all day. */}
      <div className="px-2 pb-2 pt-1">
        <p className="truncate font-display text-[16px] font-bold leading-tight text-brand-purple">{dogName}</p>
        <p className="mt-0.5 text-[12px] font-semibold leading-snug text-slate-500">
          {token.statusText}
        </p>
        <p className="mt-0.5 truncate text-[12px] leading-snug text-slate-500">
          {[serviceLabel, ownerName].filter(Boolean).join(" · ")}
        </p>
        {paymentLabel ? (
          <p className="mt-0.5 text-[12px] font-semibold leading-snug text-slate-600 tabular-nums">{paymentLabel}</p>
        ) : null}
        {confirmationLabel ? (
          <p className="mt-0.5 text-[12px] font-semibold leading-snug text-emerald-700">{confirmationLabel}</p>
        ) : null}
        {onTheWayLabel ? (
          <p className="mt-0.5 text-[12px] font-semibold leading-snug text-brand-teal-text">{onTheWayLabel}</p>
        ) : null}
        {welfareFacts.length > 0 ? (
          <p className="mt-1.5 rounded-md bg-brand-coral-light px-1.5 py-1 text-[11px] font-semibold leading-snug text-brand-coral-text">
            {welfareFacts.join(" · ")}
          </p>
        ) : null}
      </div>
      <div className="flex flex-col gap-1 border-t border-brand-paper-line pt-2">
        <DogActionList actions={actions} onSelect={onSelect} dogName={dogName} busy={busy} />
      </div>
    </div>,
    document.body,
  );
}
