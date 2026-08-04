# Tailwind Migration — Phase 3B: Modals & Remaining Components

Migrate all remaining inline-styled components to Tailwind CSS. This covers modals, form components, UI utilities, auth pages, and customer-facing pages. No feature changes.

**Tech:** Tailwind CSS v4 (installed in Phase 1), React 19.

**Depends on:** Phases 1, 2, and 3A complete (Tailwind installed, theme tokens defined, AppToolbar, all bookings page components, all views, and SettingsView split all migrated).

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

## Remaining Files to Migrate

### Files that still import BRAND or use inline `style={}`:

**Modals (13 files):**
1. `src/components/modals/BookingDetailModal.jsx` — main booking detail overlay (~960 lines)
2. `src/components/modals/booking-detail/shared.jsx` — modalInputStyle, DetailRow, LogisticsLabel, FinanceLabel
3. `src/components/modals/booking-detail/BookingHeader.jsx` — gradient header with size theme
4. `src/components/modals/booking-detail/BookingStatusBar.jsx` — status buttons + confirmed toggle
5. `src/components/modals/booking-detail/BookingActions.jsx` — edit/save/message/cancel actions
6. `src/components/modals/booking-detail/BookingAlerts.jsx` — alert toggles and allergy input
7. `src/components/modals/booking-detail/ExitConfirmDialog.jsx` — discard changes confirmation
8. `src/components/modals/DogCardModal.jsx` — dog profile card (~850 lines)
9. `src/components/modals/NewBookingModal.jsx` — multi-step booking wizard (~850 lines)
10. `src/components/modals/ChainBookingModal.jsx` — recurring bookings builder
11. `src/components/modals/AddDogModal.jsx` — add new dog form
12. `src/components/modals/AddHumanModal.jsx` — add new human form
13. `src/components/modals/HumanCardModal.jsx` — human profile card (~850 lines)
14. `src/components/modals/ContactPopup.jsx` — small contact info popup
15. `src/components/modals/DatePickerModal.jsx` — calendar date picker

**Booking components (2 files):**
16. `src/components/booking/AddBookingForm.jsx` — inline booking form in slot grid
17. `src/components/booking/BookingCard.jsx` — booking row in slot grid

**Layout (2 files):**
18. `src/components/layout/ClosedDayView.jsx` — closed day placeholder
19. `src/components/layout/WeekCalendarView.jsx` — MonthGrid sub-component only (header/buttons already migrated)

**Booking panel (1 file):**
20. `src/components/booking/WaitlistPanel.jsx` — waitlist panel below slot grid

**UI components (7 files):**
21. `src/components/ui/SizeTag.jsx` — coloured size dot
22. `src/components/ui/LoadingSpinner.jsx` — loading animation
23. `src/components/ui/ErrorBanner.jsx` — error message banner
24. `src/components/ui/Legend.jsx` — icon legend popover
25. `src/components/ui/StaffIconBtn.jsx` — small icon button
26. `src/components/ui/AvailableSeat.jsx` — available seat row
27. `src/components/ui/BlockedSeat.jsx` — blocked seat row
28. `src/components/ui/CapacityBar.jsx` — capacity indicator

**Auth pages (3 files):**
29. `src/components/auth/CustomerLoginPage.jsx` — customer OTP login
30. `src/components/auth/LoginPage.jsx` — staff email/password login
31. `src/components/auth/ResetPasswordPage.jsx` — password reset form

**Customer portal (1 file):**
32. `src/components/customer/CustomerDashboard.jsx` — customer dashboard

**Icons (1 file):**
33. `src/components/icons/index.jsx` — SVG icon components (use BRAND for default colours)

**Shared styles (1 file):**
34. `src/constants/styles.js` — inputStyle, labelStyle, closeBtnStyle, onInputFocus, onInputBlur

**Customer booking wizard (7 TSX files — Phase 3B scope note):**
35-41. `src/components/customer/booking/*.tsx` — these files use BRAND imports and inline styles but are TypeScript/React files for the customer booking flow. They should be migrated to Tailwind in this phase.

---

## Shared Modal Patterns

All modals follow a consistent structure. These Tailwind classes replace the repeated inline style objects.

### Overlay
```
fixed inset-0 bg-black/35 flex items-center justify-center z-[1000]
```
Higher z-index overlays (ExitConfirmDialog, ContactPopup, DatePicker):
```
fixed inset-0 bg-black/50 flex items-center justify-center z-[1100]
```

### Modal Box
Standard modal (420px):
```
bg-white rounded-2xl w-[min(420px,95vw)] max-h-[90vh] overflow-auto shadow-[0_8px_32px_rgba(0,0,0,0.18)]
```
Wider modal (460px, for NewBookingModal/ChainBookingModal):
```
bg-white rounded-2xl w-[min(460px,95vw)] max-h-[92vh] overflow-auto shadow-[0_12px_48px_rgba(0,0,0,0.2)]
```
Smaller modal (320px, for DatePicker/ContactPopup):
```
bg-white rounded-2xl w-[min(320px,95vw)] overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.18)]
```

### Gradient Header
Each modal has a gradient header. Since the gradient colours are dynamic (from `SIZE_THEME`), keep gradient as inline `style`. Layout classes:
```
px-6 py-5 rounded-t-2xl flex justify-between items-start
```
For inline gradient: `style={{ background: \`linear-gradient(135deg, ${theme.gradient[0]}, ${theme.gradient[1]})\` }}`

### Close Button
```
bg-white/20 border-none rounded-lg w-7 h-7 flex items-center justify-center cursor-pointer text-sm font-bold shrink-0
```
Dynamic text colour stays inline: `style={{ color: theme.headerText }}`

### Form Input (shared)
Replace `modalInputStyle` / `inputStyle` object:
```
w-full px-3 py-2 rounded-lg border border-slate-200 text-[13px] outline-none font-inherit text-slate-800 box-border
```
Focus state: `focus:border-brand-blue` (or `focus:border-brand-teal` in human-themed modals)

### Form Label
Replace `labelStyle` object:
```
text-[11px] font-extrabold text-brand-teal uppercase tracking-wide block mb-1
```

### Detail Row (shared.jsx pattern)
```
py-2.5 border-b border-slate-200
```
Inner flex: `flex justify-between items-center`
Label: `text-[13px] text-slate-500 shrink-0 pr-3`
Value: `text-[13px] font-semibold text-slate-800 text-right break-words`

### Section Label
Teal labels (logistics): `text-[12px] font-extrabold text-brand-teal uppercase tracking-wide`
Green labels (finance): `text-[12px] font-extrabold text-brand-green uppercase tracking-wide`
Coral labels (alerts): `text-[12px] font-extrabold text-brand-coral uppercase tracking-wide`

### Error Message
```
mt-3 px-3 py-2.5 bg-brand-coral-light text-brand-coral rounded-lg text-[13px] font-bold
```

### Primary Action Button
Dynamic colours (from sizeTheme) stay inline. Layout:
```
flex-1 py-3 rounded-[10px] border-none text-[13px] font-bold cursor-pointer font-inherit flex items-center justify-center gap-1.5 transition-colors
```

### Cancel/Secondary Button
```
flex-1 py-3 rounded-[10px] border-[1.5px] border-slate-200 text-[13px] font-bold cursor-pointer font-inherit flex items-center justify-center gap-1.5 bg-white text-slate-500 transition-colors hover:bg-slate-50
```

---

## Component-by-Component Migration Notes

### 1. booking-detail/shared.jsx

**What it does:** Exports `modalInputStyle` (object), `LogisticsLabel`, `FinanceLabel`, `DetailRow`.

**Changes:**
- Remove `modalInputStyle` object entirely. Replace all usages in BookingDetailModal with Tailwind class strings on the elements.
- `LogisticsLabel`: Replace inline style with `text-[12px] font-extrabold text-brand-teal uppercase tracking-wide`
- `FinanceLabel`: Replace inline style with `text-[12px] font-extrabold text-brand-green uppercase tracking-wide`
- `DetailRow`: Replace inline styles with Tailwind classes. The `verticalEdit` and `isEditing` conditionals become class toggling.
- **BRAND import:** Can be fully removed.

### 2. booking-detail/BookingHeader.jsx

**What it does:** Gradient header showing dog name, breed, service, age. Edit mode shows service dropdown.

**Changes:**
- Outer div: gradient stays inline (dynamic). Layout: `px-6 py-5 rounded-t-2xl flex justify-between items-start`
- Dog name: `text-xl font-extrabold` with inline `color`
- Breed/service sub-text: `text-[13px] mt-0.5` with inline `color`
- Edit-mode service select: `bg-white/20 border border-white/30 rounded-md px-2.5 py-1.5 text-[13px] font-semibold outline-none cursor-pointer font-inherit`
- Close button: shared close button pattern
- **BRAND import:** Can be mostly removed. Only `BRAND.text` used in `<option>` style attribute (keep for dropdown option colour).

### 3. booking-detail/BookingStatusBar.jsx

**What it does:** Row of status buttons (Not Arrived, Checked In, etc.) + client confirmed toggle.

**Changes:**
- Status buttons: Layout stays flex with gap. Dynamic colours (from `BOOKING_STATUSES` config) must stay inline since they come from runtime data. Convert layout/spacing to Tailwind: `px-3 py-1.5 rounded-lg text-xs font-bold transition-all`
- Confirmed toggle button: Dynamic colours (green/red based on `booking.confirmed`) stay inline. Layout: `rounded-lg px-3 py-1 text-xs font-bold cursor-pointer font-inherit transition-all`
- **BRAND import:** Can be mostly removed. Keep for dynamic colour references in confirmed toggle.

### 4. booking-detail/BookingActions.jsx

**What it does:** Edit mode shows Save/Cancel. View mode shows Edit/Message/Cancel/Rebook buttons.

**Changes:**
- Action bar container: `px-6 py-4 pb-5 flex gap-2.5 bg-slate-50 border-t border-slate-200`
- Buttons: Use shared primary/secondary button patterns. Dynamic colours (sizeTheme) stay inline.
- Remove all `onMouseEnter`/`onMouseLeave` handlers. Replace with `hover:` Tailwind utilities where colours are static. For dynamic hover colours (sizeTheme), keep inline but simplify.
- **BRAND import:** Can be fully removed.

### 5. booking-detail/BookingAlerts.jsx

**What it does:** Alert toggle chips (Bites, Nervous, etc.) and allergy input.

**Changes:**
- Alert chips: Dynamic colours from `ALERT_OPTIONS` config stay inline. Layout: `px-3.5 py-2 rounded-full text-[13px] font-bold cursor-pointer transition-all`
- Allergy button: `px-4 py-2.5 rounded-full text-sm font-extrabold cursor-pointer transition-all flex items-center justify-center text-center`
- View-mode alert badges: `bg-brand-coral text-white px-4 py-2.5 rounded-full text-sm font-extrabold flex items-center justify-center gap-1.5 shadow-[0_4px_12px_rgba(232,86,127,0.25)] text-center`
- **BRAND import:** Mostly removed. Keep for dynamic alert option colours.

### 6. booking-detail/ExitConfirmDialog.jsx

**What it does:** "Discard changes?" confirmation dialog.

**Changes:**
- Overlay: `fixed inset-0 bg-black/50 flex items-center justify-center z-[1100]`
- Dialog box: `bg-white rounded-2xl p-6 w-[min(300px,90vw)] shadow-[0_8px_32px_rgba(0,0,0,0.2)]`
- Title: `text-base font-bold text-slate-800 mb-2`
- Message: `text-[13px] text-slate-500 mb-5`
- Discard button: `flex-1 py-2.5 rounded-[10px] border-none bg-brand-coral text-white text-[13px] font-bold cursor-pointer font-inherit`
- Keep editing button: `flex-1 py-2.5 rounded-[10px] border-[1.5px] border-slate-200 bg-white text-slate-800 text-[13px] font-bold cursor-pointer font-inherit`
- **BRAND import:** Can be fully removed.

### 7. BookingDetailModal.jsx

**What it does:** Main booking detail modal (overlay + modal box + all sub-components).

**Changes:**
- Overlay: shared overlay pattern
- Modal box: `bg-white rounded-2xl w-[min(420px,95vw)] max-h-[90vh] overflow-auto shadow-[0_8px_32px_rgba(0,0,0,0.18)]`
- Body padding: `px-6 pt-4`
- Dog/Breed/Human rows: `py-2.5 border-b border-slate-200` with flex layout
- Row label: `text-[12px] font-extrabold text-brand-teal uppercase tracking-wide`
- Clickable value: `text-[13px] font-semibold cursor-pointer` with dynamic colour inline + `border-b border-dashed`
- Slot grid: `grid grid-cols-[repeat(auto-fill,minmax(70px,1fr))] gap-1.5 w-full`
- Slot buttons: dynamic colours stay inline. Layout: `py-2 rounded-lg text-[13px] font-semibold text-center`
- Add-ons checkboxes: `flex items-center gap-1.5 text-[13px] cursor-pointer font-medium`
- Amount due: `font-extrabold text-base` with dynamic colour
- Save error: shared error message pattern
- History flag: `text-[13px] text-brand-coral font-bold bg-brand-coral-light px-3 py-2 rounded-lg inline-block float-right mt-3`
- **BRAND import:** Can be mostly removed. Keep for dynamic sizeTheme colours that come from runtime data.

### 8. DogCardModal.jsx

**What it does:** Full dog profile card with edit mode, grooming history, trusted humans, alerts.

**Changes:**
- Overlay + modal box: shared patterns (width 360px)
- Gradient header: inline gradient. Layout classes for name, breed, DOB inputs.
- Body sections: detail rows with section labels using `text-[12px] font-extrabold uppercase tracking-wide` with dynamic colour
- Owner search dropdown: `absolute top-full left-0 right-0 mt-1 border border-slate-200 rounded-lg overflow-hidden bg-white z-10 shadow-[0_4px_12px_rgba(0,0,0,0.1)]`
- Trusted human section: same patterns as HumanCardModal
- Chain booking button
- **BRAND import:** Mostly removed. Keep for dynamic sizeTheme colours.

### 9. NewBookingModal.jsx

**What it does:** Multi-step booking wizard: search dog, pick date (AvailabilityCalendar), pick slot (TimeSlotPicker), confirm.

**Changes:**
- Overlay + modal box: shared patterns (width 440px, max-height 92vh)
- Gradient header: dynamic. Layout: `px-6 py-[18px] rounded-t-[20px] flex justify-between items-center shrink-0`
- Search section: `px-6 pt-5 overflow-visible shrink-0 relative z-10`
- Dog card (selected): `rounded-xl p-2.5 px-3.5 border-[1.5px]` with dynamic colours inline
- AvailabilityCalendar: month nav, day headers, day grid cells all move to Tailwind. Dynamic colours (status-based) stay inline.
- TimeSlotPicker: slot buttons use `py-2.5 rounded-[10px] border-2 text-sm font-bold cursor-pointer font-inherit transition-all text-center` with dynamic colours inline
- Scrollable body: `px-6 py-4 pb-5 flex flex-col gap-4 overflow-y-auto flex-1`
- **BRAND import:** Mostly removed. Dynamic SIZE_THEME colours stay inline.

### 10. ChainBookingModal.jsx

**What it does:** Build recurring booking chains. Template row, weeks input, chain list.

**Changes:**
- Overlay + modal box: shared patterns (460px)
- Title: `text-lg font-extrabold text-slate-800 mb-1`
- Subtitle: `text-[13px] text-slate-500 mb-5`
- Select inputs: `px-2.5 py-2 rounded-lg border-[1.5px] border-slate-200 text-[13px] font-semibold font-inherit bg-white text-slate-800 cursor-pointer`
- Weeks input: same select style but `w-[60px] text-center`
- Warning box: `px-3 py-2 rounded-lg mb-2 bg-amber-50 text-amber-800 text-xs font-bold flex items-center gap-1.5`
- Chain items: `flex items-center gap-2 px-2.5 py-2 rounded-lg mb-1 bg-slate-50 border border-slate-200`
- Remove button: `w-6 h-6 rounded-md border-none bg-brand-coral-light text-brand-coral text-sm font-bold cursor-pointer flex items-center justify-center font-inherit`
- **BRAND import:** Can be mostly removed.

### 11. AddDogModal.jsx

**What it does:** Add new dog form with breed auto-detection, DOB, size, owner search.

**Changes:**
- Overlay + modal box: shared patterns (400px)
- Gradient header: dynamic from sizeTheme
- Form: `px-6 py-5 flex flex-col gap-3`
- Grid inputs: `grid grid-cols-2 gap-2.5`
- All `inputStyle` objects: replace with shared form input Tailwind classes
- All `labelStyle` objects: replace with shared form label Tailwind classes
- All `onFocus`/`onBlur` handlers: replace with `focus:border-brand-teal` or dynamic focus via sizeTheme accent
- Owner search dropdown: absolute positioned with shadow
- "Add new owner" inline form: `p-3 bg-slate-50 rounded-lg border border-slate-200`
- Submit/Cancel buttons: shared patterns
- **BRAND import:** Mostly removed.

### 12. AddHumanModal.jsx

**What it does:** Add new human form with name, phone, email, address, SMS/WhatsApp toggles.

**Changes:**
- Overlay + modal box: shared patterns (400px)
- Gradient header: teal gradient (`bg-gradient-to-br from-brand-teal to-[#236b5d]`)
- Form: `px-6 py-5 flex flex-col gap-3`
- All inputs: shared form input classes with `focus:border-brand-teal`
- Checkbox labels: `flex items-center gap-1.5 text-[13px] cursor-pointer font-medium`
- Checkboxes: `accent-brand-teal w-[18px] h-[18px] cursor-pointer`
- **BRAND import:** Can be fully removed.

### 13. HumanCardModal.jsx

**What it does:** Human profile card with dogs, trusted humans, booking history, editable trusted contacts.

**Changes:**
- Overlay + modal box: shared patterns (380px)
- Gradient header: teal gradient
- Detail rows: `flex justify-between py-2 border-b border-slate-200`
- Contact rows (SMS/WhatsApp active/off): dynamic colour stays inline
- Dog pills: `inline-flex items-center gap-1 px-3 py-1.5 rounded-full cursor-pointer text-xs font-bold transition-opacity hover:opacity-80` with dynamic bg/text colours inline
- Trusted humans list: clickable names in teal
- Search input for trusted: shared pattern with teal focus
- "Create new human" button: `w-full mt-2.5 py-2.5 rounded-[10px] border-[1.5px] border-dashed border-brand-teal bg-[#E6F5F2] text-brand-teal text-[13px] font-bold cursor-pointer font-inherit transition-all hover:bg-brand-teal hover:text-white`
- New trusted form: `mt-2.5 p-3.5 bg-slate-50 rounded-[10px] border border-slate-200`
- **BRAND import:** Mostly removed.

### 14. ContactPopup.jsx

**What it does:** Small popup showing phone, SMS, WhatsApp, email for a human.

**Changes:**
- Overlay: higher z-index (1100). `fixed inset-0 bg-black/25 flex items-center justify-center z-[1100]`
- Popup box: `bg-white rounded-[14px] w-[min(280px,90vw)] overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.18)]`
- Header: teal gradient
- Contact rows: `flex justify-between items-center py-2 border-b border-slate-200`
- **BRAND import:** Can be fully removed.

### 15. DatePickerModal.jsx

**What it does:** Calendar date picker modal for selecting booking dates.

**Changes:**
- Overlay: z-index 1200 (sits above other modals). `fixed inset-0 bg-black/35 flex items-center justify-center z-[1200]`
- Picker box: `bg-white rounded-2xl w-[min(320px,95vw)] overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.18)]`
- Header: `bg-gradient-to-br from-brand-blue to-brand-blue-dark px-4 py-3.5 flex items-center justify-between`
- Nav buttons: `bg-white/20 border-none rounded-md w-8 h-8 cursor-pointer flex items-center justify-center`
- Day headers grid: `grid grid-cols-7 px-3 pt-2.5 pb-1`
- Day cells grid: `grid grid-cols-7 px-3 pb-3.5 gap-0.5`
- Day buttons: `w-full aspect-square border-none rounded-lg text-sm font-inherit transition-all` with dynamic colours for selected/today/disabled
- "Today" button: `bg-transparent border-[1.5px] border-brand-blue rounded-lg px-5 py-2 text-[13px] font-semibold text-brand-blue cursor-pointer font-inherit`
- Remove `onMouseEnter`/`onMouseLeave` — replace with `hover:bg-slate-50` for non-selected days
- **BRAND import:** Can be fully removed.

### 16. AddBookingForm.jsx

**What it does:** Inline form within the slot grid for quick-adding a booking.

**Changes:**
- Form container: `flex flex-col gap-1.5 mt-1.5`
- Selected dog chip: `flex items-center gap-1.5 bg-blue-50 rounded-lg px-2.5 py-1.5`
- Dog name: `text-[13px] font-bold text-brand-blue-dark`
- Search input: shared pattern with `focus:border-brand-blue`
- Dropdown: `absolute top-full left-0 right-0 mt-0.5 z-20 bg-white border border-slate-200 rounded-lg shadow-[0_4px_12px_rgba(0,0,0,0.1)] max-h-[200px] overflow-auto`
- Size/Service grid: `grid grid-cols-2 gap-1.5`
- Confirm button: `flex-1 py-[7px] rounded-lg border-none bg-brand-blue text-white font-semibold text-[13px] cursor-pointer font-inherit hover:bg-brand-blue-dark disabled:bg-slate-200 disabled:text-slate-500 disabled:cursor-not-allowed`
- **BRAND import:** Can be fully removed.

### 17. BookingCard.jsx

**What it does:** Booking row in slot grid. Shows dog name, breed, owner, service, status, action buttons.

**Changes:**
- Card row: `flex items-center gap-2 bg-white border border-slate-200 rounded-[10px] px-2.5 py-1.5 text-[13px] cursor-pointer min-h-[42px] box-border transition-all` with dynamic `borderLeft` colour inline
- Dog name: `font-semibold text-slate-800 whitespace-nowrap overflow-hidden text-ellipsis`
- Clickable dog link: `cursor-pointer border-b border-dashed` with dynamic colour
- Service line: `text-[11px] text-slate-500`
- Status advance button: dynamic colours inline. Layout: `rounded-md px-2 py-[3px] text-[10px] font-bold cursor-pointer font-inherit whitespace-nowrap transition-all`
- "Done" badge: `text-[10px] font-bold px-2 py-[3px] rounded-md` with dynamic colours
- Remove `onMouseEnter`/`onMouseLeave` — use `hover:border-[sizeTheme] hover:shadow-sm` (keep dynamic values inline)
- **BRAND import:** Can be mostly removed.

### 18. ClosedDayView.jsx

**What it does:** Placeholder shown when a day is closed. Paw icon, message, "Open this day" button.

**Changes:**
- Container: `py-12 px-4 text-center bg-slate-50 rounded-b-[14px] border border-slate-200 border-t-0`
- Paw emoji: `text-[40px] mb-3`
- Title: `text-base font-semibold text-slate-800 mb-1`
- Subtitle: `text-[13px] text-slate-500 leading-relaxed mb-4`
- Button: `bg-brand-blue text-white border-none rounded-[10px] px-6 py-2.5 text-[13px] font-semibold cursor-pointer font-inherit transition-all hover:bg-brand-blue-dark`
- **BRAND import:** Can be fully removed.

### 19. WeekCalendarView.jsx — MonthGrid sub-component

**What it does:** Full calendar month grid inside WeekCalendarView. Shows booking counts per day, navigation arrows, view-mode buttons.

**Changes (MonthGrid only):**
- Month header banner: `flex items-center mb-3 p-3.5 px-4 bg-gradient-to-br from-brand-blue to-brand-blue-dark rounded-[14px]`
- Nav arrows: `w-7 h-10 flex items-center justify-center bg-white border-none rounded-lg cursor-pointer shrink-0 shadow-[0_2px_8px_rgba(0,0,0,0.15)]`
- Month/Year box: `bg-white rounded-[10px] px-12 py-2 flex flex-col items-center justify-center min-h-[58px] min-w-[200px]`
- Month label: `text-[26px] font-extrabold text-slate-800 leading-none`
- Year label: `text-sm font-bold text-slate-500 mt-0.5`
- View toggle buttons: dynamic colours stay inline. Layout: `px-2 py-1 rounded-md border-none text-[10px] font-bold cursor-pointer font-inherit transition-all whitespace-nowrap`
- Day headers: `grid grid-cols-7 gap-1 mb-1`
- Day cells: `grid grid-cols-7 gap-1`
- Individual day buttons: dynamic background/border colours stay inline. Layout: `min-h-[56px] rounded-[10px] border flex flex-col items-center justify-center cursor-pointer font-inherit transition-all`
- **BRAND import:** Mostly removed. Keep for dynamic cell colours.

### 20. WaitlistPanel.jsx

**What it does:** Waitlist section below the slot grid showing customers waiting for slots.

**Changes:**
- Container: `border-t border-slate-200 bg-[#FFFBF2] p-4 flex flex-col gap-3`
- Header: `flex justify-between items-center`
- Title: `text-[13px] font-extrabold text-slate-800 uppercase tracking-wide`
- "Add Person" button: `px-2 py-1 rounded-md border-[1.5px] border-slate-200 bg-white text-slate-500 text-[11px] font-bold cursor-pointer transition-all hover:text-brand-blue hover:border-brand-blue`
- Add form: `flex gap-2 bg-white p-2 rounded-lg border border-slate-200`
- Waitlist entries: `flex items-center justify-between bg-white px-3 py-2 rounded-lg border border-slate-200`
- Remove button: `bg-transparent border-none text-brand-coral text-xs font-bold cursor-pointer px-2 py-1`
- **BRAND import:** Can be fully removed.

### 21. UI Components (SizeTag, LoadingSpinner, ErrorBanner, Legend, StaffIconBtn, AvailableSeat, BlockedSeat, CapacityBar)

**SizeTag.jsx:**
- Replace inline style with Tailwind: `inline-flex items-center justify-center rounded-full shrink-0`
- Dynamic size (width/height) and colour stay inline since they depend on runtime props.
- **BRAND import:** Not used. `SIZE_THEME` import stays (needed for gradient colour).

**LoadingSpinner.jsx:**
- Container: `flex flex-col items-center justify-center min-h-[300px] gap-4`
- Spinner div: `w-10 h-10 border-4 border-slate-200 border-t-brand-blue rounded-full animate-spin`
- Text: `text-sm text-slate-500 font-semibold`
- Remove inline `<style>` tag — use Tailwind's built-in `animate-spin`.
- **BRAND import:** Can be fully removed.

**ErrorBanner.jsx:**
- Container: `bg-red-100 border border-red-600 rounded-[10px] px-5 py-4 my-5 flex items-center gap-2.5`
- Title: `text-sm font-bold text-red-600`
- Message: `text-[13px] text-slate-800 mt-1`
- **BRAND import:** Can be fully removed.

**Legend.jsx:**
- Toggle button: `w-8 h-8 rounded-full border-none text-base font-extrabold cursor-pointer flex items-center justify-center transition-all shrink-0 shadow-[0_1px_4px_rgba(0,0,0,0.1)]` with dynamic bg/colour
- Dropdown: `absolute top-[38px] left-0 z-50 flex flex-wrap p-2.5 px-4 bg-white rounded-[10px] text-xs text-slate-500 items-center justify-between gap-2.5 shadow-[0_4px_16px_rgba(0,0,0,0.12)] min-w-[340px] border border-slate-200`
- **BRAND import:** Can be fully removed.

**StaffIconBtn.jsx:**
- Button: `bg-transparent border-none w-[26px] h-[26px] flex items-center justify-center cursor-pointer p-0 transition-all rounded hover:opacity-60 hover:scale-110`
- Remove `onMouseEnter`/`onMouseLeave`.
- **No BRAND import** currently. No changes needed beyond removing inline styles.

**AvailableSeat.jsx:**
- Row: `flex items-center justify-between rounded-[10px] px-2.5 py-1.5 min-h-[42px] box-border bg-blue-50 border-[1.5px] border-[#8AD8EE]`
- Text: `text-xs font-semibold text-brand-blue-dark`
- **BRAND import:** Can be fully removed.

**BlockedSeat.jsx:**
- Row: `flex items-center justify-between rounded-[10px] px-2.5 py-1.5 min-h-[42px] box-border bg-slate-50 border-[1.5px] border-slate-200`
- Text: `text-xs font-semibold text-brand-coral`
- **BRAND import:** Can be fully removed.

**CapacityBar.jsx:**
- Container: `flex gap-[3px] items-center`
- Each bar segment: `w-3.5 h-5 rounded-[3px] transition-all duration-200` with dynamic colours inline
- Constraint label: `text-[10px] text-brand-coral font-semibold ml-0.5`
- **BRAND import:** Mostly removed. Dynamic segment colours may still need inline.

### 22. Auth Pages (CustomerLoginPage, LoginPage, ResetPasswordPage)

**CustomerLoginPage.jsx:**
- Full-page wrapper: `min-h-screen bg-[#F8FFFE] flex items-center justify-center p-5 font-sans`
- Card: `bg-white rounded-2xl p-7 border border-slate-200 shadow-[0_4px_20px_rgba(0,0,0,0.06)]`
- Brand header: `text-[32px] font-extrabold text-slate-800` with teal span
- All inputs: shared form input pattern with `focus:border-brand-teal`
- Submit button: `w-full py-3.5 rounded-[10px] border-none bg-brand-teal text-white text-[15px] font-bold cursor-pointer font-inherit transition-all mt-2 disabled:bg-slate-200 disabled:text-slate-500 disabled:cursor-not-allowed`
- Demo mode button: `w-full mt-4 py-3 rounded-[10px] border-[1.5px] border-dashed border-slate-500 bg-transparent text-[13px] font-semibold text-slate-500 cursor-pointer font-inherit transition-all hover:border-brand-teal hover:text-brand-teal`
- **BRAND import:** Can be fully removed.

**LoginPage.jsx and ResetPasswordPage.jsx:** Same patterns as CustomerLoginPage — full-page auth forms with card layout, form inputs, and buttons. Apply consistent Tailwind classes.

### 23. CustomerDashboard.jsx

**What it does:** Customer-facing dashboard with personal details, dogs, trusted humans, booking history.

**Changes:**
- Full-page wrapper: `min-h-screen bg-[#F8FFFE] font-sans`
- Header bar: `bg-gradient-to-br from-brand-teal to-[#236b5d] px-5 py-5 pb-7 relative`
- Inner max-width: `max-w-[600px] mx-auto`
- Card: `bg-white rounded-[14px] px-6 py-5 border border-slate-200 mb-4 shadow-[0_2px_8px_rgba(0,0,0,0.04)]`
- Section title: `font-extrabold text-xs text-brand-teal uppercase tracking-wide mb-2.5`
- Detail rows: `flex justify-between items-center py-2.5 border-b border-slate-200`
- Toggle switch: custom CSS with `relative` positioning, keep inline for knob positioning
- Booking cards: status badge with dynamic colours inline
- Cancel button: `mt-2 w-full py-2 rounded-lg border border-brand-coral bg-transparent text-[13px] font-semibold text-brand-coral cursor-pointer font-inherit`
- "Book a Groom" CTA: `w-full py-4 rounded-xl border-none bg-brand-teal text-white text-base font-bold cursor-pointer font-inherit mb-5`
- **BRAND import:** Can be mostly removed.

### 24. Icons (index.jsx)

**What it does:** SVG icon components with default colours from BRAND.

**Changes:**
- Default colour parameters currently reference `BRAND.blue`, `BRAND.coral`, etc.
- Replace defaults with hex values: `colour = "#0EA5E9"` instead of `colour = BRAND.blue`
- This removes the last BRAND dependency from this file.
- **BRAND import:** Can be fully removed.

### 25. constants/styles.js

**What it does:** Shared `inputStyle`, `labelStyle`, `closeBtnStyle`, `onInputFocus`, `onInputBlur` objects.

**Changes:**
- After all components are migrated to Tailwind, this file becomes unused.
- Remove all exports. Delete the file.
- Remove the re-export from `src/constants/index.js`.
- **BRAND import:** File deleted entirely.

---

## Responsive Considerations

- All modals use `w-[min(Xpx,95vw)]` to cap width at 95% of viewport on mobile
- `max-h-[85vh]` or `max-h-[90vh]` with `overflow-auto` ensures modals scroll on small screens
- Form grids (`grid grid-cols-2`) work well down to 320px viewports — the 95vw constraint handles the rest
- No explicit mobile breakpoints needed for modals — the `min()` width pattern handles it

## Approach for Dynamic Colours

Many components use `SIZE_THEME` or `BOOKING_STATUSES` to apply runtime-determined colours. These CANNOT be converted to Tailwind classes because Tailwind only works with classes known at build time.

**Strategy:**
- Layout, spacing, typography, borders, radius, shadows => Tailwind classes
- Dynamic colours (gradients, backgrounds, text colours from sizeTheme/statusObj) => keep as inline `style`
- Replace `onMouseEnter`/`onMouseLeave` with Tailwind `hover:` where possible (static colours only)
- For dynamic hover effects that cannot be expressed in Tailwind, accept keeping the `onMouseEnter`/`onMouseLeave` pattern but minimise it

## Customer Booking Wizard Files (TSX)

The 7 files in `src/components/customer/booking/` are TypeScript React components that also use BRAND imports and inline styles. They follow the same patterns as the JSX modals and should be migrated using identical Tailwind classes. Their migration follows the exact same approach — replace inline styles with Tailwind utilities, keep dynamic runtime colours as inline `style`.
