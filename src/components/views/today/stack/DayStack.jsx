// The day, top to bottom, in appointment order.
//
// One card open at a time. Not a rule for its own sake: the cards are tinted by
// status and an open one is tall, so two open at once pushes the rest of the
// day off screen and turns a list you scan into a page you scroll. Opening a
// second closes the first.
//
// This component reads. It does not write — every action lives on the card in a
// later step, and all of them go through `tokenActions` and the existing
// booking write path.
import { useCallback, useState } from "react";
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
  emptyMessage = "No bookings on this date",
}) {
  const [openId, setOpenId] = useState(null);

  const toggle = useCallback((id) => {
    setOpenId((current) => (current === id ? null : id));
  }, []);

  if (rows.length === 0) {
    return (
      <p className="px-4 py-10 text-center text-[14px] text-slate-500">{emptyMessage}</p>
    );
  }

  return (
    <ul data-day-stack className="m-0 flex list-none flex-col gap-2 p-0">
      {rows.map((row) => (
        <StackCard
          key={row.id}
          row={row}
          display={resolve(row.booking)}
          welfare={getWelfare(row.booking)}
          payment={paymentOf(row.booking)}
          lastVisit={formatLastVisit(lastVisitFor(row.booking))}
          onTheWay={!!onTheWaySignals?.[row.id]}
          // Highlighting dims the rest rather than hiding it. A member of staff
          // asking "which two are late?" still needs to see that the other nine
          // exist, or the list stops being the day.
          dimmed={!!highlightIds && !highlightIds.has(row.id)}
          expanded={openId === row.id}
          onToggle={() => toggle(row.id)}
        />
      ))}
    </ul>
  );
}
