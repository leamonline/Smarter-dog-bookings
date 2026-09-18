// The price on a card, and the one-off agreed price behind it.
//
// Two figures, deliberately both visible when they differ. The editable one is
// the BASE price, because that is what `bookings.price_override` stores; the
// total underneath adds the add-ons. Letting staff type a total into a field
// that writes a base would add the add-ons a second time on the next read, and
// nobody would notice until a customer queried their bill.
//
// The value is pounds. `price_override` is numeric and documented in pounds,
// its only constraint is "greater than zero", and a figure entered as pence
// would pass that constraint and overcharge by a hundred times.
import { useEffect, useRef, useState } from "react";

function moneyLabel(amount) {
  return Number.isInteger(amount) ? `£${amount}` : `£${amount.toFixed(2)}`;
}

export function PriceField({
  basePrice,
  addonsTotal = 0,
  subtotal,
  tone,
  dogName,
  editable = false,
  onSave,
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const hasAddons = addonsTotal > 0;

  function commit() {
    setEditing(false);
    const pounds = Number.parseFloat(draft);
    // An unchanged or unparseable figure is a no-op rather than an error: the
    // most common way out of this field is to change your mind.
    if (!Number.isFinite(pounds) || pounds === basePrice) return;
    onSave?.(pounds);
  }

  if (!editable) {
    return (
      <span className="font-medium tabular-nums">{moneyLabel(subtotal)}</span>
    );
  }

  if (editing) {
    return (
      <span className="inline-flex items-center gap-2">
        <input
          ref={inputRef}
          type="number"
          inputMode="decimal"
          step="0.5"
          min="0"
          aria-label={`Price for ${dogName}, in pounds`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          onBlur={commit}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") commit();
            if (e.key === "Escape") setEditing(false);
          }}
          className="min-h-11 w-24 rounded border bg-white px-2 text-right text-[14px] tabular-nums"
          style={{ borderColor: "rgba(0,0,0,0.18)", color: tone.ink }}
        />
        {hasAddons ? (
          <span className="text-[12px]" style={{ color: "var(--card-meta)" }}>
            + {moneyLabel(addonsTotal)}
          </span>
        ) : null}
      </span>
    );
  }

  return (
    <button
      type="button"
      data-edit-price
      aria-label={`Change the price for ${dogName}, currently ${moneyLabel(subtotal)}`}
      onClick={(e) => {
        e.stopPropagation();
        setDraft(String(basePrice));
        setEditing(true);
      }}
      className="min-h-11 border-b border-dashed font-medium tabular-nums"
      style={{ color: "inherit", borderColor: "currentColor" }}
    >
      {hasAddons ? (
        <>
          {moneyLabel(subtotal)}
          <span className="ml-1 text-[12px] font-normal" style={{ color: "var(--card-meta)" }}>
            ({moneyLabel(basePrice)} + {moneyLabel(addonsTotal)})
          </span>
        </>
      ) : (
        moneyLabel(subtotal)
      )}
    </button>
  );
}
