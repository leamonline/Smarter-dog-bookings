// The day, top to bottom, in appointment order.
//
// One card open at a time. Not a rule for its own sake: the cards are tinted by
// status and an open one is tall, so two open at once pushes the rest of the
// day off screen and turns a list you scan into a page you scroll. Opening a
// second closes the first.
//
// This component only owns presentation. All appointment actions still go
// through `tokenActions` and the existing booking write path.
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { usePullToRefresh } from "../../../shared/PullToRefresh.jsx";
import { stackLayout, STACK_HEADER_HEIGHT } from "./stackLayout";
import { useStackGeometry } from "./useStackGeometry.js";
import "./dayStack.css";
import { StackCard } from "./StackCard.jsx";

function formatLastVisit(dateStr) {
  if (!dateStr) return "";
  const parsed = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleDateString("en-GB", { day: "numeric", month: "long" });
}

export function DayStack({
  rows,
  resolve,
  getWelfare,
  paymentOf,
  lastVisitFor,
  onTheWaySignals,
  highlightIds = null,
  tokensById = null,
  onAction,
  onCollectWithPayment,
  onSetPrice,
  onOpenInvoice,
  busyIds = null,
  emptyMessage = "No bookings on this date",
}) {
  const [openId, setOpenId] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const listRef = useRef(null);
  const revealRef = useRef(false);
  const refresh = usePullToRefresh();
  const rowKey = rows.map((row) => row.id).join("|");
  const geometry = useStackGeometry(listRef, openId, rowKey);
  const selectedIndex = Math.max(0, rows.findIndex((row) => row.id === selectedId));
  const layout = stackLayout({
    count: rows.length, selectedIndex, ...geometry, pullProgress: refresh.progress,
  });

  useLayoutEffect(() => {
    if (!revealRef.current) return;
    const list = listRef.current;
    const main = list?.closest("main");
    if (!main) { revealRef.current = false; return; }
    // Wait for the measured drawer height to reach the DOM; otherwise the
    // browser clamps the target to the previous (collapsed) scroll height.
    const frame = requestAnimationFrame(() => {
      revealRef.current = false;
      const target = main.scrollTop + list.getBoundingClientRect().top
        - main.getBoundingClientRect().top + layout.positions[selectedIndex] - 12;
      main.scrollTo({
        top: Math.max(0, target),
        behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [selectedId, openId, selectedIndex, layout.positions]);

  const toggle = useCallback((id) => {
    revealRef.current = id !== openId;
    setSelectedId(id);
    setOpenId((current) => (current === id ? null : id));
  }, [openId]);

  if (rows.length === 0) {
    return (
      <p className="px-4 py-10 text-center text-[14px] text-slate-500">{emptyMessage}</p>
    );
  }

  return (
    <ul
      ref={listRef}
      data-day-stack
      data-dragging={refresh.dragging ? "true" : "false"}
      className="day-wallet-stack m-0 list-none p-0"
      style={{ height: layout.height, "--stack-header-height": `${STACK_HEADER_HEIGHT}px` }}
    >
      {rows.map((row, index) => (
        <StackCard
          key={row.id}
          row={row}
          stackStyle={{
            transform: `translate3d(0, ${layout.positions[index]}px, 0)`,
            zIndex: index === selectedIndex ? rows.length + 1 : index + 1,
          }}
          focused={index === selectedIndex}
          onHeadFocus={(event) => {
            // Keyboard navigation reveals the whole card before its actions.
            if (event.target.matches(":focus-visible")) {
              revealRef.current = row.id !== selectedId;
              setSelectedId(row.id);
              setOpenId((current) => current === row.id ? current : null);
            }
          }}
          display={resolve(row.booking)}
          welfare={getWelfare(row.booking)}
          payment={paymentOf(row.booking)}
          lastVisit={formatLastVisit(lastVisitFor(row.booking))}
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
          expanded={openId === row.id}
          onToggle={() => toggle(row.id)}
        />
      ))}
    </ul>
  );
}
