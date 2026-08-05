// ============================================================
// src/components/views/booking-workspace/BookingActionsPane.jsx
//
// The Booking pane's two staff actions. Composes the entry choice, the dog +
// service picker and the diary, and owns the responsive shape:
//
//   • wide  — everything stacked in one scrolling column, sticky action footer
//   • narrow — a staged flow (dogs → times → review) so an iPhone isn't asked
//              to render a compressed desktop pane
//
// Phase 1 implements the OFFER action only. It writes nothing and sends
// nothing: the composed message is inserted into the existing composer, which
// keeps ownership of the WhatsApp 24-hour window and template rules.
// See docs/booking-pane-actions-spec.md.
// ============================================================

import { useCallback, useMemo, useRef } from "react";
import { CalendarPlus, CornerUpLeft, MessageSquareText, PawPrint } from "lucide-react";

import { useMediaQuery } from "../../../hooks/useMediaQuery";
import { BookingPane } from "./BookingPane.jsx";
import { DogServicePicker } from "./DogServicePicker.jsx";
import { MAX_OFFER_SLOTS } from "./bookingComposerModel.js";
import { useBookingComposer } from "./useBookingComposer.js";

// Below the inbox's `md` breakpoint the pane is full-screen, so the flow is
// staged rather than scrolled. Width-based, never user-agent based.
const NARROW_QUERY = "(max-width: 767px)";

const PRIMARY_BTN =
  "inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-brand-purple px-4 text-sm font-bold text-white transition-colors hover:bg-brand-purple-light disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple focus-visible:ring-offset-2";
const GHOST_BTN =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full px-3 text-sm font-bold text-brand-purple transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple focus-visible:ring-offset-2";
// Offer only ever drafts a message — fully reversible, and the common case.
// It gets the filled, reach-for-it-by-reflex treatment.
const OFFER_BTN =
  "inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-full bg-brand-teal px-4 text-sm font-bold text-white transition-colors hover:bg-brand-teal/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-teal focus-visible:ring-offset-2";
// Book writes a real appointment. Outlined, not filled, so it costs one more
// beat of intent than the reversible action beside it — never equal billing.
const BOOK_BTN =
  "inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-full border-2 border-brand-purple/25 px-4 text-sm font-bold text-brand-purple transition-colors hover:border-brand-purple/40 hover:bg-brand-purple/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-purple focus-visible:ring-offset-2";

// The header above this pane already carries the "Booking suggested" badge
// (BookingCustomerPane, fed independently from the same signal) — that's the
// one place this gets said. Nothing here repeats it.
function EntryChoice({ onChoose }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col justify-center gap-2.5 px-4 py-6">
      <button type="button" onClick={() => onChoose("offer")} className={OFFER_BTN}>
        <MessageSquareText aria-hidden="true" size={17} />
        Available appointments?
      </button>
      <button type="button" onClick={() => onChoose("book")} className={BOOK_BTN}>
        <CalendarPlus aria-hidden="true" size={17} />
        Let&apos;s book!
      </button>
    </div>
  );
}

export function BookingActionsPane({
  conversationId,
  customerName,
  dogs,
  lastServiceByDogId,
  dates,
  currentDateStr,
  daySettings,
  bookingsByDate,
  dailyDogCap,
  onPickDate,
  onInsertIntoReply,
}) {
  const narrow = useMediaQuery(NARROW_QUERY);
  const headingRef = useRef(null);
  const composer = useBookingComposer({ conversationId, dogs, lastServiceByDogId });
  const { actions, mode, stage, selectedDogs, slotChoices } = composer;

  const handleInsert = useCallback(() => {
    const text = composer.offerText(customerName);
    if (!text) return;
    onInsertIntoReply(text);
    actions.cancel();
  }, [actions, composer, customerName, onInsertIntoReply]);

  const selectionSummary = useMemo(() => {
    if (selectedDogs.length === 0) return "No dogs chosen yet";
    const names = selectedDogs.map((dog) => dog.name).join(", ");
    const times = slotChoices.length;
    return `${names} · ${times} of ${MAX_OFFER_SLOTS} times chosen`;
  }, [selectedDogs, slotChoices.length]);

  if (!mode) {
    return <EntryChoice onChoose={actions.setMode} />;
  }

  if (mode === "book") {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <PawPrint aria-hidden="true" size={28} className="text-slate-300" />
          <p className="mt-3 text-sm font-bold text-brand-purple">Booking is not switched on yet</p>
          <p className="mt-1 text-xs text-slate-500">
            Offering times works now. Booking straight from the inbox is coming next.
          </p>
        </div>
        <div className="shrink-0 border-t border-slate-200 px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          <button type="button" onClick={actions.cancel} className={GHOST_BTN}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // Narrow layouts show one stage at a time; wide shows the lot in one scroller.
  const showDogs = !narrow || stage === "dogs";
  const showSlots = !narrow || stage === "slots";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* One compact line on narrow — the shell already shows a "Booking"
          header above this, so a second stacked two-line header would cost
          scarce phone height for no new information. */}
      <div className="flex shrink-0 items-baseline gap-2 border-b border-slate-200 px-3 py-1.5 sm:block sm:py-2">
        <h2 ref={headingRef} tabIndex={-1} className="shrink-0 text-sm font-extrabold text-brand-purple">
          {narrow && stage === "slots" ? "Choose times" : "Choose dogs"}
        </h2>
        <p className="min-w-0 truncate text-micro text-slate-500 sm:mt-0.5">{customerName}</p>
      </div>

      {/* The only scrolling region. */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {showDogs ? (
          <DogServicePicker
            dogs={dogs}
            selectedDogIds={composer.selectedDogIds}
            servicesByDogId={composer.servicesByDogId}
            lastServiceByDogId={lastServiceByDogId}
            onToggleDog={actions.toggleDog}
            onSetService={actions.setService}
          />
        ) : null}

        {showSlots ? (
          <BookingPane
            dogs={selectedDogs}
            emptyStateTitle="Choose a dog to see availability"
            emptyStateBody="The diary checks capacity against each dog's recorded size."
            offerActionLabel="Offer this time"
            dates={dates}
            currentDateStr={currentDateStr}
            daySettings={daySettings}
            bookingsByDate={bookingsByDate}
            dailyDogCap={dailyDogCap}
            choices={slotChoices}
            onToggleChoice={actions.toggleSlot}
            onPickDate={onPickDate}
            atLimit={composer.atSlotLimit}
          />
        ) : null}
      </div>

      <div className="shrink-0 border-t border-slate-200 bg-white px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-[0_-5px_20px_rgba(45,0,75,0.08)]">
        <p
          role="status"
          aria-live="polite"
          className={`mb-2 truncate text-xs ${
            selectedDogs.length > 0 ? "font-bold text-brand-purple" : "font-semibold text-slate-500"
          }`}
        >
          {selectionSummary}
        </p>
        <div className="flex items-center gap-2">
          <button type="button" onClick={actions.cancel} className={GHOST_BTN}>
            Cancel
          </button>
          {narrow && stage === "slots" ? (
            <button
              type="button"
              onClick={() => actions.goToStage("dogs")}
              className={GHOST_BTN}
            >
              Back
            </button>
          ) : null}
          {narrow && stage === "dogs" ? (
            <button
              type="button"
              disabled={selectedDogs.length === 0}
              onClick={() => actions.goToStage("slots")}
              className={PRIMARY_BTN}
            >
              Choose times
            </button>
          ) : (
            <button
              type="button"
              disabled={!composer.canSubmitOffer}
              onClick={handleInsert}
              className={PRIMARY_BTN}
            >
              <CornerUpLeft aria-hidden="true" size={15} />
              Add to reply
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
