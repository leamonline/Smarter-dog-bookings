# Tailwind Phase 2: Bookings Page — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate all 10 bookings page components from inline styles to Tailwind CSS with responsive behaviour.

**Architecture:** Each component is rewritten to use Tailwind utility classes. Dynamic values that can't be classes (conditional colours, gradients) stay as inline `style`. useState hover handlers are replaced with Tailwind `hover:` utilities. The `md` breakpoint (768px) is the primary responsive split.

**Tech Stack:** Tailwind CSS v4, React 19, Vite.

**Spec:** `docs/superpowers/specs/2026-04-07-tailwind-phase2-bookings.md`

---

### Task 1: ShopSign — Simple Conversion

**File:** `src/components/layout/ShopSign.jsx`

This is a straight conversion. The dynamic `background` colour (open green or closed red) stays as inline `style` since it's conditional on props. The BRAND import is kept only for `BRAND.openGreen` and `BRAND.closedRed`.

- [ ] **Step 1: Replace ShopSign.jsx with Tailwind version**

Replace the full contents of `src/components/layout/ShopSign.jsx` with:

```jsx
// src/components/layout/ShopSign.jsx
import { BRAND } from "../../constants/index.js";

export function ShopSign({ isOpen }) {
  const colour = isOpen ? BRAND.openGreen : BRAND.closedRed;
  const label = isOpen ? "Open" : "Closed";
  const shadowColour = isOpen ? "rgba(22,163,74,0.35)" : "rgba(220,38,38,0.35)";

  return (
    <div className="transform -rotate-[4deg] shrink-0">
      <div className="inline-flex flex-col items-center">
        {/* Hook */}
        <div className="w-[18px] h-[9px] border-2 border-white/25 border-b-0 rounded-t-[9px] -mb-0.5" />
        {/* Sign body */}
        <div
          className="rounded-[10px] px-[22px] py-[7px] text-[15px] font-black text-white uppercase tracking-[2px] border-2 border-white/15 relative"
          style={{
            background: colour,
            boxShadow: `0 3px 10px ${shadowColour}, inset 0 1px 0 rgba(255,255,255,0.2)`,
          }}
        >
          {/* Shine */}
          <div className="absolute top-[3px] left-2 right-2 h-[3px] bg-white/15 rounded-full" />
          {label}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build check**

Run:
```bash
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.nvm/versions/node/*/bin:$PATH" && node node_modules/.bin/vite build
```

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/ShopSign.jsx && git commit -m "refactor(tailwind): migrate ShopSign to Tailwind classes"
```

---

### Task 2: DayTab — Responsive Sizing, Remove useState(hovered)

**File:** `src/components/layout/DayTab.jsx`

Remove the `useState(hovered)` + `onMouseEnter`/`onMouseLeave` pattern. Replace with Tailwind `hover:` utilities. Add responsive sizing: smaller on mobile, full size on `md:`. The coloured strip background stays inline (conditional on `isOpen`). Dog count colour stays inline (conditional on `isOpen` and `isActive`).

- [ ] **Step 1: Replace DayTab.jsx with Tailwind version**

Replace the full contents of `src/components/layout/DayTab.jsx` with:

```jsx
// src/components/layout/DayTab.jsx
import { BRAND } from "../../constants/index.js";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function DayTab({ dateObj, dogCount, isOpen, isActive, onClick }) {
  const dayName = DAY_NAMES[dateObj.getDay()];
  const dateNum = dateObj.getDate();
  const monthName = dateObj.toLocaleDateString("en-GB", { month: "long" });

  const stripBg = isOpen ? BRAND.openGreen : BRAND.closedRed;

  const dateNumColour = isOpen ? BRAND.text : "#9CA3AF";
  const monthColour = isOpen ? BRAND.text : "#9CA3AF";

  let dogCountColour;
  if (!isOpen) {
    dogCountColour = BRAND.closedRed;
  } else if (isActive) {
    dogCountColour = BRAND.blueDark;
  } else {
    dogCountColour = BRAND.blue;
  }

  let dogCountText;
  if (!isOpen) {
    dogCountText = "Closed";
  } else if (dogCount === 1) {
    dogCountText = "1 dog";
  } else {
    dogCountText = `${dogCount} dogs`;
  }

  return (
    <div
      className={[
        "flex-1 min-w-[56px] md:min-w-[72px] rounded-t-[10px] bg-white text-center border-[1.5px] border-b-0 select-none pb-1.5 cursor-pointer transition-all snap-center shrink-0",
        isActive
          ? "border-brand-blue opacity-100 -translate-y-[3px] z-[2] shadow-[0_-4px_14px_rgba(0,184,224,0.12)]"
          : "opacity-70 hover:opacity-90 hover:-translate-y-0.5 z-[1] shadow-[0_-2px_8px_rgba(0,0,0,0.04)] border-slate-200",
      ].join(" ")}
      onClick={onClick}
    >
      {/* Coloured strip */}
      <div
        className="py-[3px] text-[8px] font-extrabold text-white uppercase tracking-[0.8px] rounded-t-lg"
        style={{ background: stripBg }}
      >
        {dayName}
      </div>

      {/* Date number */}
      <div
        className="text-lg md:text-2xl font-black leading-none mt-0.5"
        style={{ color: dateNumColour }}
      >
        {dateNum}
      </div>

      {/* Month name */}
      <div
        className="text-[10px] md:text-[13px] font-extrabold leading-none mt-px"
        style={{ color: monthColour }}
      >
        {monthName}
      </div>

      {/* Dog count */}
      <div
        className="text-[9px] font-extrabold mt-[3px] leading-none"
        style={{ color: dogCountColour }}
      >
        {dogCountText}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build check**

Run:
```bash
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.nvm/versions/node/*/bin:$PATH" && node node_modules/.bin/vite build
```

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/DayTab.jsx && git commit -m "refactor(tailwind): migrate DayTab to Tailwind with responsive sizing, remove hover state"
```

---

### Task 3: MonthTab — Responsive Sizing, Remove useState(hovered)

**File:** `src/components/layout/MonthTab.jsx`

Same pattern as DayTab — remove `useState(hovered)`, use Tailwind hover utilities. Mini calendar dots keep inline `style` for dynamic per-cell colours. The `useMemo` for cell generation is unchanged.

- [ ] **Step 1: Replace MonthTab.jsx with Tailwind version**

Replace the full contents of `src/components/layout/MonthTab.jsx` with:

```jsx
// src/components/layout/MonthTab.jsx
import { useMemo } from "react";
import { toDateStr } from "../../supabase/transforms.js";

export function MonthTab({ currentDateObj, bookingsByDate, isActive, onClick }) {
  const monthLabel = currentDateObj.toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });

  const today = toDateStr(new Date());

  // Build calendar grid cells
  const cells = useMemo(() => {
    const year = currentDateObj.getFullYear();
    const month = currentDateObj.getMonth();

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    // Mon=0 ... Sun=6 alignment
    const startPad = (firstDay.getDay() + 6) % 7;
    const daysInMonth = lastDay.getDate();

    const result = [];

    // Leading empty cells
    for (let i = 0; i < startPad; i++) {
      result.push(null);
    }

    // Day cells
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = toDateStr(new Date(year, month, d));
      result.push(dateStr);
    }

    return result;
  }, [currentDateObj]);

  return (
    <div
      className={[
        "flex-[1.1] min-w-[64px] md:min-w-[80px] rounded-t-[10px] bg-white text-center border-[1.5px] border-b-0 select-none pb-1.5 cursor-pointer transition-all snap-center shrink-0",
        isActive
          ? "border-brand-blue opacity-100 -translate-y-[3px] z-[2] shadow-[0_-4px_14px_rgba(0,184,224,0.12)]"
          : "opacity-70 hover:opacity-90 hover:-translate-y-0.5 z-[1] shadow-[0_-2px_8px_rgba(0,0,0,0.04)] border-slate-200",
      ].join(" ")}
      onClick={onClick}
    >
      {/* Blue strip */}
      <div className="bg-brand-blue-dark py-[3px] px-1 text-[8px] font-extrabold text-white uppercase tracking-[0.8px] rounded-t-lg whitespace-nowrap overflow-hidden text-ellipsis">
        {monthLabel}
      </div>

      {/* Mini calendar grid */}
      <div className="grid grid-cols-7 gap-0 p-[3px_4px] mt-0.5">
        {cells.map((dateStr, i) => {
          if (!dateStr) {
            return <div key={`empty-${i}`} className="w-[5px] h-[5px] mx-auto my-[1px]" />;
          }

          const isToday = dateStr === today;
          const hasBookings = !!(bookingsByDate[dateStr]?.length);

          let dotColour;
          if (isToday) {
            dotColour = "#E8567F";
          } else if (hasBookings) {
            dotColour = "#00B8E0";
          } else {
            dotColour = "#E5E7EB";
          }

          return (
            <div
              key={dateStr}
              className="w-[5px] h-[5px] rounded-sm mx-auto my-[1px]"
              style={{ background: dotColour }}
            />
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build check**

Run:
```bash
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.nvm/versions/node/*/bin:$PATH" && node node_modules/.bin/vite build
```

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/MonthTab.jsx && git commit -m "refactor(tailwind): migrate MonthTab to Tailwind with responsive sizing, remove hover state"
```

---

### Task 4: CalendarTabs — Horizontal Scroll, useRef for Scroll-into-View

**File:** `src/components/layout/CalendarTabs.jsx`

Add horizontal scrolling on mobile with `overflow-x-auto` and `snap-x`. Use a `useRef` + `useEffect` to scroll the active tab into view on mount. Desktop shows all tabs visible with `md:overflow-x-visible`.

- [ ] **Step 1: Replace CalendarTabs.jsx with Tailwind version**

Replace the full contents of `src/components/layout/CalendarTabs.jsx` with:

```jsx
// src/components/layout/CalendarTabs.jsx
import { useRef, useEffect } from "react";
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
  const activeTabRef = useRef(null);

  useEffect(() => {
    activeTabRef.current?.scrollIntoView({
      behavior: "smooth",
      inline: "center",
      block: "nearest",
    });
  }, [selectedDay, calendarMode]);

  return (
    <div className="flex gap-1.5 px-1 overflow-x-auto md:overflow-x-visible snap-x snap-mandatory scrollbar-none">
      {dates.map((d, i) => {
        const isOpen = dayOpenState[d.dateStr] ?? true;
        const dogCount = (bookingsByDate[d.dateStr] || []).length;
        const isActive = calendarMode !== "month" && selectedDay === i;

        return (
          <div
            key={d.dateStr}
            ref={isActive ? activeTabRef : null}
            className="snap-center shrink-0"
          >
            <DayTab
              dateObj={d.dateObj}
              dogCount={dogCount}
              isOpen={isOpen}
              isActive={isActive}
              onClick={() => onSelectDay(i)}
            />
          </div>
        );
      })}

      <div
        ref={calendarMode === "month" ? activeTabRef : null}
        className="snap-center shrink-0"
      >
        <MonthTab
          currentDateObj={currentDateObj}
          bookingsByDate={bookingsByDate}
          isActive={calendarMode === "month"}
          onClick={onSelectMonth}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build check**

Run:
```bash
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.nvm/versions/node/*/bin:$PATH" && node node_modules/.bin/vite build
```

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/CalendarTabs.jsx && git commit -m "refactor(tailwind): migrate CalendarTabs to Tailwind with horizontal scroll and snap"
```

---

### Task 5: BookingCardNew — Compact Mobile Mode, Remove useState(hovered)

**File:** `src/components/booking/BookingCardNew.jsx`

Remove `useState(hovered)` + mouse handlers. Replace with Tailwind `hover:` utilities. Add responsive sizing: tighter padding and smaller text on mobile. The border-left colour, pill status colours, and size dot colour stay as inline `style` (dynamic per booking). The `BookingDetailModal` lazy-load and `useSalon()` context usage are unchanged.

- [ ] **Step 1: Replace BookingCardNew.jsx with Tailwind version**

Replace the full contents of `src/components/booking/BookingCardNew.jsx` with:

```jsx
// src/components/booking/BookingCardNew.jsx
import { useState, lazy, Suspense } from "react";
import { SERVICES, PRICING } from "../../constants/index.js";
import { useSalon } from "../../contexts/SalonContext.jsx";
import {
  getDogByIdOrName,
  getHumanByIdOrName,
} from "../../engine/bookingRules.js";

const BookingDetailModal = lazy(() =>
  import("../modals/BookingDetailModal.jsx").then((module) => ({
    default: module.BookingDetailModal,
  })),
);

function titleCase(str) {
  if (!str) return "";
  return str.replace(/\b\w/g, (c) => c.toUpperCase());
}

const SIZE_DOT = {
  small:  { dot: "#F5C518", border: "#D4A500" },
  medium: { dot: "#2D8B7A", border: "#1E6B5C" },
  large:  { dot: "#E8567F", border: "#C93D63" },
};

const SIZE_FALLBACK_THEME = { dot: "#00B8E0", border: "#0099BD" };

const STATUS_DISPLAY = {
  "Not Arrived":       { bg: "#FFF8E0", color: "#92400E", label: "Not Arrived" },
  "Checked In":        { bg: "#DCFCE7", color: "#16A34A", label: "Checked In" },
  "In the Bath":       { bg: "#E0F7FC", color: "#0099BD", label: "In the Bath" },
  "Ready for Pick-up": { bg: "#EDE9FE", color: "#7C3AED", label: "Ready" },
  "Completed":         { bg: "#F3F4F6", color: "#374151", label: "Completed" },
};

export function BookingCardNew({ booking, onClick }) {
  const {
    dogs,
    humans,
    currentDateStr,
    currentDateObj,
    bookingsByDate,
    dayOpenState,
    daySettings,
    onRemove,
    onUpdate,
    onUpdateDog,
    onOpenHuman,
    onOpenDog,
    onRebook,
  } = useSalon();

  const [showDetail, setShowDetail] = useState(false);

  const sizeTheme = SIZE_DOT[booking.size] || SIZE_FALLBACK_THEME;

  const service = SERVICES.find((s) => s.id === booking.service);
  const statusObj = STATUS_DISPLAY[booking.status] || STATUS_DISPLAY["Not Arrived"];

  const price =
    PRICING[booking.service]?.[booking.size] ??
    PRICING[booking.service]?.small ??
    "";

  const pickupText = booking.status === "Completed"
    ? `Collected${booking.pickup_time ? ` ${booking.pickup_time}` : ""}`
    : booking.pickup_time
      ? `Pick-up ${booking.pickup_time}`
      : "";

  const dogRecord = getDogByIdOrName(dogs, booking.dog_id || booking.dogName);
  const humanRecord = getHumanByIdOrName(humans, booking._ownerId || booking.owner || booking.ownerName);

  const displayDogName = titleCase(
    dogRecord?.name || booking.dogName || "Unknown Dog"
  );
  const displayBreed = titleCase(
    dogRecord?.breed || booking.breed || ""
  );
  const displayOwner = titleCase(
    humanRecord?.name || booking.owner || booking.ownerName || ""
  );

  const handleCardClick = onClick || (() => setShowDetail(true));

  return (
    <>
      <div
        onClick={handleCardClick}
        className="bg-white border-[1.5px] border-slate-200 border-l-4 rounded-xl p-2.5 md:p-3.5 flex flex-col gap-1 cursor-pointer transition-all hover:border-brand-blue hover:shadow-md hover:-translate-y-px box-border"
        style={{ borderLeftColor: sizeTheme.border }}
      >
        {/* Row 1: size dot + dog name + price */}
        <div className="flex items-center gap-2">
          <span
            className="w-3 h-3 rounded-full shrink-0 inline-block"
            style={{ background: sizeTheme.dot }}
          />
          <span className="text-sm md:text-[17px] font-extrabold text-slate-800 whitespace-nowrap overflow-hidden text-ellipsis">
            {displayDogName}
          </span>
          {dogRecord?.alerts?.length > 0 && (
            <svg width="14" height="14" viewBox="0 0 24 24" className="shrink-0">
              <path d="M12 2L1 21h22L12 2z" fill="#E8567F" />
              <text x="12" y="18" textAnchor="middle" fill="white" fontSize="14" fontWeight="900" fontFamily="inherit">!</text>
            </svg>
          )}
          {price && (
            <span className="text-sm md:text-[17px] font-black text-[#1E6B5C] ml-auto shrink-0">
              {price}
            </span>
          )}
        </div>

        {/* Row 2: breed */}
        {displayBreed && (
          <div className="text-xs md:text-sm font-semibold text-slate-500 pl-4 md:pl-5">
            {displayBreed}
          </div>
        )}

        {/* Row 3: owner */}
        {displayOwner && (
          <div className="text-xs md:text-sm font-bold text-brand-teal pl-4 md:pl-5">
            {displayOwner}
          </div>
        )}

        {/* Row 4: pill row */}
        <div className="flex gap-1 md:gap-[5px] pl-4 md:pl-5 mt-1 md:mt-1.5">
          {/* Service pill */}
          <span className="flex-1 text-[8px] md:text-[10px] font-bold py-1 md:py-[5px] rounded-md inline-flex items-center justify-center whitespace-nowrap overflow-hidden text-ellipsis bg-slate-100 text-slate-700">
            {service?.name || booking.service || "\u2014"}
          </span>

          {/* Pickup pill */}
          <span className="flex-1 text-[8px] md:text-[10px] font-bold py-1 md:py-[5px] rounded-md inline-flex items-center justify-center whitespace-nowrap overflow-hidden text-ellipsis bg-[#F3EEFF] text-[#7C3AED]">
            {pickupText || "\u2014"}
          </span>

          {/* Status pill */}
          <span
            className="flex-1 text-[8px] md:text-[10px] font-bold py-1 md:py-[5px] rounded-md inline-flex items-center justify-center whitespace-nowrap overflow-hidden text-ellipsis"
            style={{ background: statusObj.bg, color: statusObj.color }}
          >
            {statusObj.label}
          </span>
        </div>
      </div>

      {showDetail && (
        <Suspense fallback={null}>
          <BookingDetailModal
            booking={booking}
            onClose={() => setShowDetail(false)}
            onRemove={onRemove}
            onOpenHuman={onOpenHuman}
            onOpenDog={onOpenDog}
            onUpdate={onUpdate}
            currentDateStr={currentDateStr}
            currentDateObj={currentDateObj}
            bookingsByDate={bookingsByDate}
            dayOpenState={dayOpenState}
            dogs={dogs}
            humans={humans}
            onUpdateDog={onUpdateDog}
            onRebook={onRebook}
            daySettings={daySettings}
          />
        </Suspense>
      )}
    </>
  );
}
```

- [ ] **Step 2: Build check**

Run:
```bash
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.nvm/versions/node/*/bin:$PATH" && node node_modules/.bin/vite build
```

- [ ] **Step 3: Commit**

```bash
git add src/components/booking/BookingCardNew.jsx && git commit -m "refactor(tailwind): migrate BookingCardNew to Tailwind with compact mobile mode, remove hover state"
```

---

### Task 6: GhostSeat — Convert to Tailwind, Keep BlockMenu

**File:** `src/components/booking/GhostSeat.jsx`

Convert all inline styles to Tailwind. Replace all `onMouseEnter`/`onMouseLeave` handlers with Tailwind `hover:` utilities. The `BlockMenu` popup uses Tailwind for layout. The `useState(showMenu)` stays (it controls menu visibility, not hover).

- [ ] **Step 1: Replace GhostSeat.jsx with Tailwind version**

Replace the full contents of `src/components/booking/GhostSeat.jsx` with:

```jsx
// src/components/booking/GhostSeat.jsx
import { useState } from "react";

function BlockMenu({ onBlock1, onBlock2, onBlockBoth, onClose }) {
  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-[10px] shadow-lg border border-slate-200 p-2 flex flex-col gap-1 z-10 min-w-[140px]"
    >
      {[
        { label: "Block seat 1", action: onBlock1 },
        { label: "Block seat 2", action: onBlock2 },
        { label: "Block both", action: onBlockBoth },
      ].map(({ label, action }) => (
        <button
          key={label}
          onClick={() => { action(); onClose(); }}
          className="py-1.5 px-3 rounded-md border-none bg-brand-coral-light text-brand-coral text-xs font-bold cursor-pointer font-[inherit] transition-all text-left hover:bg-brand-coral hover:text-white"
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function GhostSeat({ onClick, onBlock, span }) {
  const [showMenu, setShowMenu] = useState(false);

  const spanClass = span ? "col-span-2" : "";

  // Simple ghost seat without blocking (e.g., rebook modal)
  if (!onBlock) {
    return (
      <div
        onClick={onClick}
        className={`border-2 border-dashed border-slate-200 rounded-xl flex items-center justify-center text-slate-300 text-[22px] cursor-pointer transition-all min-h-[60px] md:min-h-[80px] hover:border-brand-blue hover:text-brand-blue hover:bg-sky-50 ${spanClass}`}
      >
        +
      </div>
    );
  }

  // Ghost seat with block button
  return (
    <div
      className={`border-2 border-dashed border-slate-200 rounded-xl flex items-center justify-center gap-2 transition-all min-h-[60px] md:min-h-[80px] relative ${spanClass}`}
    >
      {/* Book button */}
      <button
        onClick={onClick}
        className="w-8 h-8 rounded-lg bg-sky-50 text-brand-blue border-none flex items-center justify-center cursor-pointer transition-all font-[inherit] text-lg font-bold hover:bg-brand-blue hover:text-white"
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
        className="w-8 h-8 rounded-lg bg-brand-coral-light text-brand-coral border-none flex items-center justify-center cursor-pointer transition-all font-[inherit] hover:bg-brand-coral hover:text-white"
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

- [ ] **Step 2: Build check**

Run:
```bash
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.nvm/versions/node/*/bin:$PATH" && node node_modules/.bin/vite build
```

- [ ] **Step 3: Commit**

```bash
git add src/components/booking/GhostSeat.jsx && git commit -m "refactor(tailwind): migrate GhostSeat to Tailwind, remove BRAND import and hover handlers"
```

---

### Task 7: BlockedSeatCell — Simple Conversion

**File:** `src/components/booking/BlockedSeatCell.jsx`

Straight conversion. Replace all inline styles and mouse handlers with Tailwind classes. The SVG icon uses `stroke="currentColor"` so it inherits the text colour from the parent's `text-brand-coral`.

- [ ] **Step 1: Replace BlockedSeatCell.jsx with Tailwind version**

Replace the full contents of `src/components/booking/BlockedSeatCell.jsx` with:

```jsx
// src/components/booking/BlockedSeatCell.jsx
export function BlockedSeatCell({ onClick, span }) {
  return (
    <div
      onClick={onClick}
      className={[
        "border-2 border-dashed border-brand-coral rounded-xl flex items-center justify-center cursor-pointer transition-all min-h-[60px] md:min-h-[80px] bg-brand-coral/[0.04] text-brand-coral hover:border-brand-red hover:bg-brand-coral/[0.08]",
        span ? "col-span-2" : "",
      ].join(" ")}
    >
      {/* Block icon — circle with diagonal strike */}
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
        <line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </div>
  );
}
```

- [ ] **Step 2: Build check**

Run:
```bash
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.nvm/versions/node/*/bin:$PATH" && node node_modules/.bin/vite build
```

- [ ] **Step 3: Commit**

```bash
git add src/components/booking/BlockedSeatCell.jsx && git commit -m "refactor(tailwind): migrate BlockedSeatCell to Tailwind, remove BRAND import"
```

---

### Task 8: SlotGrid — Responsive Grid Columns

**File:** `src/components/booking/SlotGrid.jsx`

Convert the container and row grid to Tailwind. Responsive: narrower time column on mobile (`grid-cols-[56px_1fr_1fr]`), wider on desktop (`md:grid-cols-[72px_1fr_1fr]`). Row dividers use `border-b last:border-b-0`. The capacity engine integration (`getSeatStatesForSlot`) is unchanged. The reserved-seat and overflow-blocked cells get Tailwind classes too.

- [ ] **Step 1: Replace SlotGrid.jsx with Tailwind version**

Replace the full contents of `src/components/booking/SlotGrid.jsx` with:

```jsx
// src/components/booking/SlotGrid.jsx
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
    <div className="bg-white border border-slate-200 border-t-0 rounded-b-[14px]">
      {activeSlots.map((slot, i) => {
        const slotOverrides = overrides?.[slot] || {};
        const seatStates = getSeatStatesForSlot(bookings, slot, activeSlots, slotOverrides);

        // Determine layout patterns for spanning
        const allAvailable = seatStates.every((s) => s.type === "available");
        const allBlockedByStaff = seatStates.every((s) => s.type === "blocked" && s.staffBlocked);

        const isLast = i === activeSlots.length - 1;

        return (
          <div
            key={slot}
            className={[
              "grid grid-cols-[56px_1fr_1fr] md:grid-cols-[72px_1fr_1fr] gap-1.5 md:gap-2.5 p-2 md:p-[10px_14px] min-h-[80px] md:min-h-[100px] items-center",
              isLast ? "" : "border-b border-[#F1F3F5]",
            ].join(" ")}
          >
            {/* Time label */}
            <div className="text-sm font-extrabold text-slate-800 text-center border-r-2 border-slate-200 pr-2 md:pr-2.5 self-stretch flex items-center justify-center">
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
                    return (
                      <div
                        key={seat.seatIndex}
                        className="border-[1.5px] border-slate-200 rounded-xl min-h-[60px] md:min-h-[80px] flex items-center justify-center bg-slate-50 text-slate-400 text-[11px] font-semibold italic"
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
                    return (
                      <div
                        key={seat.seatIndex}
                        className="border-[1.5px] border-slate-200 rounded-xl min-h-[60px] md:min-h-[80px] flex items-center justify-center bg-slate-50 text-slate-300"
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

- [ ] **Step 2: Build check**

Run:
```bash
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.nvm/versions/node/*/bin:$PATH" && node node_modules/.bin/vite build
```

- [ ] **Step 3: Commit**

```bash
git add src/components/booking/SlotGrid.jsx && git commit -m "refactor(tailwind): migrate SlotGrid to Tailwind with responsive grid columns, remove BRAND import"
```

---

### Task 9: FloatingActions — Responsive Positioning Above Bottom Tab Bar

**File:** `src/components/layout/FloatingActions.jsx`

Convert to Tailwind. Mobile positioning moves up to `bottom-20` (above the 80px bottom tab bar). The green gradient and blue accent gradients stay as inline `style` (Tailwind arbitrary gradients are too verbose). The `useState` for `noteHover`/`cardHover` stays because Tailwind can't do z-index-on-hover-of-sibling — the z-index shuffling requires JS state.

- [ ] **Step 1: Replace FloatingActions.jsx with Tailwind version**

Replace the full contents of `src/components/layout/FloatingActions.jsx` with:

```jsx
// src/components/layout/FloatingActions.jsx
import { useState } from "react";
import { PRICING } from "../../constants/index.js";

function computeRevenue(bookings) {
  let total = 0;
  for (const b of bookings) {
    const priceStr = PRICING[b.service]?.[b.size] || "";
    const num = parseFloat(priceStr.replace(/[^0-9.]/g, ""));
    if (!isNaN(num)) total += num;
  }
  return total;
}

export default function FloatingActions({ bookings, onNewBooking }) {
  const [noteHover, setNoteHover] = useState(false);
  const [cardHover, setCardHover] = useState(false);

  const revenue = computeRevenue(bookings || []);

  return (
    <div className="fixed z-[200] flex items-end bottom-20 right-4 md:bottom-6 md:right-7">
      {/* Money Note */}
      <div
        onMouseEnter={() => setNoteHover(true)}
        onMouseLeave={() => setNoteHover(false)}
        className="transform -rotate-[4deg] -mr-[18px] mb-1 transition-all cursor-default"
        style={{
          transform: `rotate(-4deg) translateY(${noteHover ? "-6px" : "0"}) scale(${noteHover ? "1.04" : "1"})`,
          zIndex: noteHover ? 210 : 201,
        }}
      >
        <div
          className="border-2 border-white/20 rounded-lg px-5 md:px-6 py-2.5 min-w-[120px] text-center text-white relative"
          style={{
            background: "linear-gradient(135deg, #16A34A, #15803D)",
            boxShadow: "0 4px 16px rgba(22,163,74,0.35), 0 2px 6px rgba(0,0,0,0.1)",
          }}
        >
          {/* Dashed inner border */}
          <div className="absolute inset-[5px] border-[1.5px] border-dashed border-white/15 rounded pointer-events-none" />

          {/* Corner pound symbols */}
          <span className="absolute top-[7px] left-2 text-[7px] font-black text-white/20">&pound;</span>
          <span className="absolute top-[7px] right-2 text-[7px] font-black text-white/20">&pound;</span>
          <span className="absolute bottom-[7px] left-2 text-[7px] font-black text-white/20">&pound;</span>
          <span className="absolute bottom-[7px] right-2 text-[7px] font-black text-white/20">&pound;</span>

          {/* Label */}
          <div className="text-[8px] font-extrabold uppercase tracking-[1px] text-white/55">
            Today&apos;s Revenue
          </div>

          {/* Amount */}
          <div className="text-2xl font-black leading-tight" style={{ textShadow: "0 1px 2px rgba(0,0,0,0.15)" }}>
            &pound;{revenue}
          </div>
        </div>
      </div>

      {/* Book Now Card */}
      <div
        onMouseEnter={() => setCardHover(true)}
        onMouseLeave={() => setCardHover(false)}
        onClick={onNewBooking}
        className="transform rotate-[3deg] transition-all cursor-pointer"
        style={{
          transform: `rotate(3deg) translateY(${cardHover ? "-6px" : "0"}) scale(${cardHover ? "1.04" : "1"})`,
          zIndex: cardHover ? 210 : 202,
        }}
      >
        <div
          className="bg-white rounded-[10px] p-[14px_30px] text-center min-w-[150px] border-[1.5px] border-slate-200 shadow-lg relative overflow-hidden"
        >
          {/* Top accent */}
          <div
            className="absolute top-0 left-0 right-0 h-[3px]"
            style={{ background: "linear-gradient(90deg, #00B8E0, #0099BD)" }}
          />

          {/* Bottom accent */}
          <div
            className="absolute bottom-0 left-0 right-0 h-[2px] opacity-30"
            style={{ background: "linear-gradient(90deg, #00B8E0, #0099BD)" }}
          />

          {/* Brand name */}
          <div className="text-[9px] font-extrabold text-[#0099BD] uppercase tracking-[1.5px] mb-[3px]">
            Smarter Dog
          </div>

          {/* CTA */}
          <div className="text-lg font-black text-slate-800 leading-none">
            Book Now
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build check**

Run:
```bash
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.nvm/versions/node/*/bin:$PATH" && node node_modules/.bin/vite build
```

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/FloatingActions.jsx && git commit -m "refactor(tailwind): migrate FloatingActions to Tailwind with responsive bottom positioning"
```

---

### Task 10: WeekCalendarView — Header Bar + Slot Buttons Conversion

**File:** `src/components/layout/WeekCalendarView.jsx`

Convert the day header bar (gradient background, paw watermark) and the add/remove slot buttons to Tailwind. The slot buttons replace `onMouseEnter`/`onMouseLeave` handlers with Tailwind `hover:` classes. The `MonthGrid`, rebook modal, and `DatePickerModal` keep their existing inline styles (out of scope for Phase 2). The BRAND import is kept for `MonthGrid` and rebook modal internal styles.

- [ ] **Step 1: Replace WeekCalendarView.jsx with Tailwind version**

Replace the full contents of `src/components/layout/WeekCalendarView.jsx` with:

```jsx
// src/components/layout/WeekCalendarView.jsx
import { useState, useMemo, lazy, Suspense } from "react";
import { BRAND, SALON_SLOTS } from "../../constants/index.js";
import { canBookSlot } from "../../engine/capacity.js";
import { toDateStr } from "../../supabase/transforms.js";
import { getDefaultOpenForDate } from "../../engine/utils.js";
import { LoadingSpinner } from "../ui/LoadingSpinner.jsx";
import { ClosedDayView } from "./ClosedDayView.jsx";
import { AddBookingForm } from "../booking/AddBookingForm.jsx";
import { WaitlistPanel } from "../booking/WaitlistPanel.jsx";
import { CalendarTabs } from "./CalendarTabs.jsx";
import { ShopSign } from "./ShopSign.jsx";
import { SlotGrid } from "../booking/SlotGrid.jsx";
import FloatingActions from "./FloatingActions.jsx";
const DatePickerModal = lazy(() =>
  import("../modals/DatePickerModal.jsx").then((module) => ({
    default: module.DatePickerModal,
  })),
);

// Arrow colour for MonthGrid navigation arrows
const ARROW_COLOURS = { month: "#E8567F" };

/* ------------------------------------------------------------------
 * MonthGrid -- shows a full calendar month with booking counts
 * (Kept inline-styled -- complex internal component, Phase 3 scope)
 * ------------------------------------------------------------------ */
function MonthGrid({ currentDateObj, bookingsByDate, dayOpenState, onSelectDate, onNavigateMonth, calendarMode, setCalendarMode }) {
  const year = currentDateObj.getFullYear();
  const month = currentDateObj.getMonth();

  const { weeks, monthLabel, monthName, yearStr } = useMemo(() => {
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    const startDay = first.getDay() === 0 ? 6 : first.getDay() - 1; // Mon=0
    const label = first.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
    const mName = first.toLocaleDateString("en-GB", { month: "long" });
    const yr = String(first.getFullYear());

    const rows = [];
    let week = new Array(startDay).fill(null);

    for (let d = 1; d <= last.getDate(); d++) {
      week.push(new Date(year, month, d));
      if (week.length === 7) { rows.push(week); week = []; }
    }
    if (week.length > 0) {
      while (week.length < 7) week.push(null);
      rows.push(week);
    }
    return { weeks: rows, monthLabel: label, monthName: mName, yearStr: yr };
  }, [year, month]);

  const todayStr = toDateStr(new Date());

  const goMonth = (offset) => {
    const d = new Date(year, month + offset, 1);
    (onNavigateMonth || onSelectDate)(d);
  };

  return (
    <div style={{ marginBottom: 16 }}>
      {/* Month header -- blue banner matching day/week view */}
      <div style={{
        display: "flex", alignItems: "center",
        marginBottom: 12, padding: "14px 16px",
        background: `linear-gradient(135deg, ${BRAND.blue}, ${BRAND.blueDark})`,
        borderRadius: 14,
      }}>
        {/* Prev arrow -- far left */}
        <button onClick={() => goMonth(-1)} style={{
          width: 28, height: 40, display: "flex", alignItems: "center", justifyContent: "center",
          background: BRAND.white, border: "none", borderRadius: 8, cursor: "pointer", flexShrink: 0,
          boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
        }}>
          <svg width={14} height={14} viewBox="0 0 16 16" fill="none" stroke={ARROW_COLOURS.month} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 3l-5 5 5 5" />
          </svg>
        </button>

        {/* Centre group: month box + view buttons */}
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 12 }}>
          {/* Month & year in a wider white box */}
          <div style={{
            background: BRAND.white, borderRadius: 10, padding: "8px 48px",
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            minHeight: 58, minWidth: 200,
          }}>
            <div style={{ fontSize: 26, fontWeight: 800, color: BRAND.text, lineHeight: 1.1 }}>{monthName}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: BRAND.textLight, marginTop: 2 }}>{yearStr}</div>
          </div>

          {/* View buttons -- stacked, right of month box */}
          {setCalendarMode && (
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {[{ mode: "day", label: "Day View", colour: "#F5C518" }, { mode: "month", label: "Month View", colour: "#E8567F" }].map(v => {
                const active = calendarMode === v.mode;
                return (
                  <button key={v.mode} onClick={() => setCalendarMode(v.mode)} style={{
                    padding: "4px 8px", borderRadius: 6, border: "none",
                    background: active ? BRAND.white : "rgba(255,255,255,0.15)",
                    color: active ? v.colour : "rgba(255,255,255,0.85)",
                    fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                    transition: "all 0.15s", whiteSpace: "nowrap",
                  }}>{v.label}</button>
                );
              })}
            </div>
          )}
        </div>

        {/* Next arrow -- far right */}
        <button onClick={() => goMonth(1)} style={{
          width: 28, height: 40, display: "flex", alignItems: "center", justifyContent: "center",
          background: BRAND.white, border: "none", borderRadius: 8, cursor: "pointer", flexShrink: 0,
          boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
        }}>
          <svg width={14} height={14} viewBox="0 0 16 16" fill="none" stroke={ARROW_COLOURS.month} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 3l5 5-5 5" />
          </svg>
        </button>
      </div>

      {/* Day-of-week headers */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 4 }}>
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(d => (
          <div key={d} style={{
            textAlign: "center", fontSize: 11, fontWeight: 700,
            color: BRAND.textLight, textTransform: "uppercase", padding: "4px 0",
          }}>{d}</div>
        ))}
      </div>

      {/* Calendar grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
        {weeks.flat().map((date, i) => {
          if (!date) return <div key={`empty-${i}`} />;

          const dateStr = toDateStr(date);
          const isOpen = dayOpenState[dateStr] ?? getDefaultOpenForDate(date);
          const count = (bookingsByDate[dateStr] || []).length;
          const isToday = dateStr === todayStr;
          const isSelected = dateStr === toDateStr(currentDateObj);

          let bg = BRAND.white;
          let border = `1px solid ${BRAND.greyLight}`;
          let textColour = BRAND.text;

          if (!isOpen) {
            bg = "#F3F4F6";
            textColour = BRAND.textLight;
          }
          if (isSelected) {
            bg = BRAND.blue;
            textColour = BRAND.white;
            border = `1px solid ${BRAND.blue}`;
          }
          if (isToday && !isSelected) {
            border = `2px solid ${BRAND.blue}`;
          }

          return (
            <button
              key={dateStr}
              onClick={() => onSelectDate(date)}
              style={{
                padding: "8px 4px", borderRadius: 10, border, background: bg,
                cursor: "pointer", fontFamily: "inherit", transition: "all 0.1s",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                minHeight: 56,
              }}
            >
              <span style={{ fontSize: 14, fontWeight: 700, color: textColour }}>{date.getDate()}</span>
              {isOpen ? (
                <span style={{
                  fontSize: 11, fontWeight: 800,
                  color: isSelected ? "rgba(255,255,255,0.85)" : count > 0 ? BRAND.blue : BRAND.textLight,
                }}>
                  {count > 0 ? count : "\u2014"}
                </span>
              ) : (
                <span style={{ fontSize: 10, fontWeight: 600, color: isSelected ? "rgba(255,255,255,0.7)" : BRAND.closedRed }}>
                  Closed
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function WeekCalendarView({
  // Week navigation
  selectedDay,
  setSelectedDay,
  dates,
  currentDateObj,
  currentDateStr,
  // Data
  bookingsByDate,
  daySettings,
  dayOpenState,
  dogs,
  humans,
  // Current day settings (pre-computed in App.jsx)
  currentSettings,
  // Handlers
  handleAdd,
  handleOverride,
  handleAddSlot,
  handleRemoveSlot,
  toggleDayOpen,
  // Date picker
  showDatePicker,
  setShowDatePicker,
  handleDatePick,
  // Rebook
  rebookData,
  setRebookData,
  showRebookDatePicker,
  setShowRebookDatePicker,
  // New booking modal trigger
  setShowNewBooking,
}) {
  const [calendarMode, setCalendarMode] = useState("day"); // "day" | "month"

  const isOpen = currentSettings.isOpen;
  const dayBookings = bookingsByDate[currentDateStr] || [];

  const activeSlots = useMemo(() => {
    return [...SALON_SLOTS, ...(currentSettings.extraSlots || [])];
  }, [currentSettings.extraSlots]);

  // --- Rebook derived state ---
  const rebookDateStr = rebookData?.dateStr || "";
  const rebookSettings = rebookData
    ? daySettings[rebookDateStr] || {
        isOpen:
          dayOpenState[rebookDateStr] ?? getDefaultOpenForDate(rebookData.date),
        overrides: {},
        extraSlots: [],
      }
    : null;

  const rebookSlots = rebookData
    ? [...SALON_SLOTS, ...(rebookSettings?.extraSlots || [])]
    : [];
  const rebookBookings = rebookData ? bookingsByDate[rebookDateStr] || [] : [];
  const rebookDayOpen = rebookData
    ? (rebookSettings?.isOpen ?? dayOpenState[rebookDateStr] ?? false)
    : false;

  const rebookAvailableSlots = useMemo(() => {
    if (!rebookData) return [];
    return rebookSlots.filter(
      (slot) =>
        canBookSlot(rebookBookings, slot, rebookData.size, rebookSlots, {
          overrides: rebookSettings?.overrides?.[slot] || {},
        }).allowed,
    );
  }, [rebookData, rebookSlots, rebookBookings, rebookSettings]);

  // When clicking a date in month view, switch to day view for that date
  const handleMonthDateSelect = (date) => {
    handleDatePick(date);
    setCalendarMode("day");
  };

  return (
    <>
      {/* -- Calendar tabs -- */}
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

      {/* -- Day view -- */}
      {calendarMode === "day" && (
        <>
          {/* Slim header bar with ShopSign */}
          <div className="bg-gradient-to-br from-brand-blue to-brand-blue-dark p-[12px_20px] flex items-center justify-center min-h-[56px] relative overflow-hidden">
            {/* Paw watermark */}
            <div className="absolute right-10 -top-3.5 text-[100px] opacity-[0.04] -rotate-[15deg] pointer-events-none">
              {"\uD83D\uDC3E"}
            </div>
            <ShopSign isOpen={isOpen} />
          </div>

          {isOpen ? (
            <>
              <SlotGrid
                bookings={dayBookings}
                activeSlots={activeSlots}
                onOpenNewBooking={(dateStr, slot) => setShowNewBooking({ dateStr, slot })}
                currentDateStr={currentDateStr}
                overrides={currentSettings.overrides || {}}
                onOverride={handleOverride}
              />
              {/* Add/Remove extra slot buttons */}
              <div className="p-[12px_16px] border-t border-slate-200 bg-white flex flex-col gap-2">
                {(currentSettings.extraSlots || []).length > 0 && (
                  <button
                    onClick={handleRemoveSlot}
                    className="w-full py-2.5 rounded-[10px] border-none bg-brand-blue text-white text-[13px] font-bold cursor-pointer font-[inherit] transition-all hover:bg-brand-blue-dark"
                  >
                    Remove added timeslot
                  </button>
                )}
                <button
                  onClick={handleAddSlot}
                  className="w-full py-2.5 rounded-[10px] border-none bg-brand-coral text-white text-[13px] font-bold cursor-pointer font-[inherit] transition-all hover:bg-[#D9466F]"
                >
                  Add another timeslot
                </button>
              </div>
              <WaitlistPanel
                currentDateObj={currentDateObj}
                humans={humans}
                dogs={dogs}
              />
            </>
          ) : (
            <ClosedDayView onOpen={toggleDayOpen} />
          )}
        </>
      )}

      {/* -- Month view -- */}
      {calendarMode === "month" && (
        <MonthGrid
          currentDateObj={currentDateObj}
          bookingsByDate={bookingsByDate}
          dayOpenState={dayOpenState}
          onSelectDate={handleMonthDateSelect}
          onNavigateMonth={handleDatePick}
          calendarMode={calendarMode}
          setCalendarMode={setCalendarMode}
        />
      )}

      {/* -- Floating actions -- */}
      <FloatingActions
        bookings={dayBookings}
        onNewBooking={() => setShowNewBooking({ dateStr: currentDateStr, slot: "" })}
      />

      {/* -- Date picker modal -- */}
      {showDatePicker && (
        <Suspense fallback={<LoadingSpinner />}>
          <DatePickerModal
            currentDate={currentDateObj}
            dayOpenState={dayOpenState}
            onSelectDate={handleDatePick}
            onClose={() => setShowDatePicker(false)}
          />
        </Suspense>
      )}

      {/* -- Rebook modal (inline styles preserved -- Phase 3 scope) -- */}
      {rebookData && (
        <div
          onClick={() => {
            setRebookData(null);
            setShowRebookDatePicker(false);
          }}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: BRAND.white,
              borderRadius: 16,
              width: 420,
              padding: "20px 24px",
              boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
            }}
          >
            <div
              style={{
                fontSize: 16,
                fontWeight: 800,
                color: BRAND.text,
                marginBottom: 4,
              }}
            >
              Rebook {rebookData.dogName}
            </div>
            <div
              style={{
                fontSize: 13,
                color: BRAND.textLight,
                marginBottom: 12,
              }}
            >
              Pre-filled from previous appointment. Choose a date and slot, then
              confirm.
            </div>

            <button
              type="button"
              onClick={() => setShowRebookDatePicker(true)}
              style={{
                width: "100%",
                marginBottom: 10,
                padding: "10px 12px",
                borderRadius: 10,
                border: `1.5px solid ${BRAND.greyLight}`,
                background: BRAND.white,
                color: BRAND.text,
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "inherit",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span>
                {rebookData.date
                  ? rebookData.date.toLocaleDateString("en-GB", {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })
                  : "Choose date"}
              </span>
              <span>{"\uD83D\uDCC5"}</span>
            </button>

            {!rebookDayOpen && (
              <div
                style={{
                  marginBottom: 10,
                  padding: "10px 12px",
                  borderRadius: 8,
                  background: BRAND.coralLight,
                  color: BRAND.coral,
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                This day is currently closed. Choose another date.
              </div>
            )}

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(72px, 1fr))",
                gap: 6,
                marginBottom: 12,
              }}
            >
              {rebookSlots.map((slot) => {
                const allowed = canBookSlot(
                  rebookBookings,
                  slot,
                  rebookData.size,
                  rebookSlots,
                  {
                    overrides: rebookSettings?.overrides?.[slot] || {},
                  },
                ).allowed;

                return (
                  <button
                    key={slot}
                    type="button"
                    disabled={!allowed}
                    onClick={() =>
                      setRebookData((prev) => ({ ...prev, slot }))
                    }
                    style={{
                      padding: "8px 0",
                      borderRadius: 8,
                      border: `1.5px solid ${rebookData.slot === slot ? BRAND.blue : BRAND.greyLight}`,
                      background:
                        rebookData.slot === slot ? BRAND.blue : BRAND.white,
                      color:
                        rebookData.slot === slot
                          ? BRAND.white
                          : allowed
                            ? BRAND.text
                            : BRAND.textLight,
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: allowed ? "pointer" : "not-allowed",
                      opacity: allowed ? 1 : 0.5,
                      fontFamily: "inherit",
                    }}
                  >
                    {slot}
                  </button>
                );
              })}
            </div>

            {rebookAvailableSlots.length === 0 && (
              <div
                style={{
                  marginBottom: 12,
                  fontSize: 12,
                  color: BRAND.coral,
                  fontWeight: 700,
                }}
              >
                No bookable slots are available for this dog on the selected
                date.
              </div>
            )}

            <AddBookingForm
              slot={rebookData.slot}
              bookings={rebookBookings}
              activeSlots={rebookSlots}
              dogs={dogs}
              humans={humans}
              prefill={rebookData}
              slotOverrides={
                rebookSettings?.overrides?.[rebookData.slot] || {}
              }
              onAdd={async (booking) => {
                const saved = await handleAdd(booking, rebookData.dateStr);
                if (saved) {
                  setRebookData(null);
                  setShowRebookDatePicker(false);
                }
                return saved;
              }}
              onCancel={() => {
                setRebookData(null);
                setShowRebookDatePicker(false);
              }}
            />
          </div>
        </div>
      )}

      {/* -- Rebook date picker -- */}
      {showRebookDatePicker && rebookData && (
        <Suspense fallback={<LoadingSpinner />}>
          <DatePickerModal
            currentDate={rebookData.date}
            dayOpenState={dayOpenState}
            onSelectDate={(newDate) => {
              const newDateStr = toDateStr(newDate);
              const settings = daySettings[newDateStr] || {
                isOpen:
                  dayOpenState[newDateStr] ?? getDefaultOpenForDate(newDate),
                overrides: {},
                extraSlots: [],
              };
              const slots = [
                ...SALON_SLOTS,
                ...(settings.extraSlots || []),
              ];
              const bookings = bookingsByDate[newDateStr] || [];
              const nextSlot =
                slots.find(
                  (slot) =>
                    canBookSlot(bookings, slot, rebookData.size, slots, {
                      overrides: settings.overrides?.[slot] || {},
                    }).allowed,
                ) || "";

              setRebookData((prev) => ({
                ...prev,
                date: newDate,
                dateStr: newDateStr,
                slot: nextSlot,
              }));
              setShowRebookDatePicker(false);
            }}
            onClose={() => setShowRebookDatePicker(false)}
          />
        </Suspense>
      )}
    </>
  );
}
```

- [ ] **Step 2: Build check**

Run:
```bash
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.nvm/versions/node/*/bin:$PATH" && node node_modules/.bin/vite build
```

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/WeekCalendarView.jsx && git commit -m "refactor(tailwind): migrate WeekCalendarView header bar and slot buttons to Tailwind"
```

---

### Task 11: Final Verification

Run a clean build and verify no BRAND imports remain in components that should have dropped them.

- [ ] **Step 1: Full build check**

Run:
```bash
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.nvm/versions/node/*/bin:$PATH" && node node_modules/.bin/vite build
```

- [ ] **Step 2: Verify BRAND import removal**

Check that these files no longer import BRAND:
- `src/components/layout/CalendarTabs.jsx` -- should have no BRAND import
- `src/components/layout/MonthTab.jsx` -- should have no BRAND import
- `src/components/booking/GhostSeat.jsx` -- should have no BRAND import
- `src/components/booking/BlockedSeatCell.jsx` -- should have no BRAND import
- `src/components/booking/SlotGrid.jsx` -- should have no BRAND import

Check that these files correctly retain BRAND (or PRICING) imports where needed:
- `src/components/layout/ShopSign.jsx` -- BRAND for openGreen/closedRed
- `src/components/layout/DayTab.jsx` -- BRAND for conditional colours (strip, text, dog count)
- `src/components/booking/BookingCardNew.jsx` -- SERVICES, PRICING (no BRAND)
- `src/components/layout/FloatingActions.jsx` -- PRICING for revenue calc
- `src/components/layout/WeekCalendarView.jsx` -- BRAND for MonthGrid, rebook modal

Run:
```bash
grep -n "import.*BRAND" src/components/layout/CalendarTabs.jsx src/components/layout/MonthTab.jsx src/components/booking/GhostSeat.jsx src/components/booking/BlockedSeatCell.jsx src/components/booking/SlotGrid.jsx
```

This should return no results. If any BRAND imports remain in those files, remove them.

- [ ] **Step 3: Verify useState(hovered) removal**

Check that no migrated component still uses `useState(hovered)` for hover effects:

```bash
grep -n "useState(hovered\|useState(false)" src/components/layout/DayTab.jsx src/components/layout/MonthTab.jsx src/components/booking/BookingCardNew.jsx src/components/booking/GhostSeat.jsx src/components/booking/BlockedSeatCell.jsx
```

This should return no results for DayTab, MonthTab, or BookingCardNew. GhostSeat may have `useState(showMenu)` which is fine (it controls menu visibility, not hover). BlockedSeatCell should have no state at all.

- [ ] **Step 4: Visual spot-check**

Start the dev server and visually verify:

```bash
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.nvm/versions/node/*/bin:$PATH" && node node_modules/.bin/vite --host
```

Check these items at desktop width (>768px):
1. Calendar tabs display correctly with all days visible
2. Day header bar shows gradient background with paw watermark
3. ShopSign shows correct open/closed state with tilt
4. Slot grid rows have correct time labels and seat cells
5. Booking cards show all 4 rows (name, breed, owner, pills)
6. Ghost seats show + button and block button on hover
7. Blocked seat cells show dashed coral border with strike icon
8. Floating actions show revenue note and Book Now card
9. Hover effects work on cards, tabs, buttons

Check these items at mobile width (<768px):
1. Calendar tabs scroll horizontally with snap behaviour
2. Booking cards have compact text and tighter padding
3. Slot grid has narrower time column
4. Floating actions sit above the bottom tab bar
5. Ghost seats and blocked cells have shorter minimum height
