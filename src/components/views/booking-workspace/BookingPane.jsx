import { useMemo } from "react";
import {
  CalendarDays,
  Check,
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
import { seatOccupancy } from "./bookingComposerModel.js";
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

// Hidden on phones: at 375px this five-day strip costs more height than the
// slot list it sits above, and the ‹ › arrows already move the date. Restored
// from `sm` up, where the height is there to spend.
function DateStrip({ dates, currentDateStr, daySettings, bookingsByDate, dailyCap, onPickDate }) {
  return (
    <div role="tablist" aria-label="Diary dates" className="hidden shrink-0 grid-cols-5 border-y border-slate-200 bg-white sm:grid">
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
            className={`min-h-[52px] border-r border-slate-100 px-1 py-1.5 text-center transition-colors last:border-r-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-purple sm:min-h-[66px] sm:py-2 ${
              // "Which date am I looking at" is orienting information, not a
              // problem — coral is reserved for the latter, so the currently
              // viewed date gets a quiet ink tint instead.
              active ? "bg-brand-purple/[0.06]" : "hover:bg-slate-50"
            }`}
          >
            <span className="block text-micro font-bold uppercase tracking-wide text-slate-500">
              {date.dateObj.toLocaleDateString("en-GB", { weekday: "short" })}
            </span>
            <span className="mt-0.5 block font-display text-lg font-black text-brand-purple">
              {date.dateObj.getDate()}
            </span>
            {open ? (
              <span className="mt-0.5 flex items-center justify-center gap-[3px]" aria-hidden="true">
                {/* A rough fullness read at a glance — precise count is still
                    the accessible name below. Three dots, filled by how much
                    of the daily cap this date has used. */}
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className={`size-1.5 rounded-full ${
                      i < Math.ceil((count / (dailyCap || 1)) * 3) ? "bg-brand-teal" : "bg-slate-200"
                    }`}
                  />
                ))}
              </span>
            ) : null}
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
  dogs,
  emptyStateTitle = "Choose a request first",
  emptyStateBody = "The diary will then check capacity for that recorded dog size.",
  offerActionLabel = "Choose",
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
  // Capacity is computed for whatever dogs the caller supplies. The inbox
  // passes an explicit multi-dog array; the Booking Desk still passes its
  // single derived `request`, so that shape is normalised here rather than
  // forcing a change on a surface this work doesn't touch.
  const capacityDogs = useMemo(() => {
    if (Array.isArray(dogs)) {
      return dogs
        .filter((dog) => dog?.size)
        .map((dog) => ({ id: dog.id, size: dog.size }));
    }
    if (request?.size && request.dogName) {
      return [{ id: request.dog?.id || `${request.id}-dog`, size: request.size }];
    }
    return [];
  }, [dogs, request]);

  const hasSelection = capacityDogs.length > 0;

  const bookableSlots = useMemo(() => {
    if (!open || !hasSelection) return new Set();
    const allocations = findGroupedSlots(
      capacityDogs,
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
  }, [activeSlots, capacityDogs, dailyDogCap, dayBookings, hasSelection, open, settings.overrides]);

  function moveDay(delta) {
    const next = new Date(currentDate);
    next.setDate(next.getDate() + delta);
    onPickDate(next);
  }

  return (
    <section aria-labelledby="booking-desk-diary" className="flex min-h-0 flex-1 flex-col bg-white">
      {/* Paging days, and even knowing which day is in view, isn't
          actionable until there's a dog to check capacity against — so
          none of this diary chrome exists on screen until hasSelection is
          true. Before that, the pane is just the empty state below. */}
      {hasSelection ? (
        <>
          {/* Vertical budget matters most on a 375px phone, where this header
              competes directly with the slot list it exists to introduce. The
              title and its explanatory line are desktop-only; narrow keeps just
              the date and its two arrows. */}
          <div className="flex shrink-0 items-center justify-between gap-2 px-3 py-2 sm:min-h-[62px]">
            <div className="hidden sm:block">
              <h2 id="booking-desk-diary" className="font-display text-lg font-extrabold text-brand-purple">Diary</h2>
              <p className="text-caption text-slate-500">Read-only · choose up to 3 draft times</p>
            </div>
            <div className="flex w-full items-center justify-between gap-1 sm:w-auto sm:justify-end">
              <button type="button" onClick={() => moveDay(-1)} aria-label="Previous day" className="inline-flex size-11 shrink-0 items-center justify-center rounded-control border border-slate-200 text-brand-purple hover:bg-slate-50">
                <ChevronLeft aria-hidden="true" size={18} />
              </button>
              <div className="min-w-0 flex-1 truncate text-center font-display text-sm font-extrabold text-brand-purple sm:min-w-[150px] sm:flex-none">
                {formatDate(currentDateStr, { year: "numeric" })}
              </div>
              <button type="button" onClick={() => moveDay(1)} aria-label="Next day" className="inline-flex size-11 shrink-0 items-center justify-center rounded-control border border-slate-200 text-brand-purple hover:bg-slate-50">
                <ChevronRight aria-hidden="true" size={18} />
              </button>
            </div>
          </div>

          <DateStrip
            dates={dates}
            currentDateStr={currentDateStr}
            daySettings={daySettings}
            bookingsByDate={bookingsByDate}
            dailyCap={dailyDogCap}
            onPickDate={onPickDate}
          />
        </>
      ) : null}

      {!hasSelection ? (
        <div id="booking-desk-diary" className="flex flex-1 flex-col items-center justify-center px-6 text-center text-slate-500">
          <PawPrint aria-hidden="true" size={28} className="text-slate-300" />
          <p className="mt-3 text-sm font-bold text-brand-purple">{emptyStateTitle}</p>
          <p className="mt-1 text-xs">{emptyStateBody}</p>
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
          const choice = { dateStr: currentDateStr, slot };
          const selected = choicesSet.has(slotChoiceKey(choice));
          const bookable = bookableSlots.has(slot);
          const occupancy = seatOccupancy(slot, dayBookings, activeSlots);
          const capacityCheck = hasSelection
            ? canBookSlot(dayBookings, slot, capacityDogs[0].size, activeSlots, {
                overrides: settings.overrides?.[slot] || {},
                dogId: capacityDogs[0].id,
              })
            : null;
          const disabled = !selected && (!open || !hasSelection || !bookable || choices.length >= 3);
          const free = !open ? null : occupancy.free;

          return (
            <button
              key={slot}
              type="button"
              disabled={disabled}
              onClick={() => onToggleChoice(choice)}
              aria-pressed={selected}
              title={disabled && capacityCheck?.reason ? capacityCheck.reason : undefined}
              className={`grid w-full grid-cols-[52px_minmax(0,1fr)_auto] items-start text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-purple ${
                selected
                  ? "bg-brand-teal/[0.08]"
                  : bookable && open
                    ? "bg-white hover:bg-slate-50"
                    : "bg-slate-50/60"
              } disabled:cursor-not-allowed`}
            >
              {/* The number staff actually scan for — how many spaces —
                  leads the row, sized to match. Time is real information
                  too, but it's the row's label, not its headline. */}
              <span className="flex min-h-[62px] flex-col items-center justify-center gap-0.5 py-3">
                <span
                  className={`font-display text-xl font-black leading-none ${
                    !open ? "text-slate-300" : free > 0 ? "text-brand-teal-text" : "text-slate-300"
                  }`}
                >
                  {!open ? "–" : free}
                </span>
                <span className="text-[9px] font-bold uppercase tracking-wide text-slate-400">
                  {!open ? "closed" : free > 0 ? (free === 1 ? "space" : "spaces") : "full"}
                </span>
              </span>
              <span className="min-w-0 px-3 py-3">
                <span className="block text-xs font-bold text-brand-purple">{slot}</span>
                {/* Existing bookings stay visible even when the slot is
                    selected — that context is exactly what staff want to
                    sanity-check before offering or booking a time. */}
                {occupancy.dogs.length > 0 ? (
                  <span className="mt-1 block">
                    {occupancy.dogs.map((dog, index) => (
                      <span
                        key={`${dog.name}-${index}`}
                        className="block break-words text-micro text-slate-500"
                      >
                        {dog.name}
                        {dog.breed ? ` (${dog.breed})` : ""} booked
                      </span>
                    ))}
                  </span>
                ) : null}
              </span>
              <span className="px-3 py-3 text-right">
                {selected ? (
                  // Same teal-and-check language as a chosen dog — settles
                  // in rather than snapping, so it reads as calm, not a
                  // toggle firing.
                  <span className="motion-safe:animate-[popIn_140ms_ease-out] inline-flex min-h-6 items-center gap-1 rounded-full bg-brand-teal/15 px-2 text-micro font-bold text-brand-teal-text">
                    <Check aria-hidden="true" size={12} />
                    Selected
                  </span>
                ) : bookable && open ? (
                  <span className="text-micro font-bold text-brand-teal-text">
                    {offerActionLabel}
                  </span>
                ) : !open ? (
                  <span className="text-micro font-semibold text-slate-400">Closed</span>
                ) : hasSelection ? (
                  // Only a claim about the CURRENT selection. With no dogs
                  // chosen there is nothing to not fit, so saying "No space"
                  // would contradict the free-seat count on the left.
                  <span className="text-micro font-semibold text-slate-400">No space</span>
                ) : null}
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
