// What has gone home, and what it took.
//
// Collected dogs leave the stack — the list above is the work still in front of
// you, and a finished dog sitting in it is just something to read past. They
// land here instead, closed by default, with the running total on the closed
// row so the one number anybody wants mid-shift needs no tap at all.
//
// Cash and card are separated because that is the question the till actually
// asks at the end of the day. The settled figures come from `buildTakingsByMethod`,
// including the per-dog rows, so the list and the total it sits under cannot
// disagree — computing the rows here would reach the pricing chain by a
// different route and produce a list that visibly fails to add up.
//
// The LIST, though, is every collected dog, not only the paying ones. Those are
// two different questions and this summary answers both: the total is what is
// in the drawer, and the list is who has left. Deriving the list from the
// takings meant a dog handed back without paying appeared nowhere on the screen
// at all — not in the stack, which it had left, and not here (#878). That is
// the one case that actually costs the salon money, so it is also the one case
// that is stated on the closed row, where nobody has to go looking for it.
import { ChevronDown } from "lucide-react";
import { titleCase } from "../../../../utils/text";

function moneyLabel(amount) {
  return Number.isInteger(amount) ? `£${amount}` : `£${amount.toFixed(2)}`;
}

function dogLabel(count) {
  return count === 1 ? "1 dog" : `${count} dogs`;
}

export function CollectedSummary({ takings, rows = [], resolve }) {
  const total = takings?.total ?? 0;
  const byMethod = takings?.byMethod ?? [];

  const owing = rows.filter((row) => !row.settled);
  const owed = owing.reduce((sum, row) => sum + (row.amount || 0), 0);

  return (
    <details data-collected-summary className="group/collected">
      <summary
        className="flex min-h-14 cursor-pointer list-none items-center gap-3 rounded-card px-4 py-3 text-sm text-ink-muted outline-none focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink [&::-webkit-details-marker]:hidden"
      >
        <span className="shrink-0">Collected today</span>
        <span className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-x-2 gap-y-1 text-right">
          {/*
            Stated before anyone opens anything. A total that silently excluded
            a dog who walked out owing £42 is a total that reads as a good day.
          */}
          {owed > 0 ? (
            <span data-collected-owed className="font-medium tabular-nums text-rose-700">
              {moneyLabel(owed)} owed
            </span>
          ) : null}
          <span className="font-medium tabular-nums text-brand-ink">
            {moneyLabel(total)} · {dogLabel(rows.length)}
          </span>
        </span>
        <ChevronDown size={16} aria-hidden="true" className="shrink-0 motion-safe:transition-transform group-open/collected:rotate-180" />
      </summary>

      {rows.length === 0 ? (
        <p className="px-4 pb-3 text-sm text-ink-muted">Nothing collected yet.</p>
      ) : (
        <>
          {/* The split first: it is what the end of the day is actually for. */}
          {byMethod.length > 1 ? (
            <div className="mx-4 flex flex-wrap gap-x-5 gap-y-1 border-t border-brand-paper-line py-2 text-body text-ink-muted">
              {byMethod.map((entry) => (
                <span key={entry.method}>
                  {entry.label}{" "}
                  <b className="font-medium tabular-nums text-brand-ink">
                    {moneyLabel(entry.amount)}
                  </b>{" "}
                  <span className="text-ink-muted">· {dogLabel(entry.count)}</span>
                </span>
              ))}
            </div>
          ) : null}

          <ul className="m-0 list-none px-4 pb-2">
            {rows.map((row) => {
              const display = resolve(row.booking);
              const name = titleCase(
                display?.dogMissing ? "Unnamed booking" : display?.dogName || row.booking.dogName,
              );
              return (
                <li
                  key={String(row.booking.id)}
                  data-collected-row
                  data-settled={row.settled ? "true" : "false"}
                  className="flex items-center justify-between gap-3 border-t border-brand-paper-line py-2 text-sm text-ink-muted"
                >
                  <span className="truncate text-brand-ink">{name}</span>
                  <span
                    className={`whitespace-nowrap tabular-nums ${row.settled ? "" : "font-medium text-rose-700"}`}
                  >
                    {moneyLabel(row.amount)}{" "}
                    {/*
                      "owed" rather than a colour or an icon. A row that reads
                      "£42 card" and one that reads "£42 owed" are opposite
                      facts, and the difference must survive being read aloud.
                    */}
                    <span className={row.settled ? "text-ink-muted" : ""}>
                      {row.settled ? row.label.toLowerCase() : row.label}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </details>
  );
}
