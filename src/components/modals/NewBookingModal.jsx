import { useState, useMemo, useRef, useEffect } from "react";
import { BRAND, SERVICES, PRICING, SALON_SLOTS, ALL_DAYS } from "../../constants/index.js";
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

// ─── sub-components ─────────────────────────────────────────────────────────

function AvailabilityCalendar({ bookingsByDate, dayOpenState, daySettings, onSelectDate, selectedDateStr }) {
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
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: 10,
      }}>
        <button onClick={prevMonth} style={{
          background: BRAND.offWhite, border: `1px solid ${BRAND.greyLight}`, borderRadius: 6,
          width: 30, height: 30, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <svg width={12} height={12} viewBox="0 0 16 16" fill="none" stroke={BRAND.text} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M10 3l-5 5 5 5" /></svg>
        </button>
        <div style={{ fontSize: 14, fontWeight: 700, color: BRAND.text }}>{monthName}</div>
        <button onClick={nextMonth} style={{
          background: BRAND.offWhite, border: `1px solid ${BRAND.greyLight}`, borderRadius: 6,
          width: 30, height: 30, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <svg width={12} height={12} viewBox="0 0 16 16" fill="none" stroke={BRAND.text} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M6 3l5 5-5 5" /></svg>
        </button>
      </div>

      {/* Day headers */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 4 }}>
        {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((d) => (
          <div key={d} style={{ textAlign: "center", fontSize: 10, fontWeight: 700, color: BRAND.textLight, padding: "2px 0" }}>{d}</div>
        ))}
      </div>

      {/* Day grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 3 }}>
        {cells.map((d, i) => {
          if (d === null) return <div key={`e${i}`} />;

          const status = dateStatuses[d];
          const dateStr = toDateStr(new Date(viewYear, viewMonth, d));
          const isSelected = dateStr === selectedDateStr;
          const isClickable = status === "available";

          let bg = "transparent";
          let color = BRAND.greyLight;
          let border = "2px solid transparent";
          let cursor = "not-allowed";
          let opacity = 0.4;
          let fontWeight = 500;

          if (status === "available") {
            bg = BRAND.openGreenBg;
            color = BRAND.openGreen;
            border = `2px solid ${BRAND.openGreen}`;
            cursor = "pointer";
            opacity = 1;
            fontWeight = 700;
          }
          if (status === "closed") {
            bg = BRAND.coralLight;
            color = BRAND.coral;
            border = `2px solid ${BRAND.coralLight}`;
            cursor = "not-allowed";
            opacity = 0.7;
            fontWeight = 600;
          }
          if (status === "full") {
            bg = BRAND.coralLight;
            color = BRAND.coral;
            border = `2px solid ${BRAND.coralLight}`;
            cursor = "not-allowed";
            opacity = 0.6;
            fontWeight = 600;
          }
          if (isSelected) {
            bg = BRAND.blue;
            color = BRAND.white;
            border = `2px solid ${BRAND.blue}`;
            opacity = 1;
          }
          if (isToday(d) && !isSelected) {
            border = `2px solid ${BRAND.blue}`;
          }

          return (
            <button
              key={d}
              onClick={() => { if (isClickable) onSelectDate(new Date(viewYear, viewMonth, d)); }}
              disabled={!isClickable}
              style={{
                width: "100%", aspectRatio: "1", border, borderRadius: 8,
                fontSize: 13, fontWeight, cursor, fontFamily: "inherit",
                background: bg, color, opacity, transition: "all 0.15s",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
              onMouseEnter={(e) => { if (isClickable && !isSelected) { e.currentTarget.style.background = BRAND.blueLight; e.currentTarget.style.color = BRAND.blue; } }}
              onMouseLeave={(e) => { if (isClickable && !isSelected) { e.currentTarget.style.background = BRAND.openGreenBg; e.currentTarget.style.color = BRAND.openGreen; } }}
            >
              {d}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TimeSlotPicker({ dateStr, bookingsByDate, daySettings, selectedSizes, onSelectSlot, selectedSlot }) {
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
      <div style={{ fontSize: 13, color: BRAND.textLight, textAlign: "center", padding: "12px 0" }}>
        No available slots for this size on this date.
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(80px, 1fr))", gap: 8 }}>
      {availableSlots.map(slot => {
        const hour = parseInt(slot.split(":")[0]);
        const min = parseInt(slot.split(":")[1]);
        const displayTime = `${hour > 12 ? hour - 12 : hour}:${min.toString().padStart(2, "0")}${hour >= 12 ? "pm" : "am"}`;
        const isSelected = slot === selectedSlot;

        return (
          <button
            key={slot}
            onClick={() => onSelectSlot(slot)}
            style={{
              padding: "10px 0", borderRadius: 10,
              border: isSelected ? `2px solid ${BRAND.blue}` : `2px solid ${BRAND.greyLight}`,
              background: isSelected ? BRAND.blue : BRAND.white,
              color: isSelected ? BRAND.white : BRAND.text,
              fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
              transition: "all 0.15s", textAlign: "center",
            }}
            onMouseEnter={(e) => { if (!isSelected) { e.currentTarget.style.borderColor = BRAND.blue; e.currentTarget.style.background = BRAND.blueLight; } }}
            onMouseLeave={(e) => { if (!isSelected) { e.currentTarget.style.borderColor = BRAND.greyLight; e.currentTarget.style.background = BRAND.white; } }}
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

  const inputStyle = {
    width: "100%", padding: "12px 14px", borderRadius: 10,
    border: `1.5px solid ${BRAND.greyLight}`, fontSize: 14,
    fontFamily: "inherit", boxSizing: "border-box", outline: "none",
    color: BRAND.text, transition: "border-color 0.15s",
  };

  const labelStyle = {
    fontSize: 11, fontWeight: 700, color: BRAND.textLight,
    textTransform: "uppercase", letterSpacing: 0.5,
    display: "block", marginBottom: 6,
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
    <div onClick={onClose} style={{
      position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.4)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: BRAND.white, borderRadius: 20, width: 440, maxHeight: "92vh",
        display: "flex", flexDirection: "column", boxShadow: "0 12px 48px rgba(0,0,0,0.2)",
      }}>
        {/* Header */}
        <div style={{
          background: `linear-gradient(135deg, ${BRAND.blue}, ${BRAND.blueDark})`,
          padding: "18px 24px", borderRadius: "20px 20px 0 0",
          display: "flex", justifyContent: "space-between", alignItems: "center",
          flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: BRAND.white }}>New Booking</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", marginTop: 2 }}>
              {hasDogs ? dogEntries.map(e => e.dog.name).join(", ") : "Search for a dog to get started"}
            </div>
          </div>
          <button onClick={onClose} style={{
            background: "rgba(255,255,255,0.2)", border: "none", borderRadius: 8,
            width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", fontSize: 16, color: BRAND.white, fontWeight: 700,
          }}>{"\u00D7"}</button>
        </div>

        {/* ─── Search section (overflow visible so dropdown isn't clipped) ─── */}
        <div style={{ padding: "20px 24px 0 24px", overflow: "visible", flexShrink: 0, position: "relative", zIndex: 10 }}>

          {/* ─── STEP 1: Dog Search / Dog Cards ─── */}
          {hasDogs ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {dogEntries.map((entry, idx) => (
                <div key={entry.dog.id} style={{
                  background: BRAND.blueLight, borderRadius: 12, padding: "10px 14px",
                  border: `1.5px solid ${BRAND.blue}`,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: 8, background: BRAND.blue,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 18, flexShrink: 0,
                    }}>🐕</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 800, color: BRAND.blueDark }}>
                        {entry.dog.name}
                        {entry.dog.alerts?.length > 0 && <span style={{ marginLeft: 6 }}>⚠️</span>}
                      </div>
                      <div style={{ fontSize: 11, color: BRAND.text }}>
                        {entry.dog.breed} · {entry.dog.size || "small"} · {entry.humanKey}
                      </div>
                      {entry.dog.alerts?.length > 0 && (
                        <div style={{ fontSize: 10, color: BRAND.coral, fontWeight: 600, marginTop: 1 }}>
                          {entry.dog.alerts.join(", ")}
                        </div>
                      )}
                    </div>
                    <button type="button" onClick={() => handleRemoveDog(entry.dog.id)} style={{
                      background: "none", border: "none", cursor: "pointer",
                      fontSize: 18, color: BRAND.textLight, fontWeight: 700, padding: "4px 8px",
                      borderRadius: 6, transition: "all 0.15s",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = BRAND.coral; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = BRAND.textLight; }}>
                      ×
                    </button>
                  </div>
                  {/* Inline service dropdown */}
                  <select
                    value={entry.service}
                    onChange={(e) => handleServiceChange(entry.dog.id, e.target.value)}
                    style={{
                      width: "100%", marginTop: 8, padding: "8px 10px", borderRadius: 8,
                      border: `1px solid ${BRAND.greyLight}`, fontSize: 12,
                      fontFamily: "inherit", fontWeight: 600, cursor: "pointer",
                      background: BRAND.white, color: BRAND.text, boxSizing: "border-box",
                    }}
                  >
                    {SERVICES.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.icon} {s.name} — {PRICING[s.id]?.[entry.dog.size || "small"] || "N/A"}
                      </option>
                    ))}
                  </select>
                </div>
              ))}

              {/* Add another dog / Start over buttons */}
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" onClick={() => setAddingAnotherDog(true)} style={{
                  flex: 1, padding: "8px 12px", borderRadius: 8,
                  border: `1.5px dashed ${BRAND.blue}`, background: BRAND.white,
                  color: BRAND.blue, fontSize: 12, fontWeight: 700,
                  cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = BRAND.blueLight; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = BRAND.white; }}>
                  + Add another dog
                </button>
                <button type="button" onClick={handleClearAll} style={{
                  padding: "8px 12px", borderRadius: 8,
                  border: `1.5px solid ${BRAND.greyLight}`, background: BRAND.white,
                  color: BRAND.textLight, fontSize: 12, fontWeight: 700,
                  cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = BRAND.coral; e.currentTarget.style.color = BRAND.coral; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = BRAND.greyLight; e.currentTarget.style.color = BRAND.textLight; }}>
                  Start over
                </button>
              </div>

              {/* Same-owner dog picker */}
              {addingAnotherDog && (
                <div style={{
                  background: BRAND.white, border: `1.5px solid ${BRAND.greyLight}`, borderRadius: 12,
                  boxShadow: "0 4px 16px rgba(0,0,0,0.08)", overflow: "hidden",
                }}>
                  <div style={{ padding: "8px 12px", fontSize: 11, fontWeight: 700, color: BRAND.textLight, borderBottom: `1px solid ${BRAND.greyLight}` }}>
                    {selectedHumanKey}'s other dogs
                  </div>
                  {sameOwnerDogs.length === 0 ? (
                    <div style={{ padding: "12px", fontSize: 12, color: BRAND.textLight }}>
                      No other dogs for this owner.
                    </div>
                  ) : (
                    sameOwnerDogs.map(dog => (
                      <div key={dog.id}
                        onMouseDown={() => handleAddAnotherDog(dog)}
                        style={{
                          padding: "10px 12px", cursor: "pointer",
                          borderBottom: `1px solid ${BRAND.greyLight}`,
                          transition: "background 0.1s",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = BRAND.blueLight)}
                        onMouseLeave={(e) => (e.currentTarget.style.background = BRAND.white)}
                      >
                        <span style={{ fontSize: 13, fontWeight: 700, color: BRAND.text }}>{dog.name}</span>
                        <span style={{ fontSize: 12, color: BRAND.textLight, marginLeft: 6 }}>{dog.breed} · {dog.size || "small"}</span>
                      </div>
                    ))
                  )}
                  <div
                    onMouseDown={() => { onClose(); onOpenAddDog?.(); }}
                    style={{
                      padding: "10px 12px", cursor: "pointer", fontSize: 12,
                      fontWeight: 700, color: BRAND.blue, transition: "background 0.1s",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = BRAND.blueLight)}
                    onMouseLeave={(e) => (e.currentTarget.style.background = BRAND.white)}
                  >
                    + New dog for {selectedHumanKey}
                  </div>
                  <div style={{ padding: "6px 12px", borderTop: `1px solid ${BRAND.greyLight}` }}>
                    <button type="button" onClick={() => setAddingAnotherDog(false)} style={{
                      background: "none", border: "none", fontSize: 11, color: BRAND.textLight,
                      cursor: "pointer", fontFamily: "inherit", padding: 0,
                    }}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div>
              <label style={labelStyle}>Search Dog</label>
              <div style={{ position: "relative" }}>
                <div style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", display: "flex", pointerEvents: "none", zIndex: 1 }}>
                  <IconSearch size={15} colour={BRAND.textLight} />
                </div>
                <input
                  ref={searchRef}
                  placeholder="Start typing a dog's name, breed, or owner..."
                  value={dogQuery}
                  onChange={(e) => { setDogQuery(e.target.value); setError(""); onSearchDogs?.(e.target.value); }}
                  style={{ ...inputStyle, paddingLeft: 36, fontSize: 15 }}
                  onFocus={(e) => (e.target.style.borderColor = BRAND.blue)}
                  onBlur={(e) => (e.target.style.borderColor = BRAND.greyLight)}
                />

                {/* Searching indicator */}
                {isSearchingDogs && dogQuery.trim().length > 0 && (
                  <div style={{
                    position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4, zIndex: 30,
                    background: BRAND.white, border: `1.5px solid ${BRAND.greyLight}`, borderRadius: 12,
                    boxShadow: "0 8px 24px rgba(0,0,0,0.12)", padding: "12px 14px",
                    fontSize: 13, color: BRAND.textLight, fontStyle: "italic",
                  }}>
                    Searching...
                  </div>
                )}

                {/* Dropdown results */}
                {!isSearchingDogs && filteredEntries.length > 0 && (
                  <div style={{
                    position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4, zIndex: 30,
                    background: BRAND.white, border: `1.5px solid ${BRAND.greyLight}`, borderRadius: 12,
                    boxShadow: "0 8px 24px rgba(0,0,0,0.12)", maxHeight: 280, overflow: "auto",
                  }}>
                    {filteredEntries.map((entry, idx) => {
                      const isTrusted = entry.isTrusted;
                      const textColor = isTrusted ? BRAND.teal : BRAND.text;
                      const subtextColor = isTrusted ? "#2D8B7A" : BRAND.textLight;
                      const bgHover = isTrusted ? BRAND.tealLight : BRAND.blueLight;
                      const label = isTrusted ? "Trusted" : "Owner";
                      const labelBg = isTrusted ? BRAND.tealLight : BRAND.blueLight;
                      const labelColor = isTrusted ? BRAND.teal : BRAND.blueDark;

                      return (
                        <div
                          key={`${entry.dog.id}-${entry.humanKey}-${idx}`}
                          onMouseDown={() => handleSelectEntry(entry)}
                          style={{
                            padding: "10px 14px", cursor: "pointer",
                            borderBottom: idx < filteredEntries.length - 1 ? `1px solid ${BRAND.greyLight}` : "none",
                            transition: "background 0.1s",
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = bgHover)}
                          onMouseLeave={(e) => (e.currentTarget.style.background = BRAND.white)}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "space-between" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                              <span style={{ fontSize: 14, fontWeight: 700, color: textColor }}>{entry.dog.name}</span>
                              <span style={{ fontSize: 12, color: subtextColor }}>—</span>
                              <span style={{ fontSize: 12, color: subtextColor }}>{entry.dog.breed}</span>
                              {entry.hasAlerts && <span style={{ fontSize: 13 }}>⚠️</span>}
                            </div>
                            <span style={{
                              fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 6,
                              background: labelBg, color: labelColor, flexShrink: 0, textTransform: "uppercase",
                              letterSpacing: 0.5,
                            }}>{label}</span>
                          </div>
                          <div style={{ fontSize: 12, color: subtextColor, marginTop: 2 }}>
                            {entry.humanKey}{entry.humanPhone ? ` · ${entry.humanPhone}` : ""}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* No results + add buttons */}
                {!isSearchingDogs && dogQuery.trim().length >= 2 && filteredEntries.length === 0 && (
                  <div style={{
                    position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4, zIndex: 30,
                    background: BRAND.white, border: `1.5px solid ${BRAND.greyLight}`, borderRadius: 12,
                    boxShadow: "0 8px 24px rgba(0,0,0,0.12)", padding: "14px",
                  }}>
                    <div style={{ fontSize: 13, color: BRAND.textLight, marginBottom: 10 }}>
                      No dogs found matching "{dogQuery}"
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button type="button" onClick={() => { onClose(); onOpenAddDog?.(); }} style={{
                        flex: 1, padding: "9px 12px", borderRadius: 8, border: "none",
                        background: BRAND.blue, color: BRAND.white, fontSize: 12,
                        fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                      }}>+ New Dog</button>
                      <button type="button" onClick={() => { onClose(); onOpenAddHuman?.(); }} style={{
                        flex: 1, padding: "9px 12px", borderRadius: 8, border: "none",
                        background: BRAND.teal, color: BRAND.white, fontSize: 12,
                        fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                      }}>+ New Human</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ─── Rest of form (scrollable) ─── */}
        <div style={{ padding: "16px 24px 20px 24px", display: "flex", flexDirection: "column", gap: 16, overflowY: "auto", flex: 1 }}>

          {/* ─── STEP 2: Date Selection ─── */}
          {hasDogs && (
            <div>
              <label style={labelStyle}>Choose a Date</label>
              <AvailabilityCalendar
                bookingsByDate={bookingsByDate}
                dayOpenState={dayOpenState}
                daySettings={daySettings}
                onSelectDate={handleSelectDate}
                selectedDateStr={selectedDateStr}
              />
            </div>
          )}

          {/* ─── STEP 3: Time Slot Selection ─── */}
          {selectedDateStr && hasDogs && (
            <div>
              <label style={labelStyle}>
                Available Times — {selectedDateDisplay}
              </label>
              <TimeSlotPicker
                dateStr={selectedDateStr}
                bookingsByDate={bookingsByDate}
                daySettings={daySettings}
                selectedSizes={selectedSizes}
                onSelectSlot={handleSelectSlot}
                selectedSlot={selectedSlot}
              />
            </div>
          )}

          {/* ─── Error ─── */}
          {error && (
            <div style={{
              fontSize: 13, color: BRAND.coral, fontWeight: 600,
              background: BRAND.coralLight, padding: "10px 14px", borderRadius: 10,
              marginBottom: 16,
            }}>
              {error}
            </div>
          )}

          {/* ─── STEP 4: Recurring (Optional) ─── */}
          {hasDogs && selectedDateStr && selectedSlot && (
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Repeat Booking (Optional)</label>
              <select
                value={recurringWeeks}
                onChange={(e) => setRecurringWeeks(Number(e.target.value))}
                style={{ ...inputStyle, cursor: "pointer", background: BRAND.white }}
              >
                <option value={0}>None (Once off)</option>
                <option value={4}>Every 4 weeks</option>
                <option value={6}>Every 6 weeks</option>
                <option value={8}>Every 8 weeks</option>
              </select>
              {recurringWeeks > 0 && (
                <div style={{ marginTop: 8, fontSize: 13, color: BRAND.teal, fontWeight: 600 }}>
                  This will generate bookings for the rest of the year. If a day is full, that slot will be skipped.
                </div>
              )}
            </div>
          )}

          {/* ─── Actions ─── */}
          <div style={{ display: "flex", gap: 10 }}>
            {(() => {
              const ready = hasDogs && selectedDateStr && selectedSlot;
              const label = dogEntries.length > 1
                ? `Confirm ${dogEntries.length} Bookings`
                : "Confirm Booking";
              return (
                <button
                  onClick={handleConfirm}
                  disabled={!ready}
                  style={{
                    flex: 1, padding: "13px 0", borderRadius: 12, border: "none",
                    background: ready ? BRAND.blue : BRAND.greyLight,
                    color: ready ? BRAND.white : BRAND.textLight,
                    fontWeight: 700, fontSize: 14, cursor: ready ? "pointer" : "not-allowed",
                    fontFamily: "inherit", transition: "all 0.15s",
                  }}
                  onMouseEnter={(e) => { if (ready) e.currentTarget.style.background = BRAND.blueDark; }}
                  onMouseLeave={(e) => { if (ready) e.currentTarget.style.background = BRAND.blue; }}
                >
                  {label}
                </button>
              );
            })()}
            <button onClick={onClose} style={{
              padding: "13px 20px", borderRadius: 12, border: `1.5px solid ${BRAND.greyLight}`,
              background: BRAND.white, color: BRAND.textLight, fontSize: 14, fontWeight: 600,
              cursor: "pointer", fontFamily: "inherit",
            }}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}
