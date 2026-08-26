// The live salon board.
//
// Three zones, always in the same place, holding one token per dog. Reading it
// is meant to be a glance, not a study: where a dog sits says what is
// happening to it, how prominent it looks says how much it wants you, and
// pressing it gets you the things you can do to it. Nothing else.
//
// Layout by device, because a board is a physical thing and the device is the
// table it sits on:
//   phone        zones stack; a press opens a bottom sheet
//   tablet ⬍     two columns, Ready spanning underneath — vertical, still spatial
//   tablet ⬌ +   three columns; the real board, with Arriving weighted wider
//                because it is the zone that fills up first
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMediaQuery } from "../../../../hooks/useMediaQuery";
import {
  ACTIVE_BOARD_ZONES,
  BOARD_ZONE_META,
  dropZoneFor,
  moveForDrag,
  tokenActions,
} from "../../../../engine/salonBoard";
import {
  confirmationLabel,
  firstName,
  formatMoney,
  serviceLabel,
  telephoneHref,
} from "../parts.jsx";
import { BoardZone } from "./BoardZone.jsx";
import { welfareFacts } from "./DogToken.jsx";
import { DogTokenAvatar } from "./DogTokenAvatar.jsx";
import { DogActionMenu } from "./DogActionMenu.jsx";
import { DogActionSheet } from "./DogActionSheet.jsx";
import { useTokenDrag } from "./useTokenDrag.js";
import { useTokenFlip } from "./useTokenFlip.js";

const ZONE_SPAN = {
  due: "",
  withUs: "",
  // On a two-column tablet the Ready zone takes the full width beneath the
  // other two, so its tokens stay big enough to hit rather than being squeezed
  // into a third of a portrait iPad.
  ready: "md:col-span-2 lg:col-span-1",
};

/** Actions that stay on the board — focus goes back to the dog that moved. */
const KEEPS_FOCUS = new Set(["checkIn", "startGroom", "ready", "collected", "confirm", "unconfirm"]);

/** Payment as a sentence for the panel — never printed on the token itself. */
function paymentSentence(payment) {
  if (!payment) return null;
  if (payment.kind === "paid") return "Paid in full";
  if (payment.amountDue != null && payment.amountDue > 0) return `${formatMoney(payment.amountDue)} to collect`;
  if (payment.amountDue === 0) return "Nothing to collect";
  return payment.label || null;
}

function tokenButtonFor(bookingId) {
  return document.querySelector(`[data-booking-id="${bookingId}"] [data-dog-token]`);
}

export function SalonBoard({
  tokens,
  resolve,
  getWelfare,
  paymentOf,
  handlers = {},
  onTheWaySignals = null,
  busyIds = null,
  attentionActive = false,
  landedId = null,
  selectedId = null,
  onSelectToken,
}) {
  const isTabletUp = useMediaQuery("(min-width: 768px)");
  const isWide = useMediaQuery("(min-width: 1024px)");
  const [dragAnnouncement, setDragAnnouncement] = useState("");
  const lastFocusedId = useRef(null);

  const density = isTabletUp && !isWide ? "roomy" : "regular";

  const byId = useMemo(() => {
    const index = new Map();
    for (const zone of ACTIVE_BOARD_ZONES) {
      for (const token of tokens[zone]) index.set(String(token.booking.id), token);
    }
    for (const token of tokens.home) index.set(String(token.booking.id), token);
    return index;
  }, [tokens]);

  // A signature that changes whenever the arrangement does, so the motion
  // layer re-measures exactly when something has actually moved.
  const arrangement = useMemo(
    () => ACTIVE_BOARD_ZONES
      .map((zone) => `${zone}:${tokens[zone].map((token) => token.booking.id).join(",")}`)
      .join("|"),
    [tokens],
  );
  const registerTokenRef = useTokenFlip(arrangement);

  // Remember which dog the keyboard was on. A token that changes zone is a
  // different DOM node in a different list, so React unmounts the focused
  // element and the browser drops focus to <body> — which would strand a
  // keyboard user at the top of the page every time they moved a dog.
  useEffect(() => {
    const onFocusIn = (event) => {
      const id = event.target?.closest?.("[data-booking-id]")?.getAttribute("data-booking-id");
      if (id) lastFocusedId.current = id;
    };
    document.addEventListener("focusin", onFocusIn);
    return () => document.removeEventListener("focusin", onFocusIn);
  }, []);

  // After any rearrangement, put focus back on that same dog in its new zone —
  // but only if focus was actually orphaned. A modal or another control that
  // legitimately holds focus is never interrupted.
  useLayoutEffect(() => {
    const id = lastFocusedId.current;
    if (!id) return;
    const active = document.activeElement;
    if (active && active !== document.body) return;
    tokenButtonFor(id)?.focus?.({ preventScroll: true });
  }, [arrangement]);

  const describe = useCallback((token) => {
    const display = resolve(token.booking);
    const payment = paymentOf(token.booking);
    const welfare = getWelfare?.(token.booking);
    return {
      display,
      payment,
      welfare,
      dogName: display.dogName,
      ownerName: display.owner,
      amountDue: payment?.amountDue ?? null,
      // A balance only earns space on the board once it actually blocks
      // something — from Ready onward. A dog mid-groom that will settle at
      // pick-up is routine, and must not look like a problem.
      showBalance: (token.zone === "ready" || token.zone === "home")
        && (token.entry.actionReasons?.includes("payment") ?? false),
      facts: welfareFacts(welfare),
      // Read-only WhatsApp signal: the owner said they are on their way. It
      // changes how long a Ready dog's wait actually matters, so it belongs
      // on the token — as a mark, with the words in the panel.
      onTheWay: onTheWaySignals?.[String(token.booking.id)] ?? null,
    };
  }, [getWelfare, onTheWaySignals, paymentOf, resolve]);

  const runDrop = useCallback((token, targetZone) => {
    const move = moveForDrag(token.zone, targetZone);
    if (!move) return;
    const dogName = resolve(token.booking).dogName;
    setDragAnnouncement("");
    requestAnimationFrame(
      () => setDragAnnouncement(`${dogName} moved to ${BOARD_ZONE_META[targetZone].title}.`),
    );
    handlers.onTokenAction?.(token, { id: move.action });
  }, [handlers, resolve]);

  const { drag, onPointerDown, consumedClick } = useTokenDrag({
    // Drag accelerates work for someone at a table with a mouse, a trackpad or
    // a steady finger on a big screen. On a phone the sheet is faster than any
    // drag and there is no room to drag across, so it is simply off there —
    // and nothing is lost, because every move is also a menu item.
    enabled: isTabletUp,
    onDrop: runDrop,
  });

  const onActivateToken = useCallback((bookingId) => {
    if (consumedClick()) return;
    onSelectToken?.(selectedId === bookingId ? null : bookingId);
  }, [consumedClick, onSelectToken, selectedId]);

  // Focus is restored synchronously, before any handler runs: the token is
  // still on screen at that moment, and a modal opened by the action traps
  // focus afterwards exactly as it does from every other menu in the app.
  const closePanel = useCallback((restoreFocus = true) => {
    if (restoreFocus && selectedId) tokenButtonFor(selectedId)?.focus?.({ preventScroll: true });
    onSelectToken?.(null);
  }, [onSelectToken, selectedId]);

  const selectedToken = selectedId ? byId.get(selectedId) : null;
  const selectedInfo = selectedToken ? describe(selectedToken) : null;

  const selectedActions = useMemo(() => {
    if (!selectedToken || !selectedInfo) return [];
    return tokenActions(selectedToken, {
      amountDue: selectedInfo.amountDue,
      paid: selectedInfo.payment?.kind === "paid",
      telHref: telephoneHref(selectedInfo.display.ownerPhone),
      contactName: firstName(selectedInfo.display.owner),
      dogName: selectedInfo.dogName,
      ownerName: selectedInfo.display.owner,
      hasOwner: !!selectedToken.booking._ownerId,
      hasDog: !!selectedToken.booking._dogId,
    });
  }, [selectedInfo, selectedToken]);

  const onSelectAction = useCallback((action) => {
    const token = selectedToken;
    closePanel(KEEPS_FOCUS.has(action.id));
    if (!token || action.href) return;
    handlers.onTokenAction?.(token, action);
  }, [closePanel, handlers, selectedToken]);

  const draggingId = drag?.bookingId ?? null;
  const draggingToken = draggingId ? byId.get(draggingId) : null;
  const eligibleZone = draggingToken ? dropZoneFor(draggingToken) : null;

  const panelProps = selectedToken && selectedInfo
    ? {
      token: selectedToken,
      dogName: selectedInfo.dogName,
      ownerName: selectedInfo.display.owner,
      serviceLabel: serviceLabel(selectedToken.booking.service),
      paymentLabel: paymentSentence(selectedInfo.payment),
      confirmationLabel: confirmationLabel(selectedToken.booking),
      welfareFacts: selectedInfo.facts,
      onTheWayLabel: selectedInfo.onTheWay
        ? `Owner on the way${selectedInfo.onTheWay.minutesAgo > 1 ? ` · said ${selectedInfo.onTheWay.minutesAgo} min ago` : ""}`
        : null,
      actions: selectedActions,
      busy: busyIds?.has(selectedId),
      onSelect: onSelectAction,
    }
    : null;

  return (
    <section
      aria-label="Live salon board"
      data-salon-board-root
      tabIndex={-1}
      className="flex flex-col gap-3 outline-none focus-visible:ring-2 focus-visible:ring-brand-purple focus-visible:ring-offset-2"
    >
      <p className="sr-only" aria-live="polite" aria-atomic="true">{dragAnnouncement}</p>
      {isTabletUp ? (
        <p className="sr-only" id="salon-board-drag-hint">
          A dog can be dragged to the next zone. Every move is also available from that
          dog&apos;s actions, which open when you press it.
        </p>
      ) : null}

      <div
        aria-describedby={isTabletUp ? "salon-board-drag-hint" : undefined}
        className="grid min-w-0 grid-cols-1 items-start gap-x-3 gap-y-2 md:grid-cols-2 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)_minmax(0,1fr)]"
      >
        {ACTIVE_BOARD_ZONES.map((zone) => (
          <BoardZone
            key={zone}
            zone={zone}
            tokens={tokens[zone]}
            density={density}
            className={ZONE_SPAN[zone]}
            dropActive={drag?.targetZone === zone}
            dropEligible={!!eligibleZone && eligibleZone === zone && drag?.targetZone !== zone}
            selectedId={selectedId}
            attentionActive={attentionActive}
            busyIds={busyIds}
            draggingId={draggingId}
            landedId={landedId}
            dragEnabled={isTabletUp}
            onActivateToken={onActivateToken}
            onTokenPointerDown={onPointerDown}
            registerTokenRef={registerTokenRef}
            tokenMeta={describe}
          />
        ))}
      </div>

      {panelProps
        ? isTabletUp
          ? <DogActionMenu {...panelProps} onClose={closePanel} />
          : <DogActionSheet {...panelProps} onClose={() => closePanel(true)} />
        : null}

      {drag && draggingToken
        ? createPortal(
          <div
            aria-hidden="true"
            data-drag-ghost
            style={{ top: drag.y, left: drag.x }}
            className="pointer-events-none fixed z-[1300] -translate-x-1/2 -translate-y-1/2"
          >
            <DogTokenAvatar
              name={resolve(draggingToken.booking).dogName}
              seed={draggingToken.booking._dogId || draggingToken.booking.id}
              size={64}
              className="rotate-[-3deg] scale-105 shadow-[0_12px_28px_-6px_rgba(45,0,75,0.4)] ring-2 ring-white"
            />
          </div>,
          document.body,
        )
        : null}
    </section>
  );
}
