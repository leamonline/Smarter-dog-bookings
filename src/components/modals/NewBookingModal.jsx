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

          const status = getDateStatus(d);
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
          if (status === "full") {
            bg = BRAND.coralLight;
            color = BRAND.coral;
            border = `2px solid ${BRAND.coralLight}`;
            cursor = "not-allowed";
            opacity = 0.6;
            fontWeight = 600;
          }
          if (isSelected) {
            bg = BRAND.openGreen;
            color = BRAND.white;
            border = `2px solid ${BRAND.openGreen}`;
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
              onMouseEnter={(e) => { if (isClickable && !isSelected) { e.currentTarget.style.background = BRAND.openGreen; e.currentTarget.style.color = BRAND.white; } }}
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

function TimeSlotPicker({ dateStr, bookingsByDate, daySettings, selectedSize, onSelectSlot, selectedSlot }) {
  const dayBookings = bookingsByDate?.[dateStr] || [];
  const settings = daySettings?.[dateStr];
  const activeSlots = [...SALON_SLOTS, ...(settings?.extraSlots || [])];
  const capacities = computeSlotCapacities(dayBookings, activeSlots);

  const availableSlots = activeSlots.filter(slot => {
    const cap = capacities[slot];
    if (!cap || cap.available <= 0) return false;
    // Also check if the specific size can book
    const check = canBookSlot(dayBookings, slot, selectedSize, activeSlots);
    return check.allowed;
  });

  if (availableSlots.length === 0) {
    return (
      <div style={{ fontSize: 13, color: BRAND.textLight, textAlign: "center", padding: "12px 0" }}>
        No available slots for this size on this date.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
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
              padding: "10px 18px", borderRadius: 10,
              border: isSelected ? `2px solid ${BRAND.openGreen}` : `2px solid ${BRAND.greyLight}`,
              background: isSelected ? BRAND.openGreen : BRAND.white,
              color: isSelected ? BRAND.white : BRAND.text,
              fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
              transition: "all 0.15s", minWidth: 80, textAlign: "center",
            }}
            onMouseEnter={(e) => { if (!isSelected) { e.currentTarget.style.borderColor = BRAND.openGreen; e.currentTarget.style.background = BRAND.openGreenBg; } }}
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
}) {
  const [dogQuery, setDogQuery] = useState("");
  const [selectedDog, setSelectedDog] = useState(null);
  const [selectedHumanKey, setSelectedHumanKey] = useState("");
  const [service, setService] = useState("full_groom");
  const [selectedDateStr, setSelectedDateStr] = useState(initialDateStr || "");
  const [selectedSlot, setSelectedSlot] = useState(initialSlot || "");
  const [error, setError] = useState("");
  const [step, setStep] = useState(1); // 1=search dog, 2=pick service, 3=pick date, 4=pick time
  const searchRef = useRef(null);

  // Auto-focus the search field
  useEffect(() => {
    if (step === 1 && searchRef.current) {
      searchRef.current.focus();
    }
  }, [step]);

  // Build search entries (owner + trusted human variations)
  const allEntries = useMemo(() => buildSearchEntries(dogs, humans), [dogs, humans]);

  // Filter by query
  const filteredEntries = useMemo(() => {
    if (!dogQuery.trim() || selectedDog) return [];
    const q = dogQuery.toLowerCase().trim();
    return allEntries
      .filter(entry => {
        const searchStr = `${entry.dog.name} ${entry.dog.breed} ${entry.humanKey} ${entry.humanPhone}`.toLowerCase();
        return searchStr.includes(q);
      })
      .slice(0, 8);
  }, [dogQuery, allEntries, selectedDog]);

  const handleSelectEntry = (entry) => {
    setSelectedDog(entry.dog);
    setSelectedHumanKey(entry.humanKey);
    setDogQuery(entry.dog.name);
    setError("");
    setStep(2);
  };

  const handleClearDog = () => {
    setSelectedDog(null);
    setSelectedHumanKey("");
    setDogQuery("");
    setSelectedDateStr("");
    setSelectedSlot("");
    setStep(1);
  };

  const handleSelectDate = (date) => {
    const dateStr = toDateStr(date);
    setSelectedDateStr(dateStr);
    setSelectedSlot("");
    setStep(4);
  };

  const handleSelectSlot = (slot) => {
    setSelectedSlot(slot);
  };

  const size = selectedDog?.size || "small";

  const handleConfirm = () => {
    if (!selectedDog) { setError("Please select a dog."); return; }
    if (!selectedDateStr) { setError("Please select a date."); return; }
    if (!selectedSlot) { setError("Please select a time slot."); return; }

    // Final capacity check
    const dayBookings = bookingsByDate?.[selectedDateStr] || [];
    const settings = daySettings?.[selectedDateStr];
    const activeSlots = [...SALON_SLOTS, ...(settings?.extraSlots || [])];
    const check = canBookSlot(dayBookings, selectedSlot, size, activeSlots);
    if (!check.allowed) {
      setError(check.reason);
      return;
    }

    onAdd({
      id: Date.now(),
      slot: selectedSlot,
      dogName: selectedDog.name,
      breed: selectedDog.breed,
      size,
      service,
      owner: selectedDog.humanId,
    }, selectedDateStr);
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
              {selectedDog ? `${selectedDog.name} — ${selectedDog.breed}` : "Search for a dog to get started"}
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

          {/* ─── STEP 1: Dog Search ─── */}
          {selectedDog ? (
            <div style={{
              background: BRAND.blueLight, borderRadius: 12, padding: "12px 14px",
              display: "flex", alignItems: "center", gap: 10,
              border: `1.5px solid ${BRAND.blue}`,
            }}>
              <div style={{
                width: 40, height: 40, borderRadius: 10, background: BRAND.blue,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 20, flexShrink: 0,
              }}>🐕</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: BRAND.blueDark }}>
                  {selectedDog.name}
                  {selectedDog.alerts?.length > 0 && <span style={{ marginLeft: 6 }}>⚠️</span>}
                </div>
                <div style={{ fontSize: 12, color: BRAND.text }}>
                  {selectedDog.breed} · {size} · {selectedHumanKey}
                </div>
                {selectedDog.alerts?.length > 0 && (
                  <div style={{ fontSize: 11, color: BRAND.coral, fontWeight: 600, marginTop: 2 }}>
                    {selectedDog.alerts.join(", ")}
                  </div>
                )}
              </div>
              <button type="button" onClick={handleClearDog} style={{
                background: BRAND.white, border: `1.5px solid ${BRAND.greyLight}`, borderRadius: 8,
                padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer",
                color: BRAND.textLight, fontFamily: "inherit", transition: "all 0.15s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = BRAND.coral; e.currentTarget.style.color = BRAND.coral; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = BRAND.greyLight; e.currentTarget.style.color = BRAND.textLight; }}>
                Change
              </button>
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
                  onChange={(e) => { setDogQuery(e.target.value); setError(""); }}
                  style={{ ...inputStyle, paddingLeft: 36, fontSize: 15 }}
                  onFocus={(e) => (e.target.style.borderColor = BRAND.blue)}
                  onBlur={(e) => (e.target.style.borderColor = BRAND.greyLight)}
                />

                {/* Dropdown results */}
                {filteredEntries.length > 0 && (
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
                {dogQuery.trim().length >= 2 && filteredEntries.length === 0 && (
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

          {/* ─── STEP 2: Service Selection ─── */}
          {selectedDog && (
            <div>
              <label style={labelStyle}>Service</label>
              <select
                value={service}
                onChange={(e) => setService(e.target.value)}
                style={{ ...inputStyle, cursor: "pointer", fontWeight: 600 }}
              >
                {SERVICES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.icon} {s.name} — {PRICING[s.id]?.[size] || "N/A"}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* ─── STEP 3: Date Selection ─── */}
          {selectedDog && (
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

          {/* ─── STEP 4: Time Slot Selection ─── */}
          {selectedDateStr && selectedDog && (
            <div>
              <label style={labelStyle}>
                Available Times — {selectedDateDisplay}
              </label>
              <TimeSlotPicker
                dateStr={selectedDateStr}
                bookingsByDate={bookingsByDate}
                daySettings={daySettings}
                selectedSize={size}
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
            }}>
              {error}
            </div>
          )}

          {/* ─── Actions ─── */}
          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={handleConfirm}
              disabled={!selectedDog || !selectedDateStr || !selectedSlot}
              style={{
                flex: 1, padding: "13px 0", borderRadius: 12, border: "none",
                background: (!selectedDog || !selectedDateStr || !selectedSlot) ? BRAND.greyLight : BRAND.blue,
                color: (!selectedDog || !selectedDateStr || !selectedSlot) ? BRAND.textLight : BRAND.white,
                fontWeight: 700, fontSize: 14, cursor: (!selectedDog || !selectedDateStr || !selectedSlot) ? "not-allowed" : "pointer",
                fontFamily: "inherit", transition: "all 0.15s",
              }}
              onMouseEnter={(e) => { if (selectedDog && selectedDateStr && selectedSlot) e.currentTarget.style.background = BRAND.blueDark; }}
              onMouseLeave={(e) => { if (selectedDog && selectedDateStr && selectedSlot) e.currentTarget.style.background = BRAND.blue; }}
            >
              Confirm Booking
            </button>
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
