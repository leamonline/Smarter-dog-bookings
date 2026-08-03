import { useMemo } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CornerUpLeft,
  PawPrint,
  RotateCcw,
} from "lucide-react";

import { canBookSlot, findGroupedSlots } from "../../../engine/capacity";
import { excludeCancelled } from "../../../engine/occupancy";
import { buildSlotGrid } from "../../../engine/slotGrid";
import { isDateOpen } from "../../../engine/utils";
import { slotChoiceKey } from "./bookingWorkspaceModel.js";

export function parseDate(dateStr) {
  const [year, month, day] = String(dateStr).split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function formatDate(dateStr, options = {}) {
  if (!dateStr) return "";
  return parseDate(dateStr).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    ...options,
  });
}

function DateStrip({ dates, currentDateStr, daySettings, bookingsByDate, onPickDate }) {
  return (
    <div role="tablist" aria-label="Diary dates" className="grid grid-cols-5 border-y border-slate-200 bg-white">
      {dates.slice(0, 5).map((date) => {
        const active = date.dateStr === currentDateStr;
        const open = isDateOpen(date.dateStr, null, daySettings);
        const count = excludeCancelled(bookingsByDate[date.dateStr] || []).length;
        return (
          <button
            key={date.dateStr}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onPickDate(date.dateObj)}
            className={`min-h-[66px] border-r border-slate-100 px-1 py-2 text-center transition-colors last:border-r-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-purple ${
              active ? "bg-brand-coral-light text-brand-purple" : "hover:bg-slate-50"
            }`}
          >
            <span className="block text-micro font-bold uppercase tracking-wide text-slate-500">
              {date.dateObj.toLocaleDateString("en-GB", { weekday: "short" })}
            </span>
            <span className={`mt-0.5 block font-display text-lg font-black ${active ? "text-brand-coral-text" : "text-brand-purple"}`}>
              {date.dateObj.getDate()}
            </span>
            <span className="mt-0.5 block text-micro font-semibold text-slate-500">
              {open ? `${count} booked` : "Closed"}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function DraftOffer({
  choices,
  onClear,
  compact = false,
  onInsertIntoReply,
  showInsertAction = false,
}) {
  return (
    <div className={compact ? "" : "border-t border-slate-200 pt-3"}>
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-xs font-extrabold text-brand-purple">Draft offer ({choices.length})</h3>
          <p className="mt-0.5 text-micro text-slate-500">Not saved or sent</p>
        </div>
        {choices.length > 0 ? (
          <button type="button" onClick={onClear} className="inline-flex min-h-9 items-center gap-1 rounded-full px-2 text-caption font-bold text-brand-teal-text hover:bg-emerald-50">
            <RotateCcw aria-hidden="true" size={13} /> Clear choices
          </button>
        ) : null}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {choices.length ? choices.map((choice) => (
          <span key={slotChoiceKey(choice)} className="inline-flex min-h-8 items-center rounded-control bg-brand-yellow/20 px-2.5 text-caption font-bold text-brand-purple">
            {formatDate(choice.dateStr)} · {choice.slot}
          </span>
        )) : (
          <span className="text-caption text-slate-500">Choose two or three suitable times from the diary.</span>
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {showInsertAction ? (
          choices.length > 0 ? (
            <button
              type="button"
              onClick={onInsertIntoReply}
              className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full bg-brand-purple px-4 text-xs font-bold text-white hover:bg-brand-purple-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple focus-visible:ring-offset-2"
            >
              <CornerUpLeft aria-hidden="true" size={14} /> Insert into reply
            </button>
          ) : null
        ) : (
          <>
            <button type="button" disabled className="inline-flex min-h-10 items-center justify-center rounded-full bg-slate-200 px-4 text-xs font-bold text-slate-500">
              Send options
            </button>
            <span className="text-caption font-semibold text-slate-500">Sending is not enabled yet</span>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Read-only diary for one request: date movement, capacity-checked slots and an
 * optional draft-offer footer.
 *
 * The footer is rendered only when `onClear` is supplied — Booking Desk's
 * desktop layout keeps the draft offer in its own customer column, so that
 * column passes no clear handler and gets the diary alone.
 */
export function BookingPane({
  request,
  dates,
  currentDateStr,
  daySettings,
  bookingsByDate,
  dailyDogCap,
  choices,
  onToggleChoice,
  onPickDate,
  atLimit,
  onClear,
  onInsertIntoReply,
  showInsertAction = false,
}) {
  const currentDate = parseDate(currentDateStr);
  const settings = daySettings[currentDateStr] || {};
  const open = isDateOpen(currentDateStr, null, daySettings);
  const activeSlots = useMemo(
    () => buildSlotGrid(settings.extraSlots || []),
    [settings.extraSlots],
  );
  const dayBookings = useMemo(
    () => excludeCancelled(bookingsByDate[currentDateStr] || []),
    [bookingsByDate, currentDateStr],
  );
  const choicesSet = useMemo(
    () => new Set(choices.map(slotChoiceKey)),
    [choices],
  );
  const bookableSlots = useMemo(() => {
    if (!open || !request?.size || !request.dogName) return new Set();
    const allocations = findGroupedSlots(
      [{ id: request.dog?.id || `${request.id}-dog`, size: request.size }],
      dayBookings,
      activeSlots,
      dailyDogCap,
      settings.overrides || {},
    );
    return new Set(
      allocations.flatMap((allocation) =>
        allocation.assignments.map((assignment) => assignment.slot),
      ),
    );
  }, [activeSlots, dailyDogCap, dayBookings, open, request, settings.overrides]);

  function moveDay(delta) {
    const next = new Date(currentDate);
    next.setDate(next.getDate() + delta);
    onPickDate(next);
  }

  return (
    <section aria-labelledby="booking-desk-diary" className="flex min-h-0 flex-1 flex-col bg-white">
      <div className="flex min-h-[62px] items-center justify-between gap-2 px-3 py-2">
        <div>
          <h2 id="booking-desk-diary" className="font-display text-lg font-extrabold text-brand-purple">Diary</h2>
          <p className="text-caption text-slate-500">Read-only · choose up to 3 draft times</p>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => moveDay(-1)} aria-label="Previous day" className="inline-flex size-11 items-center justify-center rounded-control border border-slate-200 text-brand-purple hover:bg-slate-50">
            <ChevronLeft aria-hidden="true" size={18} />
          </button>
          <div className="min-w-[128px] text-center font-display text-sm font-extrabold text-brand-purple sm:min-w-[150px]">
            {formatDate(currentDateStr, { year: "numeric" })}
          </div>
          <button type="button" onClick={() => moveDay(1)} aria-label="Next day" className="inline-flex size-11 items-center justify-center rounded-control border border-slate-200 text-brand-purple hover:bg-slate-50">
            <ChevronRight aria-hidden="true" size={18} />
          </button>
        </div>
      </div>

      <DateStrip
        dates={dates}
        currentDateStr={currentDateStr}
        daySettings={daySettings}
        bookingsByDate={bookingsByDate}
        onPickDate={onPickDate}
      />

      {!request ? (
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center text-slate-500">
          <PawPrint aria-hidden="true" size={28} className="text-slate-300" />
          <p className="mt-3 text-sm font-bold text-brand-purple">Choose a request first</p>
          <p className="mt-1 text-xs">The diary will then check capacity for that recorded dog size.</p>
        </div>
      ) : !request.size ? (
        <div className="m-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <CircleAlert aria-hidden="true" size={17} className="mt-0.5 shrink-0" />
          Capacity cannot be checked until the dog has an authoritative size on file.
        </div>
      ) : !open ? (
        <div className="m-3 flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
          <CalendarDays aria-hidden="true" size={17} className="mt-0.5 shrink-0" />
          The salon is closed on this date. Existing appointments remain visible for context.
        </div>
      ) : atLimit ? (
        <div role="status" className="m-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <CircleAlert aria-hidden="true" size={17} className="mt-0.5 shrink-0" />
          Three draft times are already selected. Remove one before choosing another.
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {activeSlots.map((slot) => {
          const slotBookings = dayBookings.filter((booking) => booking.slot === slot);
          const choice = { dateStr: currentDateStr, slot };
          const selected = choicesSet.has(slotChoiceKey(choice));
          const bookable = bookableSlots.has(slot);
          const capacityCheck = request?.size
            ? canBookSlot(dayBookings, slot, request.size, activeSlots, {
                overrides: settings.overrides?.[slot] || {},
                dogId: request.dog?.id || null,
              })
            : null;
          const disabled = !selected && (!open || !request?.size || !bookable || choices.length >= 3);
          const bookingLabel = slotBookings.length
            ? slotBookings.map((booking) => booking.dogName || "Unknown dog").join(" · ")
            : "Available slot";
          const detailLabel = slotBookings.length
            ? slotBookings.map((booking) => `${booking.breed || booking.size || "Dog"}`).join(" · ")
            : request?.size
              ? "Fits the current request"
              : "Size needed to check";

          return (
            <button
              key={slot}
              type="button"
              disabled={disabled}
              onClick={() => onToggleChoice(choice)}
              aria-pressed={selected}
              title={disabled && capacityCheck?.reason ? capacityCheck.reason : undefined}
              className={`grid min-h-[58px] w-full grid-cols-[58px_minmax(0,1fr)_auto] items-center border-b border-slate-100 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-purple ${
                selected
                  ? "bg-brand-yellow/15"
                  : bookable && open
                    ? "bg-white hover:bg-cyan-50/60"
                    : "bg-slate-50/70"
              } disabled:cursor-not-allowed`}
            >
              <span className="px-2 text-center font-display text-sm font-extrabold text-brand-purple">{slot}</span>
              <span className="min-w-0 border-l border-slate-100 px-3 py-2">
                <span className={`block truncate text-xs font-bold ${selected ? "text-brand-teal-text" : slotBookings.length ? "text-brand-purple" : bookable ? "text-brand-teal-text" : "text-slate-500"}`}>
                  {selected ? `${formatDate(currentDateStr)} · ${slot}` : bookingLabel}
                </span>
                <span className="mt-0.5 block truncate text-micro text-slate-500">{detailLabel}</span>
              </span>
              <span className="px-3 text-right">
                {selected ? (
                  <span className="inline-flex min-h-7 items-center rounded-full bg-brand-yellow px-2 text-micro font-black text-brand-purple">Draft</span>
                ) : bookable && open ? (
                  <span className="inline-flex min-h-7 items-center rounded-full border border-brand-teal/30 bg-white px-2 text-micro font-bold text-brand-teal-text">Choose</span>
                ) : (
                  <span className="text-micro font-semibold text-slate-400">{open ? "No space" : "Closed"}</span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      {onClear ? (
        <div className="shrink-0 border-t border-slate-200 bg-white px-3 py-2 shadow-[0_-5px_20px_rgba(45,0,75,0.08)]">
          <DraftOffer
            choices={choices}
            onClear={onClear}
            compact
            onInsertIntoReply={onInsertIntoReply}
            showInsertAction={showInsertAction}
          />
        </div>
      ) : null}
    </section>
  );
}
