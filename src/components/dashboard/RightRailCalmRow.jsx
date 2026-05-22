// ============================================================
// src/components/dashboard/RightRailCalmRow.jsx
//
// Collapsed fallback for the right rail. Renders only when all four
// resolved tones are calm — replaces the four stacked cards with a
// single one-line summary, reclaiming vertical space when the salon
// is fully on top of things. Each chip is a tertiary link to its
// own destination, matching the per-card CTA in the calm tone.
// ============================================================

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

export function RightRailCalmRow({
  onOpenInbox,
  onOpenReminders,
  onOpenWaitlist,
  onOpenTodos,
  remindersTargetLabel,
}) {
  return (
    <div
      role="status"
      aria-label="Right rail summary, all clear"
      className="rounded-2xl bg-neutral-50 border border-neutral-200/60 px-3 py-2 flex flex-wrap items-center gap-x-1 gap-y-1 text-neutral-600"
    >
      <Chip label="Inbox clear" onClick={onOpenInbox} hue="emerald" />
      <span className="text-neutral-300" aria-hidden="true">·</span>
      <Chip
        label={remindersTargetLabel ? `All reminders sent` : "No bookings tomorrow"}
        onClick={onOpenReminders}
        hue="amber"
      />
      <span className="text-neutral-300" aria-hidden="true">·</span>
      <Chip label="Waitlist empty" onClick={onOpenWaitlist} hue="sky" />
      <span className="text-neutral-300" aria-hidden="true">·</span>
      <Chip label="No open tasks" onClick={onOpenTodos} hue="rose" />
    </div>
  );
}
