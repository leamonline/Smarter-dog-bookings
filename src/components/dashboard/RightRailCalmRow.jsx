// ============================================================
// src/components/dashboard/RightRailCalmRow.jsx
//
// Compact summary row for the right rail's calm cards. Replaces a
// stack of muted cards with a single one-line strip of tertiary-link
// chips — used both when every card is calm (the full four) and when
// only some are (the calm remainder sitting below the loud cards).
// Every chip shares one calm colour: they all mean "nothing needs you here",
// and the label names the card. Identity colours belong to the loud cards,
// so colour only appears when something needs attention (audit N-22: a red
// "All sorted" read as a problem).
// ============================================================

import { Fragment } from "react";
import { ArrowRight } from "lucide-react";

const CALM_CHIP_COLOUR = "text-emerald-800 hover:bg-emerald-50";

function Chip({ label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-full bg-transparent border-none cursor-pointer font-[inherit] text-xs font-semibold ${CALM_CHIP_COLOUR}`}
    >
      {label}
      <ArrowRight size={11} strokeWidth={2.5} aria-hidden="true" />
    </button>
  );
}

// chips: [{ key, label, onClick }] — one per calm card, in display order.
export function RightRailCalmRow({ chips }) {
  if (!chips || chips.length === 0) return null;
  // The full four collapsing means "all clear"; a calm remainder sitting
  // beneath loud cards is just the quiet items.
  const summaryLabel =
    chips.length >= 4
      ? "Right rail summary, all clear"
      : "Right rail summary, quiet items";
  return (
    <div
      role="status"
      aria-label={summaryLabel}
      className="rounded-card bg-neutral-50 border border-neutral-200/60 px-3 py-2 flex flex-wrap items-center gap-x-1 gap-y-1 text-neutral-600"
    >
      {chips.map((chip, i) => (
        <Fragment key={chip.key}>
          {i > 0 && (
            <span className="text-neutral-300" aria-hidden="true">·</span>
          )}
          <Chip label={chip.label} onClick={chip.onClick} />
        </Fragment>
      ))}
    </div>
  );
}
