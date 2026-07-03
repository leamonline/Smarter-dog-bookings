import { Section } from "./ReportWidgets.jsx";

// 2A — "Which days and slots are hardest to fill?"
// Fill % = countable bookings / capacity (slots: openDays×2 seats; weekdays:
// that weekday's open days × the 14/day cap). Lower = harder to fill.
export function SlotFillReport({ slotFill, slotLevers }) {
  const { bySlot, byWeekday, quietestWeekday, openDays } = slotFill;
  const openWeekdays = byWeekday.filter((d) => d.open && d.capacity > 0);
  // Hardest-to-fill slots first (lowest fill), only slots that could be booked.
  const rankedSlots = bySlot.filter((s) => s.capacity > 0).sort((a, b) => a.fillPct - b.fillPct);

  const insightBits = [];
  if (quietestWeekday && openDays >= 3) {
    insightBits.push(
      `${quietestWeekday.label} is quietest at ${quietestWeekday.fillPct.toFixed(0)}% of capacity — a good day to message suitable regulars or run an offer.`,
    );
  }
  if (slotLevers && slotLevers.extraOpened > 0) {
    const unbooked = slotLevers.extraOpened - slotLevers.extraBooked;
    if (unbooked > 0) {
      insightBits.push(`${unbooked} of ${slotLevers.extraOpened} extra slot${slotLevers.extraOpened !== 1 ? "s" : ""} you opened went unbooked.`);
    }
  }
  const insight = insightBits.join(" ") || undefined;

  if (openDays === 0) {
    return (
      <Section title="Hardest to fill" accent="var(--color-brand-coral)">
        <div className="text-caption text-ink-muted font-medium">
          No open days in this period yet.
        </div>
      </Section>
    );
  }

  return (
    <Section title="Hardest to fill" accent="var(--color-brand-coral)" insight={insight}>
      {/* By weekday */}
      <div className="mb-4">
        <div className="text-xs font-semibold text-slate-500 mb-2">By weekday · fill of capacity</div>
        <div className="flex flex-col gap-1.5">
          {openWeekdays.map((d) => (
            <div key={d.label} className="flex items-center gap-2">
              <span className="text-caption font-bold text-slate-600 w-[34px] shrink-0">{d.label}</span>
              <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden" role="img" aria-label={`${d.label}: ${d.fillPct.toFixed(0)}% full`}>
                <div className="h-full rounded-full bg-brand-teal/60 transition-all" style={{ width: `${Math.min(d.fillPct, 100)}%` }} />
              </div>
              <span className="text-micro font-extrabold text-slate-500 w-[38px] text-right">{d.fillPct.toFixed(0)}%</span>
            </div>
          ))}
        </div>
      </div>

      {/* Hardest slots */}
      <div className="pt-3 border-t border-slate-100">
        <div className="text-xs font-semibold text-slate-500 mb-2">By slot · quietest first</div>
        <div className="flex flex-col gap-1.5">
          {rankedSlots.map((s) => (
            <div key={s.slot} className="flex items-center gap-2">
              <span className="text-caption font-bold text-slate-600 w-[50px] shrink-0">{s.label}</span>
              <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden" role="img" aria-label={`${s.label}: ${s.fillPct.toFixed(0)}% full`}>
                <div className={`h-full rounded-full transition-all ${s.fillPct < 40 ? "bg-brand-coral/60" : "bg-brand-teal/50"}`} style={{ width: `${Math.min(s.fillPct, 100)}%` }} />
              </div>
              <span className="text-micro font-extrabold text-slate-500 w-[38px] text-right">{s.fillPct.toFixed(0)}%</span>
            </div>
          ))}
        </div>
      </div>

      {slotLevers && (slotLevers.extraOpened > 0 || slotLevers.immediateFlagged > 0) && (
        <div className="mt-3 pt-3 border-t border-slate-100 text-caption text-ink-muted font-medium flex flex-wrap gap-x-4 gap-y-1">
          {slotLevers.extraOpened > 0 && (
            <span>Extra slots: <strong className="text-slate-700">{slotLevers.extraBooked}/{slotLevers.extraOpened}</strong> booked</span>
          )}
          {slotLevers.immediateFlagged > 0 && (
            <span>Last-minute: <strong className="text-slate-700">{slotLevers.immediateBooked}/{slotLevers.immediateFlagged}</strong> booked</span>
          )}
        </div>
      )}
    </Section>
  );
}
