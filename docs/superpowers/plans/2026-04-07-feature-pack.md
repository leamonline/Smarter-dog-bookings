# Feature Pack — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add four independent features: dog alert indicators on booking cards, per-seat slot blocking, a stats/revenue view, and chain booking for recurring appointments.

**Architecture:** Four independent features with no shared dependencies. Each can be built, tested, and committed separately. All use the existing inline-styles approach, BRAND constants, and SalonContext pattern. The slot blocking feature re-enables existing capacity engine infrastructure that was disconnected during the recent UI redesign. The stats view adds a new tab. Chain booking adds a new modal launched from the dog card.

**Tech Stack:** React 19, inline styles, Supabase (PostgreSQL + hooks), BRAND/PRICING/SERVICES constants from `src/constants/index.js`, capacity engine from `src/engine/capacity.ts`.

**Spec:** `docs/superpowers/specs/2026-04-07-feature-pack-design.md`

---

### Task 1: Dog Alert Indicator on Booking Cards

**Files:**
- Modify: `src/components/booking/BookingCardNew.jsx`

The simplest feature — add a coral warning triangle SVG next to the dog name when the dog has alerts. No new files, no data changes.

- [ ] **Step 1: Add the alert triangle SVG to BookingCardNew**

In `src/components/booking/BookingCardNew.jsx`, find the row 1 div (the one with the size dot + dog name + price). Add a warning triangle after the dog name span, before the price span. Only render it when the dog has alerts.

Find this block in BookingCardNew.jsx (the row 1 section):
```jsx
        <span style={{ fontSize: 17, fontWeight: 800, color: BRAND.text }}>{displayDogName}</span>
        <span style={{
```

Replace with:
```jsx
        <span style={{ fontSize: 17, fontWeight: 800, color: BRAND.text }}>{displayDogName}</span>
        {dogRecord?.alerts?.length > 0 && (
          <svg width="14" height="14" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
            <path d="M12 2L1 21h22L12 2z" fill={BRAND.coral} />
            <text x="12" y="18" textAnchor="middle" fill="white" fontSize="14" fontWeight="900" fontFamily="inherit">!</text>
          </svg>
        )}
        <span style={{
```

- [ ] **Step 2: Verify in browser**

Open `http://localhost:5173`. Look at a booking card for a dog that has alerts (e.g., Bella has "Allergic to oatmeal shampoo", Max has "Bites / Nips"). A small coral triangle with white "!" should appear between the dog name and the price. Dogs without alerts (Luna, Charlie) should show no triangle.

- [ ] **Step 3: Commit**

```bash
git add src/components/booking/BookingCardNew.jsx
git commit -m "feat: add coral warning triangle on booking cards for dogs with alerts"
```

---

### Task 2: BlockedSeatCell Component

**Files:**
- Create: `src/components/booking/BlockedSeatCell.jsx`

A new component for rendering a blocked seat in the slot grid. Coral dashed border, block icon centred, click to unblock. Supports spanning both columns when both seats are blocked.

- [ ] **Step 1: Create the BlockedSeatCell component**

```jsx
// src/components/booking/BlockedSeatCell.jsx
import { BRAND } from "../../constants/index.js";

export function BlockedSeatCell({ onClick, span }) {
  return (
    <div
      onClick={onClick}
      style={{
        border: `2px dashed ${BRAND.coral}`,
        borderRadius: 12,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        transition: "all 0.15s",
        minHeight: 80,
        background: "rgba(232, 86, 127, 0.04)",
        ...(span ? { gridColumn: "2 / 4" } : {}),
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = BRAND.closedRed;
        e.currentTarget.style.background = "rgba(232, 86, 127, 0.08)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = BRAND.coral;
        e.currentTarget.style.background = "rgba(232, 86, 127, 0.04)";
      }}
    >
      {/* Block icon — circle with diagonal strike */}
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="9" stroke={BRAND.coral} strokeWidth="2" />
        <line x1="6" y1="6" x2="18" y2="18" stroke={BRAND.coral} strokeWidth="2" strokeLinecap="round" />
      </svg>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/booking/BlockedSeatCell.jsx
git commit -m "feat: add BlockedSeatCell component for slot blocking UI"
```

---

### Task 3: Update GhostSeat with Block Button

**Files:**
- Modify: `src/components/booking/GhostSeat.jsx`

Add an `onBlock` prop. When `onBlock` is provided, render two buttons side by side: "+" to book and a block icon to block. When `span` is true AND `onBlock` is provided, the "+" button opens a booking and the block icon shows a small popup to choose "Block seat 1", "Block seat 2", or "Block both".

- [ ] **Step 1: Rewrite GhostSeat with dual-button layout**

Replace the entire contents of `src/components/booking/GhostSeat.jsx` with:

```jsx
import { useState } from "react";
import { BRAND } from "../../constants/index.js";

function BlockMenu({ onBlock1, onBlock2, onBlockBoth, onClose }) {
  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        position: "absolute", top: "50%", left: "50%",
        transform: "translate(-50%, -50%)",
        background: BRAND.white, borderRadius: 10,
        boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
        border: `1.5px solid ${BRAND.greyLight}`,
        padding: 8, display: "flex", flexDirection: "column", gap: 4,
        zIndex: 10, minWidth: 140,
      }}
    >
      {[
        { label: "Block seat 1", action: onBlock1 },
        { label: "Block seat 2", action: onBlock2 },
        { label: "Block both", action: onBlockBoth },
      ].map(({ label, action }) => (
        <button
          key={label}
          onClick={() => { action(); onClose(); }}
          style={{
            padding: "6px 12px", borderRadius: 6, border: "none",
            background: "#FDE2E8", color: BRAND.coral,
            fontSize: 12, fontWeight: 700, cursor: "pointer",
            fontFamily: "inherit", transition: "all 0.15s",
            textAlign: "left",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = BRAND.coral; e.currentTarget.style.color = BRAND.white; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "#FDE2E8"; e.currentTarget.style.color = BRAND.coral; }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

const ICON_BTN = {
  width: 32, height: 32, borderRadius: 8, border: "none",
  display: "flex", alignItems: "center", justifyContent: "center",
  cursor: "pointer", transition: "all 0.15s", fontFamily: "inherit",
};

export function GhostSeat({ onClick, onBlock, span }) {
  const [showMenu, setShowMenu] = useState(false);

  // Simple ghost seat without blocking (e.g., rebook modal)
  if (!onBlock) {
    return (
      <div
        onClick={onClick}
        style={{
          border: `2px dashed ${BRAND.greyLight}`, borderRadius: 12,
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "#D1D5DB", fontSize: 22, cursor: "pointer",
          transition: "all 0.15s", minHeight: 80,
          ...(span ? { gridColumn: "2 / 4" } : {}),
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = BRAND.blue;
          e.currentTarget.style.color = BRAND.blue;
          e.currentTarget.style.background = "#F0FAFF";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = BRAND.greyLight;
          e.currentTarget.style.color = "#D1D5DB";
          e.currentTarget.style.background = "transparent";
        }}
      >
        +
      </div>
    );
  }

  // Ghost seat with block button
  return (
    <div
      style={{
        border: `2px dashed ${BRAND.greyLight}`, borderRadius: 12,
        display: "flex", alignItems: "center", justifyContent: "center",
        gap: 8, transition: "all 0.15s", minHeight: 80,
        position: "relative",
        ...(span ? { gridColumn: "2 / 4" } : {}),
      }}
    >
      {/* Book button */}
      <button
        onClick={onClick}
        style={{
          ...ICON_BTN,
          background: "#F0FAFF", color: BRAND.blue,
          fontSize: 18, fontWeight: 700,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = BRAND.blue; e.currentTarget.style.color = BRAND.white; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "#F0FAFF"; e.currentTarget.style.color = BRAND.blue; }}
      >
        +
      </button>

      {/* Block button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          if (span) {
            setShowMenu(true);
          } else {
            onBlock();
          }
        }}
        style={{
          ...ICON_BTN,
          background: "#FDE2E8", color: BRAND.coral,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = BRAND.coral; e.currentTarget.style.color = BRAND.white; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "#FDE2E8"; e.currentTarget.style.color = BRAND.coral; }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" />
          <line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      </button>

      {/* Block menu for spanning ghost seats */}
      {showMenu && (
        <BlockMenu
          onBlock1={() => onBlock(0)}
          onBlock2={() => onBlock(1)}
          onBlockBoth={() => { onBlock(0); onBlock(1); }}
          onClose={() => setShowMenu(false)}
        />
      )}
    </div>
  );
}
```

**Key design decisions:**
- When `onBlock` is not provided (e.g., in the rebook modal), behaves exactly like before — single "+" tap target.
- When `onBlock` IS provided and `span` is false (single seat): block icon calls `onBlock()` directly — no menu needed since we know which seat it is.
- When `onBlock` IS provided and `span` is true (both empty): block icon opens a 3-option menu. The `onBlock` callback receives a seat index: `onBlock(0)`, `onBlock(1)`, or both called in sequence.

- [ ] **Step 2: Commit**

```bash
git add src/components/booking/GhostSeat.jsx
git commit -m "feat: add block button to GhostSeat with seat picker menu for spanning seats"
```

---

### Task 4: Rewrite SlotGrid to Use Capacity Engine Seat States

**Files:**
- Modify: `src/components/booking/SlotGrid.jsx`

This is the main integration task for slot blocking. SlotGrid currently uses a simple "is there a booking or not" check. It needs to use `getSeatStatesForSlot()` from the capacity engine, which returns typed seat states including `"blocked"` with `staffBlocked: true` for staff-blocked seats.

- [ ] **Step 1: Rewrite SlotGrid.jsx**

Replace the entire contents of `src/components/booking/SlotGrid.jsx` with:

```jsx
import { BRAND } from "../../constants/index.js";
import { getSeatStatesForSlot } from "../../engine/capacity.js";
import { BookingCardNew } from "./BookingCardNew.jsx";
import { GhostSeat } from "./GhostSeat.jsx";
import { BlockedSeatCell } from "./BlockedSeatCell.jsx";

function formatSlotTime(slot) {
  const [hourStr, minStr] = slot.split(":");
  const hour = parseInt(hourStr, 10);
  const suffix = hour < 12 ? "am" : "pm";
  const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${displayHour}:${minStr}${suffix}`;
}

export function SlotGrid({
  bookings,
  activeSlots,
  onOpenNewBooking,
  currentDateStr,
  overrides,
  onOverride,
}) {
  return (
    <div
      style={{
        background: BRAND.white,
        border: `1px solid ${BRAND.greyLight}`,
        borderTop: "none",
        borderRadius: "0 0 14px 14px",
      }}
    >
      {activeSlots.map((slot, i) => {
        const slotOverrides = overrides?.[slot] || {};
        const seatStates = getSeatStatesForSlot(bookings, slot, activeSlots, slotOverrides);

        // Determine layout: check what types we have
        const types = seatStates.map((s) => s.type);
        const allAvailable = types.every((t) => t === "available");
        const allBlocked = types.every((t) => t === "blocked");
        const allBlockedByStaff = allBlocked && seatStates.every((s) => s.staffBlocked);

        return (
          <div
            key={slot}
            style={{
              display: "grid",
              gridTemplateColumns: "72px 1fr 1fr",
              gap: 10,
              padding: "10px 14px",
              minHeight: 100,
              alignItems: "center",
              borderBottom: i < activeSlots.length - 1
                ? "1px solid #F1F3F5"
                : "none",
            }}
          >
            {/* Time label */}
            <div
              style={{
                fontSize: 14,
                fontWeight: 800,
                color: BRAND.text,
                textAlign: "center",
                borderRight: `2px solid ${BRAND.greyLight}`,
                paddingRight: 10,
                alignSelf: "stretch",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {formatSlotTime(slot)}
            </div>

            {/* Seats */}
            {allAvailable ? (
              /* Both empty — spanning ghost seat */
              <GhostSeat
                span
                onClick={() => onOpenNewBooking(currentDateStr, slot)}
                onBlock={onOverride ? (seatIdx) => onOverride(currentDateStr, slot, seatIdx, "blocked") : undefined}
              />
            ) : allBlockedByStaff ? (
              /* Both staff-blocked — spanning blocked bar */
              <BlockedSeatCell
                span
                onClick={() => {
                  if (onOverride) {
                    onOverride(currentDateStr, slot, 0, "blocked");
                    onOverride(currentDateStr, slot, 1, "blocked");
                  }
                }}
              />
            ) : (
              /* Mixed — render each seat individually */
              <>
                {seatStates.map((seat) => {
                  if (seat.type === "booking") {
                    return <BookingCardNew key={seat.seatIndex} booking={seat.booking} />;
                  }
                  if (seat.type === "reserved") {
                    // Large dog spillover — muted placeholder
                    return (
                      <div
                        key={seat.seatIndex}
                        style={{
                          border: `1.5px solid ${BRAND.greyLight}`,
                          borderRadius: 12,
                          minHeight: 80,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          background: "#F9FAFB",
                          color: BRAND.textLight,
                          fontSize: 11,
                          fontWeight: 600,
                          fontStyle: "italic",
                        }}
                      >
                        (large dog)
                      </div>
                    );
                  }
                  if (seat.type === "blocked" && seat.staffBlocked) {
                    return (
                      <BlockedSeatCell
                        key={seat.seatIndex}
                        onClick={() => {
                          if (onOverride) onOverride(currentDateStr, slot, seat.seatIndex, "blocked");
                        }}
                      />
                    );
                  }
                  if (seat.type === "blocked") {
                    // System-blocked (capacity limit, early close) — show as unavailable, no unblock
                    return (
                      <div
                        key={seat.seatIndex}
                        style={{
                          border: `1.5px solid ${BRAND.greyLight}`,
                          borderRadius: 12,
                          minHeight: 80,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          background: "#F9FAFB",
                          color: "#D1D5DB",
                        }}
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                          <circle cx="12" cy="12" r="9" stroke="#D1D5DB" strokeWidth="2" />
                          <line x1="6" y1="6" x2="18" y2="18" stroke="#D1D5DB" strokeWidth="2" strokeLinecap="round" />
                        </svg>
                      </div>
                    );
                  }
                  // Available seat
                  return (
                    <GhostSeat
                      key={seat.seatIndex}
                      onClick={() => onOpenNewBooking(currentDateStr, slot)}
                      onBlock={onOverride ? () => onOverride(currentDateStr, slot, seat.seatIndex, "blocked") : undefined}
                    />
                  );
                })}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

**Key changes from previous SlotGrid:**
- Imports `getSeatStatesForSlot` from the capacity engine and `BlockedSeatCell`
- New props: `overrides` (the current day's override map from `currentSettings.overrides`) and `onOverride` (callback to `handleOverride`)
- Uses `getSeatStatesForSlot()` for each slot row to get typed seat states
- Renders five possible seat types: booking card, reserved (large dog), staff-blocked, system-blocked, available
- Staff-blocked seats render as `BlockedSeatCell` (clickable to unblock)
- System-blocked seats (capacity/early-close) render as a grey non-interactive placeholder
- Both-available spans a single GhostSeat; both-staff-blocked spans a single BlockedSeatCell

- [ ] **Step 2: Commit**

```bash
git add src/components/booking/SlotGrid.jsx
git commit -m "feat: rewrite SlotGrid to use capacity engine seat states with blocking support"
```

---

### Task 5: Wire Slot Blocking Through WeekCalendarView

**Files:**
- Modify: `src/components/layout/WeekCalendarView.jsx`

Re-add `handleOverride` to the props and pass it plus `currentSettings.overrides` through to SlotGrid.

- [ ] **Step 1: Add handleOverride back to WeekCalendarView props**

In `src/components/layout/WeekCalendarView.jsx`, find the destructured props:

```jsx
  // Handlers
  handleAdd,
  handleAddSlot,
  handleRemoveSlot,
  toggleDayOpen,
```

Replace with:

```jsx
  // Handlers
  handleAdd,
  handleOverride,
  handleAddSlot,
  handleRemoveSlot,
  toggleDayOpen,
```

- [ ] **Step 2: Pass overrides and onOverride to SlotGrid**

Find the `<SlotGrid` render:

```jsx
              <SlotGrid
                bookings={dayBookings}
                activeSlots={activeSlots}
                onOpenNewBooking={(dateStr, slot) => setShowNewBooking({ dateStr, slot })}
                currentDateStr={currentDateStr}
              />
```

Replace with:

```jsx
              <SlotGrid
                bookings={dayBookings}
                activeSlots={activeSlots}
                onOpenNewBooking={(dateStr, slot) => setShowNewBooking({ dateStr, slot })}
                currentDateStr={currentDateStr}
                overrides={currentSettings.overrides || {}}
                onOverride={handleOverride}
              />
```

- [ ] **Step 3: Verify in browser**

Open `http://localhost:5173`. On any day with empty slots, each ghost seat should now show two buttons: "+" (blue) and a block icon (coral). Click the block icon — the seat should turn into a coral dashed "Blocked" cell. Click the blocked cell — it should unblock back to a ghost seat. When both seats in a row are empty and you click block, a menu should appear letting you pick "Block seat 1", "Block seat 2", or "Block both".

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/WeekCalendarView.jsx
git commit -m "feat: wire handleOverride through WeekCalendarView to SlotGrid for seat blocking"
```

---

### Task 6: Stats View — Create StatsView Component

**Files:**
- Create: `src/components/views/StatsView.jsx`

A new view component showing weekly revenue breakdown (bar chart) and operational metrics. All data computed from `bookingsByDate` via `useSalon()`.

- [ ] **Step 1: Create StatsView.jsx**

```jsx
// src/components/views/StatsView.jsx
import { useMemo } from "react";
import { BRAND, PRICING, SERVICES, SALON_SLOTS } from "../../constants/index.js";
import { useSalon } from "../../contexts/SalonContext.jsx";
import { getDogByIdOrName, getHumanByIdOrName } from "../../engine/bookingRules.js";
import { toDateStr } from "../../supabase/transforms.js";

function parsePrice(service, size) {
  const priceStr = PRICING[service]?.[size] || "";
  const num = parseFloat(priceStr.replace(/[^0-9.]/g, ""));
  return isNaN(num) ? 0 : num;
}

function getWeekDates(refDate) {
  const d = new Date(refDate);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day; // Monday start
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  const dates = [];
  for (let i = 0; i < 7; i++) {
    const dt = new Date(monday);
    dt.setDate(monday.getDate() + i);
    dates.push(dt);
  }
  return dates;
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function RevenueForDay(bookings) {
  return bookings.reduce((sum, b) => sum + parsePrice(b.service, b.size), 0);
}

export function StatsView() {
  const { dogs, humans, bookingsByDate } = useSalon();

  const today = new Date();
  const todayStr = toDateStr(today);

  // This week's dates (Mon-Sun)
  const thisWeekDates = useMemo(() => getWeekDates(today), [todayStr]);

  // Last week's dates
  const lastWeekDates = useMemo(() => {
    const lastMon = new Date(thisWeekDates[0]);
    lastMon.setDate(lastMon.getDate() - 7);
    return getWeekDates(lastMon);
  }, [thisWeekDates]);

  // Weekly revenue data
  const thisWeekData = useMemo(() => {
    return thisWeekDates.map((date, i) => {
      const dateStr = toDateStr(date);
      const dayBookings = bookingsByDate[dateStr] || [];
      const revenue = RevenueForDay(dayBookings);
      return {
        label: DAY_LABELS[i],
        dateStr,
        revenue,
        count: dayBookings.length,
        isToday: dateStr === todayStr,
      };
    });
  }, [thisWeekDates, bookingsByDate, todayStr]);

  const lastWeekData = useMemo(() => {
    return lastWeekDates.map((date) => {
      const dateStr = toDateStr(date);
      const dayBookings = bookingsByDate[dateStr] || [];
      return RevenueForDay(dayBookings);
    });
  }, [lastWeekDates, bookingsByDate]);

  const thisWeekTotal = thisWeekData.reduce((s, d) => s + d.revenue, 0);
  const lastWeekTotal = lastWeekData.reduce((s, v) => s + v, 0);
  const maxDayRevenue = Math.max(...thisWeekData.map((d) => d.revenue), 1);

  // Monthly total (all loaded data for this month)
  const monthlyTotal = useMemo(() => {
    const month = today.getMonth();
    const year = today.getFullYear();
    let total = 0;
    for (const [dateStr, dayBookings] of Object.entries(bookingsByDate)) {
      const d = new Date(dateStr + "T00:00:00");
      if (d.getMonth() === month && d.getFullYear() === year) {
        total += RevenueForDay(dayBookings);
      }
    }
    return total;
  }, [bookingsByDate, todayStr]);

  // --- Operations ---

  // Busiest day of week (from loaded data)
  const busiestDay = useMemo(() => {
    const dayCounts = [0, 0, 0, 0, 0, 0, 0]; // Mon-Sun
    const dayTotals = [0, 0, 0, 0, 0, 0, 0];
    for (const [dateStr, dayBookings] of Object.entries(bookingsByDate)) {
      const d = new Date(dateStr + "T00:00:00");
      const dayIdx = d.getDay() === 0 ? 6 : d.getDay() - 1; // Mon=0
      dayCounts[dayIdx]++;
      dayTotals[dayIdx] += dayBookings.length;
    }
    let bestIdx = 0;
    let bestAvg = 0;
    for (let i = 0; i < 7; i++) {
      const avg = dayCounts[i] > 0 ? dayTotals[i] / dayCounts[i] : 0;
      if (avg > bestAvg) { bestAvg = avg; bestIdx = i; }
    }
    return { day: DAY_LABELS[bestIdx] + "s", avg: bestAvg.toFixed(1) };
  }, [bookingsByDate]);

  // Service breakdown
  const serviceBreakdown = useMemo(() => {
    const counts = {};
    for (const dayBookings of Object.values(bookingsByDate)) {
      for (const b of dayBookings) {
        counts[b.service] = (counts[b.service] || 0) + 1;
      }
    }
    return SERVICES
      .map((s) => ({ name: s.name, count: counts[s.id] || 0 }))
      .sort((a, b) => b.count - a.count);
  }, [bookingsByDate]);

  // Top 5 customers
  const topCustomers = useMemo(() => {
    const ownerCounts = {};
    for (const dayBookings of Object.values(bookingsByDate)) {
      for (const b of dayBookings) {
        const dog = getDogByIdOrName(dogs, b.dog_id || b.dogName);
        const human = dog?.owner_id
          ? getHumanByIdOrName(humans, dog.owner_id)
          : null;
        const name = human
          ? `${human.first_name || ""} ${human.last_name || ""}`.trim()
          : b.ownerName || b.owner || "Unknown";
        if (name && name !== "Unknown") {
          ownerCounts[name] = (ownerCounts[name] || 0) + 1;
        }
      }
    }
    return Object.entries(ownerCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));
  }, [bookingsByDate, dogs, humans]);

  // Daily averages
  const thisWeekAvg = (thisWeekData.reduce((s, d) => s + d.count, 0) / 7).toFixed(1);
  const lastWeekAvg = useMemo(() => {
    const total = lastWeekDates.reduce((sum, date) => {
      const dateStr = toDateStr(date);
      return sum + (bookingsByDate[dateStr] || []).length;
    }, 0);
    return (total / 7).toFixed(1);
  }, [lastWeekDates, bookingsByDate]);

  // --- Render ---

  const cardStyle = {
    background: BRAND.white,
    border: `1px solid ${BRAND.greyLight}`,
    borderRadius: 14,
    padding: "20px 24px",
    boxShadow: "0 2px 12px rgba(0,0,0,0.04)",
  };

  const sectionTitle = {
    fontSize: 13,
    fontWeight: 800,
    color: BRAND.textLight,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 16,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Revenue card */}
      <div style={cardStyle}>
        <div style={sectionTitle}>Revenue</div>

        {/* Hero total */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 20 }}>
          <span style={{ fontSize: 32, fontWeight: 900, color: BRAND.text }}>
            £{thisWeekTotal}
          </span>
          <span style={{ fontSize: 14, fontWeight: 600, color: BRAND.textLight }}>
            this week
          </span>
        </div>

        {/* Bar chart */}
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end", height: 120, marginBottom: 16 }}>
          {thisWeekData.map((day) => (
            <div key={day.label} style={{ flex: 1, textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
              <div
                style={{
                  width: "100%",
                  maxWidth: 40,
                  height: `${Math.max((day.revenue / maxDayRevenue) * 100, 4)}%`,
                  background: day.isToday ? BRAND.teal : BRAND.blue,
                  borderRadius: "6px 6px 0 0",
                  transition: "height 0.3s",
                  minHeight: 4,
                }}
              />
              <div style={{ fontSize: 11, fontWeight: 700, color: BRAND.text, marginTop: 6 }}>
                {day.label}
              </div>
              <div style={{ fontSize: 11, fontWeight: 600, color: BRAND.textLight }}>
                £{day.revenue}
              </div>
            </div>
          ))}
        </div>

        {/* Comparisons */}
        <div style={{ display: "flex", gap: 24 }}>
          <div>
            <span style={{ fontSize: 12, fontWeight: 600, color: BRAND.textLight }}>Last week: </span>
            <span style={{ fontSize: 14, fontWeight: 800, color: BRAND.text }}>£{lastWeekTotal}</span>
          </div>
          <div>
            <span style={{ fontSize: 12, fontWeight: 600, color: BRAND.textLight }}>This month: </span>
            <span style={{ fontSize: 14, fontWeight: 800, color: BRAND.text }}>£{monthlyTotal}</span>
          </div>
        </div>
      </div>

      {/* Operations card */}
      <div style={cardStyle}>
        <div style={sectionTitle}>Operations</div>

        {/* Busiest day */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: BRAND.text }}>
            {busiestDay.day} are your busiest day
          </div>
          <div style={{ fontSize: 12, fontWeight: 600, color: BRAND.textLight }}>
            avg {busiestDay.avg} bookings per {busiestDay.day.slice(0, -1).toLowerCase()}
          </div>
        </div>

        {/* Service breakdown */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: BRAND.textLight, marginBottom: 8 }}>
            Services
          </div>
          {serviceBreakdown.map((svc) => {
            const pct = serviceBreakdown[0]?.count > 0
              ? (svc.count / serviceBreakdown[0].count) * 100
              : 0;
            return (
              <div key={svc.name} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: BRAND.text, width: 110, flexShrink: 0 }}>
                  {svc.name}
                </span>
                <div style={{ flex: 1, height: 8, background: "#F1F3F5", borderRadius: 4, overflow: "hidden" }}>
                  <div style={{ width: `${pct}%`, height: "100%", background: BRAND.blue, borderRadius: 4 }} />
                </div>
                <span style={{ fontSize: 12, fontWeight: 800, color: BRAND.text, width: 30, textAlign: "right" }}>
                  {svc.count}
                </span>
              </div>
            );
          })}
        </div>

        {/* Top customers */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: BRAND.textLight, marginBottom: 8 }}>
            Top Customers
          </div>
          {topCustomers.map((c, i) => (
            <div key={c.name} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0" }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: BRAND.text }}>
                {i + 1}. {c.name}
              </span>
              <span style={{ fontSize: 12, fontWeight: 800, color: BRAND.blue }}>
                {c.count} booking{c.count !== 1 ? "s" : ""}
              </span>
            </div>
          ))}
          {topCustomers.length === 0 && (
            <div style={{ fontSize: 12, color: BRAND.textLight }}>No booking data yet</div>
          )}
        </div>

        {/* Daily averages */}
        <div style={{ display: "flex", gap: 24 }}>
          <div>
            <span style={{ fontSize: 12, fontWeight: 600, color: BRAND.textLight }}>This week: </span>
            <span style={{ fontSize: 14, fontWeight: 800, color: BRAND.text }}>{thisWeekAvg}/day</span>
          </div>
          <div>
            <span style={{ fontSize: 12, fontWeight: 600, color: BRAND.textLight }}>Last week: </span>
            <span style={{ fontSize: 14, fontWeight: 800, color: BRAND.text }}>{lastWeekAvg}/day</span>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/views/StatsView.jsx
git commit -m "feat: add StatsView with weekly revenue bar chart and operational metrics"
```

---

### Task 7: Add Stats Tab to Navigation and App.jsx

**Files:**
- Modify: `src/components/layout/AppToolbar.jsx`
- Modify: `src/App.jsx`

Wire StatsView into the app navigation.

- [ ] **Step 1: Add "Stats" to AppToolbar NAV_ITEMS**

In `src/components/layout/AppToolbar.jsx`, find:

```jsx
const NAV_ITEMS = [
  { key: "dashboard", label: "Bookings" },
  { key: "dogs", label: "Dogs" },
  { key: "humans", label: "Humans" },
];
```

Replace with:

```jsx
const NAV_ITEMS = [
  { key: "dashboard", label: "Bookings" },
  { key: "dogs", label: "Dogs" },
  { key: "humans", label: "Humans" },
  { key: "stats", label: "Stats" },
];
```

- [ ] **Step 2: Add StatsView to the App.jsx view switcher**

In `src/App.jsx`, add a lazy import near the top (after the other view imports):

Find:
```jsx
import { ReportsView } from "./components/views/ReportsView.jsx";
```

Add after it:
```jsx
const StatsView = lazy(() =>
  import("./components/views/StatsView.jsx").then((m) => ({ default: m.StatsView })),
);
```

Then in the view switcher section, find:
```jsx
          ) : activeView === "reports" ? (
            <ReportsView />
          ) : (
```

Replace with:
```jsx
          ) : activeView === "reports" ? (
            <ReportsView />
          ) : activeView === "stats" ? (
            <StatsView />
          ) : (
```

- [ ] **Step 3: Verify in browser**

Open `http://localhost:5173`. The top nav should now show "Bookings | Dogs | Humans | Stats". Click "Stats" — the view should render with a revenue card (bar chart with Mon–Sun bars) and an operations card (busiest day, service breakdown, top customers, daily averages).

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/AppToolbar.jsx src/App.jsx
git commit -m "feat: add Stats tab to navigation with lazy-loaded StatsView"
```

---

### Task 8: Chain Booking — Database Migration

**Files:**
- DB migration via Supabase

Add a nullable `chain_id` UUID column to the `bookings` table.

- [ ] **Step 1: Run the migration**

Using the Supabase MCP tool, execute:

```sql
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS chain_id UUID DEFAULT NULL;
COMMENT ON COLUMN bookings.chain_id IS 'Groups bookings created together via chain booking. Nullable, no FK.';
```

- [ ] **Step 2: Verify**

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'bookings' AND column_name = 'chain_id';
```

Expected: `chain_id | uuid | YES`

- [ ] **Step 3: Commit a note**

No code file to commit — this is a DB-only change. Optionally add a migration file if the project uses tracked migrations, otherwise note in the commit:

```bash
git commit --allow-empty -m "chore: add chain_id UUID column to bookings table (DB migration)"
```

---

### Task 9: Chain Booking — ChainBookingModal Component

**Files:**
- Create: `src/components/modals/ChainBookingModal.jsx`

The chain builder modal. Shows the dog's last booking as template, lets staff add up to 10 future appointments by specifying weeks between each. Each link shows the calculated date, service, slot, and size — all editable. Availability warnings shown when a slot may be full.

- [ ] **Step 1: Create ChainBookingModal.jsx**

```jsx
// src/components/modals/ChainBookingModal.jsx
import { useState, useMemo, useCallback } from "react";
import { BRAND, SERVICES, SALON_SLOTS, PRICING } from "../../constants/index.js";
import { useSalon } from "../../contexts/SalonContext.jsx";
import { canBookSlot } from "../../engine/capacity.js";
import { toDateStr } from "../../supabase/transforms.js";

const SIZES = ["small", "medium", "large"];
const MAX_CHAIN = 10;

function addWeeks(date, weeks) {
  const d = new Date(date);
  d.setDate(d.getDate() + weeks * 7);
  return d;
}

function formatDate(date) {
  return date.toLocaleDateString("en-GB", {
    weekday: "short", day: "numeric", month: "short", year: "numeric",
  });
}

export function ChainBookingModal({ dog, lastBooking, onClose, onCreateChain }) {
  const { bookingsByDate, daySettings } = useSalon();

  // Template defaults from last booking
  const [service, setService] = useState(lastBooking?.service || "full-groom");
  const [slot, setSlot] = useState(lastBooking?.slot || "09:00");
  const [size, setSize] = useState(lastBooking?.size || dog?.size || "medium");

  // Chain links already added
  const [chain, setChain] = useState([]);

  // Current input
  const [weeksGap, setWeeksGap] = useState("");

  // Per-link overrides
  const [linkService, setLinkService] = useState(service);
  const [linkSlot, setLinkSlot] = useState(slot);
  const [linkSize, setLinkSize] = useState(size);

  const [creating, setCreating] = useState(false);

  // Anchor date: last chain link's date, or today
  const anchorDate = chain.length > 0 ? chain[chain.length - 1].date : new Date();

  // Calculated date for current input
  const weeksNum = parseInt(weeksGap, 10);
  const calculatedDate = weeksNum > 0 ? addWeeks(anchorDate, weeksNum) : null;

  // Check slot availability for calculated date
  const availabilityWarning = useMemo(() => {
    if (!calculatedDate) return null;
    const dateStr = toDateStr(calculatedDate);
    const dayBookings = bookingsByDate[dateStr] || [];
    if (dayBookings.length === 0) return null; // No data loaded = assume fine
    const settings = daySettings?.[dateStr] || { overrides: {}, extraSlots: [] };
    const activeSlots = [...SALON_SLOTS, ...(settings.extraSlots || [])];
    const result = canBookSlot(dayBookings, linkSlot, linkSize, activeSlots, {
      overrides: settings.overrides?.[linkSlot] || {},
    });
    return result.allowed ? null : `This slot may be full on ${formatDate(calculatedDate)}`;
  }, [calculatedDate, linkSlot, linkSize, bookingsByDate, daySettings]);

  const addLink = useCallback(() => {
    if (!calculatedDate || chain.length >= MAX_CHAIN) return;
    setChain((prev) => [
      ...prev,
      {
        date: calculatedDate,
        dateStr: toDateStr(calculatedDate),
        service: linkService,
        slot: linkSlot,
        size: linkSize,
      },
    ]);
    setWeeksGap("");
    // Carry forward current template for next link
  }, [calculatedDate, linkService, linkSlot, linkSize, chain.length]);

  const removeLink = useCallback((idx) => {
    setChain((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const handleConfirmAll = async () => {
    if (chain.length === 0) return;
    setCreating(true);
    await onCreateChain(chain);
    setCreating(false);
    onClose();
  };

  const price = PRICING[linkService]?.[linkSize] || "";

  // -- Styles --
  const overlayStyle = {
    position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
    background: "rgba(0,0,0,0.35)",
    display: "flex", alignItems: "center", justifyContent: "center",
    zIndex: 1000,
  };
  const modalStyle = {
    background: BRAND.white, borderRadius: 16, width: 460,
    maxHeight: "85vh", overflow: "auto",
    padding: "24px 28px", boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
  };
  const selectStyle = {
    padding: "8px 10px", borderRadius: 8, border: `1.5px solid ${BRAND.greyLight}`,
    fontSize: 13, fontWeight: 600, fontFamily: "inherit", background: BRAND.white,
    color: BRAND.text, cursor: "pointer",
  };
  const inputStyle = {
    ...selectStyle, width: 60, textAlign: "center",
  };

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{ fontSize: 18, fontWeight: 800, color: BRAND.text, marginBottom: 4 }}>
          Recurring Bookings — {dog?.name || "Dog"}
        </div>
        <div style={{ fontSize: 13, color: BRAND.textLight, marginBottom: 20 }}>
          Build a chain of future appointments. Each one counts from the last.
        </div>

        {/* Template row */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
          <select value={linkService} onChange={(e) => setLinkService(e.target.value)} style={selectStyle}>
            {SERVICES.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select value={linkSlot} onChange={(e) => setLinkSlot(e.target.value)} style={selectStyle}>
            {SALON_SLOTS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={linkSize} onChange={(e) => setLinkSize(e.target.value)} style={selectStyle}>
            {SIZES.map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
          </select>
          {price && (
            <span style={{ fontSize: 14, fontWeight: 800, color: "#1E6B5C" }}>{price}</span>
          )}
        </div>

        {/* Weeks input */}
        {chain.length < MAX_CHAIN && (
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            marginBottom: 8, flexWrap: "wrap",
          }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: BRAND.text }}>Book in</span>
            <input
              type="number"
              min="1"
              max="52"
              value={weeksGap}
              onChange={(e) => setWeeksGap(e.target.value)}
              placeholder="—"
              style={inputStyle}
            />
            <span style={{ fontSize: 14, fontWeight: 600, color: BRAND.text }}>weeks' time</span>
            {calculatedDate && (
              <span style={{ fontSize: 13, fontWeight: 700, color: BRAND.blue }}>
                → {formatDate(calculatedDate)}
              </span>
            )}
          </div>
        )}

        {/* Availability warning */}
        {availabilityWarning && (
          <div style={{
            padding: "8px 12px", borderRadius: 8, marginBottom: 8,
            background: "#FFF8E0", color: "#92400E",
            fontSize: 12, fontWeight: 700,
            display: "flex", alignItems: "center", gap: 6,
          }}>
            <span style={{ fontSize: 16 }}>⚠</span> {availabilityWarning}
          </div>
        )}

        {/* Add button */}
        {calculatedDate && chain.length < MAX_CHAIN && (
          <button
            onClick={addLink}
            style={{
              padding: "8px 16px", borderRadius: 8, border: "none",
              background: BRAND.blue, color: BRAND.white,
              fontSize: 13, fontWeight: 700, cursor: "pointer",
              fontFamily: "inherit", marginBottom: 16,
            }}
          >
            Add to chain
          </button>
        )}

        {/* Chain list */}
        {chain.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: BRAND.textLight, marginBottom: 8 }}>
              Chain ({chain.length}/{MAX_CHAIN})
            </div>
            {chain.map((link, idx) => {
              const svc = SERVICES.find((s) => s.id === link.service);
              return (
                <div
                  key={idx}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "8px 10px", borderRadius: 8, marginBottom: 4,
                    background: "#F8FAFB",
                    border: `1px solid ${BRAND.greyLight}`,
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: 800, color: BRAND.text, width: 20 }}>
                    {idx + 1}.
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: BRAND.text, flex: 1 }}>
                    {formatDate(link.date)} — {link.slot} — {svc?.name || link.service}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: BRAND.textLight }}>
                    {link.size}
                  </span>
                  <button
                    onClick={() => removeLink(idx)}
                    style={{
                      width: 24, height: 24, borderRadius: 6, border: "none",
                      background: "#FDE2E8", color: BRAND.coral,
                      fontSize: 14, fontWeight: 700, cursor: "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontFamily: "inherit",
                    }}
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            onClick={onClose}
            style={{
              padding: "10px 20px", borderRadius: 10, border: `1.5px solid ${BRAND.greyLight}`,
              background: BRAND.white, color: BRAND.text,
              fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
            }}
          >
            Cancel
          </button>
          {chain.length > 0 && (
            <button
              onClick={handleConfirmAll}
              disabled={creating}
              style={{
                padding: "10px 20px", borderRadius: 10, border: "none",
                background: creating ? BRAND.textLight : BRAND.blue,
                color: BRAND.white,
                fontSize: 13, fontWeight: 700, cursor: creating ? "not-allowed" : "pointer",
                fontFamily: "inherit",
              }}
            >
              {creating ? "Creating..." : `Confirm All (${chain.length})`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/modals/ChainBookingModal.jsx
git commit -m "feat: add ChainBookingModal for building recurring booking chains"
```

---

### Task 10: Wire Chain Booking into DogCardModal

**Files:**
- Modify: `src/components/modals/DogCardModal.jsx`

Add a "Recurring Bookings" button to the dog card modal. When clicked, opens the ChainBookingModal. The button only shows when the dog has at least one booking.

- [ ] **Step 1: Read DogCardModal to find the right insertion point**

Read the DogCardModal component to identify where the button should go — after the existing action buttons, before the grooming history section.

- [ ] **Step 2: Add lazy import and state**

At the top of `src/components/modals/DogCardModal.jsx`, add a lazy import for ChainBookingModal. Find the existing imports:

```jsx
import { useState, useEffect, useMemo } from "react";
```

Replace with:

```jsx
import { useState, useEffect, useMemo, lazy, Suspense } from "react";
```

After the existing imports at the top of the file, add:

```jsx
const ChainBookingModal = lazy(() =>
  import("./ChainBookingModal.jsx").then((m) => ({ default: m.ChainBookingModal })),
);
```

- [ ] **Step 3: Add state and handler inside DogCardModal**

Inside the `DogCardModal` function body (after the existing state variables), add:

```jsx
  const [showChainBooking, setShowChainBooking] = useState(false);
```

Find the dog's most recent booking from bookingsByDate for the chain template. Add after the state declaration:

```jsx
  // Find the dog's most recent booking as chain template
  const lastBooking = useMemo(() => {
    if (!resolvedDog?.id && !resolvedDog?.name) return null;
    const allBookings = Object.values(bookingsByDate || {}).flat();
    const dogBookings = allBookings.filter(
      (b) => b.dog_id === resolvedDog.id || b.dogName === resolvedDog.name,
    );
    if (dogBookings.length === 0) return null;
    // Sort by date descending, return most recent
    return dogBookings.sort((a, b) => (b.booking_date || "").localeCompare(a.booking_date || ""))[0] || null;
  }, [resolvedDog, bookingsByDate]);
```

- [ ] **Step 4: Add the "Recurring Bookings" button**

Find the location in the DogCardModal render where action buttons are shown (look for edit buttons or action areas). Add the recurring bookings button alongside them. It should only render when `lastBooking` exists:

```jsx
  {lastBooking && (
    <button
      onClick={() => setShowChainBooking(true)}
      style={{
        width: "100%",
        padding: "10px",
        borderRadius: 10,
        border: "none",
        background: BRAND.teal,
        color: BRAND.white,
        fontSize: 13,
        fontWeight: 700,
        cursor: "pointer",
        fontFamily: "inherit",
        transition: "all 0.15s",
        marginTop: 8,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = "#1E6B5C"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = BRAND.teal; }}
    >
      Recurring Bookings
    </button>
  )}
```

- [ ] **Step 5: Add the ChainBookingModal render**

At the end of the DogCardModal JSX (before the closing fragment or final `</div>`), add:

```jsx
  {showChainBooking && lastBooking && (
    <Suspense fallback={null}>
      <ChainBookingModal
        dog={resolvedDog}
        lastBooking={lastBooking}
        onClose={() => setShowChainBooking(false)}
        onCreateChain={async (chain) => {
          const chainId = crypto.randomUUID();
          for (const link of chain) {
            await handleAdd({
              dogName: resolvedDog.name,
              dog_id: resolvedDog.id,
              breed: resolvedDog.breed,
              size: link.size,
              service: link.service,
              slot: link.slot,
              owner: humanRecord?.id || resolvedDog.human_id || "",
              ownerName: humanRecord
                ? `${humanRecord.first_name || ""} ${humanRecord.last_name || ""}`.trim()
                : "",
              status: "Not Arrived",
              chain_id: chainId,
            }, link.dateStr);
          }
        }}
      />
    </Suspense>
  )}
```

Note: `handleAdd` needs to be available in this component. It's currently not passed as a prop to DogCardModal. Check if it's available via `useSalon()` context — if not, it needs to be threaded through. The `useSalon()` context does not expose `handleAdd`. Two options:

**Option A (recommended):** Pass `handleAdd` as a new prop to DogCardModal from App.jsx.

**Option B:** Access it via a new context value.

Go with Option A. In `src/App.jsx`, find the DogCardModal render and add the `handleAdd` prop:

Find in App.jsx where `DogCardModal` is rendered (search for `<DogCardModal`):

Add `handleAdd={handleAdd}` to the existing props.

Then in DogCardModal, add `handleAdd` to the destructured props alongside `fetchBookingHistoryForDog`.

- [ ] **Step 6: Verify in browser**

Open `http://localhost:5173`. Open a dog card (e.g., click a dog name from the Dogs tab). If the dog has any bookings, you should see a "Recurring Bookings" button. Click it — the chain builder should open. Set a number of weeks, see the calculated date, add it, repeat. The chain list should grow. Click "Confirm All" — bookings should be created.

- [ ] **Step 7: Commit**

```bash
git add src/components/modals/DogCardModal.jsx src/App.jsx
git commit -m "feat: add Recurring Bookings button to DogCardModal with chain booking flow"
```

---

### Task 11: Final Build Verification

**Files:** None (verification only)

- [ ] **Step 1: Run production build**

```bash
node node_modules/.bin/vite build
```

Expected: clean build, no errors, no warnings.

- [ ] **Step 2: Browser walkthrough**

Test each feature at `http://localhost:5173`:

1. **Dog alerts**: Check a booking card for a dog with alerts (Bella, Max) — coral triangle visible. Dogs without alerts — no triangle.
2. **Slot blocking**: Block a seat (click coral icon) — see it turn blocked. Unblock (click blocked cell). Block both seats in an empty row — see spanning blocked bar. Refresh — blocks persist (Supabase).
3. **Stats**: Click "Stats" tab — see revenue bar chart and operational metrics. Check revenue matches bookings.
4. **Chain booking**: Open a dog card → "Recurring Bookings" → build a chain of 2-3 appointments → confirm. Check the calendar — bookings should appear on the calculated dates.

- [ ] **Step 3: Commit any final fixes**

If any issues found during verification, fix and commit with a descriptive message.
