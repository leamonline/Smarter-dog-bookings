import { useState, useMemo, useRef, useEffect } from "react";
import { SERVICES, PRICING, SALON_SLOTS, ALL_DAYS, SIZE_THEME, SIZE_FALLBACK } from "../../constants/index.js";
import { computeSlotCapacities, canBookSlot } from "../../engine/capacity.js";
import { toDateStr } from "../../supabase/transforms.js";
import { IconSearch } from "../icons/index.jsx";

// ─── helpers ────────────────────────────────────────────────────────────────

function getHumanPhone(humans, humanKey) {
  const h = humans?.[humanKey];
  return h?.phone || "";
}

function buildSearchEntries(dogs, humans) {
  // Returns an array of { dog, humanKey, humanPhone, isTrusted, trustedHumanKey, trustedHumanPhone }
  const entries = [];
  for (const dog of Object.values(dogs || {})) {
    const ownerKey = dog.humanId || "";
    const owner = humans?.[ownerKey];
    const ownerPhone = owner?.phone || "";
    const hasAlerts = dog.alerts && dog.alerts.length > 0;

    // Primary entry (owner)
    entries.push({
      dog,
      humanKey: ownerKey,
      humanPhone: ownerPhone,
      isTrusted: false,
      hasAlerts,
    });

    // Trusted human entries
    if (owner?.trustedIds?.length) {
      for (const trustedKey of owner.trustedIds) {
        const trusted = humans?.[trustedKey];
        if (trusted) {
          entries.push({
            dog,
            humanKey: trustedKey,
            humanPhone: trusted.phone || "",
            isTrusted: true,
            hasAlerts,
          });
        }
      }
    }
  }
  return entries;
}

function titleCase(str) {
  if (!str) return "";
  return str.replace(/\b\w/g, (c) => c.toUpperCase());
}


// ─── sub-components ─────────────────────────────────────────────────────────

function AvailabilityCalendar({ bookingsByDate, dayOpenState, daySettings, onSelectDate, selectedDateStr, sizeTheme }) {
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDayOfWeek = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7;
  const monthName = new Date(viewYear, viewMonth).toLocaleDateString("en-GB", { month: "long", year: "numeric" });

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(viewYear - 1); }
    else setViewMonth(viewMonth - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(viewYear + 1); }
    else setViewMonth(viewMonth + 1);
  };

  const isToday = (d) => {
    return d === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear();
  };

  const cells = [];
  for (let i = 0; i < firstDayOfWeek; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  // Check availability for a date
  const getDateStatus = (day) => {
    const date = new Date(viewYear, viewMonth, day);
    const dateStr = toDateStr(date);

    // Past dates are disabled
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    if (date < todayStart) return "past";

    // Check if day is open — use dayOpenState if available, else check default from ALL_DAYS
    const dayOfWeek = date.getDay();
    const dayIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

    if (dayOpenState && dayOpenState[dateStr] !== undefined) {
      if (!dayOpenState[dateStr]) return "closed";
    } else {
      // Fall back to default open state
      if (!ALL_DAYS[dayIndex]?.defaultOpen) return "closed";
    }

    // Check if there's any availability (at least one slot not full)
    const dayBookings = bookingsByDate?.[dateStr] || [];
    const settings = daySettings?.[dateStr];
    const activeSlots = [...SALON_SLOTS, ...(settings?.extraSlots || [])];
    const capacities = computeSlotCapacities(dayBookings, activeSlots);
    const hasAvailability = Object.values(capacities).some(c => c.available > 0);

    return hasAvailability ? "available" : "full";
  };

  // Memoize statuses for all days in the month to avoid recomputing on every render
  const dateStatuses = useMemo(() => {
    const statuses = {};
    for (let d = 1; d <= daysInMonth; d++) {
      statuses[d] = getDateStatus(d);
    }
    return statuses;
  }, [viewYear, viewMonth, daysInMonth, bookingsByDate, dayOpenState, daySettings]);

  return (
    <div>
      {/* Month nav */}
      <div className="flex items-center justify-between mb-2.5">
        <button onClick={prevMonth} className="bg-slate-50 border border-slate-200 rounded-md w-[30px] h-[30px] cursor-pointer flex items-center justify-center">
          <svg width={12} height={12} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="text-slate-800"><path d="M10 3l-5 5 5 5" /></svg>
        </button>
        <div className="text-sm font-bold text-slate-800">{monthName}</div>
        <button onClick={nextMonth} className="bg-slate-50 border border-slate-200 rounded-md w-[30px] h-[30px] cursor-pointer flex items-center justify-center">
          <svg width={12} height={12} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="text-slate-800"><path d="M6 3l5 5-5 5" /></svg>
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 gap-0.5 mb-1">
        {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((d) => (
          <div key={d} className="text-center text-[10px] font-bold text-slate-500 py-0.5">{d}</div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-[3px]">
        {cells.map((d, i) => {
          if (d === null) return <div key={`e${i}`} />;

          const status = dateStatuses[d];
          const dateStr = toDateStr(new Date(viewYear, viewMonth, d));
          const isSelected = dateStr === selectedDateStr;
          const isClickable = status === "available";

          let bg = "transparent";
          let color = "#E5E7EB";
          let border = "2px solid transparent";
          let cursor = "not-allowed";
          let opacity = 0.4;
          let fontWeight = 500;

          if (status === "available") {
            bg = "#DCFCE7";
            color = "#16A34A";
            border = "2px solid #16A34A";
            cursor = "pointer";
            opacity = 1;
            fontWeight = 700;
          }
          if (status === "closed") {
            bg = "#FDE8EE";
            color = "#E8567F";
            border = "2px solid #FDE8EE";
            cursor = "not-allowed";
            opacity = 0.7;
            fontWeight = 600;
          }
          if (status === "full") {
            bg = "#FDE8EE";
            color = "#E8567F";
            border = "2px solid #FDE8EE";
            cursor = "not-allowed";
            opacity = 0.6;
            fontWeight = 600;
          }
          if (isSelected) {
            bg = sizeTheme.gradient[0];
            color = sizeTheme.headerText;
            border = `2px solid ${sizeTheme.gradient[0]}`;
            opacity = 1;
          }
          if (isToday(d) && !isSelected) {
            border = `2px solid ${sizeTheme.gradient[0]}`;
          }

          return (
            <button
              key={d}
              onClick={() => { if (isClickable) onSelectDate(new Date(viewYear, viewMonth, d)); }}
              disabled={!isClickable}
              className="w-full aspect-square rounded-lg text-[13px] font-inherit transition-all flex items-center justify-center"
              style={{ background: bg, color, border, cursor, opacity, fontWeight }}
              onMouseEnter={(e) => { if (isClickable && !isSelected) { e.currentTarget.style.background = sizeTheme.light; e.currentTarget.style.color = sizeTheme.gradient[0]; } }}
              onMouseLeave={(e) => { if (isClickable && !isSelected) { e.currentTarget.style.background = "#DCFCE7"; e.currentTarget.style.color = "#16A34A"; } }}
            >
              {d}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TimeSlotPicker({ dateStr, bookingsByDate, daySettings, selectedSizes, onSelectSlot, selectedSlot, sizeTheme }) {
  const dayBookings = bookingsByDate?.[dateStr] || [];
  const settings = daySettings?.[dateStr];
  const activeSlots = [...SALON_SLOTS, ...(settings?.extraSlots || [])];
  const capacities = computeSlotCapacities(dayBookings, activeSlots);

  const availableSlots = activeSlots.filter(slot => {
    const cap = capacities[slot];
    if (!cap || cap.available <= 0) return false;
    // Check that ALL dogs can fit — simulate sequential booking
    let simulated = [...dayBookings];
    for (const size of selectedSizes) {
      const check = canBookSlot(simulated, slot, size, activeSlots);
      if (!check.allowed) return false;
      simulated = [...simulated, { slot, size, id: `sim-${size}-${Math.random()}` }];
    }
    return true;
  });

  if (availableSlots.length === 0) {
    return (
      <div className="text-[13px] text-slate-500 text-center py-3">
        No available slots for this size on this date.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(80px,1fr))] gap-2">
      {availableSlots.map(slot => {
        const hour = parseInt(slot.split(":")[0]);
        const min = parseInt(slot.split(":")[1]);
        const displayTime = `${hour > 12 ? hour - 12 : hour}:${min.toString().padStart(2, "0")}${hour >= 12 ? "pm" : "am"}`;
        const isSelected = slot === selectedSlot;

        return (
          <button
            key={slot}
            onClick={() => onSelectSlot(slot)}
            className="py-2.5 rounded-[10px] border-2 text-sm font-bold cursor-pointer font-inherit transition-all text-center"
            style={{
              borderColor: isSelected ? sizeTheme.gradient[0] : "#E5E7EB",
              background: isSelected ? sizeTheme.gradient[0] : "#FFFFFF",
              color: isSelected ? sizeTheme.headerText : "#1F2937",
            }}
            onMouseEnter={(e) => { if (!isSelected) { e.currentTarget.style.borderColor = sizeTheme.gradient[0]; e.currentTarget.style.background = sizeTheme.light; } }}
            onMouseLeave={(e) => { if (!isSelected) { e.currentTarget.style.borderColor = "#E5E7EB"; e.currentTarget.style.background = "#FFFFFF"; } }}
          >
            {displayTime}
          </button>
        );
      })}
    </div>
  );
}

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
  const [dogQuery, setDogQuery] = useState("");
  const [dogEntries, setDogEntries] = useState([]); // { dog, humanKey, service }
  const [selectedHumanKey, setSelectedHumanKey] = useState("");
  const [addingAnotherDog, setAddingAnotherDog] = useState(false);
  const [selectedDateStr, setSelectedDateStr] = useState(initialDateStr || "");
  const [selectedSlot, setSelectedSlot] = useState(initialSlot || "");
  const [error, setError] = useState("");
  const searchRef = useRef(null);

  const hasDogs = dogEntries.length > 0;
  const primaryTheme = hasDogs ? (SIZE_THEME[dogEntries[0].dog.size || "small"] || SIZE_FALLBACK) : SIZE_FALLBACK;

  // Auto-focus the search field
  useEffect(() => {
    if (!hasDogs && searchRef.current) {
      searchRef.current.focus();
    }
  }, [hasDogs]);

  // Build search entries from current dogs state (for display in dropdown)
  const filteredEntries = useMemo(() => {
    if (hasDogs) return [];
    return buildSearchEntries(dogs, humans).slice(0, 8);
  }, [dogs, humans, hasDogs]);

  // Same owner's other dogs for "add another" picker
  const sameOwnerDogs = useMemo(() => {
    if (!selectedHumanKey) return [];
    return Object.values(dogs || {}).filter(d =>
      d.humanId === selectedHumanKey &&
      !dogEntries.some(e => e.dog.id === d.id)
    );
  }, [dogs, selectedHumanKey, dogEntries]);

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

  const [recurringWeeks, setRecurringWeeks] = useState(0);

  const selectedSizes = dogEntries.map(e => e.dog.size || "small");

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
  };

  // Format the selected date nicely
  const selectedDateDisplay = selectedDateStr
    ? (() => {
        const [y, m, d] = selectedDateStr.split("-").map(Number);
        const date = new Date(y, m - 1, d);
        return date.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
      })()
    : "";

  return (
    <div onClick={onClose} className="fixed inset-0 bg-black/40 flex items-center justify-center z-[1000]">
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-[20px] w-[min(440px,95vw)] max-h-[92vh] flex flex-col shadow-[0_12px_48px_rgba(0,0,0,0.2)]">
        {/* Header */}
        <div
          className="px-6 py-[18px] rounded-t-[20px] flex justify-between items-center shrink-0"
          style={{ background: `linear-gradient(135deg, ${primaryTheme.gradient[0]}, ${primaryTheme.gradient[1]})` }}
        >
          <div>
            <div className="text-lg font-extrabold" style={{ color: primaryTheme.headerText }}>New Booking</div>
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

        {/* ─── Search section (overflow visible so dropdown isn't clipped) ─── */}
        <div className="px-6 pt-5 overflow-visible shrink-0 relative z-10">

          {/* ─── STEP 1: Dog Search / Dog Cards ─── */}
          {hasDogs ? (
            <div className="flex flex-col gap-2">
              {dogEntries.map((entry, idx) => {
                const dogTheme = SIZE_THEME[entry.dog.size || "small"] || SIZE_FALLBACK;
                return (
                <div
                  key={entry.dog.id}
                  className="rounded-xl p-2.5 px-3.5 border-[1.5px]"
                  style={{ background: dogTheme.light, borderColor: dogTheme.gradient[0] }}
                >
                  <div className="flex items-center gap-2.5">
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center text-lg shrink-0"
                      style={{ background: dogTheme.gradient[0] }}
                    >🐕</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-extrabold" style={{ color: dogTheme.primary }}>
                        {titleCase(entry.dog.name)}
                        {entry.dog.alerts?.length > 0 && <span className="ml-1.5">⚠️</span>}
                      </div>
                      <div className="text-[11px] text-slate-800">
                        {titleCase(entry.dog.breed)} · {entry.dog.size || "small"} · {titleCase(entry.humanKey)}
                      </div>
                      {entry.dog.alerts?.length > 0 && (
                        <div className="text-[10px] text-brand-coral font-semibold mt-px">
                          {entry.dog.alerts.join(", ")}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveDog(entry.dog.id)}
                      className="bg-transparent border-none cursor-pointer text-lg text-slate-500 font-bold py-1 px-2 rounded-md transition-all hover:text-brand-coral"
                    >
                      ×
                    </button>
                  </div>
                  {/* Inline service dropdown */}
                  <select
                    value={entry.service}
                    onChange={(e) => handleServiceChange(entry.dog.id, e.target.value)}
                    className="w-full mt-2 px-2.5 py-2 rounded-lg border border-slate-200 text-xs font-inherit font-semibold cursor-pointer bg-white text-slate-800 box-border"
                  >
                    {SERVICES.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.icon} {s.name} — {PRICING[s.id]?.[entry.dog.size || "small"] || "N/A"}
                      </option>
                    ))}
                  </select>
                </div>
              );
              })}

              {/* Add another dog / Start over buttons */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setAddingAnotherDog(true)}
                  className="flex-1 py-2 px-3 rounded-lg border-[1.5px] border-dashed bg-white text-xs font-bold cursor-pointer font-inherit transition-all"
                  style={{ borderColor: primaryTheme.gradient[0], color: primaryTheme.gradient[0] }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = primaryTheme.light; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "#FFFFFF"; }}
                >
                  + Add another dog
                </button>
                <button
                  type="button"
                  onClick={handleClearAll}
                  className="py-2 px-3 rounded-lg border-[1.5px] border-slate-200 bg-white text-slate-500 text-xs font-bold cursor-pointer font-inherit transition-all hover:border-brand-coral hover:text-brand-coral"
                >
                  Start over
                </button>
              </div>

              {/* Same-owner dog picker */}
              {addingAnotherDog && (
                <div className="bg-white border-[1.5px] border-slate-200 rounded-xl shadow-[0_4px_16px_rgba(0,0,0,0.08)] overflow-hidden">
                  <div className="px-3 py-2 text-[11px] font-bold text-slate-500 border-b border-slate-200">
                    {titleCase(selectedHumanKey)}'s other dogs
                  </div>
                  {sameOwnerDogs.length === 0 ? (
                    <div className="p-3 text-xs text-slate-500">
                      No other dogs for this owner.
                    </div>
                  ) : (
                    sameOwnerDogs.map(dog => (
                      <div key={dog.id}
                        onMouseDown={() => handleAddAnotherDog(dog)}
                        className="px-3 py-2.5 cursor-pointer border-b border-slate-200 transition-colors"
                        onMouseEnter={(e) => (e.currentTarget.style.background = primaryTheme.light)}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "#FFFFFF")}
                      >
                        <span className="text-[13px] font-bold text-slate-800">{titleCase(dog.name)}</span>
                        <span className="text-xs text-slate-500 ml-1.5">{titleCase(dog.breed)} · {dog.size || "small"}</span>
                      </div>
                    ))
                  )}
                  <div
                    onMouseDown={() => { onClose(); onOpenAddDog?.(); }}
                    className="px-3 py-2.5 cursor-pointer text-xs font-bold transition-colors"
                    style={{ color: primaryTheme.gradient[0] }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = primaryTheme.light)}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "#FFFFFF")}
                  >
                    + New dog for {titleCase(selectedHumanKey)}
                  </div>
                  <div className="px-3 py-1.5 border-t border-slate-200">
                    <button type="button" onClick={() => setAddingAnotherDog(false)} className="bg-transparent border-none text-[11px] text-slate-500 cursor-pointer font-inherit p-0">Cancel</button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div>
              <label className="text-[11px] font-extrabold text-brand-teal uppercase tracking-wide block mb-1.5">Search Dog</label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 flex pointer-events-none z-[1]">
                  <IconSearch size={15} colour="#6B7280" />
                </div>
                <input
                  ref={searchRef}
                  placeholder="Start typing a dog's name, breed, or owner..."
                  value={dogQuery}
                  onChange={(e) => { setDogQuery(e.target.value); setError(""); onSearchDogs?.(e.target.value); }}
                  className="w-full py-3 pl-9 pr-3.5 rounded-[10px] border-[1.5px] border-slate-200 text-[15px] font-inherit box-border outline-none text-slate-800 transition-colors focus:border-brand-blue"
                />

                {/* Searching indicator */}
                {isSearchingDogs && dogQuery.trim().length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 z-30 bg-white border-[1.5px] border-slate-200 rounded-xl shadow-[0_8px_24px_rgba(0,0,0,0.12)] px-3.5 py-3 text-[13px] text-slate-500 italic">
                    Searching...
                  </div>
                )}

                {/* Dropdown results */}
                {!isSearchingDogs && filteredEntries.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 z-30 bg-white border-[1.5px] border-slate-200 rounded-xl shadow-[0_8px_24px_rgba(0,0,0,0.12)] max-h-[280px] overflow-auto">
                    {filteredEntries.map((entry, idx) => {
                      const isTrusted = entry.isTrusted;
                      const textColor = isTrusted ? "#2D8B7A" : "#1F2937";
                      const subtextColor = isTrusted ? "#2D8B7A" : "#6B7280";
                      const bgHover = isTrusted ? "#E6F5F2" : "#E0F7FC";
                      const label = isTrusted ? "Trusted" : "Owner";
                      const labelBg = isTrusted ? "#E6F5F2" : "#E0F7FC";
                      const labelColor = isTrusted ? "#2D8B7A" : "#0099BD";

                      return (
                        <div
                          key={`${entry.dog.id}-${entry.humanKey}-${idx}`}
                          onMouseDown={() => handleSelectEntry(entry)}
                          className="px-3.5 py-2.5 cursor-pointer transition-colors"
                          style={{ borderBottom: idx < filteredEntries.length - 1 ? "1px solid #E5E7EB" : "none" }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = bgHover)}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "#FFFFFF")}
                        >
                          <div className="flex items-center gap-1.5 justify-between">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="text-sm font-bold" style={{ color: textColor }}>{titleCase(entry.dog.name)}</span>
                              <span className="text-xs" style={{ color: subtextColor }}>—</span>
                              <span className="text-xs" style={{ color: subtextColor }}>{titleCase(entry.dog.breed)}</span>
                              {entry.hasAlerts && <span className="text-[13px]">⚠️</span>}
                            </div>
                            <span
                              className="text-[10px] font-bold py-0.5 px-[7px] rounded-md shrink-0 uppercase tracking-wide"
                              style={{ background: labelBg, color: labelColor }}
                            >{label}</span>
                          </div>
                          <div className="text-xs mt-0.5" style={{ color: subtextColor }}>
                            {titleCase(entry.humanKey)}{entry.humanPhone ? ` · ${entry.humanPhone}` : ""}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* No results + add buttons */}
                {!isSearchingDogs && dogQuery.trim().length >= 2 && filteredEntries.length === 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 z-30 bg-white border-[1.5px] border-slate-200 rounded-xl shadow-[0_8px_24px_rgba(0,0,0,0.12)] p-3.5">
                    <div className="text-[13px] text-slate-500 mb-2.5">
                      No dogs found matching "{dogQuery}"
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => { onClose(); onOpenAddDog?.(); }} className="flex-1 py-[9px] px-3 rounded-lg border-none bg-brand-blue text-white text-xs font-bold cursor-pointer font-inherit">+ New Dog</button>
                      <button type="button" onClick={() => { onClose(); onOpenAddHuman?.(); }} className="flex-1 py-[9px] px-3 rounded-lg border-none bg-brand-teal text-white text-xs font-bold cursor-pointer font-inherit">+ New Human</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ─── Rest of form (scrollable) ─── */}
        <div className="px-6 py-4 pb-5 flex flex-col gap-4 overflow-y-auto flex-1">

          {/* ─── STEP 2: Date Selection ─── */}
          {hasDogs && (
            <div>
              <label className="text-[11px] font-extrabold text-brand-teal uppercase tracking-wide block mb-1.5">Choose a Date</label>
              <AvailabilityCalendar
                bookingsByDate={bookingsByDate}
                dayOpenState={dayOpenState}
                daySettings={daySettings}
                onSelectDate={handleSelectDate}
                selectedDateStr={selectedDateStr}
                sizeTheme={primaryTheme}
              />
            </div>
          )}

          {/* ─── STEP 3: Time Slot Selection ─── */}
          {selectedDateStr && hasDogs && (
            <div>
              <label className="text-[11px] font-extrabold text-brand-teal uppercase tracking-wide block mb-1.5">
                Available Times — {selectedDateDisplay}
              </label>
              <TimeSlotPicker
                dateStr={selectedDateStr}
                bookingsByDate={bookingsByDate}
                daySettings={daySettings}
                selectedSizes={selectedSizes}
                onSelectSlot={handleSelectSlot}
                selectedSlot={selectedSlot}
                sizeTheme={primaryTheme}
              />
            </div>
          )}

          {/* ─── Error ─── */}
          {error && (
            <div className="text-[13px] text-brand-coral font-semibold bg-brand-coral-light px-3.5 py-2.5 rounded-[10px] mb-4">
              {error}
            </div>
          )}

          {/* ─── STEP 4: Recurring (Optional) ─── */}
          {hasDogs && selectedDateStr && selectedSlot && (
            <div className="mb-4">
              <label className="text-[11px] font-extrabold text-brand-teal uppercase tracking-wide block mb-1.5">Repeat Booking (Optional)</label>
              <select
                value={recurringWeeks}
                onChange={(e) => setRecurringWeeks(Number(e.target.value))}
                className="w-full py-3 px-3.5 rounded-[10px] border-[1.5px] border-slate-200 text-sm font-inherit box-border outline-none text-slate-800 transition-colors cursor-pointer bg-white focus:border-brand-blue"
              >
                <option value={0}>None (Once off)</option>
                <option value={4}>Every 4 weeks</option>
                <option value={6}>Every 6 weeks</option>
                <option value={8}>Every 8 weeks</option>
              </select>
              {recurringWeeks > 0 && (
                <div className="mt-2 text-[13px] text-brand-teal font-semibold">
                  This will generate bookings for the rest of the year. If a day is full, that slot will be skipped.
                </div>
              )}
            </div>
          )}

          {/* ─── Actions ─── */}
          <div className="flex gap-2.5">
            {(() => {
              const ready = hasDogs && selectedDateStr && selectedSlot;
              const label = dogEntries.length > 1
                ? `Confirm ${dogEntries.length} Bookings`
                : "Confirm Booking";
              return (
                <button
                  onClick={handleConfirm}
                  disabled={!ready}
                  className="flex-1 py-[13px] rounded-xl border-none font-bold text-sm cursor-pointer font-inherit transition-all disabled:bg-slate-200 disabled:text-slate-500 disabled:cursor-not-allowed"
                  style={{
                    background: ready ? primaryTheme.gradient[0] : undefined,
                    color: ready ? primaryTheme.headerText : undefined,
                  }}
                  onMouseEnter={(e) => { if (ready) e.currentTarget.style.background = primaryTheme.primary; }}
                  onMouseLeave={(e) => { if (ready) e.currentTarget.style.background = primaryTheme.gradient[0]; }}
                >
                  {label}
                </button>
              );
            })()}
            <button onClick={onClose} className="py-[13px] px-5 rounded-xl border-[1.5px] border-slate-200 bg-white text-slate-500 text-sm font-semibold cursor-pointer font-inherit">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}
