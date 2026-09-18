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
    <details data-collected-summary className="mt-5 border-t border-slate-200 pt-3">
      <summary
        className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-0.5 text-[14px] text-slate-600 [&::-webkit-details-marker]:hidden"
      >
        <span>Collected today</span>
        <span className="flex flex-wrap items-center justify-end gap-x-2 text-right">
          {/*
            Stated before anyone opens anything. A total that silently excluded
            a dog who walked out owing £42 is a total that reads as a good day.
          */}
          {owed > 0 ? (
            <span data-collected-owed className="font-medium tabular-nums text-rose-700">
              {moneyLabel(owed)} owed
            </span>
          ) : null}
          <span className="font-medium tabular-nums text-brand-purple">
            {moneyLabel(total)} · {dogLabel(rows.length)}
          </span>
        </span>
      </summary>

      {rows.length === 0 ? (
        <p className="px-0.5 py-2 text-[14px] text-slate-400">Nothing collected yet.</p>
      ) : (
        <>
          {/* The split first: it is what the end of the day is actually for. */}
          {byMethod.length > 1 ? (
            <div className="flex flex-wrap gap-x-5 gap-y-1 border-t border-slate-200 px-0.5 py-2 text-[13px] text-slate-600">
              {byMethod.map((entry) => (
                <span key={entry.method}>
                  {entry.label}{" "}
                  <b className="font-medium tabular-nums text-brand-purple">
                    {moneyLabel(entry.amount)}
                  </b>{" "}
                  <span className="text-slate-400">· {dogLabel(entry.count)}</span>
                </span>
              ))}
            </div>
          ) : null}

          <ul className="m-0 list-none p-0">
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
                  className="flex items-center justify-between gap-3 border-t border-slate-200 px-0.5 py-[7px] text-[14px] text-slate-600"
                >
                  <span className="truncate text-brand-purple">{name}</span>
                  <span
                    className={`whitespace-nowrap tabular-nums ${row.settled ? "" : "font-medium text-rose-700"}`}
                  >
                    {moneyLabel(row.amount)}{" "}
                    {/*
                      "owed" rather than a colour or an icon. A row that reads
                      "£42 card" and one that reads "£42 owed" are opposite
                      facts, and the difference must survive being read aloud.
                    */}
                    <span className={row.settled ? "text-slate-500" : ""}>
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
