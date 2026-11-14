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

import { canBookSlot } from "../../../engine/capacity";
import { excludeCancelled } from "../../../engine/occupancy";
import { buildSlotGrid } from "../../../engine/slotGrid";
import { isDateOpen } from "../../../engine/utils";
import { seatOccupancy } from "./bookingComposerModel.js";
import { slotChoiceKey } from "./bookingWorkspaceModel.js";
import { describeDayAvailability, findNextAvailableDate } from "./slotFit";
import { Button, Input } from "../../ui";

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
    <div role="tablist" aria-label="Booking dates" className="hidden shrink-0 grid-cols-5 border-y border-slate-200 bg-white sm:grid">
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
            className={`min-h-[52px] border-r border-slate-100 px-1 py-1.5 text-center transition-colors last:border-r-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-ink sm:min-h-[66px] sm:py-2 ${
              // "Which date am I looking at" is orienting information, not a
              // problem — coral is reserved for the latter, so the currently
              // viewed date gets a quiet ink tint instead.
              active ? "bg-brand-ink/[0.06]" : "hover:bg-slate-50"
            }`}
          >
            <span className="block text-micro font-bold uppercase tracking-wide text-slate-500">
              {date.dateObj.toLocaleDateString("en-GB", { weekday: "short" })}
            </span>
            <span className="mt-0.5 block font-display text-lg font-black text-brand-ink">
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
          <h3 className="text-xs font-extrabold text-brand-ink">Draft offer ({choices.length})</h3>
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
          <span key={slotChoiceKey(choice)} className="inline-flex min-h-8 items-center rounded-control bg-brand-yellow/20 px-2.5 text-caption font-bold text-brand-ink">
            {formatDate(choice.dateStr)} · {choice.slot}
          </span>
        )) : (
          <span className="text-caption text-slate-500">Choose two or three suitable times from Bookings.</span>
        )}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {showInsertAction ? (
          choices.length > 0 ? (
            <Button
              className="min-h-10"
              variant="strong"
              size="sm"
              type="button"
              onClick={onInsertIntoReply}
            >
              <CornerUpLeft aria-hidden="true" size={14} /> Insert into reply
            </Button>
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
  emptyStateBody = "Bookings will then check capacity for that recorded dog size.",
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
  requestedDates = [],
}) {
  void offerActionLabel;
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
        .map((dog) => ({ id: dog.id, name: dog.name, size: dog.size, service: dog.service }));
    }
    if (request?.size && request.dogName) {
      return [{ id: request.dog?.id || `${request.id}-dog`, name: request.dogName, size: request.size }];
    }
    return [];
  }, [dogs, request]);

  const hasSelection = capacityDogs.length > 0;

  const fitsBySlot = useMemo(
    () => describeDayAvailability({
      dogs: capacityDogs,
      dayBookings,
      activeSlots,
      dailyDogCap,
      overrides: settings.overrides || {},
    }),
    [activeSlots, capacityDogs, dailyDogCap, dayBookings, settings.overrides],
  );

  const nextAvailable = useMemo(
    () => findNextAvailableDate({
      fromDate: currentDateStr,
      daySettings,
      bookingsByDate,
      dogs: capacityDogs,
      dailyDogCap,
    }),
    [bookingsByDate, capacityDogs, currentDateStr, dailyDogCap, daySettings],
  );

  const bookableSlots = useMemo(() => {
    if (!open || !hasSelection) return new Set();
    return new Set(activeSlots.filter((slot) => fitsBySlot[slot]?.choosable));
  }, [activeSlots, fitsBySlot, hasSelection, open]);

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
          {/* Title, date and arrows stack on a phone so the heading is not clipped. */}
          <div className="flex shrink-0 flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h2 id="booking-desk-diary" className="font-display text-base font-extrabold text-brand-ink sm:text-lg">Suggest appointment times</h2>
              <p className="text-caption font-semibold text-ink-muted">Choose up to 3 options to include in your reply.</p>
            </div>
            <div className="flex w-full items-center justify-between gap-1 sm:w-auto sm:shrink-0 sm:justify-end">
              <button type="button" onClick={() => moveDay(-1)} aria-label="Previous day" className="inline-flex size-11 shrink-0 items-center justify-center rounded-control border border-slate-200 text-brand-ink hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ink">
                <ChevronLeft aria-hidden="true" size={18} />
              </button>
              <Input
                type="date"
                size="sm"
                aria-label="Choose a date"
                value={currentDateStr}
                onChange={(event) => {
                  if (event.target.value) onPickDate(parseDate(event.target.value));
                }}
                className="min-w-0 flex-1 text-center sm:w-[150px] sm:flex-none"
              />
              <button type="button" onClick={() => moveDay(1)} aria-label="Next day" className="inline-flex size-11 shrink-0 items-center justify-center rounded-control border border-slate-200 text-brand-ink hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ink">
                <ChevronRight aria-hidden="true" size={18} />
              </button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 px-3 pb-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={!nextAvailable}
              onClick={() => nextAvailable && onPickDate(parseDate(nextAvailable))}
              aria-describedby={nextAvailable ? undefined : "next-available-reason"}
              className="min-h-11"
            >
              Next available
            </Button>
            {!nextAvailable ? (
              <p id="next-available-reason" className="text-caption font-semibold text-ink-muted">
                No opening in the next 3 weeks.
              </p>
            ) : null}
            {requestedDates.map((date) => (
              <Button
                key={date}
                type="button"
                variant="primary"
                size="sm"
                onClick={() => onPickDate(parseDate(date))}
                className="min-h-11"
              >
                Customer asked for {formatDate(date)}
              </Button>
            ))}
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
          <p className="mt-3 text-sm font-bold text-brand-ink">{emptyStateTitle}</p>
          <p className="mt-1 text-xs">{emptyStateBody}</p>
        </div>
      ) : !open ? (
        <div className="m-3 flex items-start gap-2 rounded-tile border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
          <CalendarDays aria-hidden="true" size={17} className="mt-0.5 shrink-0" />
          The salon is closed on this date. Existing appointments remain visible for context.
        </div>
      ) : atLimit ? (
        <div role="status" className="m-3 flex items-start gap-2 rounded-tile border border-brand-mustard-tint bg-feedback-warning-tint px-3 py-2 text-xs text-feedback-warning-ink">
          <CircleAlert aria-hidden="true" size={17} className="mt-0.5 shrink-0" />
          Three draft times are already selected. Remove one before choosing another.
        </div>
      ) : null}

      {hasSelection ? (
      <div className="min-h-0 flex-1 overflow-y-auto">
        {activeSlots.map((slot) => {
          const choice = { dateStr: currentDateStr, slot };
          const selected = choicesSet.has(slotChoiceKey(choice));
          const bookable = bookableSlots.has(slot);
          const occupancy = seatOccupancy(slot, dayBookings, activeSlots);
          const fit = fitsBySlot[slot];
          const capacityCheck = canBookSlot(dayBookings, slot, capacityDogs[0].size, activeSlots, {
            overrides: settings.overrides?.[slot] || {},
            dogId: capacityDogs[0].id,
          });
          const disabled = !selected && (!open || !bookable || choices.length >= 3);
          const fitLabel = !open ? "Closed" : (fit?.label || "Full");
          const disabledReason = fit?.kind === "partial"
            ? fit.label
            : capacityCheck?.reason || fitLabel;

          return (
            <button
              key={slot}
              type="button"
              disabled={disabled}
              onClick={() => onToggleChoice(choice)}
              aria-pressed={selected}
              title={disabled ? disabledReason : undefined}
              className={`grid w-full grid-cols-[4.5rem_minmax(0,1fr)_auto] items-start text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-ink ${
                selected
                  ? "bg-brand-teal/[0.08]"
                  : bookable && open
                    ? "bg-white hover:bg-slate-50"
                    : "bg-slate-50/60"
              } disabled:cursor-not-allowed`}
            >
              <span className="flex min-h-[62px] items-center justify-center px-2 font-display text-sm font-black text-brand-ink">
                {slot}
              </span>
              <span className="min-w-0 px-3 py-3">
                <span className={`block text-xs font-bold ${bookable && open ? "text-brand-ink" : "text-ink-muted"}`}>
                  {fitLabel}
                </span>
                {fit?.assignment ? (
                  <span className="mt-0.5 block text-micro font-semibold text-ink-muted">{fit.assignment}</span>
                ) : null}
                {occupancy.dogs.length > 0 ? (
                  <span className="mt-1 block">
                    {occupancy.dogs.map((dog, index) => (
                      <span
                        key={`${dog.name}-${index}`}
                        className="block break-words text-micro font-medium text-ink-muted"
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
                  <span className="motion-safe:animate-[popIn_140ms_ease-out] inline-flex min-h-6 items-center gap-1 rounded-full bg-brand-teal/15 px-2 text-micro font-bold text-brand-teal-text">
                    <Check aria-hidden="true" size={12} />
                    Selected
                  </span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
      ) : null}

      {onClear ? (
        <div className="shrink-0 border-t border-slate-200 bg-white px-3 py-2 shadow-[0_-5px_20px_rgba(31,31,31,0.08)]">
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
