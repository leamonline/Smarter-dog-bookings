// Manage availability — a modal listing today's unbooked slots so staff can
// choose which are open for last-minute online booking. "Online" is the
// whole-slot same-day flag (day_settings.immediate_slots); toggling it is the
// only change this modal makes. Size labels show what physically fits (from the
// capacity engine) — they are honest indicators, not per-size settings, because
// the app has no per-size online availability. All counts come from the same
// rows they head, so they can never disagree.
import { useId } from "react";
import { X } from "lucide-react";
import { ModalShell, HeaderIconButton } from "../../modals/shell/index.js";
import { Chip, PrimaryButton, SecondaryButton, TertiaryLink } from "./parts.jsx";

/** "Slots 1 & 2 free" / "Slot 1 free" — nods to the two physical seats. */
function seatsLabel(seatsFree) {
  if (seatsFree >= 2) return "Slots 1 & 2 free";
  return "Slot 1 free";
}

/** A size that physically fits this slot — an indicator, not a toggle. */
function SizeChip({ label }) {
  return (
    <Chip className="bg-brand-teal/10 text-brand-teal-text" title={`${label} dogs fit this slot`}>
      {label}
    </Chip>
  );
}

function AvailabilityRow({ row, onToggleImmediate, onNewBooking }) {
  const sizes = [
    row.sizes.small && "Small",
    row.sizes.medium && "Medium",
    row.sizes.large && "Large",
  ].filter(Boolean);
  // Online but past the 30-min cutoff: flagged, yet not bookable right now.
  const pastCutoff = row.isOnline && !row.customerReachable;

  return (
    <li className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
      <span className="font-bold text-slate-800 text-[15px] tabular-nums w-14 shrink-0">{row.slot}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[13px] font-semibold text-slate-700">{seatsLabel(row.seatsFree)}</span>
          {row.isOnline ? (
            <Chip dot className="bg-brand-teal/15 text-brand-teal-text">Online</Chip>
          ) : (
            <Chip dot className="bg-slate-100 text-slate-600">Hidden</Chip>
          )}
          {pastCutoff && (
            <span className="text-[12px] text-slate-500">past today&apos;s cutoff</span>
          )}
        </div>
        <div className="flex items-center gap-1 flex-wrap mt-1.5">
          <span className="text-[11px] font-semibold text-slate-500 mr-0.5">Fits:</span>
          {sizes.map((s) => (
            <SizeChip key={s} label={s} />
          ))}
        </div>
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        {row.isOnline ? (
          <SecondaryButton
            onClick={() => onToggleImmediate(row.slot)}
            aria-label={`Take ${row.slot} offline`}
          >
            Take offline
          </SecondaryButton>
        ) : (
          <PrimaryButton
            onClick={() => onToggleImmediate(row.slot)}
            aria-label={`Put ${row.slot} online`}
          >
            Put online
          </PrimaryButton>
        )}
        {onNewBooking && (
          <TertiaryLink tone="purple" onClick={() => onNewBooking(row.slot)}>
            Book in
          </TertiaryLink>
        )}
      </div>
    </li>
  );
}

export function AvailabilityModal({ onClose, view, dogsBooked, onToggleImmediate, onNewBooking }) {
  const titleId = useId();
  const { rows, unbookedSlots, onlineCount, nextOnlineSlot } = view;

  return (
    <ModalShell
      onClose={onClose}
      titleId={titleId}
      accent="var(--color-brand-teal)"
      widthClass="w-[min(560px,95vw)]"
      maxHeightClass="max-h-[90vh]"
      zIndex={1200}
      header={
        <header className="flex items-start justify-between gap-3 px-5 pt-5 pb-4 bg-[var(--color-brand-paper)]">
          <div className="flex-1 min-w-0">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Availability</span>
            <h2
              id={titleId}
              className="text-xl md:text-2xl font-bold font-display text-brand-purple leading-tight mt-1"
            >
              Manage availability
            </h2>
          </div>
          <HeaderIconButton label="Close" onClick={onClose}>
            <X size={16} strokeWidth={2.2} aria-hidden="true" />
          </HeaderIconButton>
        </header>
      }
    >
      <div className="px-5 pb-5">
        <div className="rounded-xl bg-slate-50 border border-slate-100 px-4 py-3 mb-3">
          <p className="text-[13px] text-slate-700">
            <span className="font-bold text-slate-800">{dogsBooked}</span> {dogsBooked === 1 ? "dog" : "dogs"} booked
            {" · "}
            <span className="font-bold text-slate-800">{unbookedSlots}</span> unbooked {unbookedSlots === 1 ? "slot" : "slots"}
            {" · "}
            <span className="font-bold text-slate-800">{onlineCount}</span> online
          </p>
          <p className="text-[13px] text-slate-600 mt-0.5">
            Next online slot:{" "}
            {nextOnlineSlot ? (
              <span className="font-bold text-brand-teal-text tabular-nums">{nextOnlineSlot}</span>
            ) : (
              <span className="font-semibold text-slate-500">none open</span>
            )}
          </p>
        </div>

        <p className="text-[12px] text-slate-500 mb-2.5">
          Online slots let customers book themselves today, up to 30 minutes before the start. Hidden slots
          stay yours to fill.
        </p>

        {rows.length === 0 ? (
          <p className="rounded-xl border border-slate-200 bg-white px-4 py-8 text-center text-[13px] text-slate-600">
            No free slots left today.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {rows.map((row) => (
              <AvailabilityRow
                key={row.slot}
                row={row}
                onToggleImmediate={onToggleImmediate}
                onNewBooking={onNewBooking}
              />
            ))}
          </ul>
        )}
      </div>
    </ModalShell>
  );
}
