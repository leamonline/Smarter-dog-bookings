# Tailwind Migration — Phase 3A: Views

Migrate the 5 main view components from inline styles to Tailwind CSS. Split SettingsView (~890 lines) into a thin shell + 8 focused section components. No feature changes.

**Tech:** Tailwind CSS v4 (installed in Phase 1), React 19.

**Depends on:** Phases 1 and 2 complete (Tailwind installed, theme tokens defined, AppToolbar and all bookings page components migrated).

---

## Theme Token Reference

These tokens are defined in `src/index.css` under `@theme`:

| Token               | Hex       | Usage                             |
|----------------------|-----------|-----------------------------------|
| `brand-blue`         | `#0EA5E9` | Primary buttons, links, accents   |
| `brand-blue-dark`    | `#0284C7` | Hover states for blue elements    |
| `brand-coral`        | `#E8567F` | Alerts, coral accents             |
| `brand-coral-light`  | `#FDE2E8` | Alert backgrounds                 |
| `brand-teal`         | `#2D8B7A` | Teal accents, settings headings   |
| `brand-green`        | `#16A34A` | Success/open states               |
| `brand-red`          | `#DC2626` | Error/closed states               |
| `size-small`         | `#F5C518` | Small dog size dot                |
| `size-medium`        | `#2D8B7A` | Medium dog size dot               |
| `size-large`         | `#E8567F` | Large dog size dot                |

Standard Tailwind colours used: `slate-50`, `slate-200`, `slate-400`, `slate-500`, `slate-600`, `slate-700`, `slate-800`, `white`, `red-600`, `red-100`, `green-600`, `green-100`, `amber-800`, `amber-50`, `blue-50`.

---

## Shared Patterns

These patterns are established in Phases 1-2 and reused across all views:

**Responsive grid:** `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4`

**Search input:** `w-full py-2.5 pl-10 pr-3.5 rounded-[10px] border-[1.5px] border-slate-200 text-sm font-inherit outline-none text-slate-800 transition-colors focus:border-brand-blue`

**Primary button:** `bg-brand-blue text-white border-none rounded-[10px] px-4 py-2.5 text-[13px] font-bold cursor-pointer font-inherit whitespace-nowrap transition-all hover:bg-brand-blue-dark`

**Card:** `bg-white rounded-xl border border-slate-200 overflow-hidden shadow-[0_2px_8px_rgba(0,0,0,0.03)] cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-md`

**Section label:** `text-[11px] font-extrabold text-brand-teal uppercase tracking-wide`

**Fade-in animation:** Use Tailwind `animate-[fadeIn_0.2s_ease-in]` with a `@keyframes fadeIn` definition in `index.css` (add once).

---

## DogsView

**File:** `src/components/views/DogsView.jsx`

Current state: ~370 lines, all inline styles, uses `BRAND` throughout, `onMouseEnter`/`onMouseLeave` for hover effects.

### Changes

**Header bar:**
- Outer wrapper: `flex items-center justify-between mb-6 flex-wrap gap-4`
- Title: `text-2xl font-extrabold text-slate-800`
- Subtitle: `text-[13px] text-slate-500 mt-1`

**Search + Add Dog row:**
- Container: `flex gap-2.5 items-center w-full max-w-[460px]`
- Search input with icon: use shared search input pattern. Focus border: `focus:border-brand-blue`
- "Add Dog" button: use shared primary button pattern

**Card grid:**
- Container: `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4`
- Each card: use shared card pattern. Hover border colour depends on `sizeTheme` — keep as inline `style` for the dynamic border/shadow colours since they vary per dog size
- Card header: dynamic `style={{ background: sizeTheme.bg }}` stays inline. Layout: `p-3.5 px-4 border-b border-slate-200 flex justify-between items-start`
- Dog name: `text-base font-extrabold` with `style={{ color: sizeTheme.text }}`
- Breed + age: `text-[13px] font-semibold text-slate-800 mt-1`
- Alert badge: `bg-brand-coral-light text-brand-coral px-2.5 py-1 rounded-xl text-[11px] font-bold`
- Card body: `p-3.5 px-4`
- "Owner" label: section label pattern
- Owner pill: `bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-xl text-xs font-semibold text-slate-800`
- Groom notes section: `mt-2.5` with label and `text-xs text-slate-800 leading-relaxed`

**Empty state:**
- `col-span-full text-center py-16 px-5 text-slate-500`

**Footer (count + load more):**
- Container: `mt-5 flex items-center justify-between flex-wrap gap-2.5`
- Count text: `text-[13px] text-slate-500`
- "Load more" button: `border border-slate-200 rounded-[10px] px-4 py-2 text-[13px] font-semibold cursor-pointer font-inherit bg-white text-slate-800 transition-all hover:border-brand-blue hover:text-brand-blue`

**Remove:** BRAND import (fully replaced). Remove all `onMouseEnter`/`onMouseLeave` handlers where Tailwind `hover:` suffices. Keep `SIZE_THEME` and `SIZE_FALLBACK` imports — the dynamic size-based colours require inline `style`.

**Remove:** Inline `<style>` block with `@keyframes fadeIn` (moved to index.css).

---

## HumansView

**File:** `src/components/views/HumansView.jsx`

Current state: ~355 lines, same pattern as DogsView but teal-themed. Uses `BRAND` throughout.

### Changes

**Header bar:** same layout as DogsView.
- Title: "Humans Directory"
- Subtitle text about search fields

**Search + Add Human row:**
- Search focus border: `focus:border-brand-teal`
- "Add Human" button: `bg-brand-teal text-white ... hover:bg-[#236b5d]` (darker teal on hover)

**Card grid:** `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4`

**Human card:**
- Base card: same shared card pattern. Hover uses teal: `hover:border-brand-teal hover:shadow-[0_6px_16px_rgba(45,139,122,0.12)]`
- Card header: `bg-[#E6F5F2] p-3.5 px-4 border-b border-slate-200 flex justify-between items-start`
- Human name: `text-base font-extrabold text-[#1F6659]`
- Phone (WhatsApp link): `text-[13px] font-semibold text-slate-800 mt-1 block no-underline hover:text-brand-teal`
- "No phone" italic: `text-[13px] text-slate-500 font-semibold mt-1 italic`
- Card body "Dogs" label: `text-[11px] font-extrabold text-[#1E6B5C] uppercase tracking-wide mb-2`
- Dog pills: dynamic colours from `sizePill()` — keep inline `style` for `background`, `border`, `color` since they depend on each dog's size
- "None listed" text: `text-[13px] text-slate-500 italic`

**Empty state, footer, load more:** same pattern as DogsView but with teal hover colours.

**Remove:** BRAND import (except `SIZE_THEME` for the dynamic size pill colours). Remove `onMouseEnter`/`onMouseLeave`. Remove inline `<style>` block.

---

## StatsView

**File:** `src/components/views/StatsView.jsx`

Current state: ~307 lines, well-structured with two main cards (Revenue and Operations). Uses `BRAND` for colours.

### Changes

**Layout:** `flex flex-col gap-4`

**Revenue card:**
- Card: `bg-white border border-slate-200 rounded-[14px] p-5 px-6 shadow-[0_2px_12px_rgba(0,0,0,0.04)]`
- Section title: `text-[13px] font-extrabold text-slate-500 uppercase tracking-widest mb-4`
- Hero total: `text-[32px] font-black text-slate-800` + `text-sm font-semibold text-slate-500`
- Bar chart container: `flex gap-2 items-end h-[120px] mb-4`
- Each bar column: `flex-1 text-center flex flex-col items-center justify-end h-full`
- Bar div: `w-full max-w-[40px] rounded-t-md min-h-[4px] transition-[height] duration-300` with dynamic `style={{ height, background }}` — bar colour is conditional (today=teal, other=blue) so stays inline
- Day label: `text-[11px] font-bold text-slate-800 mt-1.5`
- Revenue label: `text-[11px] font-semibold text-slate-500`
- Comparison row: `flex gap-6`
- Label: `text-xs font-semibold text-slate-500`
- Value: `text-sm font-extrabold text-slate-800`

**Operations card:**
- Same card styling as revenue
- Busiest day: `text-sm font-bold text-slate-800` + subtitle `text-xs font-semibold text-slate-500`
- Services section label: `text-xs font-bold text-slate-500 mb-2`
- Service row: `flex items-center gap-2.5 mb-1.5`
- Service name: `text-[13px] font-semibold text-slate-800 w-[110px] shrink-0`
- Progress bar track: `flex-1 h-2 bg-slate-100 rounded overflow-hidden`
- Progress bar fill: `h-full bg-brand-blue rounded` with dynamic `style={{ width: pct% }}`
- Count: `text-xs font-extrabold text-slate-800 w-[30px] text-right`
- Top customers: numbered list with `flex justify-between py-1`
- Daily averages row: `flex gap-6`

**Remove:** BRAND import fully. The only dynamic colours are the bar chart (today vs. other day) which can use `bg-brand-teal` and `bg-brand-blue` classes conditionally via template literals or ternary in className.

**Remove:** Inline `cardStyle` and `sectionTitle` objects.

---

## ReportsView

**File:** `src/components/views/ReportsView.jsx`

Current state: ~147 lines. A 2-column grid with 4 overview cards (Revenue, Bookings, Services, Busiest Days). Uses `BRAND`.

### Changes

**Header:**
- Container: `flex justify-between items-center mb-6`
- Title: `text-[22px] font-extrabold text-slate-800`
- Time range select: `px-3 py-2 rounded-lg border border-slate-200 text-[13px] bg-white`

**Grid:** `grid grid-cols-1 md:grid-cols-2 gap-4` (responsive: stack on mobile, 2-col on tablet+)

**Overview cards** (all 4 follow the same pattern):
- Card: `bg-white p-6 rounded-2xl border border-slate-200 shadow-[0_4px_12px_rgba(0,0,0,0.03)]`
- Label: `text-xs font-extrabold text-[#1E6B5C] uppercase tracking-wide`
- Big number: `text-4xl font-extrabold mt-1` with colour varying per card (`text-brand-blue` for revenue, `text-brand-teal` for bookings)
- Subtitle: `text-[13px] text-slate-500 mt-1`

**Services/Days breakdown cards:**
- Same card shell
- Row: `flex justify-between items-center`
- Name: `text-sm font-semibold text-slate-800`
- Count: `text-sm font-extrabold text-[#1E6B5C]`
- "No data" text: `text-[13px] text-slate-500`

**Remove:** BRAND and PRICING imports (PRICING is still needed for `getEstimatedPrice` — keep that import). Remove BRAND completely; all its usages map to Tailwind classes or to `#1E6B5C` which is close enough to `brand-teal` or can be used as an arbitrary value `text-[#1E6B5C]`.

---

## SettingsView Split

**Current file:** `src/components/views/SettingsView.jsx` (~892 lines)

This monolith is split into 9 files:

```
src/components/views/SettingsView.jsx          (thin shell — ~80 lines)
src/components/views/settings/shared.jsx       (shared sub-components — ~120 lines)
src/components/views/settings/BusinessSettings.jsx
src/components/views/settings/HoursSettings.jsx
src/components/views/settings/AccountSettings.jsx
src/components/views/settings/PricingSettings.jsx
src/components/views/settings/BookingRulesSettings.jsx
src/components/views/settings/CapacitySettings.jsx
src/components/views/settings/CustomerPortalSettings.jsx
src/components/views/settings/NotificationSettings.jsx
```

### SettingsView.jsx (Shell)

The shell provides:
1. Page title + subtitle
2. Jump bar (now a tab bar) with 8 section buttons
3. Renders each section component in sequence, passing appropriate props

The jump bar scrolls to anchored sections (same `scrollIntoView` behaviour), now styled with Tailwind:
- Bar container: `flex gap-1 flex-wrap bg-slate-100 p-1 rounded-[10px] mb-5`
- Each button: `rounded-[7px] px-3 py-[7px] text-xs font-semibold cursor-pointer font-inherit transition-all border-none bg-transparent text-slate-500 hover:text-slate-800 hover:bg-white/60`

Props passed through: `config`, `onUpdateConfig`, `user`, `staffProfile`.

### settings/shared.jsx

Extract the shared sub-components that multiple settings sections use:

**Card:** `bg-white border border-slate-200 rounded-xl mb-4 shadow-[0_2px_8px_rgba(0,0,0,0.03)] overflow-hidden`

**CardHead:** variants map to Tailwind classes:
- `teal`: `bg-[#E6F5F2]` header, `text-[#1E6B5C]` title
- `blue`: `bg-blue-50` header, `text-brand-blue-dark` title
- `yellow`: `bg-amber-50` header, `text-amber-800` title
- `coral`: `bg-brand-coral-light` header, `text-brand-coral` title
- Layout: `p-3.5 px-4 border-b border-slate-200 flex justify-between items-center`
- Title: `text-base font-extrabold`
- Desc: `text-[13px] font-semibold text-slate-800 mt-0.5`

**CardBody:** `p-4`

**SettingRow:**
- Container: `flex justify-between items-center py-3.5` with conditional `border-b border-slate-200`
- Label: `text-sm font-semibold text-slate-800`
- Sublabel: `text-xs text-slate-500 mt-0.5`

**Toggle:**
- Track: `w-11 h-6 rounded-xl relative cursor-pointer transition-colors duration-200` with `bg-brand-green` when on, `bg-slate-200` when off
- Thumb: `w-5 h-5 bg-white rounded-full absolute top-0.5 transition-[left] duration-200` with `left-[22px]` when on, `left-0.5` when off

**InlineField:**
- Same layout as SettingRow but with a number input on the right
- Input: `py-2 px-3 rounded-lg border-[1.5px] border-slate-200 text-[13px] font-inherit text-slate-800 text-right outline-none w-20 transition-colors focus:border-brand-teal`
- Suffix: `text-[13px] text-slate-500`

**SaveButton:**
- `px-4 py-2.5 rounded-[10px] border-none text-[13px] font-bold cursor-pointer font-inherit transition-colors duration-200`
- Normal: `bg-brand-teal text-white hover:bg-[#1E6B5C]`
- Saving: `bg-slate-200 text-slate-500 cursor-not-allowed`
- Saved: `bg-brand-teal text-white`

**Label styles (as className strings):**
- Field label: `text-[11px] font-extrabold text-[#1E6B5C] uppercase tracking-wide block mb-1.5`
- Section label: `text-[11px] font-extrabold text-[#1E6B5C] uppercase tracking-wide mb-2`

**Input className:** `w-full py-2.5 px-3.5 rounded-[10px] border-[1.5px] border-slate-200 text-[13px] font-inherit outline-none text-slate-800 transition-colors focus:border-brand-teal`

Remove all `onFocus`/`onBlur` handlers for border colour — replaced by Tailwind `focus:` pseudo-class.

### BusinessSettings.jsx

Receives: `config`, `onUpdateConfig`

Local state: `business`, `bizSaving`, `bizSaved` + `handleBizSave` handler.

Form fields:
- Salon Name (full width input)
- Phone + Email (2-col grid: `grid grid-cols-1 md:grid-cols-2 gap-2.5 mb-3`)
- Address (full width input)
- SaveButton

### HoursSettings.jsx

Receives: `config`, `onUpdateConfig`

Local state: `hours`, `closures`, `hoursSaving`, `hoursSaved`, `newClosureDate`, `newClosureLabel` + handlers.

Constants: `DAYS`, `DEFAULT_HOURS` (moved into this file or shared).

Content:
- Weekly hours grid: `grid grid-cols-[80px_1fr_1fr_32px] gap-2 items-center py-1` per day
- Day name: `text-[13px] font-bold` with conditional `text-brand-red` when closed
- Closed banner: `col-span-2 text-center text-[11px] font-bold text-brand-red bg-red-100 py-2 rounded-lg`
- Time inputs: shared input pattern with `text-center`
- Close toggle button: `w-8 h-8 rounded-lg border cursor-pointer flex items-center justify-center text-[13px] transition-all` with conditional styling
- Closures section with pills: `inline-flex items-center gap-1.5 bg-brand-coral-light text-brand-coral px-3 py-[5px] rounded-xl text-xs font-semibold`
- Remove closure button: `cursor-pointer opacity-60 hover:opacity-100 text-sm`
- Add closure row: date input + label input + dashed "+ Add" button

### AccountSettings.jsx

Receives: `user`, `staffProfile`

Local state: `account`, `accountSaving`, `accountSaved`, `accountError`, `emailPending`, `pwSending`, `pwSent` + handlers. Imports `supabase` client directly.

Content:
- Display Name input
- Phone + Email (2-col grid)
- Email pending confirmation message: `text-xs text-brand-teal mt-1.5`
- Error banner: `text-[13px] text-brand-coral font-semibold bg-brand-coral-light px-3 py-2 rounded-lg mb-3`
- SaveButton
- Divider: `border-t border-slate-200 pt-3.5 mt-3.5`
- Password reset section with outline button: `px-[18px] py-[9px] rounded-[10px] border border-slate-200 bg-white text-slate-800 text-[13px] font-bold cursor-pointer font-inherit transition-all hover:border-brand-teal hover:text-brand-teal`

### PricingSettings.jsx

Receives: `config`, `onUpdateConfig`

Local state: `newServiceName`, `newServiceIcon`, `pricingSaving`, `pricingSaved` + handlers. Imports `SERVICES` from constants.

Content:
- Header row (5-col grid): `grid grid-cols-[1fr_90px_90px_90px_32px] gap-2`
- Size dot indicators: `inline-block w-2 h-2 rounded-full bg-size-small` (etc.)
- Service rows: same 5-col grid, each with name + 3 price inputs + delete button
- Price input with "from" prefix: `relative` wrapper, absolute-positioned "from" label
- Delete button: `w-8 h-8 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-center cursor-pointer text-sm text-slate-500 transition-all hover:bg-red-100 hover:text-brand-red hover:border-brand-red`
- Add service row: input + dashed button
- SaveButton

### BookingRulesSettings.jsx

Receives: `config`, `onUpdateConfig`

No local state needed — all values come from config and updates go through `onUpdateConfig`.

Content:
- 3 InlineField rows (advance booking window, min cancellation notice, default pick-up offset)
- 1 SettingRow with Toggle (auto-confirm bookings)

### CapacitySettings.jsx

Receives: `config`, `onUpdateConfig`

Local state: `newSlotTime`.

Content:
- Toggle row for enforce 2-2-1 capacity
- "Large Dog Approved Slots" section
- Slot time pills: `inline-flex items-center gap-1 bg-brand-coral-light text-brand-coral px-3 py-[5px] rounded-xl text-xs font-bold cursor-pointer transition-all hover:bg-brand-coral hover:text-white`
- Add slot: time input + dashed button

### CustomerPortalSettings.jsx

Receives: `config`, `onUpdateConfig`

Constants: `DEFAULT_PORTAL` (moved here or shared).

Content:
- 4 SettingRow + Toggle combinations:
  - Show upcoming bookings
  - Show past booking history
  - Allow rebooking
  - Allow cancellations

### NotificationSettings.jsx

Receives: `config`, `onUpdateConfig`

Constants: `DEFAULT_NOTIFICATIONS`, `ALL_CHANNELS`, `CHANNEL_STYLES`, `NOTIF_ROWS` (moved here).

Content:
- 4 notification rows, each with:
  - Label + sublabel + Toggle
  - Channel badges row: `flex gap-1.5 mt-2`
  - Each channel badge: `text-[10px] font-bold px-2.5 py-1 rounded-lg uppercase tracking-tight cursor-pointer transition-all select-none`
  - Active badge: dynamic `style` for bg/colour/border based on channel type (WhatsApp=green, Email=blue, SMS=amber) — these vary per channel so inline style is appropriate
  - Inactive badge: `bg-slate-100 text-slate-400 border-[1.5px] border-transparent`
  - Disabled state: `opacity-40 pointer-events-none`

---

## index.css Addition

Add the `fadeIn` keyframe animation to `src/index.css` so all views can use it:

```css
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(5px); }
  to { opacity: 1; transform: translateY(0); }
}
```

This replaces the inline `<style>` blocks in DogsView, HumansView, and SettingsView.

---

## Migration Checklist

For every component:
- [ ] Replace all inline `style={{}}` with Tailwind classes
- [ ] Replace `onMouseEnter`/`onMouseLeave` with Tailwind `hover:`
- [ ] Replace `onFocus`/`onBlur` with Tailwind `focus:`
- [ ] Remove BRAND import where all usages are converted
- [ ] Keep inline `style` only for genuinely dynamic values (per-item colours, computed percentages)
- [ ] Use responsive prefixes: unprefixed = mobile-first, `sm:` (640px), `md:` (768px), `lg:` (1024px)
- [ ] Use brand theme tokens (`brand-blue`, `brand-teal`, etc.) not raw hex where tokens exist
- [ ] Remove inline `<style>` blocks (keyframes moved to index.css)
- [ ] Test build passes after each component
