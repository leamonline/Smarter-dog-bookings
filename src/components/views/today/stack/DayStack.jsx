// The day, top to bottom, in appointment order, as a wallet.
//
// At rest every card shows the same 72px strip and the last card shows in full
// (stackLayout.ts). Tapping a strip LIFTS that card out: it moves to the top of
// what is visible and opens, and every other card collapses into a shallow pile
// directly below it, behind a labelled way back. That replaced the in-place
// expand, which pushed the rest of the day down the page and hid the bottom
// line of every card it covered.
//
// One card lifted at a time, and four ways back, each the same close:
//
//   • the card's Close button, or its strip again
//   • a tap on the pile ("Back to the day")
//   • Escape
//   • the browser's Back button — lifting pushes one history entry, so on a
//     phone the gesture people already use for "go back" does go back
//
// That entry names the dog it opened, so it is never a dead step. Leave
// /today from a lifted card (WhatsApp the owner, open the dog's file) and Back
// brings you to that dog's lifted card, the place you left; the next Back
// closes it. Forward onto the entry lifts it again. A browser cannot delete an
// entry from the middle of its history, so giving it a meaning is the only way
// to stop it being an extra Back press. If the dog has left the day, the entry
// is quietly cleared instead.
//
// Closing puts the page's scroll position back where it was and returns focus
// to the strip that opened the card. Under prefers-reduced-motion the state
// simply switches: no lift, no pile animation, no smooth scroll.
//
// This component only owns presentation. All appointment actions still go
// through `tokenActions` and the existing booking write path.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePullToRefresh } from "../../../shared/PullToRefresh.jsx";
import { StackPile } from "../../../ui";
import { stackLayout, STACK_CARD_HEIGHT, STACK_STRIP_HEIGHT } from "./stackLayout";
import { measureLiftFrame, useLiftedHeight } from "./useStackGeometry.js";
import { useReducedMotion } from "./useReducedMotion.js";
import "./dayStack.css";
import { StackCard } from "./StackCard.jsx";

/**
 * Marks the history entry a lift pushed, holding the lifted dog's booking id, so
 * Back closes the card rather than leaving the page, and returning to the entry
 * lifts that card again.
 */
const HISTORY_KEY = "dayStackLifted";

/** The booking id a history entry names, or null. */
function liftedIdInHistory(state) {
  const id = state?.[HISTORY_KEY];
  return typeof id === "string" && id ? id : null;
}

function withoutLiftedId(state) {
  if (!state || typeof state !== "object") return state;
  const { [HISTORY_KEY]: _omit, ...rest } = state;
  return rest;
}

function formatLastVisit(dateStr) {
  if (!dateStr) return "";
  const parsed = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleDateString("en-GB", { day: "numeric", month: "long" });
}

function scrollportOf(list) {
  return list?.closest("main") || null;
}

export function DayStack({
  rows,
  resolve,
  getWelfare,
  paymentOf,
  lastVisitFor,
  photoPathFor = null,
  onTheWaySignals,
  highlightIds = null,
  tokensById = null,
  onAction,
  onCollectWithPayment,
  onSetPrice,
  onOpenInvoice,
  busyIds = null,
  emptyMessage = "No bookings on this date",
  /**
   * `{ id, key }` — bring that dog's strip into view, without lifting it. A
   * new `key` repeats the request for the same dog. Sent when staff press an
   * attention segment ("1 late"). A lifted card is put back first.
   */
  focusRequest = null,
}) {
  const [liftedId, setLiftedId] = useState(null);
  const [frame, setFrame] = useState(null);
  const listRef = useRef(null);
  const headRefs = useRef(new Map());
  const detailsRefs = useRef(new Map());
  const savedScrollRef = useRef(0);
  const returnFocusRef = useRef(null);
  const sentinelRef = useRef(false);
  const ignorePopRef = useRef(false);
  // A lift made while our own Back is still travelling: its entry is pushed
  // once that Back has landed, not on top of the entry being left.
  const deferredPushRef = useRef(null);
  const revealIdRef = useRef(null);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  // Arriving on an entry a lift pushed (Back from the inbox, a reload): the
  // card it names is lifted again once its row is on the stack.
  const pendingRestoreRef = useRef(
    typeof window === "undefined" ? null : liftedIdInHistory(window.history.state),
  );
  const reducedMotion = useReducedMotion();
  const refresh = usePullToRefresh();

  // A lifted dog can leave the stack under us: collected, or moved by a
  // colleague on another till. The card it named is gone, so is the lift.
  const liftedIndex = liftedId ? rows.findIndex((row) => row.id === liftedId) : -1;
  const lifted = liftedIndex >= 0 ? liftedId : null;
  const liftedHeight = useLiftedHeight(listRef, lifted);
  const layout = stackLayout({
    count: rows.length,
    liftedIndex,
    liftedHeight,
    frame,
    pullProgress: lifted ? 0 : refresh.progress,
  });

  /**
   * Lift a card. `fromHistory` means the browser is already on an entry that
   * names this card (Back or Forward onto it, or a remount), so nothing is
   * pushed: that entry is the one the next close or Back steps off.
   */
  const lift = useCallback((id, { fromHistory = false } = {}) => {
    const list = listRef.current;
    if (!list) return;
    const main = scrollportOf(list);
    savedScrollRef.current = main ? main.scrollTop : 0;
    returnFocusRef.current = id;
    setFrame(measureLiftFrame(list));
    setLiftedId(id);
    if (typeof window === "undefined") return;
    if (fromHistory) {
      sentinelRef.current = true;
    } else if (!sentinelRef.current) {
      // history.back() is asynchronous. If a close has just stepped back and
      // the browser has not landed yet, pushing now would stack this card's
      // entry on the one being left, and the late Back would then land on the
      // previous dog's entry while this dog is on screen.
      if (ignorePopRef.current) {
        deferredPushRef.current = id;
      } else {
        window.history.pushState({ ...window.history.state, [HISTORY_KEY]: id }, "", window.location.href);
        sentinelRef.current = true;
      }
    }
  }, []);

  // Returning to an entry a lift pushed: lift that card again, or, if the dog
  // has left the day, clear the entry's mark so it does not lift anything later.
  useLayoutEffect(() => {
    const id = pendingRestoreRef.current;
    if (!id || liftedId) return;
    if (rows.some((row) => row.id === id)) {
      pendingRestoreRef.current = null;
      lift(id, { fromHistory: true });
    } else if (rows.length > 0) {
      pendingRestoreRef.current = null;
      window.history.replaceState(withoutLiftedId(window.history.state), "", window.location.href);
    }
  }, [rows, liftedId, lift]);

  /**
   * Put the day back. `fromHistory` means the browser already stepped back,
   * so the entry the lift pushed is gone; every other close steps back over it
   * so that Back is not left holding a card that is no longer open.
   */
  const close = useCallback(({ fromHistory = false, restoreFocus = true } = {}) => {
    if (!liftedId) return;
    setLiftedId(null);
    setFrame(null);
    // A lift still waiting for its entry never gets one.
    deferredPushRef.current = null;
    if (sentinelRef.current) {
      sentinelRef.current = false;
      if (!fromHistory && typeof window !== "undefined") {
        ignorePopRef.current = true;
        window.history.back();
      }
    }
    if (!restoreFocus) returnFocusRef.current = null;
  }, [liftedId]);

  // After a close commits: scroll back first, then return focus without
  // scrolling, so the focus move cannot undo the restore.
  const focusedLiftRef = useRef(null);
  useLayoutEffect(() => {
    if (lifted) {
      if (!liftedHeight || focusedLiftRef.current === lifted) return;
      focusedLiftRef.current = lifted;
      // The first render has no measured height yet. Compacting the stack
      // can clamp the scrollport then, so restore it once the full card fits,
      // before paint. Later content resizes must not reset the user's scroll.
      const main = scrollportOf(listRef.current);
      if (main) main.scrollTop = savedScrollRef.current;
      // Focus moves into the lifted card. Its full view is a labelled region
      // that takes focus, so the dog's name is what a screen reader says next.
      detailsRefs.current.get(lifted)?.focus({ preventScroll: true });
      return;
    }
    if (!focusedLiftRef.current) return;
    focusedLiftRef.current = null;
    const main = scrollportOf(listRef.current);
    if (main) main.scrollTop = savedScrollRef.current;
    const id = returnFocusRef.current;
    returnFocusRef.current = null;
    if (id) headRefs.current.get(id)?.focus({ preventScroll: true });
  }, [lifted, liftedHeight]);

  // Escape closes — unless a dialog opened from the card (the invoice, a
  // confirmation) has it, because that Escape belongs to the dialog.
  useEffect(() => {
    if (!lifted) return undefined;
    const onKeyDown = (event) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      event.preventDefault();
      close();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [lifted, close]);

  // The browser's Back and Forward buttons. The entry the browser lands on is
  // the truth, not what this stack last did: an entry naming a dog on the day
  // means that card is lifted; any other entry means the day is at rest. That
  // holds even when this stack is still mounted while the router moves on — a
  // navigation is a transition, so /today stays on screen until the next page
  // has loaded, and a quick Back lands while it is still here.
  useEffect(() => {
    const onPopState = (event) => {
      if (ignorePopRef.current) {
        ignorePopRef.current = false;
        // Our own Back has landed: now push the entry for a card lifted
        // while it was travelling.
        const deferred = deferredPushRef.current;
        deferredPushRef.current = null;
        if (deferred) {
          window.history.pushState({ ...window.history.state, [HISTORY_KEY]: deferred }, "", window.location.href);
          sentinelRef.current = true;
        }
        return;
      }
      const id = liftedIdInHistory(event.state);
      if (id && rowsRef.current.some((row) => row.id === id)) {
        if (liftedId !== id) lift(id, { fromHistory: true });
        else sentinelRef.current = true;
        return;
      }
      if (liftedId) close({ fromHistory: true });
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [close, lift, liftedId]);

  // A card that left the stack while lifted takes its history entry with it.
  useEffect(() => {
    if (liftedId && liftedIndex === -1) close({ restoreFocus: false });
  }, [liftedId, liftedIndex, close]);

  // An attention segment asks for a dog. Put any lifted card back, then bring
  // that dog's strip into view only if it is off screen: the press is
  // deliberate, but a strip already in view needs no scroll.
  useLayoutEffect(() => {
    const id = focusRequest?.id;
    if (!id || !rows.some((row) => row.id === id)) return;
    if (liftedId) close({ restoreFocus: false });
    revealIdRef.current = id;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reacts to a new request only, not to every row refresh
  }, [focusRequest]);

  useLayoutEffect(() => {
    const id = revealIdRef.current;
    if (!id || lifted) return undefined;
    const list = listRef.current;
    const main = scrollportOf(list);
    if (!main) { revealIdRef.current = null; return undefined; }
    const frameId = requestAnimationFrame(() => {
      revealIdRef.current = null;
      const index = rows.findIndex((row) => row.id === id);
      if (index < 0) return;
      const offset = list.getBoundingClientRect().top - main.getBoundingClientRect().top
        + layout.positions[index];
      if (offset >= 0 && offset + STACK_STRIP_HEIGHT <= main.clientHeight) return;
      main.scrollTo({ top: Math.max(0, main.scrollTop + offset - 12), behavior: reducedMotion ? "instant" : "smooth" });
    });
    return () => cancelAnimationFrame(frameId);
  });

  const toggle = useCallback((id) => {
    // Pile cards are inert, so another card's strip cannot be pressed while
    // one is lifted; if it is reached some other way it puts the day back.
    if (liftedId) close({ restoreFocus: liftedId === id });
    else lift(id);
  }, [liftedId, close, lift]);

  if (rows.length === 0) {
    return (
      <p className="px-4 py-10 text-center text-sm text-slate-500">{emptyMessage}</p>
    );
  }

  const motion = reducedMotion ? "reduced" : "full";
  const transition = reducedMotion ? "none" : undefined;

  return (
    <div className="day-wallet-frame" data-lifted={lifted ? "true" : "false"}>
      <ul
        ref={listRef}
        data-day-stack
        data-motion={motion}
        data-dragging={refresh.dragging ? "true" : "false"}
        className="day-wallet-stack m-0 list-none p-0"
        style={{
          height: layout.height,
          "--stack-strip-height": `${STACK_STRIP_HEIGHT}px`,
          "--stack-face-height": `${STACK_CARD_HEIGHT - STACK_STRIP_HEIGHT}px`,
        }}
      >
        {rows.map((row, index) => {
          const isLifted = row.id === lifted;
          return (
            <StackCard
              key={row.id}
              row={row}
              stackStyle={{
                transform: `translate3d(0, ${layout.positions[index]}px, 0)`,
                zIndex: isLifted ? rows.length + 2 : index + 1,
                transition,
              }}
              clip={layout.clips[index]}
              lifted={isLifted}
              inPile={!!lifted && !isLifted}
              headRef={(node) => {
                if (node) headRefs.current.set(row.id, node);
                else headRefs.current.delete(row.id);
              }}
              detailsRef={(node) => {
                if (node) detailsRefs.current.set(row.id, node);
                else detailsRefs.current.delete(row.id);
              }}
              display={resolve(row.booking)}
              welfare={getWelfare(row.booking)}
              payment={paymentOf(row.booking)}
              lastVisit={formatLastVisit(lastVisitFor(row.booking))}
              photoPath={photoPathFor?.(row.booking) ?? null}
              onTheWay={!!onTheWaySignals?.[row.id]}
              // Highlighting dims the rest rather than hiding it. A member of staff
              // asking "which two are late?" still needs to see that the other nine
              // exist, or the list stops being the day.
              dimmed={!!highlightIds && !highlightIds.has(row.id)}
              token={tokensById?.get(row.id) ?? null}
              onAction={onAction}
              onCollectWithPayment={onCollectWithPayment}
              onSetPrice={onSetPrice}
              onOpenInvoice={onOpenInvoice}
              busy={!!busyIds?.has(row.id)}
              onToggle={() => toggle(row.id)}
              onClose={() => close()}
            />
          );
        })}
      </ul>
      {lifted && layout.pile ? (
        <StackPile
          top={layout.pile.top}
          height={layout.pile.height}
          count={layout.pile.count}
          zIndex={1}
          onClose={() => close()}
        />
      ) : null}
    </div>
  );
}
