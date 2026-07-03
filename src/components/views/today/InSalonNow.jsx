// In salon now — dogs checked in or in the bath, longest in first. One glance
// answers "who have we got?", and the primary action moves each dog along to
// Ready (which hands them to the collection queue).
import { SectionCard, StatusPill, WelfareChips, PrimaryButton, TertiaryLink, formatMinutes } from "./parts.jsx";

export function InSalonNow({ entries, resolve, getWelfare, onMarkReady, onOpenBooking }) {
  return (
    <SectionCard title="In salon now" subtitle="Being groomed at the moment" count={entries.length} accent="bg-brand-cyan">
      <ul className="flex flex-col gap-2">
        {entries.map(({ booking: b, inSalonMinutes }) => {
          const d = resolve(b);
          const welfare = getWelfare(b);
          return (
            <li key={b.id} className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-slate-800 text-[15px]">{d.dogName}</span>
                <span className="text-[13px] text-slate-600">{d.owner}</span>
                <StatusPill status={b.status} />
                {inSalonMinutes != null && (
                  <span className="text-[12px] font-semibold text-slate-600">
                    in {formatMinutes(inSalonMinutes)}
                  </span>
                )}
              </div>
              <WelfareChips alerts={welfare.alerts} pregnant={welfare.pregnant} notes={welfare.notes} />
              <div className="flex items-center gap-2 flex-wrap mt-2">
                <PrimaryButton onClick={() => onMarkReady(b)}>Mark ready</PrimaryButton>
                <TertiaryLink tone="purple" onClick={() => onOpenBooking(b.id)}>Open booking</TertiaryLink>
              </div>
            </li>
          );
        })}
      </ul>
    </SectionCard>
  );
}
