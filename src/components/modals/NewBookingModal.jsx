import { useState } from "react";
import { SALON_SLOTS, SIZE_THEME, SIZE_FALLBACK } from "../../constants/index.js";
import { AccessibleModal } from "../shared/AccessibleModal.tsx";
import { canBookSlot } from "../../engine/capacity.js";
import { toDateStr } from "../../supabase/transforms.js";
import { titleCase } from "./new-booking/helpers.js";
import { DogSearchSection } from "./new-booking/DogSearchSection.jsx";
import { BookingFormFields } from "./new-booking/BookingFormFields.jsx";
import { useToast } from "../../contexts/ToastContext.jsx";

// ─── main modal ─────────────────────────────────────────────────────────────

export function NewBookingModal({
  onClose,
  onAdd,
  dogs,
  humans,
  bookingsByDate,
  dayOpenState,
  daySettings,
  onOpenAddDog,
  onOpenAddHuman,
  initialDateStr,
  initialSlot,
  onSearchDogs,
  isSearchingDogs,
}) {
  const toast = useToast();

  const [dogQuery, setDogQuery] = useState("");
  const [dogEntries, setDogEntries] = useState([]); // { dog, humanKey, service }
  const [selectedHumanKey, setSelectedHumanKey] = useState("");
  const [addingAnotherDog, setAddingAnotherDog] = useState(false);
  const [selectedDateStr, setSelectedDateStr] = useState(initialDateStr || "");
  const [selectedSlot, setSelectedSlot] = useState(initialSlot || "");
  const [error, setError] = useState("");
  const [recurringWeeks, setRecurringWeeks] = useState(0);
  // Past-date booking confirmation. Set when handleConfirm runs against a
  // date earlier than today; the actual save happens inside the confirm
  // dialog's accept handler. Avoids accidental back-dated bookings while
  // still letting staff log historical records when they need to.
  const [pendingPastConfirm, setPendingPastConfirm] = useState(false);

  const hasDogs = dogEntries.length > 0;
  const primaryTheme = hasDogs ? (SIZE_THEME[dogEntries[0].dog.size || "small"] || SIZE_FALLBACK) : SIZE_FALLBACK;
  const selectedDogs = dogEntries.map(e => ({ id: e.dog.id, size: e.dog.size || "small", name: e.dog.name }));

  // ─── handlers ───────────────────────────────────────────────────────────

  const handleSelectEntry = (entry) => {
    setDogEntries([{ dog: entry.dog, humanKey: entry.humanKey, service: "full-groom", addons: [] }]);
    setSelectedHumanKey(entry.humanKey);
    setDogQuery(entry.dog.name);
    setError("");
  };

  const handleAddAnotherDog = (dog) => {
    setDogEntries(prev => [...prev, { dog, humanKey: selectedHumanKey, service: "full-groom", addons: [] }]);
    setAddingAnotherDog(false);
    setSelectedSlot(""); // Reset slot — capacity may have changed
  };

  const handleRemoveDog = (dogId) => {
    setDogEntries(prev => {
      const next = prev.filter(e => e.dog.id !== dogId);
      if (next.length === 0) {
        setSelectedHumanKey("");
        setDogQuery("");
        setSelectedDateStr("");
        setSelectedSlot("");
      }
      return next;
    });
    setSelectedSlot("");
  };

  const handleServiceChange = (dogId, newService) => {
    setDogEntries(prev => prev.map(e =>
      e.dog.id === dogId ? { ...e, service: newService } : e
    ));
  };

  const handleAddonsChange = (dogId, addon) => {
    setDogEntries(prev => prev.map(e => {
      if (e.dog.id !== dogId) return e;
      const current = e.addons || [];
      return {
        ...e,
        addons: current.includes(addon)
          ? current.filter(a => a !== addon)
          : [...current, addon],
      };
    }));
  };

  const handleClearAll = () => {
    setDogEntries([]);
    setSelectedHumanKey("");
    setDogQuery("");
    setSelectedDateStr("");
    setSelectedSlot("");
    setAddingAnotherDog(false);
  };

  const handleSelectDate = (date) => {
    const dateStr = toDateStr(date);
    setSelectedDateStr(dateStr);
    setSelectedSlot("");
  };

  const handleSelectSlot = (slot) => {
    setSelectedSlot(slot);
  };

  const handleConfirm = () => {
    if (dogEntries.length === 0) { setError("Please select a dog."); return; }
    if (!selectedDateStr) { setError("Please select a date."); return; }
    if (!selectedSlot) { setError("Please select a time slot."); return; }

    // Check for duplicate dogs on the same date/slot
    const existingBookings = bookingsByDate?.[selectedDateStr] || [];
    for (const entry of dogEntries) {
      const duplicate = existingBookings.find(
        (b) => (b.dog_id === entry.dog.id || b.dogName === entry.dog.name) && b.slot === selectedSlot
      );
      if (duplicate) {
        setError(`${entry.dog.name} is already booked at ${selectedSlot} on this date.`);
        return;
      }
    }

    // Past-date guard. If the selected date is before today, require an
    // explicit confirmation so staff can't accidentally book yesterday.
    const todayStr = toDateStr(new Date());
    if (selectedDateStr < todayStr) {
      setPendingPastConfirm(true);
      return;
    }

    saveBooking();
  };

  const saveBooking = () => {
    const bookings = [];
    const occurrences = recurringWeeks > 0 ? Math.floor(52 / recurringWeeks) : 1;
    let baseDate = new Date(selectedDateStr + "T00:00:00");

    for (let i = 0; i < occurrences; i++) {
      const targetDate = new Date(baseDate);
      targetDate.setDate(baseDate.getDate() + (i * recurringWeeks * 7));
      const targetDateStr = toDateStr(targetDate);

      const dayBookings = bookingsByDate?.[targetDateStr] || [];
      const settings = daySettings?.[targetDateStr];
      const activeSlots = [...SALON_SLOTS, ...(settings?.extraSlots || [])];
      let simulated = [...dayBookings];

      let allFit = true;
      let failureReason = "";

      for (const entry of dogEntries) {
        const size = entry.dog.size || "small";
        const check = canBookSlot(simulated, selectedSlot, size, activeSlots, {
          dogId: entry.dog.id,
        });
        if (!check.allowed) {
          allFit = false;
          failureReason = check.reason;
          break;
        }
        simulated = [
          ...simulated,
          { slot: selectedSlot, size, id: `check-${entry.dog.id}`, _dogId: entry.dog.id },
        ];
      }

      if (allFit) {
        dogEntries.forEach(entry => {
          bookings.push({
             id: crypto.randomUUID(),
             slot: selectedSlot,
             dogName: entry.dog.name,
             breed: entry.dog.breed,
             size: entry.dog.size || "small",
             service: entry.service,
             addons: entry.addons || [],
             owner: entry.dog.humanId,
             _dogId: entry.dog.id,
             _bookingDate: targetDateStr,
          });
        });
      } else {
        if (i === 0) {
          setError(`Booking on ${targetDateStr} failed: ${failureReason} (Choose a different starting date)`);
          return;
        }
      }
    }

    onAdd(bookings, selectedDateStr);
    toast.show("Booking created", "success");
  };

  // Format the selected date nicely (long form for the form label).
  const selectedDateDisplay = selectedDateStr
    ? (() => {
        const [y, m, d] = selectedDateStr.split("-").map(Number);
        const date = new Date(y, m - 1, d);
        return date.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
      })()
    : "";

  // Short form for the header subtitle ("Mon 11 May") so the user can
  // always see which slot they're booking into without scrolling.
  const selectedDateShort = selectedDateStr
    ? (() => {
        const [y, m, d] = selectedDateStr.split("-").map(Number);
        const date = new Date(y, m - 1, d);
        return date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
      })()
    : "";

  // Slot label without the leading zero — "10:30am" reads better than "10:30".
  const selectedSlotLabel = selectedSlot
    ? (() => {
        const [h, mn] = selectedSlot.split(":").map(Number);
        const suffix = h >= 12 ? "pm" : "am";
        const hour = h > 12 ? h - 12 : (h === 0 ? 12 : h);
        return `${hour}:${String(mn).padStart(2, "0")}${suffix}`;
      })()
    : "";

  const subtitleParts = [];
  if (hasDogs) subtitleParts.push(dogEntries.map(e => titleCase(e.dog.name)).join(", "));
  if (selectedSlotLabel) subtitleParts.push(selectedSlotLabel);
  if (selectedDateShort) subtitleParts.push(selectedDateShort);
  const headerSubtitle = subtitleParts.length > 0
    ? subtitleParts.join(" · ")
    : "Search for a dog to get started";

  // ─── render ─────────────────────────────────────────────────────────────

  return (
    <AccessibleModal
      onClose={onClose}
      titleId="new-booking-title"
      className="bg-white rounded-[20px] w-[min(440px,95vw)] max-h-[92vh] flex flex-col shadow-[0_12px_48px_rgba(0,0,0,0.2)]"
      backdropClass="bg-black/40"
    >
        {/* Header */}
        <div
          className="px-6 py-[18px] rounded-t-[20px] flex justify-between items-center shrink-0"
          style={{ background: `linear-gradient(135deg, ${primaryTheme.gradient[0]}, ${primaryTheme.gradient[1]})` }}
        >
          <div>
            <div id="new-booking-title" className="text-lg font-extrabold" style={{ color: primaryTheme.headerText }}>New Booking</div>
            <div className="text-xs mt-0.5" style={{ color: primaryTheme.headerTextSub }}>
              {headerSubtitle}
            </div>
          </div>
          <button
            onClick={onClose}
            className="bg-white/20 border-none rounded-lg w-8 h-8 flex items-center justify-center cursor-pointer text-base font-bold"
            style={{ color: primaryTheme.headerText }}
          >{"\u00D7"}</button>
        </div>

        {/* ─── Dog search / selection ─── */}
        <DogSearchSection
          dogs={dogs}
          humans={humans}
          dogEntries={dogEntries}
          dogQuery={dogQuery}
          setDogQuery={setDogQuery}
          selectedHumanKey={selectedHumanKey}
          addingAnotherDog={addingAnotherDog}
          setAddingAnotherDog={setAddingAnotherDog}
          primaryTheme={primaryTheme}
          onSelectEntry={handleSelectEntry}
          onAddAnotherDog={handleAddAnotherDog}
          onRemoveDog={handleRemoveDog}
          onServiceChange={handleServiceChange}
          onAddonsChange={handleAddonsChange}
          onClearAll={handleClearAll}
          onClose={onClose}
          onOpenAddDog={onOpenAddDog}
          onOpenAddHuman={onOpenAddHuman}
          onSearchDogs={onSearchDogs}
          isSearchingDogs={isSearchingDogs}
          setError={setError}
        />

        {/* ─── Date, time, recurring, actions ─── */}
        <BookingFormFields
          hasDogs={hasDogs}
          dogEntries={dogEntries}
          bookingsByDate={bookingsByDate}
          dayOpenState={dayOpenState}
          daySettings={daySettings}
          selectedDateStr={selectedDateStr}
          selectedDateDisplay={selectedDateDisplay}
          selectedSlot={selectedSlot}
          selectedDogs={selectedDogs}
          recurringWeeks={recurringWeeks}
          setRecurringWeeks={setRecurringWeeks}
          primaryTheme={primaryTheme}
          error={error}
          onSelectDate={handleSelectDate}
          onSelectSlot={handleSelectSlot}
          onConfirm={handleConfirm}
          onClose={onClose}
        />

        {pendingPastConfirm && (
          <PastDateConfirm
            dateLabel={selectedDateDisplay}
            slotLabel={selectedSlotLabel}
            onConfirm={() => { setPendingPastConfirm(false); saveBooking(); }}
            onCancel={() => setPendingPastConfirm(false)}
          />
        )}
    </AccessibleModal>
  );
}

// Past-date confirmation. Rendered as a fixed-position overlay on top
// of the main New Booking modal (z-index 1100 vs the modal's 1000) so
// the question is unmistakable. Kept inline here because it only makes
// sense in the booking flow.
function PastDateConfirm({ dateLabel, slotLabel, onConfirm, onCancel }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="past-date-confirm-title"
      className="fixed inset-0 bg-black/50 flex items-center justify-center p-4"
      style={{ zIndex: 1100 }}
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.2)] p-5 max-w-[360px] w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <div id="past-date-confirm-title" className="text-base font-extrabold text-slate-800 mb-1.5">
          Log a historical booking?
        </div>
        <p className="text-[13px] text-slate-600 leading-relaxed mb-4">
          {dateLabel || "This date"}{slotLabel ? ` at ${slotLabel}` : ""} is in the past.
          {" "}Save it anyway to keep a historical record?
        </p>
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="py-2 px-4 rounded-lg border-[1.5px] border-slate-200 bg-white text-slate-600 text-sm font-semibold cursor-pointer font-inherit"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            autoFocus
            className="py-2 px-4 rounded-lg border-none bg-brand-coral text-white text-sm font-bold cursor-pointer font-inherit"
          >
            Log as historical
          </button>
        </div>
      </div>
    </div>
  );
}
