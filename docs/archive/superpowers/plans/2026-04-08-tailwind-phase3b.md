# Tailwind Phase 3B: Modals & Remaining Components — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate all remaining inline-styled components to Tailwind CSS. Remove BRAND imports where possible. Delete `src/constants/styles.js` when no longer referenced.

**Architecture:** Each component is rewritten to use Tailwind utility classes for layout, spacing, typography, borders, radius, and shadows. Dynamic runtime colours (from `SIZE_THEME`, `BOOKING_STATUSES`, `ALERT_OPTIONS`) remain as inline `style` attributes since Tailwind cannot handle build-time-unknown values.

**Tech Stack:** Tailwind CSS v4, React 19, Vite.

**Spec:** `docs/superpowers/specs/2026-04-08-tailwind-phase3b-modals.md`

**Build command:**
```bash
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.nvm/versions/node/*/bin:$PATH" && node node_modules/.bin/vite build
```

---

## Class Mapping Reference

These mappings apply across ALL files in this plan. Use them consistently.

### Modal Overlay
**Old:** `style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}`
**New:** `className="fixed inset-0 bg-black/35 flex items-center justify-center z-[1000]"`

### Modal Box (420px)
**Old:** `style={{ background: BRAND.white, borderRadius: 16, width: 420, maxHeight: "90vh", overflow: "auto", boxShadow: "0 8px 32px rgba(0,0,0,0.18)" }}`
**New:** `className="bg-white rounded-2xl w-[min(420px,95vw)] max-h-[90vh] overflow-auto shadow-[0_8px_32px_rgba(0,0,0,0.18)]"`

### Close Button (in gradient headers)
**Old:** `style={{ background: "rgba(255,255,255,0.2)", border: "none", borderRadius: 8, width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 14, fontWeight: 700, flexShrink: 0 }}`
**New:** `className="bg-white/20 border-none rounded-lg w-7 h-7 flex items-center justify-center cursor-pointer text-sm font-bold shrink-0"`
Keep dynamic `style={{ color: theme.headerText }}` inline.

### Form Input
**Old:** `style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: "1.5px solid #E5E7EB", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box", outline: "none", color: "#1F2937", transition: "border-color 0.15s" }}`
**New:** `className="w-full px-3.5 py-2.5 rounded-lg border-[1.5px] border-slate-200 text-[13px] font-inherit box-border outline-none text-slate-800 transition-colors focus:border-brand-blue"`
Remove `onFocus`/`onBlur` handlers — the `focus:border-brand-blue` (or `focus:border-brand-teal`) class handles it.

### Form Label
**Old:** `style={{ fontSize: 11, fontWeight: 800, color: "#1E6B5C", textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 4 }}`
**New:** `className="text-[11px] font-extrabold text-brand-teal uppercase tracking-wide block mb-1"`

### Modal Input (smaller, used in booking-detail)
**Old:** `modalInputStyle` object from shared.jsx
**New:** `className="w-full px-3 py-2 rounded-lg border border-slate-200 text-[13px] outline-none font-inherit text-slate-800 box-border"`

### Error Message
**Old:** `style={{ fontSize: 13, color: BRAND.coral, fontWeight: 600, background: BRAND.coralLight, padding: "8px 12px", borderRadius: 8 }}`
**New:** `className="text-[13px] text-brand-coral font-semibold bg-brand-coral-light px-3 py-2 rounded-lg"`

### Section Row with Border
**Old:** `style={{ padding: "10px 0", borderBottom: "1px solid #E5E7EB" }}`
**New:** `className="py-2.5 border-b border-slate-200"`

### onMouseEnter/onMouseLeave Removal
For static colours: replace with `hover:` Tailwind class.
For dynamic colours (from sizeTheme/statusObj at runtime): keep `onMouseEnter`/`onMouseLeave` but simplify — only set the minimum changed property.

---

## Task 1: Modal Shared Patterns + ExitConfirmDialog

**Files:**
- `src/components/modals/booking-detail/shared.jsx`
- `src/components/modals/booking-detail/ExitConfirmDialog.jsx`

- [ ] **Step 1: Rewrite shared.jsx**

Remove the `BRAND` import and `modalInputStyle` export. Convert `LogisticsLabel`, `FinanceLabel`, and `DetailRow` to use Tailwind classes.

Replace the entire contents of `src/components/modals/booking-detail/shared.jsx` with:

```jsx
/**
 * Shared layout helpers for BookingDetailModal and sub-components.
 * All styling uses Tailwind — no BRAND import needed.
 */

/** Tailwind class string equivalent of the old modalInputStyle object */
export const MODAL_INPUT_CLS =
  "w-full px-3 py-2 rounded-lg border border-slate-200 text-[13px] outline-none font-inherit text-slate-800 box-border";

export function LogisticsLabel({ text }) {
  return (
    <span className="text-[12px] font-extrabold text-brand-teal uppercase tracking-wide">
      {text}
    </span>
  );
}

export function FinanceLabel({ text }) {
  return (
    <span className="text-[12px] font-extrabold text-brand-green uppercase tracking-wide">
      {text}
    </span>
  );
}

export function DetailRow({
  label,
  value,
  editNode = null,
  verticalEdit = false,
  isEditing,
}) {
  return (
    <div className="py-2.5 border-b border-slate-200">
      <div
        className={`flex justify-between ${
          isEditing && editNode && !verticalEdit ? "items-center" : "items-start"
        }`}
      >
        <span
          className={`text-[13px] text-slate-500 shrink-0 pr-3 ${
            isEditing && editNode && !verticalEdit ? "" : "pt-0.5"
          }`}
        >
          {label}
        </span>
        {isEditing && editNode && !verticalEdit ? (
          <div className="flex-1 flex justify-end max-w-[65%]">
            {editNode}
          </div>
        ) : (
          <span className="text-[13px] font-semibold text-slate-800 text-right break-words">
            {value}
          </span>
        )}
      </div>
      {isEditing && editNode && verticalEdit && (
        <div className="mt-2">{editNode}</div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Rewrite ExitConfirmDialog.jsx**

Replace the entire contents of `src/components/modals/booking-detail/ExitConfirmDialog.jsx` with:

```jsx
export function ExitConfirmDialog({ onDiscard, onKeepEditing }) {
  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1100]"
    >
      <div className="bg-white rounded-2xl p-6 w-[min(300px,90vw)] shadow-[0_8px_32px_rgba(0,0,0,0.2)]">
        <div className="text-base font-bold text-slate-800 mb-2">
          Discard changes?
        </div>
        <div className="text-[13px] text-slate-500 mb-5">
          You have unsaved changes. Are you sure you want to close?
        </div>
        <div className="flex gap-2.5">
          <button
            onClick={onDiscard}
            className="flex-1 py-2.5 rounded-[10px] border-none bg-brand-coral text-white text-[13px] font-bold cursor-pointer font-inherit"
          >
            Discard
          </button>
          <button
            onClick={onKeepEditing}
            className="flex-1 py-2.5 rounded-[10px] border-[1.5px] border-slate-200 bg-white text-slate-800 text-[13px] font-bold cursor-pointer font-inherit"
          >
            Keep editing
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Build check**
- [ ] **Step 4: Commit** `git commit -m "refactor: migrate booking-detail shared.jsx and ExitConfirmDialog to Tailwind"`

---

## Task 2: BookingDetailModal + Booking-Detail Sub-Components

**Files:**
- `src/components/modals/booking-detail/BookingHeader.jsx`
- `src/components/modals/booking-detail/BookingStatusBar.jsx`
- `src/components/modals/booking-detail/BookingActions.jsx`
- `src/components/modals/booking-detail/BookingAlerts.jsx`
- `src/components/modals/BookingDetailModal.jsx`

**Approach for each file:**
1. Remove `BRAND` import where fully replaceable
2. Replace all `style={}` attributes with `className=""` using the class mapping reference above
3. Keep inline `style` only for dynamic runtime colours from `SIZE_THEME`, `SIZE_FALLBACK`, `BOOKING_STATUSES`, or `ALERT_OPTIONS`
4. Remove `onMouseEnter`/`onMouseLeave` where replaceable with Tailwind `hover:`
5. Replace all references to `modalInputStyle` with the `MODAL_INPUT_CLS` string or inline Tailwind classes
6. Replace `{ ...modalInputStyle, ... }` spread patterns with `className={MODAL_INPUT_CLS}` plus additional inline `style` for dynamic overrides

- [ ] **Step 1: Rewrite BookingHeader.jsx**

Key changes:
- Outer div: `className="px-6 py-5 rounded-t-2xl flex justify-between items-start"` with inline `style={{ background: gradient }}`
- Inner layout: `className="flex items-center gap-3 flex-1 min-w-0"`
- Dog name: `className="text-xl font-extrabold whitespace-nowrap overflow-hidden text-ellipsis"` with inline `style={{ color: sizeTheme.headerText }}`
- Age span: `className="font-medium text-sm opacity-80 ml-1.5"`
- Breed/service sub-text: `className="text-[13px] mt-0.5"` with inline `style={{ color: sizeTheme.headerTextSub }}`
- Edit-mode select: `className="bg-white/20 border border-white/30 rounded-md px-2.5 py-1.5 text-[13px] font-semibold outline-none cursor-pointer font-inherit"` with inline `style={{ color: sizeTheme.headerText }}`
- Option elements: `style={{ color: "#1F2937" }}` (static hex, no BRAND needed)
- Close button: use shared close button class pattern
- Remove `BRAND` import. Remove `SERVICES` import IF not needed (it IS needed for service lookup). Keep `SIZE_THEME`, `SIZE_FALLBACK` imports.

- [ ] **Step 2: Rewrite BookingStatusBar.jsx**

Key changes:
- `BookingStatusBar`: Status button layout: `className="px-3 py-1.5 rounded-lg text-xs font-bold font-inherit transition-all"` with dynamic inline `style` for background/color/border from `BOOKING_STATUSES` data.
- `ClientConfirmedToggle`: Row: `className="py-2.5 border-b border-slate-200 flex justify-between items-center"`. Label: `className="text-[12px] font-extrabold text-brand-teal uppercase tracking-wide"`. Button: `className="rounded-lg px-3 py-1 text-xs font-bold cursor-pointer font-inherit transition-all"` with dynamic inline style for confirmed/unconfirmed colours.
- Remove `BRAND` import. Keep `BOOKING_STATUSES` import.

- [ ] **Step 3: Rewrite BookingActions.jsx**

Key changes:
- Edit mode container: `className="px-6 py-4 pb-5 flex gap-2.5 bg-slate-50 border-t border-slate-200"`
- Save button: `className="flex-1 py-3 rounded-[10px] border-none text-[13px] font-bold cursor-pointer font-inherit flex items-center justify-center gap-1.5 transition-colors disabled:cursor-not-allowed"` with dynamic inline `style` for background/colour from sizeTheme
- Cancel button: `className="flex-1 py-3 rounded-[10px] border-[1.5px] border-slate-200 text-[13px] font-bold cursor-pointer font-inherit flex items-center justify-center gap-1.5 bg-white text-slate-500 transition-colors hover:bg-slate-50"`
- View mode container: `className="px-6 py-4 pb-5 flex flex-col gap-2.5 bg-slate-50 border-t border-slate-200"`
- Edit/Message/Cancel buttons row: `className="flex gap-2.5"`
- Each button: shared primary button class with dynamic colours inline. Keep `onMouseEnter`/`onMouseLeave` for dynamic sizeTheme hover colours only — convert static colour hovers to Tailwind.
- Rebook button: `className="w-full py-3 rounded-[10px] border-2 text-[13px] font-bold cursor-pointer font-inherit flex items-center justify-center gap-1.5 transition-all"` with dynamic inline style
- Remove `BRAND` import entirely.

- [ ] **Step 4: Rewrite BookingAlerts.jsx**

Key changes:
- Edit-mode section: `className="mt-5 mb-4"`
- Alerts heading: `className="font-extrabold text-xs text-brand-coral uppercase tracking-wide mb-3 text-center"`
- Alert button chips: `className="px-3.5 py-2 rounded-full text-[13px] font-bold cursor-pointer transition-all"` with dynamic inline style from `ALERT_OPTIONS`
- Allergy button: `className="px-4 py-2.5 rounded-full text-sm font-extrabold cursor-pointer transition-all flex items-center justify-center text-center"` with dynamic inline style
- Allergy input: `className="w-full px-2.5 py-2.5 rounded-lg border-2 border-brand-coral text-[13px] outline-none font-inherit text-slate-800 box-border text-center"`
- View-mode alert badges: `className="px-4 py-2.5 rounded-full text-sm font-extrabold flex items-center justify-center gap-1.5 shadow-[0_4px_12px_rgba(232,86,127,0.25)] text-center bg-brand-coral text-white"`
- Remove `BRAND` import. Keep `ALERT_OPTIONS` import. Replace `modalInputStyle` usage with inline Tailwind classes.

- [ ] **Step 5: Rewrite BookingDetailModal.jsx**

This is the largest file (~960 lines). Key changes:
- Overlay: `className="fixed inset-0 bg-black/35 flex items-center justify-center z-[1000]"`
- Modal box: `className="bg-white rounded-2xl w-[min(420px,95vw)] max-h-[90vh] overflow-auto shadow-[0_8px_32px_rgba(0,0,0,0.18)]"`
- Body: `className="px-6 pt-4"`
- Dog/Breed/Human rows: `className="py-2.5 border-b border-slate-200"` with inner flex
- Row labels: `className="text-[12px] font-extrabold text-brand-teal uppercase tracking-wide"`
- Clickable values: `className="text-[13px] font-semibold cursor-pointer"` with dynamic `style={{ color: sizeTheme.primary, borderBottom: "1px dashed ..." }}`
- Grooming notes textarea: `className="w-full px-3 py-2 rounded-lg border border-slate-200 text-[13px] outline-none font-inherit text-slate-800 box-border resize-y min-h-[44px] text-right"`
- Date picker button: `className="w-full px-3 py-2 rounded-lg border border-slate-200 text-[13px] outline-none font-inherit text-slate-800 box-border bg-white cursor-pointer flex justify-between items-center"`
- Slot grid: `className="grid grid-cols-[repeat(auto-fill,minmax(70px,1fr))] gap-1.5 w-full"`
- Slot buttons: `className="py-2 rounded-lg text-[13px] font-semibold text-center"` with dynamic inline style
- Add-ons section: checkboxes: `className="flex items-center gap-1.5 text-[13px] cursor-pointer font-medium"`
- Base price input: `className="w-20 px-3 py-2 rounded-lg border border-slate-200 text-[13px] outline-none font-inherit text-slate-800 box-border"`
- Amount due: `className="font-extrabold text-base"` with dynamic colour
- Save error: `className="mt-3 px-3 py-2.5 bg-brand-coral-light text-brand-coral rounded-lg text-[13px] font-bold"`
- History flag: `className="text-[13px] text-brand-coral font-bold bg-brand-coral-light px-3 py-2 rounded-lg inline-block float-right mt-3"`
- Spacer div `<div style={{ height: 24 }} />` becomes `<div className="h-6" />`
- Remove all references to `modalInputStyle` — use `MODAL_INPUT_CLS` constant from shared.jsx or inline classes
- Remove `BRAND` import. Keep `SIZE_THEME`, `SIZE_FALLBACK`, `SERVICES`, `SALON_SLOTS` imports.

- [ ] **Step 6: Build check**
- [ ] **Step 7: Commit** `git commit -m "refactor: migrate BookingDetailModal and booking-detail sub-components to Tailwind"`

---

## Task 3: DogCardModal

**File:** `src/components/modals/DogCardModal.jsx` (~1320 lines)

- [ ] **Step 1: Rewrite DogCardModal.jsx**

Key changes:
- Overlay: `className="fixed inset-0 bg-black/35 flex items-center justify-center z-[1000]"`
- Modal box: `className="bg-white rounded-2xl w-[min(360px,95vw)] max-h-[85vh] overflow-auto shadow-[0_8px_32px_rgba(0,0,0,0.18)]"`
- Gradient header: `className="px-6 py-5 rounded-t-2xl flex justify-between items-start"` with inline `style={{ background: gradient }}`
- Edit-mode name input: `className="text-xl font-extrabold bg-white/15 border border-white/30 rounded-lg px-2.5 py-1 w-full box-border outline-none font-inherit"` with inline colour
- Edit-mode breed input: `className="text-[13px] bg-white/15 border border-white/30 rounded-md px-2 py-[3px] flex-1 outline-none font-inherit"` with inline colour
- DOB selects: `className="text-xs bg-white/15 border border-white/30 rounded-md px-1 py-[3px] outline-none font-inherit cursor-pointer"` with inline colour
- View-mode dog name: `className="text-xl font-extrabold"` with inline colour
- View-mode breed: `className="text-[13px] mt-1"` with inline colour
- Close button: shared close button class pattern
- Body: `className="px-6 pt-4"`
- `sectionLabel` object replaced with `className="font-extrabold text-xs uppercase tracking-wide"` with dynamic `style={{ color: sizeAccent }}`
- `detailRow` helper: row `className="py-2 border-b border-slate-200"`, label uses sectionLabel class, value `className="text-[13px] font-semibold text-slate-800 mt-1"`
- `inputStyle` object replaced with `className="w-full px-3 py-2 rounded-lg border border-slate-200 text-[13px] outline-none font-inherit text-slate-800 box-border"`
- Owner row (view mode): `className="text-[13px] font-semibold text-brand-teal cursor-pointer"`
- Owner phone link: `className="text-xs text-slate-500 no-underline hover:text-brand-teal"`
- Owner search dropdown: `className="mt-1 border border-slate-200 rounded-lg overflow-hidden"`
- Search result items: `className="px-3 py-2 cursor-pointer border-b border-slate-200 transition-colors hover:bg-blue-50"`
- Alert chips (edit mode): `className="px-3 py-1.5 rounded-2xl text-xs font-bold cursor-pointer transition-all"` with dynamic inline style
- Alert badges (view mode): `className="bg-brand-coral-light text-brand-coral px-3 py-1.5 rounded-lg text-xs font-bold"`
- Trusted humans section: clickable names `className="text-[13px] font-semibold text-brand-teal cursor-pointer"`
- Add trusted button: `className="w-full mt-2.5 py-2 rounded-[10px] border-[1.5px] border-dashed border-brand-teal text-[13px] font-bold cursor-pointer font-inherit transition-all"` with dynamic bg/colour
- New trusted form: `className="mt-2 p-3 bg-slate-50 rounded-lg border border-slate-200"`
- Recurring bookings button: `className="w-full py-2.5 rounded-[10px] border-none bg-brand-teal text-white text-[13px] font-bold cursor-pointer font-inherit transition-all hover:bg-[#1E6B5C] mt-2"`
- Action footer: `className="px-6 py-4 pb-5 flex gap-2.5 bg-slate-50 border-t border-slate-200 mt-4"`
- Save/Edit/Cancel buttons: dynamic colours inline, layout via Tailwind
- GroomingHistory sub-component (defined inside the file): same pattern — replace all inline styles with Tailwind classes
- Remove `BRAND` import. Keep `SIZE_THEME`, `SIZE_FALLBACK`, `ALERT_OPTIONS`, `SERVICES` imports.

- [ ] **Step 2: Build check**
- [ ] **Step 3: Commit** `git commit -m "refactor: migrate DogCardModal to Tailwind"`

---

## Task 4: NewBookingModal + AddBookingForm

**Files:**
- `src/components/modals/NewBookingModal.jsx` (~850 lines)
- `src/components/booking/AddBookingForm.jsx` (~438 lines)

- [ ] **Step 1: Rewrite NewBookingModal.jsx**

Key changes:
- Overlay: `className="fixed inset-0 bg-black/40 flex items-center justify-center z-[1000]"`
- Modal box: `className="bg-white rounded-[20px] w-[min(440px,95vw)] max-h-[92vh] flex flex-col shadow-[0_12px_48px_rgba(0,0,0,0.2)]"`
- Gradient header: `className="px-6 py-[18px] rounded-t-[20px] flex justify-between items-center shrink-0"` with inline gradient
- Close button: `className="bg-white/20 border-none rounded-lg w-8 h-8 flex items-center justify-center cursor-pointer text-base font-bold"` with inline colour
- Search section: `className="px-6 pt-5 overflow-visible shrink-0 relative z-10"`
- Dog search input: `className="w-full py-3 pl-9 pr-3.5 rounded-[10px] border-[1.5px] border-slate-200 text-[15px] font-inherit box-border outline-none text-slate-800 transition-colors focus:border-brand-blue"`
- Dog card (selected): `className="rounded-xl p-2.5 px-3.5 border-[1.5px]"` with dynamic colours
- Service dropdown: `className="w-full mt-2 px-2.5 py-2 rounded-lg border border-slate-200 text-xs font-inherit font-semibold cursor-pointer bg-white text-slate-800 box-border"`
- "Add another dog" button: `className="flex-1 py-2 px-3 rounded-lg border-[1.5px] border-dashed bg-white text-xs font-bold cursor-pointer font-inherit transition-all"` with dynamic colour
- "Start over" button: `className="py-2 px-3 rounded-lg border-[1.5px] border-slate-200 bg-white text-slate-500 text-xs font-bold cursor-pointer font-inherit transition-all hover:border-brand-coral hover:text-brand-coral"`
- AvailabilityCalendar sub-component: month nav buttons `className="bg-slate-50 border border-slate-200 rounded-md w-[30px] h-[30px] cursor-pointer flex items-center justify-center"`, day headers `className="text-center text-[10px] font-bold text-slate-500 py-0.5"`, day cells `className="w-full aspect-square rounded-lg text-[13px] font-inherit transition-all flex items-center justify-center"` with dynamic inline style for status colours
- TimeSlotPicker sub-component: `className="grid grid-cols-[repeat(auto-fill,minmax(80px,1fr))] gap-2"`, slot buttons `className="py-2.5 rounded-[10px] border-2 text-sm font-bold cursor-pointer font-inherit transition-all text-center"` with dynamic inline style
- Scrollable body: `className="px-6 py-4 pb-5 flex flex-col gap-4 overflow-y-auto flex-1"`
- `labelStyle` object replaced with `className="text-[11px] font-extrabold text-brand-teal uppercase tracking-wide block mb-1.5"`
- `inputStyle` object replaced with `className="w-full py-3 px-3.5 rounded-[10px] border-[1.5px] border-slate-200 text-sm font-inherit box-border outline-none text-slate-800 transition-colors focus:border-brand-blue"`
- Recurring select: same input class with `cursor-pointer bg-white`
- Error box: `className="text-[13px] text-brand-coral font-semibold bg-brand-coral-light px-3.5 py-2.5 rounded-[10px] mb-4"`
- Confirm button: `className="flex-1 py-[13px] rounded-xl border-none font-bold text-sm cursor-pointer font-inherit transition-all disabled:bg-slate-200 disabled:text-slate-500 disabled:cursor-not-allowed"` with dynamic inline style
- Cancel button: `className="py-[13px] px-5 rounded-xl border-[1.5px] border-slate-200 bg-white text-slate-500 text-sm font-semibold cursor-pointer font-inherit"`
- Search dropdown: `className="absolute top-full left-0 right-0 mt-1 z-30 bg-white border-[1.5px] border-slate-200 rounded-xl shadow-[0_8px_24px_rgba(0,0,0,0.12)] max-h-[280px] overflow-auto"`
- Dropdown items: `className="px-3.5 py-2.5 cursor-pointer transition-colors"` with dynamic hover colours inline for trusted vs owner
- "No results" panel: `className="absolute top-full left-0 right-0 mt-1 z-30 bg-white border-[1.5px] border-slate-200 rounded-xl shadow-[0_8px_24px_rgba(0,0,0,0.12)] p-3.5"`
- "+ New Dog" / "+ New Human" buttons: `className="flex-1 py-[9px] px-3 rounded-lg border-none text-white text-xs font-bold cursor-pointer font-inherit"` with bg-brand-blue / bg-brand-teal
- Remove all `onMouseEnter`/`onMouseLeave` where possible, keep for dynamic sizeTheme colours
- Remove `BRAND` import. Keep `SIZE_THEME`, `SIZE_FALLBACK`, `SERVICES`, `PRICING`, `SALON_SLOTS`, `ALL_DAYS`.

- [ ] **Step 2: Rewrite AddBookingForm.jsx**

Key changes:
- Form: `className="flex flex-col gap-1.5 mt-1.5"`
- Selected dog chip: `className="flex items-center gap-1.5 bg-blue-50 rounded-lg px-2.5 py-1.5"`
- Dog name: `className="text-[13px] font-bold text-brand-blue-dark"`
- Owner line: `className="text-[11px] text-slate-800"`
- Change button: `className="bg-white border border-slate-200 rounded-md px-2 py-[3px] text-[11px] font-semibold cursor-pointer text-slate-500 font-inherit"`
- Search wrapper: `className="relative"`
- Search icon: `className="absolute left-2 top-1/2 -translate-y-1/2 flex pointer-events-none"`
- Search input: `className="w-full py-[7px] pl-[26px] pr-2.5 rounded-lg border-[1.5px] border-slate-200 text-[13px] outline-none font-inherit text-slate-800 box-border transition-colors focus:border-brand-blue"`
- Dropdown: `className="absolute top-full left-0 right-0 mt-0.5 z-20 bg-white border border-slate-200 rounded-lg shadow-[0_4px_12px_rgba(0,0,0,0.1)] max-h-[200px] overflow-auto"`
- Dropdown items: `className="px-2.5 py-2 cursor-pointer border-b border-slate-200 transition-colors hover:bg-blue-50"`
- Size/Service grid: `className="grid grid-cols-2 gap-1.5"`
- Select: `className="py-[7px] px-2.5 rounded-lg border-[1.5px] border-slate-200 text-[13px] outline-none w-full box-border font-inherit cursor-pointer"`
- Error text: `className="text-xs text-brand-coral font-medium py-0.5"`
- Button row: `className="flex gap-1.5"`
- Confirm button: `className="flex-1 py-[7px] rounded-lg border-none bg-brand-blue text-white font-semibold text-[13px] cursor-pointer font-inherit transition-colors hover:bg-brand-blue-dark disabled:bg-slate-200 disabled:text-slate-500 disabled:cursor-not-allowed"`
- Cancel button: `className="py-[7px] px-3.5 rounded-lg border-[1.5px] border-slate-200 bg-white text-slate-500 text-[13px] cursor-pointer font-inherit"`
- Remove all `onMouseEnter`/`onMouseLeave`, replace with Tailwind `hover:`
- Remove `BRAND` import entirely.

- [ ] **Step 3: Build check**
- [ ] **Step 4: Commit** `git commit -m "refactor: migrate NewBookingModal and AddBookingForm to Tailwind"`

---

## Task 5: ChainBookingModal

**File:** `src/components/modals/ChainBookingModal.jsx`

- [ ] **Step 1: Rewrite ChainBookingModal.jsx**

Key changes:
- Overlay: `className="fixed inset-0 bg-black/35 flex items-center justify-center z-[1000]"`
- Modal box: `className="bg-white rounded-2xl w-[min(460px,95vw)] max-h-[85vh] overflow-auto px-7 py-6 shadow-[0_8px_32px_rgba(0,0,0,0.18)]"`
- Title: `className="text-lg font-extrabold text-slate-800 mb-1"`
- Subtitle: `className="text-[13px] text-slate-500 mb-5"`
- `selectStyle` object → `className="px-2.5 py-2 rounded-lg border-[1.5px] border-slate-200 text-[13px] font-semibold font-inherit bg-white text-slate-800 cursor-pointer"`
- Weeks input: same class + `w-[60px] text-center`
- Price span: `className="text-sm font-extrabold text-brand-teal"`
- Warning box: `className="px-3 py-2 rounded-lg mb-2 bg-amber-50 text-amber-800 text-xs font-bold flex items-center gap-1.5"`
- "Add to chain" button: `className="px-4 py-2 rounded-lg border-none bg-brand-blue text-white text-[13px] font-bold cursor-pointer font-inherit mb-4"`
- Chain count label: `className="text-xs font-bold text-slate-500 mb-2"`
- Chain item row: `className="flex items-center gap-2 px-2.5 py-2 rounded-lg mb-1 bg-slate-50 border border-slate-200"`
- Remove button: `className="w-6 h-6 rounded-md border-none bg-brand-coral-light text-brand-coral text-sm font-bold cursor-pointer flex items-center justify-center font-inherit"`
- Cancel button: `className="px-5 py-2.5 rounded-[10px] border-[1.5px] border-slate-200 bg-white text-slate-800 text-[13px] font-bold cursor-pointer font-inherit"`
- Confirm button: `className="px-5 py-2.5 rounded-[10px] border-none text-white text-[13px] font-bold cursor-pointer font-inherit disabled:cursor-not-allowed"` with dynamic bg
- Remove `BRAND` import entirely.

- [ ] **Step 2: Build check**
- [ ] **Step 3: Commit** `git commit -m "refactor: migrate ChainBookingModal to Tailwind"`

---

## Task 6: AddDogModal + AddHumanModal

**Files:**
- `src/components/modals/AddDogModal.jsx`
- `src/components/modals/AddHumanModal.jsx`

- [ ] **Step 1: Rewrite AddDogModal.jsx**

Key changes:
- Overlay: `className="fixed inset-0 bg-black/35 flex items-center justify-center z-[1000]"`
- Modal box: `className="bg-white rounded-2xl w-[min(400px,95vw)] max-h-[90vh] overflow-auto shadow-[0_8px_32px_rgba(0,0,0,0.18)]"`
- Gradient header: `className="px-6 py-5 rounded-t-2xl flex justify-between items-center"` with inline gradient
- Title: `className="text-lg font-extrabold"` with inline colour
- Close button: shared pattern
- Form: `className="px-6 py-5 flex flex-col gap-3"`
- Grid: `className="grid grid-cols-2 gap-2.5"`
- Labels: `className="text-[11px] font-extrabold text-brand-teal uppercase tracking-wide block mb-1"`
- Inputs: `className="w-full px-3.5 py-2.5 rounded-lg border-[1.5px] border-slate-200 text-[13px] font-inherit box-border outline-none text-slate-800 transition-colors focus:border-brand-teal"`
- Remove `focusHandlers` — `focus:` class handles it
- Size auto indicator: `className="font-medium normal-case tracking-normal text-brand-green ml-1.5"`
- Size unknown indicator: `className="font-medium normal-case tracking-normal text-brand-coral ml-1.5"`
- Owner selected chip: `className="flex items-center gap-2"`, inner: `className="flex-1 bg-[#E6F5F2] px-3.5 py-2.5 rounded-lg"`
- Owner name: `className="text-sm font-bold text-brand-teal"`
- Change button: `className="bg-brand-coral-light border-none rounded-lg px-3 py-2 text-brand-coral text-xs font-bold cursor-pointer font-inherit"`
- Owner search: search icon + absolute dropdown with `hover:bg-[#E6F5F2]`
- "Add new owner" button: `className="w-full mt-2 py-2 rounded-lg border-[1.5px] border-brand-teal bg-white text-brand-teal text-xs font-bold cursor-pointer font-inherit transition-all"`
- New owner form: `className="p-3 bg-slate-50 rounded-lg border border-slate-200"`
- Error: shared error pattern
- Submit button: `className="flex-1 py-3 rounded-[10px] border-none text-sm font-bold cursor-pointer font-inherit transition-all disabled:bg-slate-200 disabled:text-slate-500 disabled:cursor-not-allowed"` with dynamic gradient colours
- Cancel button: `className="py-3 px-5 rounded-[10px] border-[1.5px] border-slate-200 bg-white text-slate-500 text-sm font-semibold cursor-pointer font-inherit"`
- Remove `BRAND` import. Keep `SIZE_THEME`, `SIZE_FALLBACK`, `getSizeForBreed`.

- [ ] **Step 2: Rewrite AddHumanModal.jsx**

Key changes:
- Same overlay/modal/header/form patterns as AddDogModal
- Gradient: `className="px-6 py-5 rounded-t-2xl flex justify-between items-center"` with `style={{ background: "linear-gradient(135deg, #2D8B7A, #236b5d)" }}`
- All inputs: `className="w-full px-3.5 py-2.5 rounded-lg border-[1.5px] border-slate-200 text-[13px] font-inherit box-border outline-none text-slate-800 transition-colors focus:border-brand-teal"`
- Checkboxes: `className="accent-brand-teal w-[18px] h-[18px] cursor-pointer"`
- Remove `BRAND` import entirely.

- [ ] **Step 3: Build check**
- [ ] **Step 4: Commit** `git commit -m "refactor: migrate AddDogModal and AddHumanModal to Tailwind"`

---

## Task 7: HumanCardModal + ContactPopup

**Files:**
- `src/components/modals/HumanCardModal.jsx`
- `src/components/modals/ContactPopup.jsx`

- [ ] **Step 1: Rewrite HumanCardModal.jsx**

Key changes:
- Same overlay/modal patterns (width 380px)
- Gradient header: `style={{ background: "linear-gradient(135deg, #2D8B7A, #236b5d)" }}`
- Detail rows: `className="flex justify-between py-2 border-b border-slate-200"`
- Contact rows (active/off): `className="text-[13px] font-semibold"` with dynamic colour inline
- `DogPill` component: `className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full cursor-pointer text-xs font-bold transition-opacity hover:opacity-80"` with dynamic bg/text inline. Remove `onMouseEnter`/`onMouseLeave`.
- Section labels: `className="mt-5 font-extrabold text-xs text-brand-teal uppercase tracking-wide mb-2"`
- Trusted humans names: `className="text-[13px] font-semibold text-brand-teal cursor-pointer"`
- Add trusted button: `className="w-full mt-3 py-2.5 rounded-[10px] border-[1.5px] border-dashed border-brand-teal text-[13px] font-bold cursor-pointer font-inherit transition-all"` with dynamic bg/colour
- Search/dropdown: same patterns as DogCardModal
- New trusted form: `className="mt-2.5 p-3.5 bg-slate-50 rounded-[10px] border border-slate-200"`
- Booking history section: `HumanBookingHistory` sub-component — all inline styles to Tailwind
- Phone link: `className="text-[13px] block mt-1 no-underline transition-colors hover:text-white"` with `style={{ color: "rgba(255,255,255,0.8)" }}`
- Remove `BRAND` import. Keep `SIZE_THEME`, `SERVICES`, `getSizeForBreed`.

- [ ] **Step 2: Rewrite ContactPopup.jsx**

Key changes:
- Overlay: `className="fixed inset-0 bg-black/25 flex items-center justify-center z-[1100]"`
- Popup: `className="bg-white rounded-[14px] w-[min(280px,90vw)] overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.18)]"`
- Header: `className="px-[18px] py-3.5 flex justify-between items-center"` with teal gradient inline
- Name: `className="text-[15px] font-bold text-white"`
- Subtitle: `className="text-xs text-white/80 mt-0.5"`
- Close button: `className="bg-white/20 border-none rounded-md w-6 h-6 flex items-center justify-center cursor-pointer text-xs text-white font-bold"`
- Contact rows: `className="flex justify-between items-center py-2 border-b border-slate-200"`
- Values: `className="text-[13px] font-semibold text-slate-800"` or dynamic for active/off
- Email link: `className="text-[13px] font-semibold text-brand-teal no-underline"`
- Remove `BRAND` import entirely.

- [ ] **Step 3: Build check**
- [ ] **Step 4: Commit** `git commit -m "refactor: migrate HumanCardModal and ContactPopup to Tailwind"`

---

## Task 8: DatePickerModal

**File:** `src/components/modals/DatePickerModal.jsx`

- [ ] **Step 1: Rewrite DatePickerModal.jsx**

Key changes:
- Overlay: `className="fixed inset-0 bg-black/35 flex items-center justify-center z-[1200]"`
- Picker: `className="bg-white rounded-2xl w-[min(320px,95vw)] overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.18)]"`
- Header: `className="bg-gradient-to-br from-brand-blue to-brand-blue-dark px-4 py-3.5 flex items-center justify-between"`
- Nav buttons: `className="bg-white/20 border-none rounded-md w-8 h-8 cursor-pointer flex items-center justify-center"`
- Month title: `className="text-base font-bold text-white"`
- Day header row: `className="grid grid-cols-7 px-3 pt-2.5 pb-1"`
- Day header cells: `className="text-center text-[11px] font-bold text-slate-500 py-1"`
- Day grid: `className="grid grid-cols-7 px-3 pb-3.5 gap-0.5"`
- Day buttons: `className="w-full aspect-square border-none rounded-lg text-sm font-inherit transition-all"` with dynamic inline style for selected/today/disabled colours
- Replace `onMouseEnter`/`onMouseLeave` with `hover:bg-slate-50` for non-selected, non-disabled days
- "Today" button: `className="bg-transparent border-[1.5px] border-brand-blue rounded-lg px-5 py-2 text-[13px] font-semibold text-brand-blue cursor-pointer font-inherit"`
- Remove `BRAND` import entirely.

- [ ] **Step 2: Build check**
- [ ] **Step 3: Commit** `git commit -m "refactor: migrate DatePickerModal to Tailwind"`

---

## Task 9: ClosedDayView + MonthGrid

**Files:**
- `src/components/layout/ClosedDayView.jsx`
- `src/components/layout/WeekCalendarView.jsx` (MonthGrid function only)

- [ ] **Step 1: Rewrite ClosedDayView.jsx**

Replace the entire contents:

```jsx
export function ClosedDayView({ onOpen }) {
  return (
    <div className="py-12 px-4 text-center bg-slate-50 rounded-b-[14px] border border-slate-200 border-t-0">
      <div className="text-[40px] mb-3">{"\uD83D\uDC3E"}</div>
      <div className="text-base font-semibold text-slate-800 mb-1">Salon closed</div>
      <div className="text-[13px] text-slate-500 leading-relaxed mb-4">
        No appointments on this day.
      </div>
      <button
        onClick={onOpen}
        className="bg-brand-blue text-white border-none rounded-[10px] px-6 py-2.5 text-[13px] font-semibold cursor-pointer font-inherit transition-all hover:bg-brand-blue-dark"
      >
        Open this day
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Migrate MonthGrid in WeekCalendarView.jsx**

In `WeekCalendarView.jsx`, rewrite the `MonthGrid` function (lines ~26-180) to use Tailwind classes. Keep the `BRAND` import for dynamic day-cell colours that depend on runtime booking data. Key changes:
- Month header: `className="flex items-center mb-3 p-3.5 px-4 rounded-[14px]"` with inline gradient
- Nav arrows: `className="w-7 h-10 flex items-center justify-center bg-white border-none rounded-lg cursor-pointer shrink-0 shadow-[0_2px_8px_rgba(0,0,0,0.15)]"`
- Month/Year box: `className="bg-white rounded-[10px] px-12 py-2 flex flex-col items-center justify-center min-h-[58px] min-w-[200px]"`
- Month name: `className="text-[26px] font-extrabold text-slate-800 leading-none"`
- Year: `className="text-sm font-bold text-slate-500 mt-0.5"`
- View buttons: `className="px-2 py-1 rounded-md border-none text-[10px] font-bold cursor-pointer font-inherit transition-all whitespace-nowrap"` with dynamic colours
- Day headers: `className="grid grid-cols-7 gap-1 mb-1"`, each: `className="text-center text-[11px] font-bold text-slate-500 uppercase py-1"`
- Day grid: `className="grid grid-cols-7 gap-1"`
- Day cells: `className="min-h-[56px] rounded-[10px] border flex flex-col items-center justify-center cursor-pointer font-inherit transition-all"` with dynamic inline style for bg/border/text

- [ ] **Step 3: Build check**
- [ ] **Step 4: Commit** `git commit -m "refactor: migrate ClosedDayView and MonthGrid to Tailwind"`

---

## Task 10: WaitlistPanel + BookingCard

**Files:**
- `src/components/booking/WaitlistPanel.jsx`
- `src/components/booking/BookingCard.jsx`

- [ ] **Step 1: Rewrite WaitlistPanel.jsx**

Key changes:
- Container: `className="border-t border-slate-200 bg-[#FFFBF2] p-4 flex flex-col gap-3"`
- Header: `className="flex justify-between items-center"`
- Title: `className="text-[13px] font-extrabold text-slate-800 uppercase tracking-wide"`
- "Add Person" button: `className="px-2 py-1 rounded-md border-[1.5px] border-slate-200 bg-white text-slate-500 text-[11px] font-bold cursor-pointer transition-all hover:text-brand-blue hover:border-brand-blue"`
- Add form: `className="flex gap-2 bg-white p-2 rounded-lg border border-slate-200"`
- Select: `className="flex-1 py-1.5 rounded-md border border-slate-200 text-xs"`
- Cancel button: `className="px-2.5 py-1.5 rounded-md border-none bg-brand-coral-light text-brand-coral text-[11px] font-bold cursor-pointer"`
- Error: `className="text-xs text-brand-coral"`
- Entry rows: `className="flex items-center justify-between bg-white px-3 py-2 rounded-lg border border-slate-200"`
- Entry name: `className="text-[13px] font-bold text-slate-800"`
- Entry details: `className="text-[11px] text-slate-500 whitespace-nowrap overflow-hidden text-ellipsis"`
- Remove button: `className="bg-transparent border-none text-brand-coral text-xs font-bold cursor-pointer px-2 py-1"`
- Empty text: `className="text-xs italic text-slate-500"`
- Remove `BRAND` import entirely. Remove `onMouseEnter`/`onMouseLeave`.

- [ ] **Step 2: Rewrite BookingCard.jsx**

Key changes:
- Card row: `className="flex items-center gap-2 bg-white border border-slate-200 rounded-[10px] px-2.5 py-1.5 text-[13px] cursor-pointer min-h-[42px] box-border transition-all"` with dynamic `style={{ borderLeft: "3px solid ${statusObj.color}" }}` and dynamic hover styles
- Dog name: `className="font-semibold text-slate-800 whitespace-nowrap overflow-hidden text-ellipsis"`
- Confirmed checkmark: `className="text-brand-green mr-[3px] text-[11px]"`
- Dog link: `className="cursor-pointer"` with dynamic `style={{ borderBottom: "1px dashed", color: sizeTheme.dark }}`
- Breed: `className="font-normal text-slate-500 ml-1 text-xs"`
- Service line: `className="text-[11px] text-slate-500"`
- Owner link: `className="cursor-pointer text-brand-teal"` with `style={{ borderBottom: "1px dashed #2D8B7A" }}`
- Status button: `className="rounded-md px-2 py-[3px] text-[10px] font-bold cursor-pointer font-inherit whitespace-nowrap transition-all"` with dynamic inline style
- "Done" badge: `className="text-[10px] font-bold px-2 py-[3px] rounded-md"` with dynamic inline style
- `ICON_COL_STYLE` object: `className="w-7 min-w-[28px] flex items-center justify-center shrink-0"`
- Remove `BRAND` import. Keep `BOOKING_STATUSES`, `SIZE_THEME`, `SIZE_FALLBACK`, `SERVICES`.

- [ ] **Step 3: Build check**
- [ ] **Step 4: Commit** `git commit -m "refactor: migrate WaitlistPanel and BookingCard to Tailwind"`

---

## Task 11: UI Components

**Files:**
- `src/components/ui/SizeTag.jsx`
- `src/components/ui/LoadingSpinner.jsx`
- `src/components/ui/ErrorBanner.jsx`
- `src/components/ui/Legend.jsx`
- `src/components/ui/StaffIconBtn.jsx`
- `src/components/ui/AvailableSeat.jsx`
- `src/components/ui/BlockedSeat.jsx`
- `src/components/ui/CapacityBar.jsx`

- [ ] **Step 1: Rewrite SizeTag.jsx**

```jsx
import { SIZE_THEME } from "../../constants/index.js";

const DOT_SIZES = {
  small:  { normal: 14, legend: 12, header: 24 },
  medium: { normal: 20, legend: 18, header: 30 },
  large:  { normal: 26, legend: 24, header: 36 },
};

export function SizeTag({ size, legendMode, headerMode }) {
  const theme = SIZE_THEME[size];
  const dots = DOT_SIZES[size];
  if (!theme || !dots) return null;
  const dotSize = headerMode ? dots.header : legendMode ? dots.legend : dots.normal;
  return (
    <span
      className="inline-flex items-center justify-center rounded-full shrink-0"
      style={{ width: dotSize, height: dotSize, background: theme.gradient[0] }}
    />
  );
}
```

- [ ] **Step 2: Rewrite LoadingSpinner.jsx**

```jsx
export function LoadingSpinner() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[300px] gap-4">
      <div className="w-10 h-10 border-4 border-slate-200 border-t-brand-blue rounded-full animate-spin" />
      <div className="text-sm text-slate-500 font-semibold">Loading...</div>
    </div>
  );
}
```

- [ ] **Step 3: Rewrite ErrorBanner.jsx**

```jsx
export function ErrorBanner({ message }) {
  return (
    <div className="bg-red-100 border border-red-600 rounded-[10px] px-5 py-4 my-5 flex items-center gap-2.5">
      <span className="text-xl">{"\u26A0\uFE0F"}</span>
      <div>
        <div className="text-sm font-bold text-red-600">Something went wrong</div>
        <div className="text-[13px] text-slate-800 mt-1">{message}</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Rewrite Legend.jsx**

Key changes:
- Toggle button: `className="w-8 h-8 rounded-full border-none text-base font-extrabold cursor-pointer flex items-center justify-center transition-all shrink-0 shadow-[0_1px_4px_rgba(0,0,0,0.1)]"` with dynamic bg/colour based on `open`
- Dropdown: `className="absolute top-[38px] left-0 z-50 flex flex-wrap p-2.5 px-4 bg-white rounded-[10px] text-xs text-slate-500 items-center justify-between gap-2.5 shadow-[0_4px_16px_rgba(0,0,0,0.12)] min-w-[340px] border border-slate-200"`
- Item: `className="flex items-center gap-[5px]"`
- Remove `BRAND` import.

- [ ] **Step 5: Rewrite StaffIconBtn.jsx**

```jsx
export function StaffIconBtn({ icon, title, onClick }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="bg-transparent border-none w-[26px] h-[26px] flex items-center justify-center cursor-pointer p-0 transition-all rounded hover:opacity-60 hover:scale-110"
    >
      {icon}
    </button>
  );
}
```

- [ ] **Step 6: Rewrite AvailableSeat.jsx**

```jsx
import { IconTick, IconPlus, IconBlock } from "../icons/index.jsx";
import { StaffIconBtn } from "./StaffIconBtn.jsx";

export function AvailableSeat({ onAddBooking, onBlock }) {
  return (
    <div className="flex items-center justify-between rounded-[10px] px-2.5 py-1.5 min-h-[42px] box-border bg-blue-50 border-[1.5px] border-[#8AD8EE]">
      <div className="flex items-center gap-2">
        <div className="w-7 min-w-[28px] flex items-center justify-center shrink-0"><IconTick size={16} /></div>
        <span className="text-xs font-semibold text-brand-blue-dark">Available</span>
      </div>
      <div className="flex gap-1">
        <StaffIconBtn icon={<IconPlus />} title="Add appointment" onClick={onAddBooking} />
        <StaffIconBtn icon={<IconBlock />} title="Block appointment" onClick={onBlock} />
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Rewrite BlockedSeat.jsx**

```jsx
import { IconBlock, IconPlus, IconReopen } from "../icons/index.jsx";
import { StaffIconBtn } from "./StaffIconBtn.jsx";

export function BlockedSeat({ onOpen, onAddBooking }) {
  return (
    <div className="flex items-center justify-between rounded-[10px] px-2.5 py-1.5 min-h-[42px] box-border bg-slate-50 border-[1.5px] border-slate-200">
      <div className="flex items-center gap-2">
        <div className="w-7 min-w-[28px] flex items-center justify-center shrink-0"><IconBlock size={16} /></div>
        <span className="text-xs font-semibold text-brand-coral">Blocked</span>
      </div>
      <div className="flex gap-1">
        <StaffIconBtn icon={<IconPlus />} title="Add appointment" onClick={onAddBooking} />
        <StaffIconBtn icon={<IconReopen />} title="Re-open appointment" onClick={onOpen} />
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Rewrite CapacityBar.jsx**

Key changes:
- Container: `className="flex gap-[3px] items-center"`
- Bar segments: `className="w-3.5 h-5 rounded-[3px] transition-all duration-200"` with dynamic inline style for background/border
- Constraint label: `className="text-[10px] text-brand-coral font-semibold ml-0.5"`
- Remove `BRAND` import. Keep dynamic colour logic as inline style.

- [ ] **Step 9: Build check**
- [ ] **Step 10: Commit** `git commit -m "refactor: migrate UI components to Tailwind"`

---

## Task 12: Auth + Customer Components

**Files:**
- `src/components/auth/CustomerLoginPage.jsx`
- `src/components/auth/LoginPage.jsx`
- `src/components/auth/ResetPasswordPage.jsx`
- `src/components/customer/CustomerDashboard.jsx`

- [ ] **Step 1: Rewrite CustomerLoginPage.jsx**

Key changes:
- Full-page wrapper: `className="min-h-screen bg-[#F8FFFE] flex items-center justify-center p-5 font-sans"`
- Card container: `className="w-full max-w-[400px]"`
- Brand header: `className="text-center mb-8"`, title: `className="text-[32px] font-extrabold text-slate-800"`, teal span: `className="text-brand-teal"`
- Form card: `className="bg-white rounded-2xl p-7 border border-slate-200 shadow-[0_4px_20px_rgba(0,0,0,0.06)]"`
- Welcome title: `className="text-lg font-extrabold text-slate-800 mb-1"`
- Subtitle: `className="text-[13px] text-slate-500 mb-5"`
- Label: `className="text-xs font-extrabold text-brand-teal uppercase tracking-wide block mb-1.5"`
- Input: `className="w-full py-3.5 px-4 rounded-[10px] border-[1.5px] border-slate-200 text-base font-inherit box-border outline-none text-slate-800 transition-colors focus:border-brand-teal"`
- OTP input: same base + `text-center text-2xl tracking-[8px] font-bold`
- Error: shared error pattern
- Submit button: `className="w-full py-3.5 rounded-[10px] border-none bg-brand-teal text-white text-[15px] font-bold cursor-pointer font-inherit transition-all mt-2 disabled:bg-slate-200 disabled:text-slate-500 disabled:cursor-not-allowed"`
- "Use different number" button: `className="w-full mt-3 py-2.5 rounded-[10px] border border-slate-200 bg-white text-[13px] font-semibold text-slate-500 cursor-pointer font-inherit"`
- Demo button: `className="w-full mt-4 py-3 rounded-[10px] border-[1.5px] border-dashed border-slate-500 bg-transparent text-[13px] font-semibold text-slate-500 cursor-pointer font-inherit transition-all hover:border-brand-teal hover:text-brand-teal"`
- Remove all `onFocus`/`onBlur` handlers. Remove `BRAND` import entirely.

- [ ] **Step 2: Rewrite LoginPage.jsx**

Same patterns as CustomerLoginPage but for staff email/password login. Apply consistent Tailwind classes to all inputs, buttons, and layout. Remove `BRAND` import.

- [ ] **Step 3: Rewrite ResetPasswordPage.jsx**

Same patterns. Remove `BRAND` import.

- [ ] **Step 4: Rewrite CustomerDashboard.jsx**

Key changes:
- Full-page wrapper: `className="min-h-screen bg-[#F8FFFE] font-sans"`
- Header bar: `className="px-5 py-5 pb-7 relative"` with inline teal gradient
- Inner container: `className="max-w-[600px] mx-auto flex justify-between items-start"`
- Brand text: `className="text-sm font-semibold text-white/70 mb-1"`, white span: `className="text-white"`
- User name: `className="text-[26px] font-extrabold text-white"`
- Phone: `className="text-sm text-white/80 mt-1"`
- Log out button: `className="bg-white/15 border border-white/30 rounded-lg px-3.5 py-2 text-[13px] font-bold text-white cursor-pointer font-inherit backdrop-blur-sm"`
- Content container: `className="max-w-[600px] -mt-3 mx-auto px-4 pb-8 relative z-[1]"`
- "Book a Groom" CTA: `className="w-full py-4 rounded-xl border-none bg-brand-teal text-white text-base font-bold cursor-pointer font-inherit mb-5"`
- `cardStyle` object → `className="bg-white rounded-[14px] px-6 py-5 border border-slate-200 mb-4 shadow-[0_2px_8px_rgba(0,0,0,0.04)]"`
- `sectionTitle` → `className="font-extrabold text-xs text-brand-teal uppercase tracking-wide mb-2.5"`
- `detailRow` helper → uses `className="flex justify-between items-center py-2.5 border-b border-slate-200"`, label: `className="text-sm text-slate-500 min-w-[100px]"`, value: `className="text-sm font-semibold text-slate-800 text-right flex-1 ml-3"`
- `inputStyle` → `className="flex-1 ml-3 px-3 py-2 rounded-lg border-[1.5px] border-brand-teal text-sm font-inherit box-border outline-none text-slate-800 text-right"`
- Edit button: `className="bg-brand-teal border-none rounded-lg px-4 py-1.5 text-[13px] font-bold text-white cursor-pointer font-inherit"`
- Save button: same with `opacity: saving ? 0.6 : 1`
- Cancel button: `className="bg-white border border-slate-200 rounded-lg px-3.5 py-1.5 text-[13px] font-semibold text-slate-500 cursor-pointer font-inherit"`
- Name edit fields: `className="text-[11px] font-extrabold text-brand-teal uppercase tracking-wide mb-1"`
- WhatsApp toggle: keep inline positioning for the knob, use Tailwind for container: `className="border-none rounded-full w-12 h-[26px] cursor-pointer relative transition-colors"` with dynamic bg
- Dog cards: `className="flex justify-between items-center py-3 border-b border-slate-200"`
- Size badge: dynamic colours inline, layout: `className="text-[11px] font-bold px-2.5 py-[3px] rounded-full"`
- Booking entries: status badge `className="text-[11px] font-bold px-2.5 py-1 rounded-md whitespace-nowrap"` with dynamic colours
- "UPCOMING" badge: `className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#E6F5F2] text-brand-teal"`
- Cancel appointment button: `className="mt-2 w-full py-2 rounded-lg border border-brand-coral bg-transparent text-[13px] font-semibold text-brand-coral cursor-pointer font-inherit"`
- "Contact salon" box: `className="mt-3 py-2.5 rounded-[10px] border-[1.5px] border-dashed border-brand-teal bg-[#E6F5F2] text-brand-teal text-[13px] font-bold text-center"`
- Remove `BRAND` import. Keep `toDateStr` and Supabase imports.

- [ ] **Step 5: Build check**
- [ ] **Step 6: Commit** `git commit -m "refactor: migrate auth pages and CustomerDashboard to Tailwind"`

---

## Task 13: Icons + Clean Up

**Files:**
- `src/components/icons/index.jsx`
- `src/constants/styles.js`
- `src/constants/index.js`

- [ ] **Step 1: Update icons/index.jsx**

Replace BRAND default parameter values with hex strings:

```jsx
const S = 18;
const SW = 2;

export function IconTick({ size = S, colour = "#0EA5E9" }) {
  return (<svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={colour} strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round"><path d="M3 8.5l3.5 3.5 6.5-8" /></svg>);
}

export function IconBlock({ size = S, colour = "#E8567F" }) {
  return (<svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={colour} strokeWidth={SW} strokeLinecap="round"><circle cx="8" cy="8" r="6" /><line x1="3.5" y1="3.5" x2="12.5" y2="12.5" /></svg>);
}

export function IconReopen({ size = S, colour = "#2D8B7A" }) {
  return (<svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={colour} strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="12" height="11" rx="1.5" /><line x1="2" y1="6.5" x2="14" y2="6.5" /><line x1="5.5" y1="3" x2="5.5" y2="5" /><line x1="10.5" y1="3" x2="10.5" y2="5" /><path d="M6 10l1.5 1.5L10.5 9" /></svg>);
}

export function IconEdit({ size = S, colour = "#0EA5E9" }) {
  return (<svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={colour} strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round"><path d="M9.5 3.5l3 3L5 14H2v-3z" /><path d="M9.5 3.5l1.5-1.5 3 3-1.5 1.5" /></svg>);
}

export function IconMessage({ size = S, colour = "#2D8B7A" }) {
  return (<svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={colour} strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h12v8H5l-3 3z" /></svg>);
}

export function IconPlus({ size = S, colour = "#0EA5E9" }) {
  return (<svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={colour} strokeWidth={SW} strokeLinecap="round"><line x1="8" y1="3" x2="8" y2="13" /><line x1="3" y1="8" x2="13" y2="8" /></svg>);
}

export function IconSearch({ size = S, colour = "#6B7280" }) {
  return (<svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={colour} strokeWidth={SW} strokeLinecap="round" strokeLinejoin="round"><circle cx="7" cy="7" r="5" /><line x1="10.5" y1="10.5" x2="14" y2="14" /></svg>);
}
```

- [ ] **Step 2: Delete styles.js and clean up index.js**

Delete `src/constants/styles.js`.

Remove the styles re-export from `src/constants/index.js`. The file should become:

```js
export { BRAND, SIZE_THEME, SIZE_FALLBACK } from "./brand.js";
export {
  SALON_SLOTS,
  MAX_DOGS_PER_SLOT,
  SERVICES,
  ALL_DAYS,
  LARGE_DOG_SLOTS,
  PRICING,
  ALERT_OPTIONS,
  BOOKING_STATUSES,
} from "./salon.js";
export {
  BREED_SIZE_MAP,
  BREED_LIST,
  getSizeForBreed,
} from "./breeds.js";
```

- [ ] **Step 3: Search for any remaining `styles.js` imports**

```bash
grep -r "from.*styles.js\|from.*constants/styles\|inputStyle.*from\|labelStyle.*from\|closeBtnStyle.*from\|onInputFocus\|onInputBlur" src/
```

Fix any remaining references.

- [ ] **Step 4: Build check**
- [ ] **Step 5: Commit** `git commit -m "refactor: remove BRAND from icons, delete styles.js, clean up constants/index.js"`

---

## Task 14: Final Verification

- [ ] **Step 1: Search for remaining BRAND imports in migrated files**

```bash
grep -rn "import.*BRAND" src/components/ | grep -v "node_modules"
```

Any file that still imports BRAND should be checked — if it only uses BRAND for static colour values that now have Tailwind equivalents, remove the import. Files that use BRAND for dynamic `SIZE_THEME`/`SIZE_FALLBACK` lookups are fine.

- [ ] **Step 2: Search for remaining inline style attributes**

```bash
grep -c "style={" src/components/modals/*.jsx src/components/modals/booking-detail/*.jsx src/components/booking/AddBookingForm.jsx src/components/booking/BookingCard.jsx src/components/booking/WaitlistPanel.jsx src/components/layout/ClosedDayView.jsx src/components/ui/*.jsx src/components/auth/*.jsx src/components/customer/CustomerDashboard.jsx
```

Any file with more than a few `style=` hits should be investigated. Remaining inline styles should only be for dynamic runtime colours (sizeTheme, statusObj).

- [ ] **Step 3: Full build check**

```bash
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.nvm/versions/node/*/bin:$PATH" && node node_modules/.bin/vite build
```

- [ ] **Step 4: Visual smoke test**

Start the dev server and check:
1. Open BookingDetailModal — gradient header, status buttons, edit mode, alerts
2. Open DogCardModal — edit mode with name/breed/DOB fields, alerts, trusted humans
3. Open NewBookingModal — dog search dropdown, availability calendar, time slot picker
4. Open HumanCardModal — trusted humans, dog pills, booking history
5. Test AddDogModal and AddHumanModal — form inputs, owner search
6. Test DatePickerModal — month navigation, day selection
7. Test ContactPopup — layout and close
8. Check ClosedDayView — paw icon, "Open this day" button
9. Check BookingCard — status advance, hover effects
10. Check auth pages — login form, OTP flow
11. Check CustomerDashboard — all sections render correctly

- [ ] **Step 5: Commit** `git commit -m "refactor: complete Tailwind Phase 3B — all modals and remaining components migrated"`
