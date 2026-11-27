import { useEffect, useState } from "react";
import { Button } from "../../ui/Button";
import { getNoShowHistory, type NoShowHistory } from "../../../supabase/repositories/noShowHistoryRepo";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/**
 * "Tuesday 24 November 2026" from "2026-11-24". A calendar date, so no time
 * zone applies; built by hand because ICU inserts a comma after the weekday.
 */
function longDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1) return iso;
  return `${WEEKDAYS[date.getUTCDay()]} ${day} ${MONTHS[month - 1]} ${year}`;
}

/**
 * The customer's no-shows under ADR 015: a same-day customer cancellation or a
 * no-show staff marked. Two in 12 months turn the deposit on automatically;
 * staff correct a mistaken no-show by putting the booking back, and can switch
 * the deposit off on this card.
 */
export function NoShowHistoryPanel({ humanId }: { humanId: string }) {
  const [history, setHistory] = useState<NoShowHistory | null>(null);
  const [error, setError] = useState(false);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let live = true;
    setHistory(null); setError(false);
    getNoShowHistory(humanId).then((value) => { if (live) setHistory(value); }).catch(() => { if (live) setError(true); });
    return () => { live = false; };
  }, [humanId, refresh]);
  return <section aria-label="No-shows" className="rounded-tile border border-slate-200 p-3">
    <h3 className="text-sm font-bold">No-shows</h3>
    {error ? <p role="alert">Couldn’t load no-shows. <Button variant="link" size="sm" onClick={() => setRefresh((n) => n + 1)}>Try again</Button></p> : !history ? <p role="status">Loading no-shows…</p> : <>
      <p>{history.count} of {history.threshold} in the last 12 months</p>
      {history.count >= history.threshold && <p className="text-feedback-warning-ink font-semibold">Deposit required: {history.threshold} or more no-shows. Switch Deposit required off if this was a mistake.</p>}
      <p className="text-xs text-slate-500">Cancelling on the day counts as a no-show. One per appointment.{history.since ? ` Counted from ${longDate(history.since)}.` : ""}</p>
      {!history.items.length ? <p>No no-shows recorded.</p> : <ul>{history.items.map((item) => <li key={`${item.bookingDate}-${item.slot ?? ""}-${item.dogNames.join(",")}`} className="border-t py-2 text-sm">
        <p>{longDate(item.bookingDate)}{item.slot ? ` at ${item.slot.slice(0, 5)}` : ""}{item.dogNames.length ? ` · ${item.dogNames.join(", ")}` : ""}</p>
        <p>{item.customerCancelled ? "Customer cancelled on the day" : "Marked as a no-show by staff"}{item.reason && item.reason !== "No-show" ? `: ${item.reason}` : ""}</p>
      </li>)}</ul>}
    </>}
  </section>;
}
