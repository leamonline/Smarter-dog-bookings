# Bookings Page Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current WeekCalendarView with a day-focused bookings page featuring calendar tab navigation, two-seat slot grid, redesigned booking cards, and floating revenue/book-now elements.

**Architecture:** The existing `WeekCalendarView.jsx` gets a major rewrite. New sub-components are created in `src/components/booking/` and `src/components/layout/` following existing patterns. The capacity engine, data hooks, and App.jsx prop interface are unchanged — this is purely a visual layer rewrite.

**Tech Stack:** React 19, inline styles, Supabase data via existing hooks, BRAND/SIZE_THEME constants from `src/constants/brand.js`.

**Spec:** `docs/superpowers/specs/2026-04-07-bookings-page-redesign.md`
**Mockup:** `.superpowers/brainstorm/27499-1775568694/content/bookings-v4.html`

---

### Task 1: ShopSign Component

**Files:**
- Create: `src/components/layout/ShopSign.jsx`

This is a pure presentational component with no data dependencies — a good warm-up.

- [ ] **Step 1: Create the ShopSign component**

```jsx
// src/components/layout/ShopSign.jsx
import { BRAND } from "../../constants/index.js";

export function ShopSign({ isOpen }) {
  const colour = isOpen ? BRAND.openGreen : BRAND.closedRed;
  const label = isOpen ? "Open" : "Closed";

  return (
    <div style={{ transform: "rotate(-4deg)", flexShrink: 0 }}>
      <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "center" }}>
        {/* Hook */}
        <div style={{
          width: 18, height: 9,
          border: "2px solid rgba(255,255,255,0.25)",
          borderBottom: "none",
          borderRadius: "9px 9px 0 0",
          marginBottom: -2,
        }} />
        {/* Sign body */}
        <div style={{
          background: colour, borderRadius: 10,
          padding: "7px 22px",
          fontSize: 15, fontWeight: 900, color: BRAND.white,
          letterSpacing: 2, textTransform: "uppercase",
          boxShadow: `0 3px 10px ${isOpen ? "rgba(22,163,74,0.35)" : "rgba(220,38,38,0.35)"}, inset 0 1px 0 rgba(255,255,255,0.2)`,
          border: "2px solid rgba(255,255,255,0.15)",
          position: "relative",
        }}>
          {/* Shine */}
          <div style={{
            position: "absolute", top: 3, left: 8, right: 8,
            height: 3, background: "rgba(255,255,255,0.15)", borderRadius: 3,
          }} />
          {label}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it renders**

Open the app at `http://localhost:5173`, temporarily import and render `<ShopSign isOpen={true} />` inside the current view to confirm it appears. Then remove the temporary render.

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/ShopSign.jsx
git commit -m "feat: add ShopSign component for open/closed status display"
```

---

### Task 2: BookingCard Redesign

**Files:**
- Create: `src/components/booking/BookingCardNew.jsx`

Named `BookingCardNew` to avoid breaking the existing `BookingCard.jsx` which is used in the current view. We'll swap references in the final integration task.

- [ ] **Step 1: Create BookingCardNew component**

```jsx
// src/components/booking/BookingCardNew.jsx
import { BRAND, SERVICES, BOOKING_STATUSES, PRICING } from "../../constants/index.js";
import { useSalon } from "../../contexts/SalonContext.jsx";
import { getDogByIdOrName, getHumanByIdOrName } from "../../engine/bookingRules.js";

const SIZE_COLOURS = {
  small: { dot: "#F5C518", border: "#D4A500" },
  medium: { dot: "#2D8B7A", border: "#1E6B5C" },
  large: { dot: "#E8567F", border: "#C93D63" },
};

const STATUS_STYLES = {
  "Not Arrived": { bg: "#FFF8E0", color: "#92400E" },
  "Checked In": { bg: "#DCFCE7", color: "#16A34A" },
  "In the Bath": { bg: "#E0F7FC", color: "#0099BD" },
  "Ready for Pick-up": { bg: "#EDE9FE", color: "#7C3AED" },
  "Completed": { bg: "#F3F4F6", color: "#374151" },
};

const PILL_BASE = {
  flex: 1, fontSize: 10, fontWeight: 700,
  padding: "5px 0", borderRadius: 6,
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
};

function statusLabel(status) {
  if (status === "Ready for Pick-up") return "Ready";
  return status;
}

export function BookingCardNew({ booking, onClick }) {
  const { dogs, humans } = useSalon();

  const dog = getDogByIdOrName(dogs, booking.dog_id, booking.dogName);
  const human = dog?.owner_id ? getHumanByIdOrName(humans, dog.owner_id) : null;
  const service = SERVICES.find((s) => s.id === booking.service);
  const sizeCol = SIZE_COLOURS[booking.size] || SIZE_COLOURS.medium;
  const statusStyle = STATUS_STYLES[booking.status] || STATUS_STYLES["Not Arrived"];
  const price = PRICING[booking.service]?.[booking.size] || "";

  const dogName = dog?.name || booking.dogName || "Unknown";
  const breed = dog?.breed || booking.breed || "";
  const ownerName = human
    ? `${human.first_name || ""} ${human.last_name || ""}`.trim()
    : booking.ownerName || "";

  const pickupText = booking.status === "Completed"
    ? `Collected${booking.pickup_time ? ` ${booking.pickup_time}` : ""}`
    : booking.pickup_time
      ? `Pick-up ${booking.pickup_time}`
      : "";

  return (
    <div
      onClick={onClick}
      style={{
        background: BRAND.white, border: `1.5px solid ${BRAND.greyLight}`,
        borderLeft: `4px solid ${sizeCol.border}`,
        borderRadius: 12, padding: "14px 16px",
        display: "flex", flexDirection: "column", gap: 4,
        cursor: "pointer", transition: "all 0.15s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = BRAND.blue;
        e.currentTarget.style.borderLeftColor = sizeCol.border;
        e.currentTarget.style.boxShadow = "0 2px 12px rgba(0,0,0,0.06)";
        e.currentTarget.style.transform = "translateY(-1px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = BRAND.greyLight;
        e.currentTarget.style.borderLeftColor = sizeCol.border;
        e.currentTarget.style.boxShadow = "none";
        e.currentTarget.style.transform = "none";
      }}
    >
      {/* Row 1: size dot + dog name + price */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{
          width: 12, height: 12, borderRadius: "50%", flexShrink: 0,
          background: sizeCol.dot, boxShadow: "0 1px 3px rgba(0,0,0,0.15)",
        }} />
        <span style={{ fontSize: 17, fontWeight: 800, color: BRAND.text }}>{dogName}</span>
        <span style={{
          marginLeft: "auto", fontSize: 17, fontWeight: 900,
          color: "#1E6B5C", flexShrink: 0,
        }}>{price}</span>
      </div>

      {/* Row 2: breed */}
      <div style={{ fontSize: 14, fontWeight: 600, color: BRAND.grey, paddingLeft: 20 }}>
        {breed}
      </div>

      {/* Row 3: owner */}
      <div style={{ fontSize: 14, fontWeight: 700, color: BRAND.teal, paddingLeft: 20 }}>
        {ownerName}
      </div>

      {/* Row 4: pill row */}
      <div style={{ display: "flex", gap: 5, paddingLeft: 20, marginTop: 6 }}>
        <span style={{ ...PILL_BASE, background: "#F1F3F5", color: BRAND.greyDark }}>
          {service?.name || booking.service}
        </span>
        <span style={{ ...PILL_BASE, background: "#F3EEFF", color: "#7C3AED" }}>
          {pickupText || "—"}
        </span>
        <span style={{ ...PILL_BASE, background: statusStyle.bg, color: statusStyle.color }}>
          {statusLabel(booking.status)}
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it renders**

Temporarily import `BookingCardNew` in the current `SlotRow.jsx` alongside the existing card to confirm it renders correctly with real booking data. Then revert.

- [ ] **Step 3: Commit**

```bash
git add src/components/booking/BookingCardNew.jsx
git commit -m "feat: add BookingCardNew component with clear info hierarchy and pill row"
```

---

### Task 3: GhostSeat and SlotGrid Components

**Files:**
- Create: `src/components/booking/GhostSeat.jsx`
- Create: `src/components/booking/SlotGrid.jsx`

- [ ] **Step 1: Create GhostSeat component**

```jsx
// src/components/booking/GhostSeat.jsx
import { BRAND } from "../../constants/index.js";

export function GhostSeat({ onClick, span }) {
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
```

- [ ] **Step 2: Create SlotGrid component**

This renders the full time-slot grid for a single day. It uses the existing capacity engine to determine seat layout.

```jsx
// src/components/booking/SlotGrid.jsx
import { useMemo } from "react";
import { BRAND, SALON_SLOTS } from "../../constants/index.js";
import { computeSlotCapacities } from "../../engine/capacity.js";
import { BookingCardNew } from "./BookingCardNew.jsx";
import { GhostSeat } from "./GhostSeat.jsx";

function formatTime(slot) {
  const [h, m] = slot.split(":");
  const hour = parseInt(h, 10);
  const suffix = hour >= 12 ? "pm" : "am";
  const display = hour > 12 ? hour - 12 : hour;
  return `${display}:${m}${suffix}`;
}

function buildTwoSeatLayout(bookingsInSlot) {
  // Returns array of 2 items: each is either a booking object or null
  const seats = [null, null];
  for (let i = 0; i < Math.min(bookingsInSlot.length, 2); i++) {
    seats[i] = bookingsInSlot[i];
  }
  return seats;
}

export function SlotGrid({
  bookings,
  activeSlots,
  onOpenNewBooking,
  currentDateStr,
}) {
  const capacities = useMemo(
    () => computeSlotCapacities(bookings, activeSlots),
    [bookings, activeSlots],
  );

  return (
    <div style={{
      background: BRAND.white, border: `1px solid ${BRAND.greyLight}`,
      borderTop: "none", borderRadius: "0 0 14px 14px", overflow: "hidden",
    }}>
      {activeSlots.map((slot, i) => {
        const slotBookings = bookings.filter((b) => b.slot === slot);
        const seats = buildTwoSeatLayout(slotBookings);
        const hasAny = slotBookings.length > 0;

        const handleAdd = () => {
          if (onOpenNewBooking) onOpenNewBooking(currentDateStr, slot);
        };

        return (
          <div
            key={slot}
            style={{
              display: "grid", gridTemplateColumns: "72px 1fr 1fr",
              gap: 10, padding: "10px 14px",
              borderBottom: i < activeSlots.length - 1 ? "1px solid #F1F3F5" : "none",
              alignItems: "stretch", minHeight: 100,
            }}
          >
            {/* Time label */}
            <div style={{
              fontSize: 14, fontWeight: 800, color: BRAND.text,
              display: "flex", alignItems: "center", justifyContent: "center",
              paddingRight: 10, borderRight: `2px solid ${BRAND.greyLight}`,
            }}>
              {formatTime(slot)}
            </div>

            {/* Seats */}
            {hasAny ? (
              <>
                {seats[0] ? (
                  <BookingCardNew booking={seats[0]} />
                ) : (
                  <GhostSeat onClick={handleAdd} />
                )}
                {seats[1] ? (
                  <BookingCardNew booking={seats[1]} />
                ) : (
                  <GhostSeat onClick={handleAdd} />
                )}
              </>
            ) : (
              <GhostSeat span onClick={handleAdd} />
            )}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/booking/GhostSeat.jsx src/components/booking/SlotGrid.jsx
git commit -m "feat: add SlotGrid and GhostSeat components for two-seat time slot layout"
```

---

### Task 4: CalendarTabs Components

**Files:**
- Create: `src/components/layout/DayTab.jsx`
- Create: `src/components/layout/MonthTab.jsx`
- Create: `src/components/layout/CalendarTabs.jsx`

- [ ] **Step 1: Create DayTab component**

```jsx
// src/components/layout/DayTab.jsx
import { BRAND } from "../../constants/index.js";

const DAY_SHORTS = { 0: "Sun", 1: "Mon", 2: "Tue", 3: "Wed", 4: "Thu", 5: "Fri", 6: "Sat" };

export function DayTab({ dateObj, dogCount, isOpen, isActive, onClick }) {
  const dayName = DAY_SHORTS[dateObj.getDay()];
  const dayNum = dateObj.getDate();
  const monthName = dateObj.toLocaleDateString("en-GB", { month: "long" });
  const stripColour = isOpen ? BRAND.openGreen : BRAND.closedRed;

  return (
    <div
      onClick={onClick}
      style={{
        flex: 1, minWidth: 72,
        borderRadius: "10px 10px 0 0",
        background: BRAND.white, textAlign: "center",
        boxShadow: isActive ? "0 -4px 14px rgba(0,184,224,0.12)" : "0 -2px 8px rgba(0,0,0,0.04)",
        cursor: "pointer", transition: "all 0.2s",
        position: "relative", overflow: "hidden",
        border: `1.5px solid ${isActive ? BRAND.blue : BRAND.greyLight}`,
        borderBottom: "none",
        userSelect: "none", paddingBottom: 6,
        opacity: isActive ? 1 : 0.7,
        transform: isActive ? "translateY(-3px)" : "none",
        zIndex: isActive ? 2 : 1,
      }}
      onMouseEnter={(e) => {
        if (!isActive) {
          e.currentTarget.style.opacity = "0.9";
          e.currentTarget.style.transform = "translateY(-2px)";
        }
      }}
      onMouseLeave={(e) => {
        if (!isActive) {
          e.currentTarget.style.opacity = "0.7";
          e.currentTarget.style.transform = "none";
        }
      }}
    >
      {/* Colour strip */}
      <div style={{
        padding: "3px 0", fontSize: 8, fontWeight: 800,
        color: BRAND.white, letterSpacing: 0.8,
        textTransform: "uppercase", background: stripColour,
      }}>
        {dayName}
      </div>
      {/* Date number */}
      <div style={{ fontSize: 24, fontWeight: 900, color: isOpen ? BRAND.text : "#9CA3AF", lineHeight: 1, marginTop: 2 }}>
        {dayNum}
      </div>
      {/* Month */}
      <div style={{ fontSize: 13, fontWeight: 800, color: isOpen ? BRAND.text : "#9CA3AF", lineHeight: 1, marginTop: 1 }}>
        {monthName}
      </div>
      {/* Dog count */}
      <div style={{
        fontSize: 9, fontWeight: 800, marginTop: 3,
        color: isOpen ? (isActive ? BRAND.blueDark : BRAND.blue) : BRAND.closedRed,
      }}>
        {isOpen ? `${dogCount} dog${dogCount !== 1 ? "s" : ""}` : "Closed"}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create MonthTab component**

```jsx
// src/components/layout/MonthTab.jsx
import { useMemo } from "react";
import { BRAND } from "../../constants/index.js";
import { toDateStr } from "../../supabase/transforms.js";

export function MonthTab({ currentDateObj, bookingsByDate, isActive, onClick }) {
  const monthName = currentDateObj.toLocaleDateString("en-GB", { month: "long" });
  const year = currentDateObj.getFullYear();
  const month = currentDateObj.getMonth();
  const todayStr = toDateStr(new Date());

  const cells = useMemo(() => {
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    const startDay = first.getDay() === 0 ? 6 : first.getDay() - 1;
    const result = [];

    for (let i = 0; i < startDay; i++) result.push({ type: "empty" });
    for (let d = 1; d <= last.getDate(); d++) {
      const dateStr = toDateStr(new Date(year, month, d));
      const hasBookings = (bookingsByDate[dateStr] || []).length > 0;
      const isToday = dateStr === todayStr;
      result.push({ type: "day", hasBookings, isToday });
    }
    while (result.length % 7 !== 0) result.push({ type: "empty" });
    return result;
  }, [year, month, bookingsByDate, todayStr]);

  return (
    <div
      onClick={onClick}
      style={{
        flex: 1.1, minWidth: 80,
        borderRadius: "10px 10px 0 0",
        background: BRAND.white, textAlign: "center",
        boxShadow: isActive ? "0 -4px 14px rgba(0,184,224,0.12)" : "0 -2px 8px rgba(0,0,0,0.04)",
        cursor: "pointer", transition: "all 0.2s",
        position: "relative", overflow: "hidden",
        border: `1.5px solid ${isActive ? BRAND.blue : BRAND.greyLight}`,
        borderBottom: "none",
        userSelect: "none", paddingBottom: 6,
        opacity: isActive ? 1 : 0.7,
        transform: isActive ? "translateY(-3px)" : "none",
        zIndex: isActive ? 2 : 1,
      }}
      onMouseEnter={(e) => {
        if (!isActive) { e.currentTarget.style.opacity = "0.9"; e.currentTarget.style.transform = "translateY(-2px)"; }
      }}
      onMouseLeave={(e) => {
        if (!isActive) { e.currentTarget.style.opacity = "0.7"; e.currentTarget.style.transform = "none"; }
      }}
    >
      {/* Blue strip with month name */}
      <div style={{
        padding: "3px 0", fontSize: 8, fontWeight: 800,
        color: BRAND.white, letterSpacing: 0.8,
        textTransform: "uppercase", background: BRAND.blueDark,
      }}>
        {monthName} {year}
      </div>
      {/* Mini calendar grid */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(7, 1fr)",
        gap: 0, padding: "3px 4px", marginTop: 2,
      }}>
        {cells.map((cell, i) => {
          if (cell.type === "empty") return <div key={i} />;
          let bg = BRAND.greyLight;
          if (cell.isToday) bg = "#E8567F";
          else if (cell.hasBookings) bg = BRAND.blue;
          return (
            <div key={i} style={{
              width: 5, height: 5, margin: "0.5px auto",
              borderRadius: 1.5, background: bg,
            }} />
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create CalendarTabs container**

```jsx
// src/components/layout/CalendarTabs.jsx
import { DayTab } from "./DayTab.jsx";
import { MonthTab } from "./MonthTab.jsx";

export function CalendarTabs({
  dates,
  selectedDay,
  onSelectDay,
  bookingsByDate,
  dayOpenState,
  currentDateObj,
  calendarMode,
  onSelectMonth,
}) {
  const isMonthActive = calendarMode === "month";

  return (
    <div style={{
      display: "flex", gap: 6, padding: "0 4px",
      overflow: "hidden",
    }}>
      {dates.map((d, i) => {
        const count = (bookingsByDate[d.dateStr] || []).length;
        const isOpen = dayOpenState[d.dateStr] ?? true;
        return (
          <DayTab
            key={d.dateStr}
            dateObj={d.dateObj}
            dogCount={count}
            isOpen={isOpen}
            isActive={!isMonthActive && selectedDay === i}
            onClick={() => onSelectDay(i)}
          />
        );
      })}
      <MonthTab
        currentDateObj={currentDateObj}
        bookingsByDate={bookingsByDate}
        isActive={isMonthActive}
        onClick={onSelectMonth}
      />
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/DayTab.jsx src/components/layout/MonthTab.jsx src/components/layout/CalendarTabs.jsx
git commit -m "feat: add CalendarTabs navigation with day tabs and month tab"
```

---

### Task 5: FloatingActions Component

**Files:**
- Create: `src/components/layout/FloatingActions.jsx`

- [ ] **Step 1: Create FloatingActions component**

```jsx
// src/components/layout/FloatingActions.jsx
import { useState } from "react";
import { BRAND, PRICING } from "../../constants/index.js";

function computeRevenue(bookings) {
  let total = 0;
  for (const b of bookings) {
    const priceStr = PRICING[b.service]?.[b.size] || "";
    const num = parseFloat(priceStr.replace(/[^0-9.]/g, ""));
    if (!isNaN(num)) total += num;
  }
  return total;
}

export function FloatingActions({ bookings, onNewBooking }) {
  const [noteHover, setNoteHover] = useState(false);
  const [cardHover, setCardHover] = useState(false);
  const revenue = computeRevenue(bookings);

  return (
    <div style={{
      position: "fixed", bottom: 24, right: 28,
      zIndex: 200, display: "flex", alignItems: "flex-end",
    }}>
      {/* Money note */}
      <div
        onMouseEnter={() => setNoteHover(true)}
        onMouseLeave={() => setNoteHover(false)}
        style={{
          transform: noteHover ? "rotate(-4deg) translateY(-6px) scale(1.04)" : "rotate(-4deg)",
          zIndex: noteHover ? 210 : 201,
          transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
          marginRight: -18, marginBottom: 4,
          position: "relative",
        }}
      >
        <div style={{
          background: "linear-gradient(135deg, #16A34A, #15803D)",
          border: "2px solid rgba(255,255,255,0.2)",
          borderRadius: 8, padding: "10px 24px 10px 20px",
          position: "relative", minWidth: 120, textAlign: "center",
          color: BRAND.white,
          boxShadow: "0 4px 16px rgba(22,163,74,0.35), 0 2px 6px rgba(0,0,0,0.1)",
        }}>
          {/* Dashed inner border */}
          <div style={{
            position: "absolute", inset: 5,
            border: "1.5px dashed rgba(255,255,255,0.15)",
            borderRadius: 4, pointerEvents: "none",
          }} />
          {/* Corner ornaments */}
          {["top:7px;left:8px", "top:7px;right:8px", "bottom:7px;left:8px", "bottom:7px;right:8px"].map((pos, i) => (
            <span key={i} style={{
              position: "absolute", fontSize: 7, fontWeight: 900,
              color: "rgba(255,255,255,0.2)",
              ...Object.fromEntries(pos.split(";").map(p => p.split(":"))),
            }}>&pound;</span>
          ))}
          <div style={{
            fontSize: 8, fontWeight: 800, textTransform: "uppercase",
            letterSpacing: 1, color: "rgba(255,255,255,0.55)",
          }}>Today's Revenue</div>
          <div style={{
            fontSize: 24, fontWeight: 900, lineHeight: 1.1,
            textShadow: "0 1px 2px rgba(0,0,0,0.15)",
          }}>&pound;{revenue}</div>
        </div>
      </div>

      {/* Book Now card */}
      <div
        onClick={onNewBooking}
        onMouseEnter={() => setCardHover(true)}
        onMouseLeave={() => setCardHover(false)}
        style={{
          transform: cardHover ? "rotate(3deg) translateY(-6px) scale(1.04)" : "rotate(3deg)",
          zIndex: cardHover ? 210 : 202,
          transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
          cursor: "pointer", position: "relative",
        }}
      >
        <div style={{
          background: BRAND.white, borderRadius: 10,
          padding: "14px 30px", textAlign: "center",
          boxShadow: "0 4px 20px rgba(0,0,0,0.12), 0 2px 6px rgba(0,0,0,0.06)",
          border: `1.5px solid ${BRAND.greyLight}`,
          position: "relative", overflow: "hidden", minWidth: 150,
        }}>
          {/* Top accent */}
          <div style={{
            position: "absolute", top: 0, left: 0, right: 0, height: 3,
            background: `linear-gradient(90deg, ${BRAND.blue}, ${BRAND.blueDark})`,
          }} />
          {/* Bottom accent */}
          <div style={{
            position: "absolute", bottom: 0, left: 0, right: 0, height: 2,
            background: `linear-gradient(90deg, ${BRAND.blue}, ${BRAND.blueDark})`,
            opacity: 0.3,
          }} />
          <div style={{
            fontSize: 9, fontWeight: 800, color: BRAND.blueDark,
            textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 3,
          }}>Smarter Dog</div>
          <div style={{ fontSize: 18, fontWeight: 900, color: BRAND.text, lineHeight: 1 }}>
            Book Now
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/layout/FloatingActions.jsx
git commit -m "feat: add FloatingActions with revenue note and Book Now business card"
```

---

### Task 6: Rewrite WeekCalendarView

**Files:**
- Modify: `src/components/layout/WeekCalendarView.jsx`

This is the main integration task. The component keeps its existing prop interface (no changes to App.jsx) but gets a completely new render.

- [ ] **Step 1: Rewrite WeekCalendarView**

The full file is too large to show inline. The key changes are:

**Imports** — replace old sub-component imports with new ones:
```jsx
// REMOVE these imports:
// import { WeekNav } from "./WeekNav.jsx";
// import { DaySummary } from "./DaySummary.jsx";
// import { DayHeader } from "./DayHeader.jsx";
// import { CalendarDate } from "./CalendarDate.jsx";
// import { ClosedDayView } from "./ClosedDayView.jsx";
// import { SlotRow } from "../booking/SlotRow.jsx";
// import { Legend } from "../ui/Legend.jsx";
// import { IconTick, IconBlock } from "../icons/index.jsx";

// ADD these imports:
import { CalendarTabs } from "./CalendarTabs.jsx";
import { ShopSign } from "./ShopSign.jsx";
import { SlotGrid } from "../booking/SlotGrid.jsx";
import { FloatingActions } from "./FloatingActions.jsx";
```

**Render structure** — replace everything inside the `return` with:

1. `<CalendarTabs>` at the top (replacing WeekNav)
2. Day header bar with `<ShopSign>` (replacing DayHeader)
3. `<SlotGrid>` for the day's bookings (replacing the SlotRow loop)
4. `<FloatingActions>` fixed at bottom (replacing the FAB in AppToolbar)
5. Keep the existing `MonthGrid` for month view
6. Keep the existing rebook modal and date picker modal logic unchanged

**The day view section** becomes:
```jsx
{calendarMode === "day" && (
  <>
    {/* Day header bar */}
    <div style={{
      background: `linear-gradient(135deg, ${BRAND.blue}, ${BRAND.blueDark})`,
      borderRadius: 0, padding: "12px 20px",
      display: "flex", alignItems: "center", justifyContent: "center",
      minHeight: 56, position: "relative", overflow: "hidden",
    }}>
      {/* Paw watermark */}
      <div style={{
        position: "absolute", right: 40, top: -14,
        fontSize: 100, opacity: 0.04,
        transform: "rotate(-15deg)", pointerEvents: "none",
      }}>🐾</div>
      <ShopSign isOpen={isOpen} />
    </div>

    {isOpen ? (
      <SlotGrid
        bookings={dayBookings}
        activeSlots={activeSlots}
        onOpenNewBooking={(dateStr, slot) => setShowNewBooking({ dateStr, slot })}
        currentDateStr={currentDateStr}
      />
    ) : (
      <ClosedDayView onOpen={toggleDayOpen} />
    )}
  </>
)}
```

**The CalendarTabs** replace WeekNav:
```jsx
<CalendarTabs
  dates={dates}
  selectedDay={selectedDay}
  onSelectDay={(i) => { setSelectedDay(i); if (calendarMode !== "day") setCalendarMode("day"); }}
  bookingsByDate={bookingsByDate}
  dayOpenState={dayOpenState}
  currentDateObj={currentDateObj}
  calendarMode={calendarMode}
  onSelectMonth={() => setCalendarMode("month")}
/>
```

**FloatingActions** added after all the view content, before the modals:
```jsx
<FloatingActions
  bookings={dayBookings}
  onNewBooking={() => setShowNewBooking({ dateStr: currentDateStr, slot: "" })}
/>
```

**Keep unchanged:** the MonthGrid component (stays inside the file), the rebook modal, and the DatePickerModal logic. Also keep the add/remove extra slot buttons below the SlotGrid when in day view.

- [ ] **Step 2: Test in browser**

Run: `http://localhost:5173`
Expected: Calendar tabs across the top, slim header with shop sign, two-seat slot grid, floating revenue note and Book Now card at bottom right. Clicking tabs switches days. Clicking month tab shows month grid. Clicking "+" in empty slots or Book Now opens new booking flow.

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/WeekCalendarView.jsx
git commit -m "feat: rewrite WeekCalendarView with calendar tabs, two-seat grid, and floating actions"
```

---

### Task 7: Remove FAB from AppToolbar

**Files:**
- Modify: `src/components/layout/AppToolbar.jsx`

The floating "+" New Booking button in AppToolbar is now replaced by the FloatingActions component inside WeekCalendarView.

- [ ] **Step 1: Remove the FAB from AppToolbar**

In `src/components/layout/AppToolbar.jsx`, remove the entire `<button onClick={onNewBooking} ...>` block (lines 206–229) that renders the fixed-position "+ New Booking" button.

Also remove the `onNewBooking` prop from the component's parameter list since it's no longer used here.

- [ ] **Step 2: Update App.jsx**

Remove the `onNewBooking` prop being passed to `<AppToolbar>` in App.jsx. Find the line that passes `onNewBooking={() => setShowNewBooking({ ... })}` to AppToolbar and delete it.

- [ ] **Step 3: Verify in browser**

Confirm the old FAB is gone and only the new floating revenue note + Book Now card appear at the bottom right.

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/AppToolbar.jsx src/App.jsx
git commit -m "refactor: remove FAB from AppToolbar (now in FloatingActions)"
```

---

### Task 8: Clean Up Old Components

**Files:**
- Modify: `src/components/layout/WeekCalendarView.jsx` (verify no stale imports)

The old components (`WeekNav`, `DayHeader`, `DaySummary`, `CalendarDate`) are no longer imported by WeekCalendarView after the Task 6 rewrite. They may still be used elsewhere — check before deleting.

- [ ] **Step 1: Check for remaining usage of old components**

Search the codebase for imports of each:
```bash
grep -r "WeekNav\|DayHeader\|DaySummary\|CalendarDate" src/ --include="*.jsx" --include="*.js" -l
```

If any file other than the old WeekCalendarView still imports them, leave them. If nothing imports them, they're safe to delete.

- [ ] **Step 2: Delete unused component files**

Only delete files that have zero remaining imports:
```bash
# Only run these for files confirmed unused in step 1:
git rm src/components/layout/WeekNav.jsx
git rm src/components/layout/DayHeader.jsx
git rm src/components/layout/DaySummary.jsx
git rm src/components/layout/CalendarDate.jsx
```

- [ ] **Step 3: Commit**

```bash
git commit -m "chore: remove unused WeekNav, DayHeader, DaySummary, CalendarDate components"
```

---

### Task 9: Final Verification and Polish

- [ ] **Step 1: Full walkthrough test**

Open `http://localhost:5173` and test:

1. **Calendar tabs:** Click each day tab — view switches, dog count updates, active tab highlights blue
2. **Open/closed tabs:** Green strip on open days, red on closed, "Closed" text on closed days
3. **Month tab:** Click it — month grid appears with booking dots
4. **Shop sign:** Shows "Open" on open days, "Closed" on closed days
5. **Slot grid:** Two-seat layout, booking cards show dog name, breed, owner, price, pills
6. **Ghost seats:** "+" appears, hover turns blue, clicking opens new booking form
7. **Floating actions:** Revenue note shows correct total, Book Now opens new booking, hover lifts each element forward
8. **Existing features:** Rebook modal still works, date picker still works, add/remove extra slots still works

- [ ] **Step 2: Fix any visual issues found during testing**

Common things to check:
- Pill text overflow on narrow screens (text-overflow: ellipsis should handle)
- Calendar tab overflow when window is narrow
- Floating actions overlapping content at bottom of slot list (add bottom padding to slot container if needed, e.g. `paddingBottom: 80px` on the page wrapper)

- [ ] **Step 3: Commit any polish fixes**

```bash
git add -u
git commit -m "fix: polish bookings page layout and fix visual edge cases"
```
