// ============================================================
// src/components/dashboard/RightRailCalmRow.jsx
//
// Compact summary row for the right rail's calm cards. Replaces a
// stack of muted cards with a single one-line strip of tertiary-link
// chips — used both when every card is calm (the full four) and when
// only some are (the calm remainder sitting below the loud cards).
// Each chip keeps its card's hue so it stays identifiable at a glance.
// ============================================================

import { Fragment } from "react";
import { ArrowRight } from "lucide-react";

function Chip({ label, onClick, hue }) {
  // Per-card hue is preserved (faintly) so each chip is identifiable
  // at a glance even at this compact size.
  const colour = {
    emerald: "text-emerald-700 hover:bg-emerald-50",
    amber: "text-amber-700 hover:bg-amber-50",
    sky: "text-sky-700 hover:bg-sky-50",
    rose: "text-rose-700 hover:bg-rose-50",
  }[hue];
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-full bg-transparent border-none cursor-pointer font-[inherit] text-[12px] font-semibold ${colour}`}
    >
      {label}
      <ArrowRight size={11} strokeWidth={2.5} aria-hidden="true" />
    </button>
  );
}

// chips: [{ key, label, onClick, hue }] — one per calm card, in display order.
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
      className="rounded-2xl bg-neutral-50 border border-neutral-200/60 px-3 py-2 flex flex-wrap items-center gap-x-1 gap-y-1 text-neutral-600"
    >
      {chips.map((chip, i) => (
        <Fragment key={chip.key}>
          {i > 0 && (
            <span className="text-neutral-300" aria-hidden="true">·</span>
          )}
          <Chip label={chip.label} onClick={chip.onClick} hue={chip.hue} />
        </Fragment>
      ))}
    </div>
  );
}
