# Phase 3: UX, Accessibility & Modal Decomposition — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decompose BookingDetailModal, add WCAG AA structural accessibility via React Aria, implement keyboard shortcuts for staff and customers, and add a Today button to the toolbar.

**Architecture:** React Aria provides focus trapping and ARIA semantics via a shared `AccessibleModal` wrapper. BookingDetailModal extracts logic into 3 hooks and JSX into 3 components. A `useKeyboardShortcuts` hook powers context-aware keyboard shortcuts across both staff and customer apps.

**Tech Stack:** React 19, React Aria, TypeScript, Tailwind CSS 4, Vite 8

---

## File Structure

### New Files

```
src/components/shared/AccessibleModal.tsx      — shared modal wrapper (focus trap, ARIA, scroll lock)
src/components/shared/LiveAnnouncer.tsx         — aria-live region for screen reader announcements
src/components/shared/SkipNavLink.tsx           — skip-to-content link
src/components/shared/ShortcutsHelpOverlay.tsx  — keyboard shortcuts help modal

src/components/modals/booking-detail/LogisticsSection.jsx   — extracted logistics JSX
src/components/modals/booking-detail/FinanceSection.jsx     — extracted finance JSX
src/components/modals/booking-detail/SlotSelector.jsx       — extracted slot grid JSX

src/hooks/useBookingEditState.ts    — consolidated edit state hook
src/hooks/useSlotAvailability.ts    — memoised slot validation hook
src/hooks/useBookingSave.ts         — save handler hook
src/hooks/useKeyboardShortcuts.ts   — keyboard shortcut system
```

### Modified Files

```
src/components/modals/BookingDetailModal.jsx        — refactor to orchestrator (~350 lines)
src/components/modals/NewBookingModal.jsx            — wrap with AccessibleModal
src/components/modals/AddHumanModal.jsx              — wrap with AccessibleModal
src/components/modals/AddDogModal.jsx                — wrap with AccessibleModal
src/components/modals/ChainBookingModal.jsx          — wrap with AccessibleModal
src/components/modals/DogCardModal.jsx               — wrap with AccessibleModal
src/components/modals/HumanCardModal.jsx             — wrap with AccessibleModal
src/components/modals/ContactPopup.jsx               — wrap with AccessibleModal
src/components/modals/DatePickerModal.jsx            — wrap with AccessibleModal
src/components/modals/booking-detail/ExitConfirmDialog.jsx — wrap with AccessibleModal
src/components/layout/AppToolbar.jsx                 — add Today button, landmark semantics
src/components/layout/WeekCalendarView.jsx           — landmark semantics, aria-current
src/components/BookingCard.jsx                       — aria-labels on buttons
src/App.jsx                                          — skip nav, landmarks, keyboard shortcuts, Today handler
src/CustomerApp.jsx                                  — skip nav, landmarks, keyboard shortcuts
package.json                                         — add react-aria dependency
```

---

## Task 1: Install React Aria and Create AccessibleModal

**Files:**
- Modify: `package.json`
- Create: `src/components/shared/AccessibleModal.tsx`

- [ ] **Step 1: Install react-aria**

Run: `npm install react-aria`

Expected: Package installs successfully, added to dependencies in package.json.

- [ ] **Step 2: Verify install**

Run: `npx tsc --noEmit 2>&1 | head -20`

Expected: No new errors introduced (existing errors may be present).

- [ ] **Step 3: Create AccessibleModal component**

```tsx
// src/components/shared/AccessibleModal.tsx
import { useRef, useEffect, type ReactNode } from "react";
import { FocusScope, useDialog } from "react-aria";

interface AccessibleModalProps {
  children: ReactNode;
  onClose: () => void;
  titleId?: string;
  /** Tailwind classes for the modal container (white box) */
  className?: string;
  /** Tailwind classes for the backdrop overlay */
  backdropClass?: string;
  /** z-index for the overlay — default 1000 */
  zIndex?: number;
  /** Set false to disable Escape-to-close (e.g. ExitConfirmDialog) */
  dismissOnEscape?: boolean;
}

export function AccessibleModal({
  children,
  onClose,
  titleId,
  className = "",
  backdropClass = "bg-black/35",
  zIndex = 1000,
  dismissOnEscape = true,
}: AccessibleModalProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { dialogProps } = useDialog(
    { role: "dialog", "aria-labelledby": titleId },
    ref,
  );

  // Escape key
  useEffect(() => {
    if (!dismissOnEscape) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose, dismissOnEscape]);

  // Scroll lock
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <div
      className={`fixed inset-0 ${backdropClass} flex items-center justify-center`}
      style={{ zIndex }}
      onClick={onClose}
    >
      <FocusScope contain restoreFocus autoFocus>
        <div
          {...dialogProps}
          ref={ref}
          aria-modal="true"
          className={className}
          onClick={(e) => e.stopPropagation()}
        >
          {children}
        </div>
      </FocusScope>
    </div>
  );
}
```

- [ ] **Step 4: Verify types**

Run: `npx tsc --noEmit 2>&1 | grep -i "AccessibleModal" | head -10`

Expected: No type errors in AccessibleModal.tsx.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/components/shared/AccessibleModal.tsx
git commit -m "feat: install react-aria and create AccessibleModal wrapper"
```

---

## Task 2: Create LiveAnnouncer

**Files:**
- Create: `src/components/shared/LiveAnnouncer.tsx`

- [ ] **Step 1: Create LiveAnnouncer component**

```tsx
// src/components/shared/LiveAnnouncer.tsx
import { useState, useCallback, createContext, useContext, type ReactNode } from "react";

interface AnnouncerContextType {
  announce: (message: string) => void;
}

const AnnouncerContext = createContext<AnnouncerContextType>({
  announce: () => {},
});

export function useAnnounce() {
  return useContext(AnnouncerContext).announce;
}

export function LiveAnnouncerProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState("");

  const announce = useCallback((text: string) => {
    // Clear then set to ensure repeated identical messages are announced
    setMessage("");
    requestAnimationFrame(() => setMessage(text));
  }, []);

  return (
    <AnnouncerContext.Provider value={{ announce }}>
      {children}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {message}
      </div>
    </AnnouncerContext.Provider>
  );
}
```

- [ ] **Step 2: Verify types**

Run: `npx tsc --noEmit 2>&1 | grep -i "LiveAnnouncer" | head -10`

Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/shared/LiveAnnouncer.tsx
git commit -m "feat: add LiveAnnouncer for screen reader announcements"
```

---

## Task 3: Extract useBookingEditState Hook

**Files:**
- Create: `src/hooks/useBookingEditState.ts`
- Modify: `src/components/modals/BookingDetailModal.jsx`

This hook consolidates the 6 scattered `useState` calls (lines 86–91), the allergy state (lines 123–132), the `buildEditState` helper (lines 45–67), and `resetEditState` (lines 216–226) from BookingDetailModal.

- [ ] **Step 1: Create the hook**

```ts
// src/hooks/useBookingEditState.ts
import { useState, useCallback } from "react";

interface EditData {
  service: string;
  pickupBy: string;
  payment: string;
  groomNotes: string;
  alerts: string[];
  addons: string[];
  date: string;
  slot: string;
  customPrice: number | undefined;
}

interface AllergyState {
  hasAllergy: boolean;
  setHasAllergy: (v: boolean) => void;
  allergyInput: string;
  setAllergyInput: (v: string) => void;
}

interface ModalFlags {
  showDatePicker: boolean;
  setShowDatePicker: (v: boolean) => void;
  showExitConfirm: boolean;
  setShowExitConfirm: (v: boolean) => void;
  showContact: boolean;
  setShowContact: (v: boolean) => void;
}

interface UseBookingEditStateReturn {
  editData: EditData;
  setEditData: (v: EditData | ((prev: EditData) => EditData)) => void;
  isEditing: boolean;
  setIsEditing: (v: boolean) => void;
  saving: boolean;
  setSaving: (v: boolean) => void;
  saveError: string;
  setSaveError: (v: string) => void;
  allergyState: AllergyState;
  modalFlags: ModalFlags;
  resetEditState: () => void;
}

function buildEditState(booking: any, dogData: any): EditData {
  return {
    service: booking.service || "",
    pickupBy: booking.pickupBy || booking._pickupById || "",
    payment: booking.payment || "Unpaid",
    groomNotes: dogData?.groomNotes || "",
    alerts: dogData?.alerts ? [...dogData.alerts] : [],
    addons: booking.addons ? [...booking.addons] : [],
    date: booking._bookingDate || "",
    slot: booking.slot || "",
    customPrice: dogData?.customPrice,
  };
}

export function useBookingEditState(booking: any, dogData: any): UseBookingEditStateReturn {
  const [isEditing, setIsEditing] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [showContact, setShowContact] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);

  const [editData, setEditData] = useState<EditData>(() => buildEditState(booking, dogData));

  // Allergy state derived from alerts
  const currentAlerts = dogData?.alerts || [];
  const allergyEntry = currentAlerts.find(
    (a: string) => typeof a === "string" && a.startsWith("allergy:"),
  );
  const [allergyInput, setAllergyInput] = useState(
    allergyEntry ? allergyEntry.replace("allergy:", "").trim() : "",
  );
  const [hasAllergy, setHasAllergy] = useState(!!allergyEntry);

  const resetEditState = useCallback(() => {
    const fresh = buildEditState(booking, dogData);
    setEditData(fresh);
    setIsEditing(false);
    setSaveError("");
    const entry = (dogData?.alerts || []).find(
      (a: string) => typeof a === "string" && a.startsWith("allergy:"),
    );
    setAllergyInput(entry ? entry.replace("allergy:", "").trim() : "");
    setHasAllergy(!!entry);
  }, [booking, dogData]);

  return {
    editData,
    setEditData,
    isEditing,
    setIsEditing,
    saving,
    setSaving,
    saveError,
    setSaveError,
    allergyState: { hasAllergy, setHasAllergy, allergyInput, setAllergyInput },
    modalFlags: {
      showDatePicker, setShowDatePicker,
      showExitConfirm, setShowExitConfirm,
      showContact, setShowContact,
    },
    resetEditState,
  };
}
```

- [ ] **Step 2: Wire hook into BookingDetailModal**

In `src/components/modals/BookingDetailModal.jsx`, replace the state declarations (lines 86–91), `buildEditState` usage, allergy state (lines 123–132), and `resetEditState` (lines 216–226) with:

```jsx
import { useBookingEditState } from "../../hooks/useBookingEditState.ts";

// Replace lines 86–91 and 119–132 and 216–226 with:
const {
  editData, setEditData,
  isEditing, setIsEditing,
  saving, setSaving,
  saveError, setSaveError,
  allergyState: { hasAllergy, setHasAllergy, allergyInput, setAllergyInput },
  modalFlags: { showDatePicker, setShowDatePicker, showExitConfirm, setShowExitConfirm, showContact, setShowContact },
  resetEditState,
} = useBookingEditState(booking, dogData);
```

Remove the now-unused `buildEditState` function import/definition (lines 45–67) and the `resetEditState` function (lines 216–226).

- [ ] **Step 3: Verify build**

Run: `npm run build 2>&1 | tail -5`

Expected: Build succeeds with no errors.

- [ ] **Step 4: Verify types**

Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"` 

Expected: Same count as before (no new type errors).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useBookingEditState.ts src/components/modals/BookingDetailModal.jsx
git commit -m "refactor: extract useBookingEditState hook from BookingDetailModal"
```

---

## Task 4: Extract useSlotAvailability Hook

**Files:**
- Create: `src/hooks/useSlotAvailability.ts`
- Modify: `src/components/modals/BookingDetailModal.jsx`

Extracts the `availableSlots` (lines 160–173) and `currentSlotStillValid` (lines 175–193) useMemo blocks.

- [ ] **Step 1: Create the hook**

```ts
// src/hooks/useSlotAvailability.ts
import { useMemo } from "react";
import { canBookSlot } from "../engine/capacity.js";
import { SALON_SLOTS } from "../constants/index.js";
import type { DogSize } from "../types/index.ts";

interface SlotAvailabilityInput {
  editDateStr: string;
  editSettings: { isOpen: boolean; overrides: Record<string, any>; extraSlots: string[] } | undefined;
  editDayOpen: boolean;
  otherBookings: any[];
  bookingSize: DogSize;
  bookingSlot: string;
  isEditing: boolean;
}

interface SlotAvailabilityResult {
  availableSlots: string[];
  editActiveSlots: string[];
  currentSlotStillValid: boolean;
}

export function useSlotAvailability({
  editDateStr,
  editSettings,
  editDayOpen,
  otherBookings,
  bookingSize,
  bookingSlot,
  isEditing,
}: SlotAvailabilityInput): SlotAvailabilityResult {
  const editActiveSlots = useMemo(
    () => [...SALON_SLOTS, ...(editSettings?.extraSlots || [])],
    [editSettings?.extraSlots],
  );

  const availableSlots = useMemo(() => {
    if (!isEditing || !editDayOpen) return [];
    return editActiveSlots.filter((slot) => {
      const result = canBookSlot(
        otherBookings,
        slot,
        bookingSize,
        editSettings?.overrides?.[editDateStr] || {},
      );
      return result.allowed;
    });
  }, [isEditing, editDayOpen, editActiveSlots, otherBookings, bookingSize, editSettings, editDateStr]);

  const currentSlotStillValid = useMemo(() => {
    if (!isEditing) return true;
    if (!bookingSlot) return false;
    return availableSlots.includes(bookingSlot);
  }, [isEditing, bookingSlot, availableSlots]);

  return { availableSlots, editActiveSlots, currentSlotStillValid };
}
```

- [ ] **Step 2: Wire hook into BookingDetailModal**

In `src/components/modals/BookingDetailModal.jsx`, replace the `availableSlots` and `currentSlotStillValid` useMemo blocks and the `editActiveSlots` computation with:

```jsx
import { useSlotAvailability } from "../../hooks/useSlotAvailability.ts";

// Compute derived date values (keep these in BookingDetailModal):
const editDateStr = isEditing ? editData.date : booking._bookingDate;
const editSettings = daySettings[editDateStr];
const editDayOpen = editSettings?.isOpen ?? dayOpenState[editDateStr] ?? true;
const otherBookings = (bookingsByDate[editDateStr] || []).filter((b) => b.id !== booking.id);

// Replace the availableSlots, editActiveSlots, and currentSlotStillValid blocks:
const { availableSlots, editActiveSlots, currentSlotStillValid } = useSlotAvailability({
  editDateStr,
  editSettings,
  editDayOpen,
  otherBookings,
  bookingSize: booking.size,
  bookingSlot: editData.slot,
  isEditing,
});
```

- [ ] **Step 3: Verify build**

Run: `npm run build 2>&1 | tail -5`

Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useSlotAvailability.ts src/components/modals/BookingDetailModal.jsx
git commit -m "refactor: extract useSlotAvailability hook from BookingDetailModal"
```

---

## Task 5: Extract useBookingSave Hook

**Files:**
- Create: `src/hooks/useBookingSave.ts`
- Modify: `src/components/modals/BookingDetailModal.jsx`

Extracts the 97-line `handleSave` function (lines 272–368).

- [ ] **Step 1: Create the hook**

```ts
// src/hooks/useBookingSave.ts
import { useCallback } from "react";
import { normalizeServiceForSize, getNumericPrice, getDogByIdOrName } from "../engine/bookingRules.js";
import { canBookSlot } from "../engine/capacity.js";

interface UseBookingSaveInput {
  booking: any;
  editData: any;
  dogData: any;
  dogs: any[];
  allergyState: {
    hasAllergy: boolean;
    allergyInput: string;
  };
  editDayOpen: boolean;
  editSettings: any;
  editDateStr: string;
  otherBookings: any[];
  availableSlots: string[];
  onUpdate: (id: string, patch: any) => Promise<void> | void;
  onUpdateDog: (id: string, patch: any) => Promise<void> | void;
  setSaving: (v: boolean) => void;
  setSaveError: (v: string) => void;
  resetEditState: () => void;
}

export function useBookingSave({
  booking,
  editData,
  dogData,
  dogs,
  allergyState,
  editDayOpen,
  editSettings,
  editDateStr,
  otherBookings,
  availableSlots,
  onUpdate,
  onUpdateDog,
  setSaving,
  setSaveError,
  resetEditState,
}: UseBookingSaveInput) {
  const save = useCallback(async () => {
    setSaveError("");

    // --- Validations ---
    if (!editData.slot) {
      setSaveError("Please select a drop-off time.");
      return;
    }
    if (!editDayOpen) {
      setSaveError("That date is closed. Pick another date first.");
      return;
    }

    const normalisedService = normalizeServiceForSize(editData.service, booking.size);

    // Validate slot capacity
    if (!availableSlots.includes(editData.slot)) {
      const result = canBookSlot(
        otherBookings,
        editData.slot,
        booking.size,
        editSettings?.overrides?.[editDateStr] || {},
      );
      setSaveError(result.reason || "That slot is no longer available.");
      return;
    }

    setSaving(true);

    try {
      // --- Update dog data if changed ---
      if (dogData) {
        const updatedAlerts = [...(editData.alerts || [])].filter(
          (a: string) => !a.startsWith("allergy:"),
        );
        if (allergyState.hasAllergy && allergyState.allergyInput.trim()) {
          updatedAlerts.push(`allergy:${allergyState.allergyInput.trim()}`);
        }

        const dogPatch: Record<string, any> = {};
        if (JSON.stringify(updatedAlerts) !== JSON.stringify(dogData.alerts)) {
          dogPatch.alerts = updatedAlerts;
        }
        if (editData.groomNotes !== dogData.groomNotes) {
          dogPatch.groom_notes = editData.groomNotes;
        }
        if (editData.customPrice !== dogData.customPrice) {
          dogPatch.custom_price = editData.customPrice ?? null;
        }

        if (Object.keys(dogPatch).length > 0) {
          const dogId = dogData.id || getDogByIdOrName(dogs, booking.dogName)?.id;
          if (dogId) await onUpdateDog(dogId, dogPatch);
        }
      }

      // --- Build booking patch ---
      const dateChanged = editData.date !== booking._bookingDate;
      const slotChanged = editData.slot !== booking.slot;

      let notes = booking.notes || "";
      if (dateChanged || slotChanged) {
        const stamp = `[Moved ${new Date().toLocaleDateString("en-GB")}]`;
        notes = notes ? `${notes}\n${stamp}` : stamp;
      }

      const bookingPatch: Record<string, any> = {
        service: normalisedService,
        pickup_by: editData.pickupBy || null,
        payment: editData.payment,
        addons: editData.addons,
        slot: editData.slot,
        booking_date: editData.date,
        notes,
      };

      await onUpdate(booking.id, bookingPatch);
      resetEditState();
    } catch (err: any) {
      setSaveError(err.message || "Save failed.");
    } finally {
      setSaving(false);
    }
  }, [
    booking, editData, dogData, dogs, allergyState,
    editDayOpen, editSettings, editDateStr, otherBookings, availableSlots,
    onUpdate, onUpdateDog, setSaving, setSaveError, resetEditState,
  ]);

  return { save };
}
```

- [ ] **Step 2: Wire hook into BookingDetailModal**

In `src/components/modals/BookingDetailModal.jsx`, replace the `handleSave` function with:

```jsx
import { useBookingSave } from "../../hooks/useBookingSave.ts";

const { save: handleSave } = useBookingSave({
  booking, editData, dogData, dogs,
  allergyState: { hasAllergy, allergyInput },
  editDayOpen, editSettings, editDateStr, otherBookings, availableSlots,
  onUpdate, onUpdateDog: onUpdateDog,
  setSaving, setSaveError, resetEditState,
});
```

Remove the old `handleSave` function (lines 272–368).

- [ ] **Step 3: Verify build**

Run: `npm run build 2>&1 | tail -5`

Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useBookingSave.ts src/components/modals/BookingDetailModal.jsx
git commit -m "refactor: extract useBookingSave hook from BookingDetailModal"
```

---

## Task 6: Extract SlotSelector Component

**Files:**
- Create: `src/components/modals/booking-detail/SlotSelector.jsx`
- Modify: `src/components/modals/BookingDetailModal.jsx`

Extracts the slot grid JSX (approximately lines 542–623 of the original BookingDetailModal).

- [ ] **Step 1: Create SlotSelector**

```jsx
// src/components/modals/booking-detail/SlotSelector.jsx
import { getSeatStatesForSlot } from "../../../engine/capacity.js";

const SIZE_THEME = {
  small: { bg: "bg-emerald-50", border: "border-emerald-300", text: "text-emerald-700", accent: "bg-emerald-500" },
  medium: { bg: "bg-sky-50", border: "border-sky-300", text: "text-sky-700", accent: "bg-sky-500" },
  large: { bg: "bg-amber-50", border: "border-amber-300", text: "text-amber-700", accent: "bg-amber-500" },
};
const SIZE_FALLBACK = { bg: "bg-slate-50", border: "border-slate-300", text: "text-slate-700", accent: "bg-slate-500" };

export function SlotSelector({
  editData,
  setEditData,
  editActiveSlots,
  availableSlots,
  currentSlotStillValid,
  otherBookings,
  editSettings,
  editDateStr,
  booking,
  isEditing,
}) {
  const sizeTheme = SIZE_THEME[booking.size] || SIZE_FALLBACK;

  if (!isEditing) {
    return (
      <span className="text-[13px] font-semibold text-slate-800">
        {booking.slot || "—"}
      </span>
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5 mt-1">
      {editActiveSlots.map((slot) => {
        const isSelected = editData.slot === slot;
        const isAvailable = availableSlots.includes(slot);
        const seats = getSeatStatesForSlot(
          otherBookings,
          slot,
          editSettings?.overrides?.[editDateStr] || {},
        );
        const usedCount = seats.filter(
          (s) => s.type === "booking" || s.type === "reserved",
        ).length;
        const totalCount = seats.length;

        let btnClass =
          "px-2.5 py-1 rounded-lg text-[12px] font-bold border transition-all ";
        if (isSelected) {
          btnClass += `${sizeTheme.accent} text-white border-transparent shadow-sm`;
        } else if (isAvailable) {
          btnClass += `${sizeTheme.bg} ${sizeTheme.border} ${sizeTheme.text} hover:shadow-sm`;
        } else {
          btnClass += "bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed";
        }

        return (
          <button
            key={slot}
            type="button"
            disabled={!isAvailable && !isSelected}
            className={btnClass}
            onClick={() => setEditData((prev) => ({ ...prev, slot }))}
            aria-label={`${slot} — ${usedCount} of ${totalCount} seats used${isSelected ? ", selected" : ""}`}
            aria-pressed={isSelected}
          >
            {slot}
            <span className="ml-1 text-[10px] opacity-70">
              {usedCount}/{totalCount}
            </span>
          </button>
        );
      })}
      {!currentSlotStillValid && editData.slot && (
        <p className="text-[11px] text-brand-coral mt-1 w-full">
          Current slot is no longer available — please pick another.
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Replace slot grid JSX in BookingDetailModal**

In BookingDetailModal, find the slot grid JSX section and replace it with:

```jsx
import { SlotSelector } from "./booking-detail/SlotSelector.jsx";

// In the JSX, replace the inline slot grid with:
<SlotSelector
  editData={editData}
  setEditData={setEditData}
  editActiveSlots={editActiveSlots}
  availableSlots={availableSlots}
  currentSlotStillValid={currentSlotStillValid}
  otherBookings={otherBookings}
  editSettings={editSettings}
  editDateStr={editDateStr}
  booking={booking}
  isEditing={isEditing}
/>
```

- [ ] **Step 3: Verify build**

Run: `npm run build 2>&1 | tail -5`

Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/components/modals/booking-detail/SlotSelector.jsx src/components/modals/BookingDetailModal.jsx
git commit -m "refactor: extract SlotSelector component from BookingDetailModal"
```

---

## Task 7: Extract LogisticsSection Component

**Files:**
- Create: `src/components/modals/booking-detail/LogisticsSection.jsx`
- Modify: `src/components/modals/BookingDetailModal.jsx`

Extracts the logistics JSX block (lines ~501–723): grooming notes, date, slot selector, service, add-ons, pick-up human.

- [ ] **Step 1: Create LogisticsSection**

Create `src/components/modals/booking-detail/LogisticsSection.jsx`. This component receives all the logistics-related props and renders the DetailRow blocks for:

1. Grooming Notes — textarea with `pre-wrap` in view mode
2. Date — display with edit button to open date picker
3. Drop-off Time — delegates to `<SlotSelector />`
4. Service — dropdown filtered by `allowedServices`
5. Add-ons — checkbox list (Flea Bath, Sensitive Shampoo, Anal Glands)
6. Pick-up Human — dropdown from `pickupOptions`

```jsx
// src/components/modals/booking-detail/LogisticsSection.jsx
import { SERVICES } from "../../../constants/index.js";
import { getServicePriceLabel } from "../../../engine/bookingRules.js";
import { formatFullDate } from "../../../engine/utils.js";
import { DetailRow, LogisticsLabel, MODAL_INPUT_CLS } from "./shared.jsx";
import { SlotSelector } from "./SlotSelector.jsx";

const AVAILABLE_ADDONS = ["Flea Bath", "Sensitive Shampoo", "Anal Glands"];

export function LogisticsSection({
  booking,
  editData,
  setEditData,
  isEditing,
  allowedServices,
  editActiveSlots,
  availableSlots,
  currentSlotStillValid,
  otherBookings,
  editSettings,
  editDateStr,
  pickupOptions,
  selectedPickupLabel,
  onOpenDatePicker,
  config,
}) {
  return (
    <>
      {/* Grooming Notes */}
      <DetailRow
        label={<LogisticsLabel text="Grooming Notes" />}
        value={
          <span className="whitespace-pre-wrap text-[13px] text-slate-700">
            {booking.groomNotes || editData.groomNotes || "—"}
          </span>
        }
        isEditing={isEditing}
        verticalEdit
        editNode={
          <textarea
            className={`${MODAL_INPUT_CLS} min-h-[60px] resize-y`}
            value={editData.groomNotes}
            onChange={(e) =>
              setEditData((prev) => ({ ...prev, groomNotes: e.target.value }))
            }
          />
        }
      />

      {/* Date */}
      <DetailRow
        label={<LogisticsLabel text="Date" />}
        value={formatFullDate(booking._bookingDate)}
        isEditing={isEditing}
        editNode={
          <button
            type="button"
            className="text-[13px] font-semibold text-brand-blue underline"
            onClick={onOpenDatePicker}
          >
            {formatFullDate(editData.date)}
          </button>
        }
      />

      {/* Drop-off Time */}
      <DetailRow
        label={<LogisticsLabel text="Drop-off Time" />}
        value={booking.slot || "—"}
        isEditing={isEditing}
        verticalEdit
        editNode={
          <SlotSelector
            editData={editData}
            setEditData={setEditData}
            editActiveSlots={editActiveSlots}
            availableSlots={availableSlots}
            currentSlotStillValid={currentSlotStillValid}
            otherBookings={otherBookings}
            editSettings={editSettings}
            editDateStr={editDateStr}
            booking={booking}
            isEditing={isEditing}
          />
        }
      />

      {/* Service */}
      <DetailRow
        label={<LogisticsLabel text="Service" />}
        value={
          SERVICES.find((s) => s.id === booking.service)?.name || booking.service
        }
        isEditing={isEditing}
        editNode={
          <select
            className={MODAL_INPUT_CLS}
            value={editData.service}
            onChange={(e) =>
              setEditData((prev) => ({ ...prev, service: e.target.value }))
            }
          >
            {allowedServices.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} — {getServicePriceLabel(s.id, booking.size, config)}
              </option>
            ))}
          </select>
        }
      />

      {/* Add-ons */}
      <DetailRow
        label={<LogisticsLabel text="Add-ons" />}
        value={
          editData.addons?.length > 0
            ? editData.addons.join(", ")
            : "None"
        }
        isEditing={isEditing}
        verticalEdit
        editNode={
          <div className="flex flex-col gap-1.5">
            {AVAILABLE_ADDONS.map((addon) => {
              const checked = editData.addons?.includes(addon);
              return (
                <label key={addon} className="flex items-center gap-2 text-[13px] text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() =>
                      setEditData((prev) => ({
                        ...prev,
                        addons: checked
                          ? prev.addons.filter((a) => a !== addon)
                          : [...prev.addons, addon],
                      }))
                    }
                    className="rounded"
                  />
                  {addon}
                </label>
              );
            })}
          </div>
        }
      />

      {/* Pick-up Human */}
      <DetailRow
        label={<LogisticsLabel text="Pick-up" />}
        value={selectedPickupLabel}
        isEditing={isEditing}
        editNode={
          <select
            className={MODAL_INPUT_CLS}
            value={editData.pickupBy}
            onChange={(e) =>
              setEditData((prev) => ({ ...prev, pickupBy: e.target.value }))
            }
          >
            <option value="">Same as owner</option>
            {pickupOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        }
      />
    </>
  );
}
```

- [ ] **Step 2: Replace logistics JSX in BookingDetailModal**

In BookingDetailModal, replace the logistics JSX section (~lines 501–723) with:

```jsx
import { LogisticsSection } from "./booking-detail/LogisticsSection.jsx";

<LogisticsSection
  booking={booking}
  editData={editData}
  setEditData={setEditData}
  isEditing={isEditing}
  allowedServices={allowedServices}
  editActiveSlots={editActiveSlots}
  availableSlots={availableSlots}
  currentSlotStillValid={currentSlotStillValid}
  otherBookings={otherBookings}
  editSettings={editSettings}
  editDateStr={editDateStr}
  pickupOptions={pickupOptions}
  selectedPickupLabel={selectedPickupLabel}
  onOpenDatePicker={() => setShowDatePicker(true)}
  config={config}
/>
```

Note: `pickupOptions` and `selectedPickupLabel` computations (lines 370–387) remain in BookingDetailModal as they're used by multiple sections.

- [ ] **Step 3: Verify build**

Run: `npm run build 2>&1 | tail -5`

Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/components/modals/booking-detail/LogisticsSection.jsx src/components/modals/BookingDetailModal.jsx
git commit -m "refactor: extract LogisticsSection component from BookingDetailModal"
```

---

## Task 8: Extract FinanceSection Component

**Files:**
- Create: `src/components/modals/booking-detail/FinanceSection.jsx`
- Modify: `src/components/modals/BookingDetailModal.jsx`

Extracts the finance JSX block (~lines 726–797): base price, payment status, amount due.

- [ ] **Step 1: Create FinanceSection**

```jsx
// src/components/modals/booking-detail/FinanceSection.jsx
import { DetailRow, FinanceLabel, MODAL_INPUT_CLS } from "./shared.jsx";

export function FinanceSection({
  booking,
  editData,
  setEditData,
  isEditing,
  activePrice,
  amountDue,
  primaryHuman,
}) {
  return (
    <>
      {/* Base Price */}
      <DetailRow
        label={<FinanceLabel text="Base Price" />}
        value={`£${activePrice}`}
        isEditing={isEditing}
        editNode={
          <div className="flex items-center gap-1">
            <span className="text-[13px] text-slate-500">£</span>
            <input
              type="number"
              className={`${MODAL_INPUT_CLS} w-20`}
              value={editData.customPrice ?? activePrice}
              onChange={(e) =>
                setEditData((prev) => ({
                  ...prev,
                  customPrice: e.target.value === "" ? undefined : Number(e.target.value),
                }))
              }
            />
          </div>
        }
      />

      {/* Payment Status */}
      <DetailRow
        label={<FinanceLabel text="Payment" />}
        value={editData.payment || booking.payment || "Unpaid"}
        isEditing={isEditing}
        editNode={
          <select
            className={MODAL_INPUT_CLS}
            value={editData.payment}
            onChange={(e) =>
              setEditData((prev) => ({ ...prev, payment: e.target.value }))
            }
          >
            <option value="Unpaid">Unpaid</option>
            <option value="Deposit">Deposit</option>
            <option value="Paid">Paid</option>
          </select>
        }
      />

      {/* Amount Due */}
      <DetailRow
        label={<FinanceLabel text="Amount Due" />}
        value={
          <span
            className={`text-[14px] font-extrabold ${
              amountDue <= 0 ? "text-emerald-600" : "text-brand-coral"
            }`}
          >
            £{amountDue}
          </span>
        }
        isEditing={false}
      />

      {/* History Flag */}
      {primaryHuman?.historyFlag && (
        <div className="py-2 px-3 mt-1 rounded-lg bg-amber-50 border border-amber-200 text-[12px] text-amber-800">
          ⚠️ {primaryHuman.historyFlag}
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: Replace finance JSX in BookingDetailModal**

Replace the finance section (~lines 726–797) with:

```jsx
import { FinanceSection } from "./booking-detail/FinanceSection.jsx";

<FinanceSection
  booking={booking}
  editData={editData}
  setEditData={setEditData}
  isEditing={isEditing}
  activePrice={activePrice}
  amountDue={amountDue}
  primaryHuman={primaryHuman}
/>
```

The `amountDue` calculation (lines 211–214) remains in BookingDetailModal.

- [ ] **Step 3: Verify build**

Run: `npm run build 2>&1 | tail -5`

Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/components/modals/booking-detail/FinanceSection.jsx src/components/modals/BookingDetailModal.jsx
git commit -m "refactor: extract FinanceSection component from BookingDetailModal"
```

---

## Task 9: Apply AccessibleModal to BookingDetailModal

**Files:**
- Modify: `src/components/modals/BookingDetailModal.jsx`

Replace the raw backdrop `<div>` with `<AccessibleModal>`.

- [ ] **Step 1: Replace backdrop pattern**

In BookingDetailModal, the current outer JSX (lines ~390–397) looks like:

```jsx
<div onClick={handleCloseAttempt} className="fixed inset-0 bg-black/40 flex items-center justify-center z-[1000]">
  <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-[20px] w-[min(420px,95vw)] max-h-[90vh] overflow-auto ...">
```

Replace with:

```jsx
import { AccessibleModal } from "../shared/AccessibleModal.tsx";

<AccessibleModal
  onClose={handleCloseAttempt}
  titleId="booking-detail-title"
  className="bg-white rounded-[20px] w-[min(420px,95vw)] max-h-[90vh] overflow-auto shadow-[0_12px_48px_rgba(0,0,0,0.2)]"
  backdropClass="bg-black/40"
  dismissOnEscape={!isEditing}
>
  {/* ... existing modal content ... */}
</AccessibleModal>
```

Add `id="booking-detail-title"` to the BookingHeader's title element for `aria-labelledby`.

When `isEditing`, Escape triggers the exit confirm dialog instead of closing directly. Handle this by setting `dismissOnEscape={false}` when editing and letting the existing `handleCloseAttempt` logic handle it through the backdrop click.

- [ ] **Step 2: Remove old backdrop close logic**

Remove the `handleCloseAttempt` function's Escape handling if it existed inline. The AccessibleModal now handles backdrop click → `onClose` → `handleCloseAttempt`.

Update `handleCloseAttempt` to also handle Escape when editing:

```jsx
const handleCloseAttempt = useCallback(() => {
  if (isEditing) {
    setShowExitConfirm(true);
  } else {
    onClose();
  }
}, [isEditing, onClose]);
```

Add an Escape handler specifically for the editing case:

```jsx
useEffect(() => {
  if (!isEditing) return;
  const handler = (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      setShowExitConfirm(true);
    }
  };
  document.addEventListener("keydown", handler);
  return () => document.removeEventListener("keydown", handler);
}, [isEditing]);
```

- [ ] **Step 3: Remove closing `</div></div>` wrapper**

Replace the closing `</div></div>` at the end of the modal with `</AccessibleModal>`.

- [ ] **Step 4: Verify build**

Run: `npm run build 2>&1 | tail -5`

Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/components/modals/BookingDetailModal.jsx
git commit -m "refactor: apply AccessibleModal to BookingDetailModal"
```

---

## Task 10: Migrate All Other Modals to AccessibleModal

**Files:**
- Modify: All 9 remaining modal files

Each modal follows the same pattern. Replace the outer `<div onClick={onClose} className="fixed inset-0 bg-black/XX ...">` backdrop with `<AccessibleModal>`, and remove the inner `<div onClick={(e) => e.stopPropagation()}>` wrapper (AccessibleModal handles both).

- [ ] **Step 1: Migrate NewBookingModal**

In `src/components/modals/NewBookingModal.jsx`:

```jsx
import { AccessibleModal } from "../shared/AccessibleModal.tsx";

// Replace outer divs:
<AccessibleModal
  onClose={onClose}
  titleId="new-booking-title"
  className="bg-white rounded-[20px] w-[min(440px,95vw)] max-h-[92vh] flex flex-col shadow-[0_12px_48px_rgba(0,0,0,0.2)]"
  backdropClass="bg-black/40"
>
  {/* Add id="new-booking-title" to the h2/title element */}
  {/* ... existing content (remove stopPropagation div) ... */}
</AccessibleModal>
```

- [ ] **Step 2: Migrate AddHumanModal and AddDogModal**

In `src/components/modals/AddHumanModal.jsx`:

```jsx
<AccessibleModal
  onClose={onClose}
  titleId="add-human-title"
  className="bg-white rounded-2xl w-[min(400px,95vw)] max-h-[90vh] overflow-auto shadow-[0_8px_32px_rgba(0,0,0,0.18)]"
>
```

In `src/components/modals/AddDogModal.jsx`:

```jsx
<AccessibleModal
  onClose={onClose}
  titleId="add-dog-title"
  className="bg-white rounded-2xl w-[min(400px,95vw)] max-h-[90vh] overflow-auto shadow-[0_8px_32px_rgba(0,0,0,0.18)]"
>
```

- [ ] **Step 3: Migrate ChainBookingModal and ExitConfirmDialog**

In `src/components/modals/ChainBookingModal.jsx`:

```jsx
<AccessibleModal
  onClose={onClose}
  titleId="chain-booking-title"
  className="bg-white rounded-2xl w-[min(460px,95vw)] max-h-[85vh] overflow-auto px-7 py-6 shadow-[0_8px_32px_rgba(0,0,0,0.18)]"
>
```

In `src/components/modals/booking-detail/ExitConfirmDialog.jsx`:

```jsx
<AccessibleModal
  onClose={onKeepEditing}
  titleId="exit-confirm-title"
  className="bg-white rounded-2xl p-6 w-[min(300px,90vw)] shadow-[0_8px_32px_rgba(0,0,0,0.2)]"
  backdropClass="bg-black/50"
  zIndex={1100}
>
```

- [ ] **Step 4: Migrate DogCardModal and HumanCardModal**

In `src/components/modals/DogCardModal.jsx`:

```jsx
<AccessibleModal
  onClose={onClose}
  titleId="dog-card-title"
  className="bg-white rounded-2xl w-[min(360px,95vw)] max-h-[85vh] overflow-auto shadow-[0_8px_32px_rgba(0,0,0,0.18)]"
>
```

In `src/components/modals/HumanCardModal.jsx`:

```jsx
<AccessibleModal
  onClose={onClose}
  titleId="human-card-title"
  className="bg-white rounded-2xl w-[min(380px,95vw)] max-h-[85vh] overflow-auto shadow-[0_8px_32px_rgba(0,0,0,0.18)]"
>
```

- [ ] **Step 5: Migrate ContactPopup and DatePickerModal**

In `src/components/modals/ContactPopup.jsx`:

```jsx
<AccessibleModal
  onClose={onClose}
  titleId="contact-title"
  className="bg-white rounded-[14px] w-[min(280px,90vw)] overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.18)]"
  backdropClass="bg-black/25"
  zIndex={1100}
>
```

In `src/components/modals/DatePickerModal.jsx`:

```jsx
<AccessibleModal
  onClose={onClose}
  titleId="date-picker-title"
  className="bg-white rounded-2xl w-[min(320px,90vw)] overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.18)]"
  zIndex={1200}
>
```

- [ ] **Step 6: Add title IDs to each modal**

For each modal, add `id="{modal}-title"` to its heading element. For example in AddHumanModal, find the `<h2>` or title text and add `id="add-human-title"`.

- [ ] **Step 7: Verify build**

Run: `npm run build 2>&1 | tail -5`

Expected: Build succeeds.

- [ ] **Step 8: Commit**

```bash
git add src/components/modals/
git commit -m "refactor: migrate all modals to AccessibleModal wrapper"
```

---

## Task 11: Semantic HTML Pass — App Shells

**Files:**
- Create: `src/components/shared/SkipNavLink.tsx`
- Modify: `src/App.jsx`
- Modify: `src/CustomerApp.jsx`
- Modify: `src/components/layout/AppToolbar.jsx`

- [ ] **Step 1: Create SkipNavLink**

```tsx
// src/components/shared/SkipNavLink.tsx
export function SkipNavLink() {
  return (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[9999] focus:bg-white focus:px-4 focus:py-2 focus:rounded-lg focus:shadow-lg focus:text-brand-blue focus:font-bold focus:text-sm"
    >
      Skip to main content
    </a>
  );
}
```

- [ ] **Step 2: Add landmarks and skip nav to App.jsx**

In `src/App.jsx`:

```jsx
import { SkipNavLink } from "./components/shared/SkipNavLink.tsx";
import { LiveAnnouncerProvider } from "./components/shared/LiveAnnouncer.tsx";

// Wrap the return in LiveAnnouncerProvider and add SkipNavLink + landmarks:
return (
  <LiveAnnouncerProvider>
    <SkipNavLink />
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-5 font-sans text-slate-800 pb-20 md:pb-5">
      {dataError && <ErrorBanner message={dataError} />}

      <AppToolbar ... />

      <SalonProvider ...>
        <main id="main-content">
          <ErrorBoundary>
          <Suspense fallback={<LoadingSpinner />}>
            {/* ... view switching ... */}
          </Suspense>
          </ErrorBoundary>
        </main>

        {/* modals rendered outside main */}
      </SalonProvider>
    </div>
  </LiveAnnouncerProvider>
);
```

- [ ] **Step 3: Add landmarks to AppToolbar**

In `src/components/layout/AppToolbar.jsx`:

Wrap the desktop nav tabs in `<nav aria-label="Main navigation">`:

```jsx
<nav aria-label="Main navigation" className="hidden md:flex gap-0.5 bg-slate-100 p-1 rounded-lg shrink min-w-0">
  {NAV_ITEMS.map(...)}
</nav>
```

Wrap the mobile bottom tab bar — it already uses `<nav>`, add aria-label:

```jsx
<nav aria-label="Main navigation" className="md:hidden fixed bottom-0 ...">
```

- [ ] **Step 4: Add skip nav and landmarks to CustomerApp**

In `src/CustomerApp.jsx`:

```jsx
import { SkipNavLink } from "./components/shared/SkipNavLink.tsx";
import { LiveAnnouncerProvider } from "./components/shared/LiveAnnouncer.tsx";

// Wrap authenticated routes return:
return (
  <LiveAnnouncerProvider>
    <SkipNavLink />
    <main id="main-content">
      <Routes>
        {/* ... existing routes ... */}
      </Routes>
    </main>
  </LiveAnnouncerProvider>
);
```

- [ ] **Step 5: Verify build**

Run: `npm run build 2>&1 | tail -5`

Expected: Build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/components/shared/SkipNavLink.tsx src/App.jsx src/CustomerApp.jsx src/components/layout/AppToolbar.jsx
git commit -m "feat: add skip navigation, landmark regions, and LiveAnnouncer"
```

---

## Task 12: Semantic HTML Pass — Form Labels and Icon Buttons

**Files:**
- Modify: `src/components/BookingCard.jsx`
- Modify: `src/components/layout/WeekCalendarView.jsx`
- Modify: various modal sub-components as needed

- [ ] **Step 1: Add aria-labels to BookingCard buttons**

In `src/components/BookingCard.jsx`, find the inline status advance button and add:

```jsx
<button
  onClick={handleAdvanceStatus}
  aria-label={`Advance to ${nextStatus.label}`}
  title={`Advance to: ${nextStatus.label}`}
  // ... existing classes
>
```

Find the No Show button and add:

```jsx
<button
  onClick={handleNoShow}
  aria-label="Mark as No Show"
  // ... existing classes
>
```

Find close/contact/message icon buttons and add appropriate `aria-label` attributes.

- [ ] **Step 2: Add aria-current to today's day tab**

In `src/components/layout/WeekCalendarView.jsx` (or `CalendarTabs.jsx` / `DayTab.jsx` — wherever day tabs are rendered), find where `todayStr === dateStr` is checked and add:

```jsx
<button
  aria-current={todayStr === dateStr ? "date" : undefined}
  // ... existing props
>
```

- [ ] **Step 3: Add form labels to search inputs**

Find search inputs in DogsView and HumansView. Ensure they have associated labels:

```jsx
<div role="search">
  <label htmlFor="dog-search" className="sr-only">Search dogs</label>
  <input id="dog-search" ... />
</div>
```

Similarly for HumansView with `id="human-search"`.

- [ ] **Step 4: Add aria-labels to modal close buttons**

In each modal's close button (the × character), add:

```jsx
<button onClick={onClose} aria-label="Close">×</button>
```

Check: BookingHeader.jsx, DogCardModal, HumanCardModal, AddHumanModal, AddDogModal, ContactPopup, NewBookingModal.

- [ ] **Step 5: Verify build**

Run: `npm run build 2>&1 | tail -5`

Expected: Build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/components/
git commit -m "feat: add aria-labels, form labels, and aria-current for accessibility"
```

---

## Task 13: Create useKeyboardShortcuts Hook

**Files:**
- Create: `src/hooks/useKeyboardShortcuts.ts`

- [ ] **Step 1: Create the hook**

```ts
// src/hooks/useKeyboardShortcuts.ts
import { useEffect, useRef } from "react";

export interface Shortcut {
  handler: () => void;
  description: string;
}

export type ShortcutMap = Record<string, Shortcut>;

interface UseKeyboardShortcutsOptions {
  /** Set false to disable all shortcuts (e.g. when modal is open) */
  enabled?: boolean;
}

/**
 * Normalise a KeyboardEvent into a combo string like "Shift+ArrowLeft" or "Meta+s".
 * Uses "Meta+" for both Cmd (Mac) and Ctrl (Windows).
 */
function eventToCombo(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.metaKey || e.ctrlKey) parts.push("Meta");
  if (e.shiftKey) parts.push("Shift");
  if (e.altKey) parts.push("Alt");

  // Normalise key: use lowercase for single characters, original for named keys
  let key = e.key;
  if (key.length === 1) key = key.toLowerCase();

  // Avoid duplicating modifier names
  if (!["Meta", "Shift", "Alt", "Control"].includes(key)) {
    parts.push(key);
  }

  return parts.join("+");
}

function isInputElement(el: Element): boolean {
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if ((el as HTMLElement).isContentEditable) return true;
  return false;
}

// Keys that work even when focused on an input
const ALWAYS_ACTIVE = new Set(["Escape", "Meta+s"]);

export function useKeyboardShortcuts(
  shortcuts: ShortcutMap,
  options: UseKeyboardShortcutsOptions = {},
) {
  const { enabled = true } = options;
  // Use ref to avoid re-attaching listener on every shortcut map change
  const shortcutsRef = useRef(shortcuts);
  shortcutsRef.current = shortcuts;

  useEffect(() => {
    if (!enabled) return;

    const handler = (e: KeyboardEvent) => {
      const combo = eventToCombo(e);
      const shortcut = shortcutsRef.current[combo];
      if (!shortcut) return;

      // Suppress in inputs unless it's an always-active key
      if (isInputElement(e.target as Element) && !ALWAYS_ACTIVE.has(combo)) {
        return;
      }

      e.preventDefault();
      shortcut.handler();
    };

    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [enabled]);

  return { activeShortcuts: shortcuts };
}
```

- [ ] **Step 2: Verify types**

Run: `npx tsc --noEmit 2>&1 | grep -i "useKeyboardShortcuts" | head -10`

Expected: No type errors.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useKeyboardShortcuts.ts
git commit -m "feat: add useKeyboardShortcuts hook"
```

---

## Task 14: Staff Global Keyboard Shortcuts and Today Button

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/components/layout/AppToolbar.jsx`
- Modify: `src/hooks/useWeekNav.js`

- [ ] **Step 1: Add goToToday to useWeekNav**

In `src/hooks/useWeekNav.js`, add a `goToToday` convenience function:

```js
const goToToday = useCallback(() => {
  handleDatePick(new Date());
}, [handleDatePick]);
```

Add `goToToday` to the return object:

```js
return {
  // ... existing properties
  goToToday,
};
```

- [ ] **Step 2: Add goToPrevDay and goToNextDay to useWeekNav**

```js
const goToPrevDay = useCallback(() => {
  setSelectedDay((prev) => {
    if (prev === 0) {
      setWeekOffset((o) => o - 1);
      return 6;
    }
    return prev - 1;
  });
}, []);

const goToNextDay = useCallback(() => {
  setSelectedDay((prev) => {
    if (prev === 6) {
      setWeekOffset((o) => o + 1);
      return 0;
    }
    return prev + 1;
  });
}, []);
```

Add both to the return object.

- [ ] **Step 3: Add Today button to AppToolbar**

In `src/components/layout/AppToolbar.jsx`, add `goToToday`, `goToPrevWeek`, `goToNextWeek`, `isOnTodaysWeek` props:

```jsx
export function AppToolbar({
  activeView,
  setActiveView,
  onSignOut,
  isOnline,
  user,
  goToToday,
  goToPrevWeek,
  goToNextWeek,
  isOnTodaysWeek,
}) {
```

Add the Today button + nav arrows between the logo and nav tabs:

```jsx
{/* Week navigation — only visible when on dashboard */}
{activeView === "dashboard" && (
  <div className="flex items-center gap-1">
    <button
      onClick={goToPrevWeek}
      aria-label="Previous week"
      className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 text-sm font-bold transition-colors"
    >
      ◀
    </button>
    <button
      onClick={goToToday}
      disabled={isOnTodaysWeek}
      aria-label="Jump to today"
      className={`px-3 py-1 rounded-lg text-sm font-bold transition-colors ${
        isOnTodaysWeek
          ? "bg-slate-100 text-slate-400 cursor-default"
          : "bg-emerald-500 text-white hover:bg-emerald-600 shadow-sm"
      }`}
    >
      Today
    </button>
    <button
      onClick={goToNextWeek}
      aria-label="Next week"
      className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 text-sm font-bold transition-colors"
    >
      ▶
    </button>
  </div>
)}
```

- [ ] **Step 4: Pass new props from App.jsx to AppToolbar**

In `src/App.jsx`, destructure the new values from useWeekNav:

```jsx
const {
  // ... existing
  goToToday,
  goToPrevDay,
  goToNextDay,
  goToPrevWeek,
  goToNextWeek,
  weekOffset,
} = useWeekNav();

// Compute isOnTodaysWeek
const isOnTodaysWeek = weekOffset === 0;
```

Pass to AppToolbar:

```jsx
<AppToolbar
  activeView={activeView}
  setActiveView={setActiveView}
  onSignOut={signOut}
  isOnline={isOnline}
  user={user}
  goToToday={goToToday}
  goToPrevWeek={goToPrevWeek}
  goToNextWeek={goToNextWeek}
  isOnTodaysWeek={isOnTodaysWeek}
/>
```

- [ ] **Step 5: Register global keyboard shortcuts in App.jsx**

```jsx
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts.ts";

// Determine if any modal is open (to suppress global shortcuts)
const anyModalOpen = !!(
  selectedHumanId || selectedDogId || showNewBooking ||
  showAddDogModal || showAddHumanModal || showDatePicker
);

const globalShortcuts = useMemo(() => ({
  "ArrowLeft": { handler: goToPrevDay, description: "Previous day" },
  "ArrowRight": { handler: goToNextDay, description: "Next day" },
  "Shift+ArrowLeft": { handler: goToPrevWeek, description: "Previous week" },
  "Shift+ArrowRight": { handler: goToNextWeek, description: "Next week" },
  "t": { handler: goToToday, description: "Jump to today" },
  "n": { handler: () => openNewBooking(currentDateStr, ""), description: "New booking" },
  "/": {
    handler: () => {
      const el = document.getElementById("dog-search") || document.getElementById("human-search");
      el?.focus();
    },
    description: "Focus search",
  },
  "?": { handler: () => setShowShortcutsHelp(true), description: "Show shortcuts" },
}), [goToPrevDay, goToNextDay, goToPrevWeek, goToNextWeek, goToToday, openNewBooking, currentDateStr]);

useKeyboardShortcuts(globalShortcuts, { enabled: !anyModalOpen });
```

Add `showShortcutsHelp` state:

```jsx
const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);
```

- [ ] **Step 6: Verify build**

Run: `npm run build 2>&1 | tail -5`

Expected: Build succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/App.jsx src/components/layout/AppToolbar.jsx src/hooks/useWeekNav.js
git commit -m "feat: add Today button, week nav arrows, and staff keyboard shortcuts"
```

---

## Task 15: Staff Modal Keyboard Shortcuts

**Files:**
- Modify: `src/components/modals/BookingDetailModal.jsx`

- [ ] **Step 1: Add modal-level shortcuts to BookingDetailModal**

```jsx
import { useKeyboardShortcuts } from "../../hooks/useKeyboardShortcuts.ts";

// Inside the component, after hook declarations:
const modalShortcuts = useMemo(() => {
  const map = {};
  if (!isEditing) {
    map["e"] = { handler: () => setIsEditing(true), description: "Edit booking" };
  }
  if (isEditing) {
    map["Meta+s"] = { handler: () => handleSave(), description: "Save changes" };
  }
  return map;
}, [isEditing, handleSave]);

useKeyboardShortcuts(modalShortcuts, { enabled: true });
```

Note: `Escape` is already handled by AccessibleModal (dismissOnEscape) and the custom Escape handler for the editing case (added in Task 9).

- [ ] **Step 2: Verify build**

Run: `npm run build 2>&1 | tail -5`

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/modals/BookingDetailModal.jsx
git commit -m "feat: add modal keyboard shortcuts (E to edit, Cmd+S to save)"
```

---

## Task 16: Customer Keyboard Shortcuts

**Files:**
- Modify: `src/CustomerApp.jsx`

- [ ] **Step 1: Add keyboard shortcuts to CustomerApp**

```jsx
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts.ts";
import { useState, useMemo } from "react";

// Inside CustomerApp, before the routes return:
const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);

const customerShortcuts = useMemo(() => ({
  "?": { handler: () => setShowShortcutsHelp(true), description: "Show shortcuts" },
}), []);

useKeyboardShortcuts(customerShortcuts);
```

Note: `Escape` and `Enter` for wizard steps are handled by the AccessibleModal wrapper and native form submission. `Tab`/`Shift+Tab` is standard browser behaviour ensured by proper focus order. The `?` shortcut is the only custom addition for customers.

- [ ] **Step 2: Verify build**

Run: `npm run build 2>&1 | tail -5`

Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/CustomerApp.jsx
git commit -m "feat: add customer keyboard shortcuts"
```

---

## Task 17: ShortcutsHelpOverlay

**Files:**
- Create: `src/components/shared/ShortcutsHelpOverlay.tsx`
- Modify: `src/App.jsx`
- Modify: `src/CustomerApp.jsx`

- [ ] **Step 1: Create ShortcutsHelpOverlay**

```tsx
// src/components/shared/ShortcutsHelpOverlay.tsx
import { AccessibleModal } from "./AccessibleModal.tsx";
import type { ShortcutMap } from "../../hooks/useKeyboardShortcuts.ts";

interface ShortcutsHelpOverlayProps {
  shortcuts: ShortcutMap;
  onClose: () => void;
  title?: string;
}

function formatKey(combo: string): string {
  return combo
    .replace("Meta+", "⌘")
    .replace("Shift+", "⇧")
    .replace("ArrowLeft", "←")
    .replace("ArrowRight", "→")
    .replace("Escape", "Esc");
}

export function ShortcutsHelpOverlay({
  shortcuts,
  onClose,
  title = "Keyboard Shortcuts",
}: ShortcutsHelpOverlayProps) {
  const entries = Object.entries(shortcuts);

  return (
    <AccessibleModal
      onClose={onClose}
      titleId="shortcuts-help-title"
      className="bg-white rounded-2xl w-[min(360px,90vw)] max-h-[80vh] overflow-auto shadow-[0_8px_32px_rgba(0,0,0,0.18)] p-6"
      zIndex={1300}
    >
      <h2 id="shortcuts-help-title" className="text-lg font-extrabold text-slate-800 mb-4">
        {title}
      </h2>
      <div className="flex flex-col gap-2">
        {entries.map(([combo, shortcut]) => (
          <div key={combo} className="flex items-center justify-between py-1.5 border-b border-slate-100 last:border-0">
            <span className="text-[13px] text-slate-600">{shortcut.description}</span>
            <kbd className="ml-4 shrink-0 px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-[12px] font-mono font-bold text-slate-700">
              {formatKey(combo)}
            </kbd>
          </div>
        ))}
      </div>
      <button
        onClick={onClose}
        className="mt-4 w-full py-2 rounded-lg bg-slate-100 text-sm font-bold text-slate-600 hover:bg-slate-200 transition-colors"
      >
        Close
      </button>
    </AccessibleModal>
  );
}
```

- [ ] **Step 2: Wire into App.jsx**

In `src/App.jsx`, render the overlay when `showShortcutsHelp` is true:

```jsx
import { ShortcutsHelpOverlay } from "./components/shared/ShortcutsHelpOverlay.tsx";

// In the JSX, after modals:
{showShortcutsHelp && (
  <ShortcutsHelpOverlay
    shortcuts={globalShortcuts}
    onClose={() => setShowShortcutsHelp(false)}
    title="Keyboard Shortcuts"
  />
)}
```

- [ ] **Step 3: Wire into CustomerApp**

In `src/CustomerApp.jsx`, render similarly:

```jsx
import { ShortcutsHelpOverlay } from "./components/shared/ShortcutsHelpOverlay.tsx";

// In the authenticated routes return, after </main>:
{showShortcutsHelp && (
  <ShortcutsHelpOverlay
    shortcuts={customerShortcuts}
    onClose={() => setShowShortcutsHelp(false)}
    title="Keyboard Shortcuts"
  />
)}
```

- [ ] **Step 4: Verify build**

Run: `npm run build 2>&1 | tail -5`

Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/components/shared/ShortcutsHelpOverlay.tsx src/App.jsx src/CustomerApp.jsx
git commit -m "feat: add keyboard shortcuts help overlay (? key)"
```

---

## Task 18: Final Verification

- [ ] **Step 1: Full build check**

Run: `npm run build`

Expected: Build succeeds with no errors.

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`

Expected: No new type errors.

- [ ] **Step 3: Run existing tests**

Run: `npm test`

Expected: All existing tests pass (capacity engine tests).

- [ ] **Step 4: Manual smoke test checklist**

Open the app in a browser and verify:

- [ ] BookingDetailModal opens/closes correctly, edit/save works
- [ ] Focus is trapped inside open modals (tab doesn't escape to background)
- [ ] Escape closes modals (or triggers exit confirm when editing)
- [ ] Skip nav link appears on focus (Tab from page top)
- [ ] `←` / `→` navigate days, `Shift+←` / `Shift+→` navigate weeks
- [ ] `T` jumps to today
- [ ] `N` opens new booking modal
- [ ] `E` toggles edit in BookingDetailModal
- [ ] `Cmd+S` saves in edit mode
- [ ] `?` opens shortcuts help overlay
- [ ] `/` focuses search input on Dogs/Humans views
- [ ] Today button in toolbar works, disabled when already on today's week
- [ ] Customer portal: `?` shows help, `Escape` closes modals
- [ ] Screen reader: modals announce as dialogs, status changes are announced

- [ ] **Step 5: Final commit (if any fixups needed)**

```bash
git add -A
git commit -m "fix: address smoke test findings for Phase 3"
```
