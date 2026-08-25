// Gone home, and the day's shape.
//
// Finished work is the least interesting thing on the screen and gets the
// least ink: one line — "✓ 8 gone home" — that opens into the actual dogs if
// somebody needs one. Normality collapses; only an unpaid balance among them
// earns a word on the closed line, because that is the one thing that can
// still go wrong after a dog has left.
//
// Beneath it, the day's facts on one hairline-separated row: how many have
// arrived, what is in the till, what the day is worth, and where it sits
// against the daily cap. Restrained on purpose — this is a salon board, not
// an accounting screen.
import { useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { DogTokenAvatar } from "./DogTokenAvatar.jsx";
import { PaymentState, dogCountLabel, formatMoney } from "../parts.jsx";

export function CompletedDogs({ tokens, isToday, resolve, paymentOf, onOpenBooking, onOpenToken }) {
  const [expanded, setExpanded] = useState(false);
  if (tokens.length === 0) return null;

  const unpaid = tokens.filter((token) => token.entry.actionReasons?.includes("payment")).length;
  const label = isToday ? "gone home" : "went home";

  return (
    <section
      aria-label={`Gone home, ${dogCountLabel(tokens.length)}${unpaid ? `, ${unpaid} unpaid` : ""}`}
      className="border-t border-brand-paper-line pt-2"
    >
      <button
        type="button"
        aria-expanded={expanded}
        aria-label={`${expanded ? "Hide" : "Show"} ${dogCountLabel(tokens.length)} ${label}`}
        onClick={() => setExpanded((value) => !value)}
        className="inline-flex min-h-11 items-center gap-2 rounded-control px-1 text-[13px] font-bold text-slate-600 outline-none transition-colors hover:bg-brand-purple/[0.04] hover:text-brand-purple focus-visible:ring-2 focus-visible:ring-brand-purple focus-visible:ring-offset-2"
      >
        <Check size={15} strokeWidth={3} aria-hidden="true" className="text-brand-teal" />
        <span className="tabular-nums">{tokens.length}</span> {label}
        {unpaid > 0 ? (
          <span className="text-[12px] font-bold text-brand-coral-text">
            {unpaid} unpaid
          </span>
        ) : null}
        <ChevronDown
          size={15}
          aria-hidden="true"
          className={`text-slate-400 motion-safe:transition-transform ${expanded ? "rotate-180" : ""}`}
        />
      </button>

      {expanded ? (
        <ul className="mt-2 grid list-none grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-x-3 gap-y-1">
          {tokens.map((token) => {
            const display = resolve(token.booking);
            const payment = paymentOf(token.booking);
            return (
              <li key={token.booking.id} data-booking-id={token.booking.id} className="min-w-0">
                <button
                  type="button"
                  data-dog-token
                  aria-haspopup="menu"
                  aria-label={`${display.dogName}, ${token.statusText} — open actions`}
                  onClick={() => (onOpenToken ? onOpenToken(token) : onOpenBooking?.(token.booking.id))}
                  className="flex min-h-12 w-full min-w-0 items-center gap-2.5 rounded-xl px-1 text-left outline-none transition-colors hover:bg-brand-purple/[0.04] focus-visible:ring-2 focus-visible:ring-brand-purple focus-visible:ring-offset-2"
                >
                  <DogTokenAvatar
                    name={display.dogName}
                    seed={token.booking._dogId || token.booking.id}
                    size={34}
                    className="opacity-70"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-display text-[14px] font-bold leading-tight text-slate-600">
                      {display.dogName}
                    </span>
                    <span className="block truncate text-[11px] leading-tight text-slate-400">
                      {token.entry.timingLabel || "Collected"}
                    </span>
                  </span>
                  <PaymentState
                    payment={payment}
                    actionReason={token.entry.actionReasons?.includes("payment")}
                  />
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}

/**
 * The day's facts, one quiet row. Kept from the previous end-of-day strip
 * unchanged in substance — the numbers staff actually cash up against.
 */
export function EndOfDayFacts({ summary, takings, capacityTotal }) {
  if (!summary) return null;
  const overCap = summary.dogsBooked > capacityTotal;

  return (
    <div
      aria-label="End of day"
      role="group"
      className="flex flex-wrap items-baseline gap-x-5 gap-y-1 border-t border-brand-paper-line px-1 pt-2.5 text-[12px] text-slate-500"
    >
      {summary.arrived > 0 ? (
        <span className="whitespace-nowrap">
          <strong className="font-bold text-slate-700 tabular-nums">{summary.arrived}</strong> arrived so far
        </span>
      ) : (
        <span className="whitespace-nowrap">No dogs have arrived yet</span>
      )}
      {takings && takings.total > 0 ? (
        <span className="min-w-0">
          Taken <strong className="font-bold text-slate-700 tabular-nums">{formatMoney(takings.total)}</strong>
          {takings.byMethod.map((method) => (
            <span key={method.method} className="whitespace-nowrap">
              {" · "}{method.label} <span className="tabular-nums">{formatMoney(method.amount)}</span>
            </span>
          ))}
        </span>
      ) : null}
      <span className="whitespace-nowrap">
        Expected <strong className="font-bold text-slate-700 tabular-nums">{formatMoney(summary.expectedRevenue)}</strong>
      </span>
      <span className={`whitespace-nowrap ${overCap ? "font-bold text-brand-coral-text" : ""}`}>
        Capacity{" "}
        <strong className={`font-bold tabular-nums ${overCap ? "text-brand-coral-text" : "text-slate-700"}`}>
          {summary.dogsBooked}/{capacityTotal}
        </strong>
        {overCap ? " — over the daily cap" : ""}
      </span>
    </div>
  );
}
