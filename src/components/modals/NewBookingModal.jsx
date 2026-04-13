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

  const hasDogs = dogEntries.length > 0;
  const primaryTheme = hasDogs ? (SIZE_THEME[dogEntries[0].dog.size || "small"] || SIZE_FALLBACK) : SIZE_FALLBACK;
  const selectedSizes = dogEntries.map(e => e.dog.size || "small");

  // ─── handlers ───────────────────────────────────────────────────────────

  const handleSelectEntry = (entry) => {
    setDogEntries([{ dog: entry.dog, humanKey: entry.humanKey, service: "full-groom" }]);
    setSelectedHumanKey(entry.humanKey);
    setDogQuery(entry.dog.name);
    setError("");
  };

  const handleAddAnotherDog = (dog) => {
    setDogEntries(prev => [...prev, { dog, humanKey: selectedHumanKey, service: "full-groom" }]);
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
        const check = canBookSlot(simulated, selectedSlot, size, activeSlots);
        if (!check.allowed) {
          allFit = false;
          failureReason = check.reason;
          break;
        }
        simulated = [...simulated, { slot: selectedSlot, size, id: `check-${entry.dog.id}` }];
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
             owner: entry.dog.humanId,
             _bookingDate: targetDateStr
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

  // Format the selected date nicely
  const selectedDateDisplay = selectedDateStr
    ? (() => {
        const [y, m, d] = selectedDateStr.split("-").map(Number);
        const date = new Date(y, m - 1, d);
        return date.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
      })()
    : "";

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
              {hasDogs ? dogEntries.map(e => titleCase(e.dog.name)).join(", ") : "Search for a dog to get started"}
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
          selectedSizes={selectedSizes}
          recurringWeeks={recurringWeeks}
          setRecurringWeeks={setRecurringWeeks}
          primaryTheme={primaryTheme}
          error={error}
          onSelectDate={handleSelectDate}
          onSelectSlot={handleSelectSlot}
          onConfirm={handleConfirm}
          onClose={onClose}
        />
    </AccessibleModal>
  );
}
