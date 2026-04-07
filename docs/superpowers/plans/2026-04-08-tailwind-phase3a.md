# Tailwind Phase 3A: Views — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate 5 view components to Tailwind CSS, splitting SettingsView into 9 focused files.

**Architecture:** Each view is rewritten with Tailwind utility classes. SettingsView is decomposed into a shell + 8 section components in a settings/ subfolder. Responsive grids, form inputs, and cards follow the patterns established in Phase 2.

**Tech Stack:** Tailwind CSS v4, React 19, Vite.

**Spec:** `docs/superpowers/specs/2026-04-08-tailwind-phase3a-views.md`

---

### Task 0: Add fadeIn keyframe to index.css

Before migrating components, add the shared `fadeIn` keyframe so all views can reference it via Tailwind's `animate-` utility.

- [ ] **Step 1: Add keyframe to index.css**

Add the following block to the end of `src/index.css`:

```css
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(5px); }
  to { opacity: 1; transform: translateY(0); }
}
```

The full file should be:

```css
@import "tailwindcss";

@theme {
  /* Brand accent colours */
  --color-brand-blue: #0EA5E9;
  --color-brand-blue-dark: #0284C7;
  --color-brand-coral: #E8567F;
  --color-brand-coral-light: #FDE2E8;
  --color-brand-teal: #2D8B7A;
  --color-brand-green: #16A34A;
  --color-brand-red: #DC2626;

  /* Size dot colours */
  --color-size-small: #F5C518;
  --color-size-medium: #2D8B7A;
  --color-size-large: #E8567F;
}

/* Body reset */
body {
  margin: 0;
  background-color: theme(--color-slate-50);
}

/* Shared view animation */
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(5px); }
  to { opacity: 1; transform: translateY(0); }
}
```

- [ ] **Step 2: Build check**

```bash
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.nvm/versions/node/*/bin:$PATH" && node node_modules/.bin/vite build
```

- [ ] **Step 3: Commit**

```bash
git add src/index.css && git commit -m "refactor: add fadeIn keyframe to index.css for Tailwind views"
```

---

### Task 1: DogsView

**File:** `src/components/views/DogsView.jsx`

Replace all inline styles with Tailwind classes. Remove BRAND import. Keep SIZE_THEME and SIZE_FALLBACK for dynamic per-dog colours (inline style). Remove onMouseEnter/onMouseLeave where possible. Remove inline `<style>` block.

- [ ] **Step 1: Replace DogsView.jsx**

Replace the full contents of `src/components/views/DogsView.jsx` with:

```jsx
import { useState, useMemo } from "react";
import { SIZE_THEME, SIZE_FALLBACK } from "../../constants/index.js";
import { getHumanByIdOrName } from "../../engine/bookingRules.js";
import { IconSearch } from "../icons/index.jsx";
import { AddDogModal } from "../modals/AddDogModal.jsx";

function titleCase(str) {
  if (!str) return "";
  return str.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function DogsView({ dogs, humans, onOpenDog, onAddDog, onAddHuman, hasMore, totalCount, loadMore, onSearch, searchQuery, isSearching }) {
  const [showAddModal, setShowAddModal] = useState(false);

  const sortedDogs = useMemo(() => Object.values(dogs).sort((a, b) => a.name.localeCompare(b.name)), [dogs]);

  return (
    <div className="animate-[fadeIn_0.2s_ease-in]">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-extrabold m-0 text-slate-800">
            Dogs Directory
          </h2>
          <div className="text-[13px] text-slate-500 mt-1">
            Search by name, breed, owner, or alerts.
          </div>
        </div>

        <div className="flex gap-2.5 items-center w-full max-w-[460px]">
          <div className="relative flex-1">
            <div className="absolute left-3.5 top-1/2 -translate-y-1/2 flex">
              <IconSearch size={16} colour="#6B7280" />
            </div>
            <input
              type="text"
              placeholder="Search dogs..."
              value={searchQuery}
              onChange={(e) => onSearch(e.target.value)}
              className="w-full py-2.5 pl-10 pr-3.5 rounded-[10px] border-[1.5px] border-slate-200 text-sm font-inherit outline-none text-slate-800 transition-colors focus:border-brand-blue"
            />
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="bg-brand-blue text-white border-none rounded-[10px] px-4 py-2.5 text-[13px] font-bold cursor-pointer font-inherit whitespace-nowrap transition-all hover:bg-brand-blue-dark"
          >
            + Add Dog
          </button>
        </div>
      </div>

      {/* Card grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {sortedDogs.map((dog) => {
          const owner = getHumanByIdOrName(humans, dog._humanId || dog.humanId);
          const ownerName =
            owner?.fullName ||
            (owner
              ? `${owner.name} ${owner.surname}`.trim()
              : dog.humanId || "");
          const alertCount = (dog.alerts || []).length;

          const t = SIZE_THEME[dog.size] || SIZE_FALLBACK;
          const sizeTheme = { bg: t.light, text: t.primary, border: t.gradient[0], shadow: `${t.gradient[0]}26` };

          return (
            <div
              key={dog.id}
              onClick={() => onOpenDog(dog.id || dog.name)}
              className="bg-white rounded-xl border border-slate-200 overflow-hidden cursor-pointer transition-all shadow-[0_2px_8px_rgba(0,0,0,0.03)] hover:-translate-y-0.5 hover:shadow-md"
              style={{
                "--hover-border": sizeTheme.border,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = sizeTheme.border;
                e.currentTarget.style.boxShadow = `0 6px 16px ${sizeTheme.shadow}`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "";
                e.currentTarget.style.boxShadow = "";
              }}
            >
              <div
                className="p-3.5 px-4 border-b border-slate-200 flex justify-between items-start"
                style={{ background: sizeTheme.bg }}
              >
                <div>
                  <div
                    className="text-base font-extrabold"
                    style={{ color: sizeTheme.text }}
                  >
                    {titleCase(dog.name)}
                  </div>
                  <div className="text-[13px] text-slate-800 font-semibold mt-1">
                    {titleCase(dog.breed)}{(() => {
                      let age = "";
                      if (dog.dob) {
                        const [y, m] = dog.dob.split("-").map(Number);
                        if (y && m) {
                          const now = new Date();
                          let yrs = now.getFullYear() - y;
                          let mos = now.getMonth() + 1 - m;
                          if (mos < 0) { yrs--; mos += 12; }
                          age = yrs >= 1 ? `${yrs} ${yrs === 1 ? "yr" : "yrs"}` : `${mos} ${mos === 1 ? "month" : "months"}`;
                        }
                      } else {
                        const raw = dog.age || "";
                        if (/^\d+$/.test(raw.trim())) age = `${raw.trim()} yrs`;
                        else age = raw;
                      }
                      return age ? ` \u00B7 ${age}` : "";
                    })()}
                  </div>
                </div>
                {alertCount > 0 && (
                  <span className="bg-brand-coral-light text-brand-coral px-2.5 py-1 rounded-xl text-[11px] font-bold">
                    {"\u26A0\uFE0F"} {alertCount} alert{alertCount > 1 ? "s" : ""}
                  </span>
                )}
              </div>

              <div className="p-3.5 px-4">
                <div className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wide mb-1.5">
                  Owner
                </div>
                <span className="bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-xl text-xs font-semibold text-slate-800">
                  {titleCase(ownerName)}
                </span>

                {dog.groomNotes && (
                  <div className="mt-2.5">
                    <div className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wide mb-1">
                      Groom Notes
                    </div>
                    <div className="text-xs text-slate-800 leading-relaxed">
                      {dog.groomNotes}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {sortedDogs.length === 0 && !isSearching && (
          <div className="col-span-full text-center py-16 px-5 text-slate-500">
            <div className="text-[32px] mb-3">{"\uD83D\uDC3E"}</div>
            <div className="text-[15px] font-semibold">
              {searchQuery ? `No dogs found matching "${searchQuery}"` : "No dogs yet."}
            </div>
            {searchQuery && (
              <div className="text-[13px] mt-1.5">
                Try searching by breed or owner name instead.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="mt-5 flex items-center justify-between flex-wrap gap-2.5">
        <div className="text-[13px] text-slate-500">
          {isSearching ? (
            <span className="italic">Searching...</span>
          ) : (
            <span>Showing {sortedDogs.length} of {totalCount} dogs</span>
          )}
        </div>
        {hasMore && !isSearching && (
          <button
            onClick={loadMore}
            className="border border-slate-200 rounded-[10px] px-4 py-2 text-[13px] font-semibold cursor-pointer font-inherit bg-white text-slate-800 transition-all hover:border-brand-blue hover:text-brand-blue"
          >
            Load more
          </button>
        )}
      </div>

      {showAddModal && (
        <AddDogModal
          onClose={() => setShowAddModal(false)}
          onAdd={onAddDog}
          onAddHuman={onAddHuman}
          humans={humans}
        />
      )}
    </div>
  );
}
```

Note: The dog cards keep `onMouseEnter`/`onMouseLeave` for the dynamic size-based border and shadow colours (these vary per dog and cannot be expressed as static Tailwind classes). All other hover effects use Tailwind `hover:`.

- [ ] **Step 2: Build check**

```bash
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.nvm/versions/node/*/bin:$PATH" && node node_modules/.bin/vite build
```

- [ ] **Step 3: Commit**

```bash
git add src/components/views/DogsView.jsx && git commit -m "refactor: migrate DogsView to Tailwind CSS"
```

---

### Task 2: HumansView

**File:** `src/components/views/HumansView.jsx`

Same pattern as DogsView. Teal-themed. Remove BRAND where possible. Keep SIZE_THEME for dynamic dog-size pill colours.

- [ ] **Step 1: Replace HumansView.jsx**

Replace the full contents of `src/components/views/HumansView.jsx` with:

```jsx
import { useState, useMemo } from "react";
import { SIZE_THEME, getSizeForBreed } from "../../constants/index.js";
import { IconSearch } from "../icons/index.jsx";
import { AddHumanModal } from "../modals/AddHumanModal.jsx";

function titleCase(str) {
  if (!str) return "";
  return str.replace(/\b\w/g, (c) => c.toUpperCase());
}

function waLink(phone) {
  if (!phone) return "#";
  const digits = phone.replace(/[\s\-()]/g, "");
  const intl = digits.startsWith("0") ? "44" + digits.slice(1) : digits;
  return `https://wa.me/${intl}`;
}

const DEFAULT_PILL = { bg: "#F8FAFB", text: "#1F2937", border: "#E5E7EB" };
function sizePill(size) {
  const t = SIZE_THEME[size];
  if (!t) return DEFAULT_PILL;
  return { bg: t.light, text: t.primary, border: t.gradient[0] };
}

export function HumansView({ humans, dogs, onOpenHuman, onAddHuman, hasMore, totalCount, loadMore, onSearch, searchQuery, isSearching }) {
  const [showAddModal, setShowAddModal] = useState(false);

  const sortedHumans = useMemo(() => Object.values(humans).sort((a, b) => a.name.localeCompare(b.name)), [humans]);

  return (
    <div className="animate-[fadeIn_0.2s_ease-in]">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-extrabold m-0 text-slate-800">
            Humans Directory
          </h2>
          <div className="text-[13px] text-slate-500 mt-1">
            Search by name, phone, address, dog, or notes.
          </div>
        </div>

        <div className="flex gap-2.5 items-center w-full max-w-[460px]">
          <div className="relative flex-1">
            <div className="absolute left-3.5 top-1/2 -translate-y-1/2 flex">
              <IconSearch size={16} colour="#6B7280" />
            </div>
            <input
              type="text"
              placeholder="Search rolodex..."
              value={searchQuery}
              onChange={(e) => onSearch(e.target.value)}
              className="w-full py-2.5 pl-10 pr-3.5 rounded-[10px] border-[1.5px] border-slate-200 text-sm font-inherit outline-none text-slate-800 transition-colors focus:border-brand-teal"
            />
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="bg-brand-teal text-white border-none rounded-[10px] px-4 py-2.5 text-[13px] font-bold cursor-pointer font-inherit whitespace-nowrap transition-all hover:bg-[#236b5d]"
          >
            + Add Human
          </button>
        </div>
      </div>

      {/* Card grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {sortedHumans.map((human) => {
          const fullName = human.fullName || `${human.name} ${human.surname}`;
          const humanDogs = Object.values(dogs).filter(
            (dog) => dog._humanId === human.id || dog.humanId === fullName,
          );

          return (
            <div
              key={human.id}
              onClick={() => onOpenHuman(human.id || fullName)}
              className="bg-white rounded-xl border border-slate-200 overflow-hidden cursor-pointer transition-all shadow-[0_2px_8px_rgba(0,0,0,0.03)] hover:-translate-y-0.5 hover:border-brand-teal hover:shadow-[0_6px_16px_rgba(45,139,122,0.12)]"
            >
              <div className="bg-[#E6F5F2] p-3.5 px-4 border-b border-slate-200 flex justify-between items-start">
                <div>
                  <div className="text-base font-extrabold text-[#1F6659]">
                    {titleCase(fullName)}
                  </div>
                  {human.phone ? (
                    <a
                      href={waLink(human.phone)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-[13px] text-slate-800 font-semibold mt-1 block no-underline hover:text-brand-teal"
                    >
                      {human.phone}
                    </a>
                  ) : (
                    <div className="text-[13px] text-slate-500 font-semibold mt-1 italic">
                      No phone
                    </div>
                  )}
                </div>
                {human.historyFlag && (
                  <span title={human.historyFlag} className="text-base">
                    {"\u26A0\uFE0F"}
                  </span>
                )}
              </div>
              <div className="p-3.5 px-4">
                <div className="text-[11px] font-extrabold text-[#1E6B5C] uppercase tracking-wide mb-2">
                  Dogs
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  {humanDogs.length > 0 ? (
                    humanDogs.map((dog) => {
                      const dogSize = dog.size || getSizeForBreed(dog.breed);
                      const pill = sizePill(dogSize);
                      return (
                        <span
                          key={dog.id}
                          className="px-2.5 py-1 rounded-xl text-xs font-semibold"
                          style={{
                            background: pill.bg,
                            border: `1px solid ${pill.border}`,
                            color: pill.text,
                          }}
                        >
                          {titleCase(dog.name)}{" "}
                          <span className="font-medium opacity-75">
                            ({titleCase(dog.breed)})
                          </span>
                        </span>
                      );
                    })
                  ) : (
                    <span className="text-[13px] text-slate-500 italic">
                      None listed
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {sortedHumans.length === 0 && !isSearching && (
          <div className="col-span-full text-center py-16 px-5 text-slate-500">
            <div className="text-[32px] mb-3">{"\uD83D\uDD0D"}</div>
            <div className="text-[15px] font-semibold">
              {searchQuery ? `No humans found matching "${searchQuery}"` : "No humans yet."}
            </div>
            {searchQuery && (
              <div className="text-[13px] mt-1.5">
                Try searching by phone number or dog breed instead.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="mt-5 flex items-center justify-between flex-wrap gap-2.5">
        <div className="text-[13px] text-slate-500">
          {isSearching ? (
            <span className="italic">Searching...</span>
          ) : (
            <span>Showing {sortedHumans.length} of {totalCount} humans</span>
          )}
        </div>
        {hasMore && !isSearching && (
          <button
            onClick={loadMore}
            className="border border-slate-200 rounded-[10px] px-4 py-2 text-[13px] font-semibold cursor-pointer font-inherit bg-white text-slate-800 transition-all hover:border-brand-teal hover:text-brand-teal"
          >
            Load more
          </button>
        )}
      </div>

      {showAddModal && (
        <AddHumanModal
          onClose={() => setShowAddModal(false)}
          onAdd={onAddHuman}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Build check**

```bash
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.nvm/versions/node/*/bin:$PATH" && node node_modules/.bin/vite build
```

- [ ] **Step 3: Commit**

```bash
git add src/components/views/HumansView.jsx && git commit -m "refactor: migrate HumansView to Tailwind CSS"
```

---

### Task 3: StatsView

**File:** `src/components/views/StatsView.jsx`

Remove BRAND import entirely. Replace inline style objects with Tailwind classes. Bar chart dynamic heights and conditional colours stay inline.

- [ ] **Step 1: Replace StatsView.jsx**

Replace the full contents of `src/components/views/StatsView.jsx` with:

```jsx
// src/components/views/StatsView.jsx
import { useMemo } from "react";
import { PRICING, SERVICES, SALON_SLOTS } from "../../constants/index.js";
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
  const diff = day === 0 ? -6 : 1 - day;
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

  const thisWeekDates = useMemo(() => getWeekDates(today), [todayStr]);

  const lastWeekDates = useMemo(() => {
    const lastMon = new Date(thisWeekDates[0]);
    lastMon.setDate(lastMon.getDate() - 7);
    return getWeekDates(lastMon);
  }, [thisWeekDates]);

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

  const busiestDay = useMemo(() => {
    const dayCounts = [0, 0, 0, 0, 0, 0, 0];
    const dayTotals = [0, 0, 0, 0, 0, 0, 0];
    for (const [dateStr, dayBookings] of Object.entries(bookingsByDate)) {
      const d = new Date(dateStr + "T00:00:00");
      const dayIdx = d.getDay() === 0 ? 6 : d.getDay() - 1;
      dayCounts[dayIdx]++;
      dayTotals[dayIdx] += dayBookings.length;
    }
    let bestIdx = 0;
    let bestAvg = 0;
    for (let i = 0; i < 7; i++) {
      const avg = dayCounts[i] > 0 ? dayTotals[i] / dayCounts[i] : 0;
      if (avg > bestAvg) { bestAvg = avg; bestIdx = i; }
    }
    const FULL_DAYS = ["Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays", "Sundays"];
    return { day: FULL_DAYS[bestIdx], avg: bestAvg.toFixed(1) };
  }, [bookingsByDate]);

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

  const thisWeekAvg = (thisWeekData.reduce((s, d) => s + d.count, 0) / 7).toFixed(1);
  const lastWeekAvg = useMemo(() => {
    const total = lastWeekDates.reduce((sum, date) => {
      const dateStr = toDateStr(date);
      return sum + (bookingsByDate[dateStr] || []).length;
    }, 0);
    return (total / 7).toFixed(1);
  }, [lastWeekDates, bookingsByDate]);

  return (
    <div className="flex flex-col gap-4">
      {/* Revenue card */}
      <div className="bg-white border border-slate-200 rounded-[14px] p-5 px-6 shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
        <div className="text-[13px] font-extrabold text-slate-500 uppercase tracking-widest mb-4">Revenue</div>

        {/* Hero total */}
        <div className="flex items-baseline gap-2 mb-5">
          <span className="text-[32px] font-black text-slate-800">
            \u00A3{thisWeekTotal}
          </span>
          <span className="text-sm font-semibold text-slate-500">
            this week
          </span>
        </div>

        {/* Bar chart */}
        <div className="flex gap-2 items-end h-[120px] mb-4">
          {thisWeekData.map((day) => (
            <div key={day.label} className="flex-1 text-center flex flex-col items-center justify-end h-full">
              <div
                className={`w-full max-w-[40px] rounded-t-md min-h-[4px] transition-[height] duration-300 ${day.isToday ? "bg-brand-teal" : "bg-brand-blue"}`}
                style={{
                  height: `${Math.max((day.revenue / maxDayRevenue) * 100, 4)}%`,
                }}
              />
              <div className="text-[11px] font-bold text-slate-800 mt-1.5">
                {day.label}
              </div>
              <div className="text-[11px] font-semibold text-slate-500">
                \u00A3{day.revenue}
              </div>
            </div>
          ))}
        </div>

        {/* Comparisons */}
        <div className="flex gap-6">
          <div>
            <span className="text-xs font-semibold text-slate-500">Last week: </span>
            <span className="text-sm font-extrabold text-slate-800">\u00A3{lastWeekTotal}</span>
          </div>
          <div>
            <span className="text-xs font-semibold text-slate-500">This month: </span>
            <span className="text-sm font-extrabold text-slate-800">\u00A3{monthlyTotal}</span>
          </div>
        </div>
      </div>

      {/* Operations card */}
      <div className="bg-white border border-slate-200 rounded-[14px] p-5 px-6 shadow-[0_2px_12px_rgba(0,0,0,0.04)]">
        <div className="text-[13px] font-extrabold text-slate-500 uppercase tracking-widest mb-4">Operations</div>

        {/* Busiest day */}
        <div className="mb-5">
          <div className="text-sm font-bold text-slate-800">
            {busiestDay.day} are your busiest day
          </div>
          <div className="text-xs font-semibold text-slate-500">
            avg {busiestDay.avg} bookings per {busiestDay.day.replace(/s$/, "").toLowerCase()}
          </div>
        </div>

        {/* Service breakdown */}
        <div className="mb-5">
          <div className="text-xs font-bold text-slate-500 mb-2">
            Services
          </div>
          {serviceBreakdown.map((svc) => {
            const pct = serviceBreakdown[0]?.count > 0
              ? (svc.count / serviceBreakdown[0].count) * 100
              : 0;
            return (
              <div key={svc.name} className="flex items-center gap-2.5 mb-1.5">
                <span className="text-[13px] font-semibold text-slate-800 w-[110px] shrink-0">
                  {svc.name}
                </span>
                <div className="flex-1 h-2 bg-slate-100 rounded overflow-hidden">
                  <div
                    className="h-full bg-brand-blue rounded"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="text-xs font-extrabold text-slate-800 w-[30px] text-right">
                  {svc.count}
                </span>
              </div>
            );
          })}
        </div>

        {/* Top customers */}
        <div className="mb-5">
          <div className="text-xs font-bold text-slate-500 mb-2">
            Top Customers
          </div>
          {topCustomers.map((c, i) => (
            <div key={c.name} className="flex justify-between py-1">
              <span className="text-[13px] font-semibold text-slate-800">
                {i + 1}. {c.name}
              </span>
              <span className="text-xs font-extrabold text-brand-blue">
                {c.count} booking{c.count !== 1 ? "s" : ""}
              </span>
            </div>
          ))}
          {topCustomers.length === 0 && (
            <div className="text-xs text-slate-500">No booking data yet</div>
          )}
        </div>

        {/* Daily averages */}
        <div className="flex gap-6">
          <div>
            <span className="text-xs font-semibold text-slate-500">This week: </span>
            <span className="text-sm font-extrabold text-slate-800">{thisWeekAvg}/day</span>
          </div>
          <div>
            <span className="text-xs font-semibold text-slate-500">Last week: </span>
            <span className="text-sm font-extrabold text-slate-800">{lastWeekAvg}/day</span>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build check**

```bash
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.nvm/versions/node/*/bin:$PATH" && node node_modules/.bin/vite build
```

- [ ] **Step 3: Commit**

```bash
git add src/components/views/StatsView.jsx && git commit -m "refactor: migrate StatsView to Tailwind CSS"
```

---

### Task 4: ReportsView

**File:** `src/components/views/ReportsView.jsx`

Remove BRAND import. Keep PRICING and SERVICES imports. Responsive grid: stack on mobile, 2-col on md+.

- [ ] **Step 1: Replace ReportsView.jsx**

Replace the full contents of `src/components/views/ReportsView.jsx` with:

```jsx
import { useState, useEffect, useMemo } from "react";
import { supabase } from "../../supabase/client.js";
import { PRICING, SERVICES } from "../../constants/index.js";
import { LoadingSpinner } from "../ui/LoadingSpinner.jsx";

function getEstimatedPrice(serviceId, size) {
  const priceStr = PRICING[serviceId]?.[size] || "\u00A30";
  return parseFloat(priceStr.replace(/[^0-9.]/g, "")) || 0;
}

export function ReportsView() {
  const [loading, setLoading] = useState(true);
  const [rawBookings, setRawBookings] = useState([]);
  const [timeRange, setTimeRange] = useState("30");

  useEffect(() => {
    async function loadStats() {
      setLoading(true);

      const dateLimit = new Date();
      dateLimit.setDate(dateLimit.getDate() - parseInt(timeRange, 10));
      const isoDate = dateLimit.toISOString().split("T")[0];

      const { data, error } = await supabase
        .from("bookings")
        .select("id, booking_date, service, size, status, payment")
        .gte("booking_date", isoDate)
        .order("booking_date", { ascending: false });

      if (error) {
        console.error("Error fetching report data:", error);
      } else {
        setRawBookings(data || []);
      }
      setLoading(false);
    }
    loadStats();
  }, [timeRange]);

  const stats = useMemo(() => {
    let revenue = 0;
    const servicesCount = {};
    const daysCount = {};

    rawBookings.forEach((b) => {
      if (b.status === "Cancelled" || b.status === "No Show") return;

      revenue += getEstimatedPrice(b.service, b.size || "small");

      servicesCount[b.service] = (servicesCount[b.service] || 0) + 1;

      const dayIndex = new Date(b.booking_date).getDay();
      daysCount[dayIndex] = (daysCount[dayIndex] || 0) + 1;
    });

    const topServices = Object.entries(servicesCount)
      .sort((a, b) => b[1] - a[1])
      .map(([id, count]) => {
        const s = SERVICES.find(x => x.id === id);
        return { name: s ? s.name : id, count };
      });

    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const topDays = Object.entries(daysCount)
      .sort((a, b) => b[1] - a[1])
      .map(([index, count]) => ({ day: dayNames[index], count }));

    return {
      totalBookings: rawBookings.length,
      revenue,
      topServices,
      topDays,
    };
  }, [rawBookings]);

  return (
    <div className="py-2.5">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-[22px] font-extrabold m-0 text-slate-800">Overview & Analytics</h2>
        <select
          value={timeRange}
          onChange={(e) => setTimeRange(e.target.value)}
          className="px-3 py-2 rounded-lg border border-slate-200 text-[13px] bg-white"
        >
          <option value="7">Last 7 Days</option>
          <option value="30">Last 30 Days</option>
          <option value="90">Last 90 Days</option>
        </select>
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          {/* Revenue Card */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-[0_4px_12px_rgba(0,0,0,0.03)]">
            <div className="text-xs font-extrabold text-[#1E6B5C] uppercase tracking-wide">Estimated Revenue</div>
            <div className="text-4xl font-extrabold text-brand-blue mt-1">\u00A3{stats.revenue.toFixed(2)}</div>
            <div className="text-[13px] text-slate-500 mt-1">Based on base prices</div>
          </div>

          {/* Bookings Card */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-[0_4px_12px_rgba(0,0,0,0.03)]">
            <div className="text-xs font-extrabold text-[#1E6B5C] uppercase tracking-wide">Total Bookings</div>
            <div className="text-4xl font-extrabold text-brand-teal mt-1">{stats.totalBookings}</div>
            <div className="text-[13px] text-slate-500 mt-1">Completed & Scheduled</div>
          </div>

          {/* Popular Services */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-[0_4px_12px_rgba(0,0,0,0.03)]">
            <div className="text-xs font-extrabold text-[#1E6B5C] uppercase tracking-wide mb-4">Services Breakdown</div>
            {stats.topServices.length === 0 ? <div className="text-[13px] text-slate-500">No data</div> : null}
            <div className="flex flex-col gap-3">
              {stats.topServices.map(s => (
                <div key={s.name} className="flex justify-between items-center">
                  <span className="text-sm font-semibold text-slate-800">{s.name}</span>
                  <span className="text-sm font-extrabold text-[#1E6B5C]">{s.count}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Busiest Days */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-[0_4px_12px_rgba(0,0,0,0.03)]">
            <div className="text-xs font-extrabold text-[#1E6B5C] uppercase tracking-wide mb-4">Busiest Days</div>
            {stats.topDays.length === 0 ? <div className="text-[13px] text-slate-500">No data</div> : null}
            <div className="flex flex-col gap-3">
              {stats.topDays.map(d => (
                <div key={d.day} className="flex justify-between items-center">
                  <span className="text-sm font-semibold text-slate-800">{d.day}</span>
                  <span className="text-sm font-extrabold text-[#1E6B5C]">{d.count}</span>
                </div>
              ))}
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Build check**

```bash
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.nvm/versions/node/*/bin:$PATH" && node node_modules/.bin/vite build
```

- [ ] **Step 3: Commit**

```bash
git add src/components/views/ReportsView.jsx && git commit -m "refactor: migrate ReportsView to Tailwind CSS"
```

---

### Task 5: SettingsView shell + shared components + tab navigation

**Files:**
- `src/components/views/SettingsView.jsx` (rewrite to thin shell)
- `src/components/views/settings/shared.jsx` (new — shared sub-components)

Create the settings/ directory, the shared components file, and the shell that imports all 8 sections.

- [ ] **Step 1: Create settings/ directory**

```bash
mkdir -p "src/components/views/settings"
```

(Run from project root.)

- [ ] **Step 2: Create settings/shared.jsx**

Create `src/components/views/settings/shared.jsx` with:

```jsx
// src/components/views/settings/shared.jsx
// Shared sub-components used by multiple settings sections.

const CARD_HEAD_THEMES = {
  teal:   { bg: "bg-[#E6F5F2]", color: "text-[#1E6B5C]" },
  blue:   { bg: "bg-blue-50",    color: "text-brand-blue-dark" },
  yellow: { bg: "bg-amber-50",   color: "text-amber-800" },
  coral:  { bg: "bg-brand-coral-light", color: "text-brand-coral" },
};

export function Card({ id, children }) {
  return (
    <div id={id} className="bg-white border border-slate-200 rounded-xl mb-4 shadow-[0_2px_8px_rgba(0,0,0,0.03)] overflow-hidden">
      {children}
    </div>
  );
}

export function CardHead({ variant = "teal", title, desc, right }) {
  const t = CARD_HEAD_THEMES[variant] || CARD_HEAD_THEMES.teal;
  return (
    <div className={`p-3.5 px-4 border-b border-slate-200 flex justify-between items-center ${t.bg}`}>
      <div>
        <div className={`text-base font-extrabold ${t.color}`}>{title}</div>
        {desc && <div className="text-[13px] font-semibold text-slate-800 mt-0.5">{desc}</div>}
      </div>
      {right}
    </div>
  );
}

export function CardBody({ children }) {
  return <div className="p-4">{children}</div>;
}

export function SettingRow({ label, sublabel, control, border = true }) {
  return (
    <div className={`flex justify-between items-center py-3.5 ${border ? "border-b border-slate-200" : ""}`}>
      <div>
        <div className="text-sm font-semibold text-slate-800">{label}</div>
        {sublabel && <div className="text-xs text-slate-500 mt-0.5">{sublabel}</div>}
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  );
}

export function Toggle({ on, onToggle }) {
  return (
    <div
      onClick={onToggle}
      className={`w-11 h-6 rounded-xl relative cursor-pointer transition-colors duration-200 ${on ? "bg-brand-green" : "bg-slate-200"}`}
    >
      <div
        className="w-5 h-5 bg-white rounded-full absolute top-0.5 transition-[left] duration-200"
        style={{ left: on ? 22 : 2 }}
      />
    </div>
  );
}

export function InlineField({ label, sublabel, suffix, value, onChange, border = true }) {
  return (
    <div className={`flex justify-between items-center py-3.5 ${border ? "border-b border-slate-200" : ""}`}>
      <div>
        <div className="text-sm font-semibold text-slate-800">{label}</div>
        {sublabel && <div className="text-xs text-slate-500 mt-0.5">{sublabel}</div>}
      </div>
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          value={value}
          onChange={onChange}
          className="py-2 px-3 rounded-lg border-[1.5px] border-slate-200 text-[13px] font-inherit text-slate-800 text-right outline-none w-20 transition-colors focus:border-brand-teal"
        />
        <span className="text-[13px] text-slate-500">{suffix}</span>
      </div>
    </div>
  );
}

export function SaveButton({ onClick, saving, saved, label = "Save changes" }) {
  const base = "px-4 py-2.5 rounded-[10px] border-none text-[13px] font-bold cursor-pointer font-inherit transition-colors duration-200";
  const state = saving
    ? "bg-slate-200 text-slate-500 cursor-not-allowed"
    : saved
      ? "bg-brand-teal text-white"
      : "bg-brand-teal text-white hover:bg-[#1E6B5C]";

  return (
    <button onClick={onClick} disabled={saving} className={`${base} ${state}`}>
      {saving ? "Saving\u2026" : saved ? "\u2713 Saved" : label}
    </button>
  );
}

// Reusable class strings
export const LABEL_CLS = "text-[11px] font-extrabold text-[#1E6B5C] uppercase tracking-wide block mb-1.5";
export const SECTION_LABEL_CLS = "text-[11px] font-extrabold text-[#1E6B5C] uppercase tracking-wide mb-2";
export const INPUT_CLS = "w-full py-2.5 px-3.5 rounded-[10px] border-[1.5px] border-slate-200 text-[13px] font-inherit outline-none text-slate-800 transition-colors focus:border-brand-teal";
```

- [ ] **Step 3: Replace SettingsView.jsx with thin shell**

Replace the full contents of `src/components/views/SettingsView.jsx` with:

```jsx
// src/components/views/SettingsView.jsx — thin shell with tab navigation
import { BusinessSettings } from "./settings/BusinessSettings.jsx";
import { HoursSettings } from "./settings/HoursSettings.jsx";
import { AccountSettings } from "./settings/AccountSettings.jsx";
import { PricingSettings } from "./settings/PricingSettings.jsx";
import { BookingRulesSettings } from "./settings/BookingRulesSettings.jsx";
import { CapacitySettings } from "./settings/CapacitySettings.jsx";
import { CustomerPortalSettings } from "./settings/CustomerPortalSettings.jsx";
import { NotificationSettings } from "./settings/NotificationSettings.jsx";

const SECTIONS = [
  { id: "business", label: "Your Business" },
  { id: "hours", label: "Hours & Closures" },
  { id: "account", label: "Your Account" },
  { id: "pricing", label: "Services & Pricing" },
  { id: "rules", label: "Booking Rules" },
  { id: "capacity", label: "Capacity Engine" },
  { id: "portal", label: "Customer Portal" },
  { id: "notifs", label: "Notifications" },
];

function JumpBar() {
  const scrollTo = (id) => {
    const el = document.getElementById(`settings-${id}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="flex gap-1 flex-wrap bg-slate-100 p-1 rounded-[10px] mb-5">
      {SECTIONS.map((s) => (
        <button
          key={s.id}
          onClick={() => scrollTo(s.id)}
          className="rounded-[7px] px-3 py-[7px] text-xs font-semibold cursor-pointer font-inherit transition-all border-none bg-transparent text-slate-500 hover:text-slate-800 hover:bg-white/60"
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}

export function SettingsView({ config, onUpdateConfig, user, staffProfile }) {
  return (
    <div className="animate-[fadeIn_0.2s_ease-in]">
      {/* Page header */}
      <div className="mb-5">
        <h2 className="text-2xl font-extrabold m-0 text-slate-800">Salon Settings</h2>
        <div className="text-[13px] text-slate-500 mt-1">
          Manage your business, pricing, booking rules, and more.
        </div>
      </div>

      <JumpBar />

      <BusinessSettings config={config} onUpdateConfig={onUpdateConfig} />
      <HoursSettings config={config} onUpdateConfig={onUpdateConfig} />
      <AccountSettings user={user} staffProfile={staffProfile} />
      <PricingSettings config={config} onUpdateConfig={onUpdateConfig} />
      <BookingRulesSettings config={config} onUpdateConfig={onUpdateConfig} />
      <CapacitySettings config={config} onUpdateConfig={onUpdateConfig} />
      <CustomerPortalSettings config={config} onUpdateConfig={onUpdateConfig} />
      <NotificationSettings config={config} onUpdateConfig={onUpdateConfig} />
    </div>
  );
}
```

- [ ] **Step 4: Build check** (will fail until section components exist — skip or expect failure)

Note: The build will fail at this point because the section component files don't exist yet. Continue to Task 6 immediately.

- [ ] **Step 5: Commit** (defer until after Task 13 — commit shell + all sections together)

---

### Task 6: BusinessSettings

**File:** `src/components/views/settings/BusinessSettings.jsx`

- [ ] **Step 1: Create BusinessSettings.jsx**

Create `src/components/views/settings/BusinessSettings.jsx` with:

```jsx
import { useState } from "react";
import { Card, CardHead, CardBody, SaveButton, LABEL_CLS, INPUT_CLS } from "./shared.jsx";

export function BusinessSettings({ config, onUpdateConfig }) {
  const [business, setBusiness] = useState({
    name: config?.businessName || "Smarter Dog Grooming",
    phone: config?.businessPhone || "",
    email: config?.businessEmail || "",
    address: config?.businessAddress || "",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setSaving(true);
    onUpdateConfig((prev) => ({
      ...prev,
      businessName: business.name,
      businessPhone: business.phone,
      businessEmail: business.email,
      businessAddress: business.address,
    }));
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <Card id="settings-business">
      <CardHead variant="teal" title="Your Business" desc="Details shown to customers on the booking portal" />
      <CardBody>
        <div className="mb-3">
          <label className={LABEL_CLS}>Salon Name</label>
          <input
            type="text"
            value={business.name}
            onChange={(e) => setBusiness((b) => ({ ...b, name: e.target.value }))}
            className={INPUT_CLS}
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 mb-3">
          <div>
            <label className={LABEL_CLS}>Phone</label>
            <input
              type="tel"
              value={business.phone}
              onChange={(e) => setBusiness((b) => ({ ...b, phone: e.target.value }))}
              className={INPUT_CLS}
              placeholder="07700 900123"
            />
          </div>
          <div>
            <label className={LABEL_CLS}>Email</label>
            <input
              type="email"
              value={business.email}
              onChange={(e) => setBusiness((b) => ({ ...b, email: e.target.value }))}
              className={INPUT_CLS}
              placeholder="hello@smarterdog.co.uk"
            />
          </div>
        </div>
        <div className="mb-3.5">
          <label className={LABEL_CLS}>Address</label>
          <input
            type="text"
            value={business.address}
            onChange={(e) => setBusiness((b) => ({ ...b, address: e.target.value }))}
            className={INPUT_CLS}
            placeholder="123 High Street, Exampletown"
          />
        </div>
        <SaveButton onClick={handleSave} saving={saving} saved={saved} />
      </CardBody>
    </Card>
  );
}
```

---

### Task 7: HoursSettings

**File:** `src/components/views/settings/HoursSettings.jsx`

- [ ] **Step 1: Create HoursSettings.jsx**

Create `src/components/views/settings/HoursSettings.jsx` with:

```jsx
import { useState } from "react";
import { Card, CardHead, CardBody, SaveButton, SECTION_LABEL_CLS, INPUT_CLS } from "./shared.jsx";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const DEFAULT_HOURS = {
  Monday: { open: "08:00", close: "17:00", closed: false },
  Tuesday: { open: "08:00", close: "17:00", closed: false },
  Wednesday: { open: "08:00", close: "17:00", closed: false },
  Thursday: { open: "08:00", close: "17:00", closed: false },
  Friday: { open: "08:00", close: "17:00", closed: false },
  Saturday: { open: "09:00", close: "14:00", closed: false },
  Sunday: { open: "", close: "", closed: true },
};

export function HoursSettings({ config, onUpdateConfig }) {
  const [hours, setHours] = useState(config?.businessHours || DEFAULT_HOURS);
  const [closures, setClosures] = useState(config?.closures || []);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [newClosureDate, setNewClosureDate] = useState("");
  const [newClosureLabel, setNewClosureLabel] = useState("");

  const updateDay = (day, field, value) => {
    setHours((prev) => ({ ...prev, [day]: { ...prev[day], [field]: value } }));
  };

  const toggleDayClosed = (day) => {
    setHours((prev) => ({ ...prev, [day]: { ...prev[day], closed: !prev[day].closed } }));
  };

  const addClosure = () => {
    if (!newClosureDate) return;
    setClosures((prev) => [...prev, { date: newClosureDate, label: newClosureLabel || "Closed" }]);
    setNewClosureDate("");
    setNewClosureLabel("");
  };

  const removeClosure = (index) => {
    setClosures((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = () => {
    setSaving(true);
    onUpdateConfig((prev) => ({ ...prev, businessHours: hours, closures }));
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <Card id="settings-hours">
      <CardHead variant="blue" title="Opening Hours & Closures" desc="Weekly schedule and holiday dates" />
      <CardBody>
        <div className={SECTION_LABEL_CLS}>Weekly Hours</div>
        <div className="flex flex-col gap-1">
          {DAYS.map((day) => {
            const d = hours[day] || DEFAULT_HOURS[day];
            return (
              <div key={day} className="grid grid-cols-[80px_1fr_1fr_32px] gap-2 items-center py-1">
                <span className={`text-[13px] font-bold ${d.closed ? "text-brand-red" : "text-slate-800"}`}>
                  {day}
                </span>
                {d.closed ? (
                  <div className="col-span-2 text-center text-[11px] font-bold text-brand-red bg-red-100 py-2 rounded-lg">
                    CLOSED
                  </div>
                ) : (
                  <>
                    <input
                      type="time"
                      value={d.open}
                      onChange={(e) => updateDay(day, "open", e.target.value)}
                      className={`${INPUT_CLS} !py-2 !px-2.5 text-center`}
                    />
                    <input
                      type="time"
                      value={d.close}
                      onChange={(e) => updateDay(day, "close", e.target.value)}
                      className={`${INPUT_CLS} !py-2 !px-2.5 text-center`}
                    />
                  </>
                )}
                <div
                  onClick={() => toggleDayClosed(day)}
                  className={`w-8 h-8 rounded-lg border flex items-center justify-center cursor-pointer text-[13px] transition-all ${
                    d.closed
                      ? "border-brand-red bg-red-100 text-brand-red"
                      : "border-slate-200 bg-slate-50 text-slate-500 hover:bg-red-100 hover:text-brand-red hover:border-brand-red"
                  }`}
                >
                  {"\u2715"}
                </div>
              </div>
            );
          })}
        </div>

        {/* Closures */}
        <div className="border-t border-slate-200 mt-3.5 pt-3.5">
          <div className={SECTION_LABEL_CLS}>Upcoming Closures</div>
          <div className="flex flex-wrap gap-1.5">
            {closures.map((c, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1.5 bg-brand-coral-light text-brand-coral px-3 py-[5px] rounded-xl text-xs font-semibold"
              >
                {c.date}{c.label ? ` \u2014 ${c.label}` : ""}
                <span
                  onClick={() => removeClosure(i)}
                  className="cursor-pointer opacity-60 hover:opacity-100 text-sm"
                >
                  {"\u00D7"}
                </span>
              </span>
            ))}
          </div>
          <div className="flex gap-1.5 mt-2.5 items-center flex-wrap">
            <input
              type="date"
              value={newClosureDate}
              onChange={(e) => setNewClosureDate(e.target.value)}
              className={`${INPUT_CLS} !w-40 !py-1.5 !px-2.5`}
            />
            <input
              type="text"
              value={newClosureLabel}
              onChange={(e) => setNewClosureLabel(e.target.value)}
              placeholder="Label (optional)"
              className={`${INPUT_CLS} !w-[180px] !py-1.5 !px-2.5`}
            />
            <button
              onClick={addClosure}
              className="border-[1.5px] border-dashed border-slate-200 rounded-[10px] bg-transparent px-3.5 py-1.5 text-xs font-bold text-slate-500 cursor-pointer font-inherit transition-all hover:border-brand-teal hover:text-brand-teal"
            >
              + Add
            </button>
          </div>
        </div>
        <div className="mt-3.5">
          <SaveButton onClick={handleSave} saving={saving} saved={saved} label="Save hours" />
        </div>
      </CardBody>
    </Card>
  );
}
```

---

### Task 8: AccountSettings

**File:** `src/components/views/settings/AccountSettings.jsx`

- [ ] **Step 1: Create AccountSettings.jsx**

Create `src/components/views/settings/AccountSettings.jsx` with:

```jsx
import { useState, useCallback } from "react";
import { supabase } from "../../../supabase/client.js";
import { Card, CardHead, CardBody, SaveButton, LABEL_CLS, INPUT_CLS } from "./shared.jsx";

export function AccountSettings({ user, staffProfile }) {
  const [account, setAccount] = useState({
    displayName: staffProfile?.display_name || "",
    phone: staffProfile?.phone || "",
    email: user?.email || "",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [emailPending, setEmailPending] = useState(false);
  const [pwSending, setPwSending] = useState(false);
  const [pwSent, setPwSent] = useState(false);

  const handleSave = useCallback(async () => {
    if (!supabase || !staffProfile?.id) return;
    setSaving(true);
    setError("");
    setSaved(false);
    setEmailPending(false);

    try {
      const { error: profileErr } = await supabase
        .from("staff_profiles")
        .update({ display_name: account.displayName, phone: account.phone })
        .eq("id", staffProfile.id);
      if (profileErr) throw profileErr;

      if (account.email.trim() && account.email.trim() !== user?.email) {
        const { error: emailErr } = await supabase.auth.updateUser({ email: account.email.trim() });
        if (emailErr) throw emailErr;
        setEmailPending(true);
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError(e.message || "Could not save changes.");
    } finally {
      setSaving(false);
    }
  }, [account, staffProfile, user]);

  const handlePasswordReset = async () => {
    if (!supabase || !user?.email) return;
    setPwSending(true);
    await supabase.auth.resetPasswordForEmail(user.email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setPwSending(false);
    setPwSent(true);
    setTimeout(() => setPwSent(false), 5000);
  };

  return (
    <Card id="settings-account">
      <CardHead variant="blue" title="Your Account" desc="Login credentials and contact details" />
      <CardBody>
        <div className="mb-3">
          <label className={LABEL_CLS}>Display Name</label>
          <input
            type="text"
            value={account.displayName}
            onChange={(e) => setAccount((a) => ({ ...a, displayName: e.target.value }))}
            placeholder="e.g. Sarah"
            className={INPUT_CLS}
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 mb-3">
          <div>
            <label className={LABEL_CLS}>Phone Number</label>
            <input
              type="tel"
              value={account.phone}
              onChange={(e) => setAccount((a) => ({ ...a, phone: e.target.value }))}
              placeholder="07700 900000"
              className={INPUT_CLS}
            />
          </div>
          <div>
            <label className={LABEL_CLS}>Email Address</label>
            <input
              type="email"
              value={account.email}
              onChange={(e) => setAccount((a) => ({ ...a, email: e.target.value }))}
              placeholder="you@smarterdog.co.uk"
              className={INPUT_CLS}
            />
            {emailPending && (
              <div className="text-xs text-brand-teal mt-1.5">
                Confirmation sent to {account.email} — click the link to confirm.
              </div>
            )}
          </div>
        </div>

        {error && (
          <div className="text-[13px] text-brand-coral font-semibold bg-brand-coral-light px-3 py-2 rounded-lg mb-3">
            {error}
          </div>
        )}

        <div className="mb-1">
          <SaveButton onClick={handleSave} saving={saving} saved={saved} />
        </div>

        {/* Password reset */}
        <div className="border-t border-slate-200 pt-3.5 mt-3.5">
          <div className="text-sm font-semibold text-slate-800 mb-1">Password</div>
          <div className="text-[13px] text-slate-500 mb-2.5">
            We'll email you a secure reset link.
          </div>
          <button
            onClick={handlePasswordReset}
            disabled={pwSending || pwSent}
            className={`px-[18px] py-[9px] rounded-[10px] border text-[13px] font-bold font-inherit transition-all ${
              pwSent
                ? "bg-[#E6F5F2] text-brand-teal border-brand-teal cursor-default"
                : pwSending
                  ? "bg-white text-slate-500 border-slate-200 cursor-default"
                  : "bg-white text-slate-800 border-slate-200 cursor-pointer hover:border-brand-teal hover:text-brand-teal"
            }`}
          >
            {pwSending ? "Sending\u2026" : pwSent ? "\u2713 Reset link sent" : "Send password reset link"}
          </button>
        </div>
      </CardBody>
    </Card>
  );
}
```

---

### Task 9: PricingSettings

**File:** `src/components/views/settings/PricingSettings.jsx`

- [ ] **Step 1: Create PricingSettings.jsx**

Create `src/components/views/settings/PricingSettings.jsx` with:

```jsx
import { useState } from "react";
import { SERVICES } from "../../../constants/index.js";
import { Card, CardHead, CardBody, SaveButton, SECTION_LABEL_CLS } from "./shared.jsx";

export function PricingSettings({ config, onUpdateConfig }) {
  const [newServiceName, setNewServiceName] = useState("");
  const [newServiceIcon, setNewServiceIcon] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const currentServices = config?.services || SERVICES;
  const currentPricing = config?.pricing || {};

  const updatePricing = (serviceId, size, value) => {
    onUpdateConfig((prev) => ({
      ...prev,
      pricing: {
        ...prev.pricing,
        [serviceId]: { ...(prev.pricing?.[serviceId] || {}), [size]: value },
      },
    }));
  };

  const deleteService = (serviceId) => {
    onUpdateConfig((prev) => {
      const updatedServices = (prev.services || SERVICES).filter((s) => s.id !== serviceId);
      const updatedPricing = { ...prev.pricing };
      delete updatedPricing[serviceId];
      return { ...prev, services: updatedServices, pricing: updatedPricing };
    });
  };

  const addService = () => {
    const name = newServiceName.trim();
    if (!name) return;
    const id = name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    onUpdateConfig((prev) => ({
      ...prev,
      services: [...(prev.services || SERVICES), { id, name, icon: newServiceIcon || "\u2702\uFE0F" }],
      pricing: { ...prev.pricing, [id]: { small: "", medium: "", large: "" } },
    }));
    setNewServiceName("");
    setNewServiceIcon("");
  };

  const handleSave = () => {
    setSaving(true);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const priceInputCls = "w-full py-2 px-2 pl-10 rounded-lg border-[1.5px] border-slate-200 text-[13px] font-inherit text-slate-800 outline-none transition-colors focus:border-brand-teal";

  return (
    <Card id="settings-pricing">
      <CardHead
        variant="yellow"
        title="Services & Pricing"
        desc='Base prices per size — shown as "from" on the booking portal'
      />
      <CardBody>
        {/* Header row */}
        <div className="grid grid-cols-[1fr_90px_90px_90px_32px] gap-2 pb-2 border-b-2 border-slate-200 mb-1">
          <span className={`${SECTION_LABEL_CLS} !mb-0`}>Service</span>
          <span className={`${SECTION_LABEL_CLS} !mb-0 text-center`}>
            <span className="inline-block w-2 h-2 rounded-full bg-size-small mr-0.5 align-middle" />
            Small
          </span>
          <span className={`${SECTION_LABEL_CLS} !mb-0 text-center`}>
            <span className="inline-block w-2 h-2 rounded-full bg-size-medium mr-0.5 align-middle" />
            Medium
          </span>
          <span className={`${SECTION_LABEL_CLS} !mb-0 text-center`}>
            <span className="inline-block w-2 h-2 rounded-full bg-size-large mr-0.5 align-middle" />
            Large
          </span>
          <span />
        </div>

        {/* Service rows */}
        {currentServices.map((s, idx) => (
          <div
            key={s.id}
            className={`grid grid-cols-[1fr_90px_90px_90px_32px] gap-2 items-center py-2.5 ${
              idx < currentServices.length - 1 ? "border-b border-slate-200" : ""
            }`}
          >
            <div className="text-sm font-semibold text-slate-800">
              {s.icon && <span className="mr-1.5">{s.icon}</span>}{s.name}
            </div>
            {["small", "medium", "large"].map((size) => {
              const val = currentPricing[s.id]?.[size] || "";
              return (
                <div key={size} className="relative">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-slate-500 font-semibold pointer-events-none">
                    from
                  </span>
                  <input
                    type="text"
                    value={val}
                    onChange={(e) => updatePricing(s.id, size, e.target.value)}
                    className={priceInputCls}
                  />
                </div>
              );
            })}
            <div
              onClick={() => deleteService(s.id)}
              title="Delete service"
              className="w-8 h-8 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-center cursor-pointer text-sm text-slate-500 transition-all hover:bg-red-100 hover:text-brand-red hover:border-brand-red"
            >
              {"\u2715"}
            </div>
          </div>
        ))}

        {/* Add service */}
        <div className="flex gap-2 mt-3 items-center">
          <input
            type="text"
            value={newServiceName}
            onChange={(e) => setNewServiceName(e.target.value)}
            placeholder="Service name"
            className="flex-1 py-2 px-3 rounded-[10px] border-[1.5px] border-slate-200 text-[13px] font-inherit outline-none text-slate-800 transition-colors focus:border-brand-teal"
          />
          <button
            onClick={addService}
            className="border-[1.5px] border-dashed border-slate-200 rounded-[10px] bg-transparent px-4 py-2 text-xs font-bold text-slate-500 cursor-pointer font-inherit transition-all whitespace-nowrap hover:border-brand-teal hover:text-brand-teal"
          >
            + Add service
          </button>
        </div>

        <div className="mt-3.5">
          <SaveButton onClick={handleSave} saving={saving} saved={saved} label="Save pricing" />
        </div>
      </CardBody>
    </Card>
  );
}
```

---

### Task 10: BookingRulesSettings

**File:** `src/components/views/settings/BookingRulesSettings.jsx`

- [ ] **Step 1: Create BookingRulesSettings.jsx**

Create `src/components/views/settings/BookingRulesSettings.jsx` with:

```jsx
import { Card, CardHead, CardBody, SettingRow, Toggle, InlineField } from "./shared.jsx";

export function BookingRulesSettings({ config, onUpdateConfig }) {
  const updatePickupOffset = (value) => {
    onUpdateConfig((prev) => ({ ...prev, defaultPickupOffset: Number(value) }));
  };

  const updateConfigField = (field, value) => {
    onUpdateConfig((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <Card id="settings-rules">
      <CardHead variant="teal" title="Booking Rules" desc="Control how and when customers can book" />
      <CardBody>
        <InlineField
          label="Advance booking window"
          sublabel="How far ahead customers can book"
          suffix="weeks"
          value={config?.advanceBookingWeeks ?? 8}
          onChange={(e) => updateConfigField("advanceBookingWeeks", Number(e.target.value))}
        />
        <InlineField
          label="Minimum cancellation notice"
          sublabel="Hours before appointment a customer can cancel"
          suffix="hours"
          value={config?.minCancellationHours ?? 24}
          onChange={(e) => updateConfigField("minCancellationHours", Number(e.target.value))}
        />
        <InlineField
          label="Default pick-up offset"
          sublabel="Estimated minutes after drop-off for collection"
          suffix="mins"
          value={config?.defaultPickupOffset ?? 120}
          onChange={(e) => updatePickupOffset(e.target.value)}
        />
        <SettingRow
          label="Auto-confirm bookings"
          sublabel="When off, new bookings need manual approval"
          control={
            <Toggle
              on={config?.autoConfirm !== false}
              onToggle={() => updateConfigField("autoConfirm", !(config?.autoConfirm !== false))}
            />
          }
          border={false}
        />
      </CardBody>
    </Card>
  );
}
```

---

### Task 11: CapacitySettings

**File:** `src/components/views/settings/CapacitySettings.jsx`

- [ ] **Step 1: Create CapacitySettings.jsx**

Create `src/components/views/settings/CapacitySettings.jsx` with:

```jsx
import { useState } from "react";
import { Card, CardHead, CardBody, SettingRow, Toggle, SECTION_LABEL_CLS } from "./shared.jsx";

export function CapacitySettings({ config, onUpdateConfig }) {
  const [newSlotTime, setNewSlotTime] = useState("");

  const toggleCapacity = () => {
    onUpdateConfig((prev) => ({ ...prev, enforceCapacity: !prev.enforceCapacity }));
  };

  const addLargeDogSlot = () => {
    if (!newSlotTime) return;
    if (config.largeDogSlots[newSlotTime]) return;
    onUpdateConfig((prev) => ({
      ...prev,
      largeDogSlots: {
        ...prev.largeDogSlots,
        [newSlotTime]: { seats: 2, canShare: false, needsApproval: false },
      },
    }));
    setNewSlotTime("");
  };

  const removeLargeDogSlot = (time) => {
    onUpdateConfig((prev) => {
      const updated = { ...prev.largeDogSlots };
      delete updated[time];
      return { ...prev, largeDogSlots: updated };
    });
  };

  return (
    <Card id="settings-capacity">
      <CardHead variant="coral" title="Capacity Engine" desc="The 2-2-1 rule controls how many dogs can be booked at once" />
      <CardBody>
        <SettingRow
          label="Enforce 2-2-1 strict capacity"
          sublabel="Prevents overbooking beyond safe limits"
          control={<Toggle on={config?.enforceCapacity} onToggle={toggleCapacity} />}
        />
        <div className="pt-2">
          <div className={SECTION_LABEL_CLS}>Large Dog Approved Slots</div>
          <div className="text-xs text-slate-500 mb-2.5">
            Times when large dogs are allowed. Click to remove.
          </div>
          <div className="flex flex-wrap gap-1.5 items-center">
            {Object.keys(config?.largeDogSlots || {}).sort().map((time) => (
              <span
                key={time}
                onClick={() => removeLargeDogSlot(time)}
                className="inline-flex items-center gap-1 bg-brand-coral-light text-brand-coral px-3 py-[5px] rounded-xl text-xs font-bold cursor-pointer transition-all hover:bg-brand-coral hover:text-white"
              >
                {time} {"\u00D7"}
              </span>
            ))}
            <span className="inline-flex items-center gap-1.5">
              <input
                type="time"
                value={newSlotTime}
                onChange={(e) => setNewSlotTime(e.target.value)}
                className="py-[5px] px-2 rounded-lg border-[1.5px] border-dashed border-slate-500 text-xs font-inherit text-slate-800 outline-none w-20"
              />
              <button
                onClick={addLargeDogSlot}
                className="bg-slate-50 border-[1.5px] border-dashed border-slate-500 text-slate-500 px-3 py-[5px] rounded-lg text-xs font-bold cursor-pointer font-inherit transition-all hover:bg-[#E6F5F2] hover:text-brand-teal"
              >
                + Add
              </button>
            </span>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
```

---

### Task 12: CustomerPortalSettings

**File:** `src/components/views/settings/CustomerPortalSettings.jsx`

- [ ] **Step 1: Create CustomerPortalSettings.jsx**

Create `src/components/views/settings/CustomerPortalSettings.jsx` with:

```jsx
import { Card, CardHead, CardBody, SettingRow, Toggle } from "./shared.jsx";

const DEFAULT_PORTAL = {
  showUpcoming: true,
  showHistory: true,
  allowRebooking: false,
  allowCancellations: true,
};

export function CustomerPortalSettings({ config, onUpdateConfig }) {
  const portal = config?.customerPortal || DEFAULT_PORTAL;

  const togglePortal = (key) => {
    onUpdateConfig((prev) => ({
      ...prev,
      customerPortal: { ...(prev.customerPortal || DEFAULT_PORTAL), [key]: !(prev.customerPortal || DEFAULT_PORTAL)[key] },
    }));
  };

  return (
    <Card id="settings-portal">
      <CardHead variant="teal" title="Customer Portal" desc="Control what customers can see and do" />
      <CardBody>
        <SettingRow
          label="Show upcoming bookings"
          sublabel="Customers can see their scheduled appointments"
          control={<Toggle on={portal.showUpcoming} onToggle={() => togglePortal("showUpcoming")} />}
        />
        <SettingRow
          label="Show past booking history"
          sublabel="Customers can view previous appointments"
          control={<Toggle on={portal.showHistory} onToggle={() => togglePortal("showHistory")} />}
        />
        <SettingRow
          label="Allow rebooking"
          sublabel="Customers can rebook a previous service directly"
          control={<Toggle on={portal.allowRebooking} onToggle={() => togglePortal("allowRebooking")} />}
        />
        <SettingRow
          label="Allow cancellations"
          sublabel="Customers can cancel within the notice window"
          control={<Toggle on={portal.allowCancellations} onToggle={() => togglePortal("allowCancellations")} />}
          border={false}
        />
      </CardBody>
    </Card>
  );
}
```

---

### Task 13: NotificationSettings

**File:** `src/components/views/settings/NotificationSettings.jsx`

- [ ] **Step 1: Create NotificationSettings.jsx**

Create `src/components/views/settings/NotificationSettings.jsx` with:

```jsx
import { Card, CardHead, CardBody, Toggle } from "./shared.jsx";

const DEFAULT_NOTIFICATIONS = {
  bookingConfirmation: { enabled: true, channels: ["whatsapp", "email"] },
  dayBeforeReminder: { enabled: true, channels: ["whatsapp"] },
  readyForCollection: { enabled: true, channels: ["whatsapp", "sms"] },
  followUp: { enabled: false, channels: ["email"] },
};

const ALL_CHANNELS = ["whatsapp", "email", "sms"];

const CHANNEL_STYLES = {
  whatsapp: { bg: "#DCFCE7", color: "#16A34A", label: "WhatsApp" },
  email: { bg: "#E0F7FC", color: "#0284C7", label: "Email" },
  sms: { bg: "#FFF8E0", color: "#92400E", label: "SMS" },
};

const NOTIF_ROWS = [
  { key: "bookingConfirmation", label: "Booking confirmation", sub: "Sent immediately when a booking is made" },
  { key: "dayBeforeReminder", label: "Day-before reminder", sub: "Sent the evening before the appointment" },
  { key: "readyForCollection", label: "Ready for collection", sub: "Notify owner when their dog is finished" },
  { key: "followUp", label: "Follow-up / review request", sub: "Sent 24 hours after the appointment" },
];

export function NotificationSettings({ config, onUpdateConfig }) {
  const notifs = config?.notifications || DEFAULT_NOTIFICATIONS;

  const toggleNotif = (key) => {
    const current = notifs[key];
    onUpdateConfig((prev) => ({
      ...prev,
      notifications: {
        ...(prev.notifications || DEFAULT_NOTIFICATIONS),
        [key]: { ...current, enabled: !current.enabled },
      },
    }));
  };

  const toggleNotifChannel = (notifKey, channel) => {
    const current = notifs[notifKey] || { enabled: false, channels: [] };
    const channels = current.channels || [];
    const updated = channels.includes(channel)
      ? channels.filter((c) => c !== channel)
      : [...channels, channel];
    onUpdateConfig((prev) => ({
      ...prev,
      notifications: {
        ...(prev.notifications || DEFAULT_NOTIFICATIONS),
        [notifKey]: { ...current, channels: updated },
      },
    }));
  };

  return (
    <Card id="settings-notifs">
      <CardHead variant="yellow" title="Notifications" desc="What gets sent to customers and via which channel" />
      <CardBody>
        {NOTIF_ROWS.map((row, idx) => {
          const n = notifs[row.key] || { enabled: false, channels: [] };
          const activeChannels = n.channels || [];
          return (
            <div
              key={row.key}
              className={`py-3.5 ${idx < NOTIF_ROWS.length - 1 ? "border-b border-slate-200" : ""}`}
            >
              <div className="flex justify-between items-center">
                <div>
                  <div className="text-sm font-semibold text-slate-800">{row.label}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{row.sub}</div>
                </div>
                <Toggle on={n.enabled} onToggle={() => toggleNotif(row.key)} />
              </div>
              {/* Channel badges */}
              <div className="flex gap-1.5 mt-2">
                {ALL_CHANNELS.map((ch) => {
                  const s = CHANNEL_STYLES[ch];
                  const isActive = activeChannels.includes(ch);
                  return (
                    <span
                      key={ch}
                      onClick={() => toggleNotifChannel(row.key, ch)}
                      className={`text-[10px] font-bold px-2.5 py-1 rounded-lg uppercase tracking-tight cursor-pointer transition-all select-none ${
                        n.enabled ? "opacity-100" : "opacity-40 pointer-events-none"
                      }`}
                      style={{
                        background: isActive ? s.bg : "#F1F3F5",
                        color: isActive ? s.color : "#9CA3AF",
                        border: isActive ? `1.5px solid ${s.color}` : "1.5px solid transparent",
                      }}
                    >
                      {s.label}
                    </span>
                  );
                })}
              </div>
            </div>
          );
        })}
      </CardBody>
    </Card>
  );
}
```

---

### Task 14: Final verification — build + commit all settings files

- [ ] **Step 1: Build check**

```bash
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.nvm/versions/node/*/bin:$PATH" && node node_modules/.bin/vite build
```

If the build fails, check for import path issues or missing exports.

- [ ] **Step 2: Commit the SettingsView split**

```bash
git add src/components/views/SettingsView.jsx src/components/views/settings/ && git commit -m "refactor: split SettingsView into 9 focused files and migrate to Tailwind CSS"
```

- [ ] **Step 3: Final full build verification**

```bash
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.nvm/versions/node/*/bin:$PATH" && node node_modules/.bin/vite build
```

Confirm no warnings or errors related to the migrated views.
