# Design System Rebrand Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebrand the customer portal and staff dashboard from plum purple/Sora+DM Sans to accessible cyan/Montserrat, add semantic tokens, responsive grid, motion safety, and global focus styles.

**Architecture:** CSS-first token swap in two stylesheet files, then find-and-replace sweeps across ~30 JSX/TSX component files. No structural/logic changes — purely visual. The portal gets a responsive two-column grid at tablet+.

**Tech Stack:** React 19, Tailwind CSS 4, Vite, custom CSS classes in `customer-portal.css` and `index.css`.

**Spec:** `docs/superpowers/specs/2026-04-15-design-system-rebrand.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `index.html` | Modify | Font imports — trim to Montserrat only |
| `src/index.css` | Modify | `@theme` tokens, semantic tokens, utility classes, `.btn` updates, global focus, motion safety |
| `src/customer-portal.css` | Modify | Portal tokens, all `.portal-*` class updates, responsive grid |
| `src/CustomerApp.jsx` | Modify | Inline font + colour class swaps |
| `src/components/auth/CustomerLoginPage.jsx` | Modify | Inline font + colour class swaps |
| `src/components/customer/CustomerDashboard.jsx` | Modify | Add `.portal-section--full` classes for grid |
| `src/components/customer/MyDetailsCard.jsx` | Modify | Font class swaps |
| `src/components/customer/DogsSection.jsx` | Modify | Font + colour class swaps |
| `src/components/customer/TrustedHumansSection.jsx` | Modify | Font + colour class swaps |
| `src/components/customer/AppointmentsSection.jsx` | Modify | Font + colour class swaps |
| `src/components/customer/booking/BookingWizard.tsx` | Modify | Font + colour class swaps |
| `src/components/customer/booking/DogSelection.tsx` | Modify | Colour class swaps |
| `src/components/customer/booking/ServiceSelection.tsx` | Modify | Colour class swaps |
| `src/components/customer/booking/DateSelection.tsx` | Modify | Colour class swaps |
| `src/components/customer/booking/SlotSelection.tsx` | Modify | Colour class swaps |
| `src/components/customer/booking/BookingConfirmation.tsx` | Modify | Colour class swaps |
| `src/components/customer/booking/AddDogInline.tsx` | Modify | Colour class swaps |
| `src/App.jsx` | Modify | `brand-blue` → `brand-cyan` sweeps |
| `src/components/auth/LoginPage.jsx` | Modify | `brand-blue` → `brand-cyan` sweeps |
| `src/components/auth/ResetPasswordPage.jsx` | Modify | `brand-blue` → `brand-cyan` sweeps |
| `src/components/layout/AppToolbar.jsx` | Modify | `brand-blue` → `brand-cyan` sweeps |
| `src/components/layout/DashboardHeader.jsx` | Modify | `brand-blue` → `brand-cyan` sweeps |
| `src/components/layout/DayTab.jsx` | Modify | `brand-blue` → `brand-cyan` sweeps |
| `src/components/layout/MonthTab.jsx` | Modify | `brand-blue` → `brand-cyan` sweeps |
| `src/components/layout/WeekCalendarView.jsx` | Modify | `brand-blue` → `brand-cyan` sweeps |
| `src/components/layout/ClosedDayView.jsx` | Modify | `brand-blue` → `brand-cyan` sweep |
| `src/components/modals/DatePickerModal.jsx` | Modify | `brand-blue` → `brand-cyan` sweeps |
| `src/components/modals/dog-card/DogDetailsSection.jsx` | Modify | `brand-blue` → `brand-cyan` sweep |
| `src/components/modals/new-booking/BookingFormFields.jsx` | Modify | `brand-blue` → `brand-cyan` sweep |
| `src/components/modals/new-booking/DogSearchSection.jsx` | Modify | `brand-blue` → `brand-cyan` sweeps |
| `src/components/booking/AddBookingForm.jsx` | Modify | `brand-blue` → `brand-cyan` sweeps |
| `src/components/booking/BookingCardNew.jsx` | Modify | `brand-blue` → `brand-cyan` sweeps |
| `src/components/booking/GhostSeat.jsx` | Modify | `brand-blue` → `brand-cyan` sweeps |
| `src/components/booking/WaitlistPanel.jsx` | Modify | `brand-blue` → `brand-cyan` sweep |
| `src/components/shared/PullToRefresh.jsx` | Modify | `brand-blue` → `brand-cyan` sweep |
| `src/components/ui/Legend.jsx` | Modify | `brand-blue` → `brand-cyan` sweep |
| `src/components/ui/LoadingSpinner.jsx` | Modify | `brand-blue` → `brand-cyan` sweep |
| `src/components/views/DogsView.jsx` | Modify | `brand-blue` → `brand-cyan` sweeps |
| `src/components/views/HumansView.jsx` | Modify | `brand-blue` → `brand-cyan` sweeps |
| `src/components/views/StatsView.jsx` | Modify | `brand-blue` → `brand-cyan` sweeps |
| `src/components/views/settings/shared.jsx` | Modify | `brand-blue` → `brand-cyan` sweep |

---

### Task 1: Font Import Cleanup

**Files:**
- Modify: `index.html:15`

- [ ] **Step 1: Replace the Google Fonts link**

In `index.html`, replace line 15:

```html
    <link href="https://fonts.googleapis.com/css2?family=Quicksand:wght@400;500;600;700&family=Montserrat:wght@400;500;600;700;800;900&family=Sora:wght@600;700;800&family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
```

With:

```html
    <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&display=swap" rel="stylesheet">
```

- [ ] **Step 2: Verify the build still starts**

Run: `npm run dev`
Expected: Vite starts without errors. The app will look broken (fonts missing) — that's expected at this stage.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "chore: trim font imports to Montserrat only"
```

---

### Task 2: Tailwind Theme Tokens + Shared Utilities

**Files:**
- Modify: `src/index.css`

- [ ] **Step 1: Replace the full contents of `src/index.css`**

```css
@import "tailwindcss";

@theme {
  /* Primary brand scale — accessible cyan */
  --color-brand-cyan-light: #00C2FF;
  --color-brand-cyan: #007AAB;
  --color-brand-cyan-dark: #005986;

  /* Accents */
  --color-brand-coral: #E8567F;
  --color-brand-coral-light: #FDE2E8;
  --color-brand-teal: #2D8B7A;
  --color-brand-green: #00D94A;
  --color-brand-orange: #FF6B00;
  --color-brand-red: #DC2626;

  /* Customer portal palette */
  --color-brand-purple: #2D004B;
  --color-brand-purple-light: #5B3D80;
  --color-brand-yellow: #FFCC00;
  --color-brand-yellow-dark: #D4A500;
  --color-brand-paper: #FAF9F6;
  --color-brand-dark: #2A1810;

  /* Size dot colours */
  --color-size-small: #F5C518;
  --color-size-medium: #2D8B7A;
  --color-size-large: #E8567F;
}

/* ── Semantic tokens ──────────────────────────────────────────── */
:root {
  --color-action-primary: var(--color-brand-cyan);
  --color-action-primary-hover: var(--color-brand-cyan-dark);
  --color-action-cta: var(--color-brand-yellow);
  --color-action-danger: var(--color-brand-coral);

  --color-text-body: var(--color-brand-dark);
  --color-text-heading: var(--color-brand-dark);
  --color-text-link: var(--color-brand-cyan-dark);
  --color-text-on-action: #FFFFFF;
  --color-text-muted: theme(--color-slate-400);

  --color-surface-page: var(--color-brand-paper);
  --color-surface-card: #FFFFFF;
  --color-surface-header: var(--color-brand-cyan);

  --color-border-default: theme(--color-stone-200);
  --color-border-focus: var(--color-brand-cyan-dark);
  --color-border-accent: var(--color-brand-cyan-light);

  --color-feedback-success: var(--color-brand-green);
  --color-feedback-error: var(--color-brand-red);
  --color-feedback-warning: var(--color-brand-yellow);
}

/* ── Usage-locking classes ────────────────────────────────────── */
.text-link       { color: var(--color-text-link); }
.text-heading    { color: var(--color-text-heading); }
.text-body       { color: var(--color-text-body); }
.text-on-action  { color: var(--color-text-on-action); }
.bg-action       { background-color: var(--color-action-primary); }
.bg-page         { background-color: var(--color-surface-page); }
.bg-card         { background-color: var(--color-surface-card); }
.border-accent   { border-color: var(--color-border-accent); }
.border-focus    { border-color: var(--color-border-focus); }

/* ── Global focus ─────────────────────────────────────────────── */
:focus-visible {
  outline: 2px solid var(--color-border-focus);
  outline-offset: 2px;
}
:focus:not(:focus-visible) {
  outline: none;
}

/* ── Body reset ───────────────────────────────────────────────── */
body {
  margin: 0;
  background-color: theme(--color-slate-50);
}

/* ── Animations ───────────────────────────────────────────────── */
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes toastIn {
  from { opacity: 0; transform: translateY(12px) scale(0.95); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(32px); }
  to { opacity: 1; transform: translateY(0); }
}

/* ── Motion safety ────────────────────────────────────────────── */
@media (prefers-reduced-motion: reduce) {
  .animate-fade-in-up,
  .hover-lift,
  .btn-pill,
  .btn,
  .portal-btn {
    animation: none !important;
    transition: none !important;
    transform: none !important;
  }
  .animate-fade-in-up {
    opacity: 1 !important;
  }
}

/* ── Shared utility classes ───────────────────────────────────── */
.btn-pill {
  @apply rounded-full font-bold transition-all duration-300 cursor-pointer;
}
.btn-pill:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}
.btn-pill:active {
  transform: scale(0.95);
  transition-duration: 80ms;
}

.card-glass {
  @apply bg-white/60 backdrop-blur-sm border border-white/50 rounded-xl shadow-sm hover:shadow-md transition-all;
}

.card-solid {
  @apply bg-white rounded-2xl shadow-lg border border-gray-100;
}

.animate-fade-in-up {
  animation: fadeInUp 0.6s ease-out forwards;
}

.hover-lift {
  transition: transform 300ms ease;
}
.hover-lift:hover {
  transform: translateY(-4px);
}

/* ── Text colour hierarchy ───────────────────────────────────── */
/* Primary text: text-slate-800 */
/* Secondary text: text-slate-600 */
/* Muted/tertiary text: text-slate-400 */

/* ── Standard button styles (staff dashboard) ────────────────── */
.btn {
  @apply py-2 px-4 rounded-full text-sm font-semibold cursor-pointer font-[inherit] transition-all duration-300 border-none;
}
.btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}
.btn:active {
  transform: scale(0.95);
  transition-duration: 80ms;
}
.btn-primary {
  @apply bg-brand-cyan text-white hover:bg-brand-cyan-dark;
}
.btn-danger {
  @apply bg-brand-coral text-white hover:bg-[#d14468];
}
.btn-ghost {
  @apply bg-white text-slate-600 border-[1.5px] border-slate-200 hover:bg-slate-50;
}
.btn-sm {
  @apply py-1.5 px-3 text-xs;
}
.btn:disabled {
  @apply bg-slate-200 text-slate-400 cursor-not-allowed;
  transform: none !important;
  box-shadow: none !important;
}
```

- [ ] **Step 2: Verify Tailwind compiles**

Run: `npm run dev`
Expected: Vite starts. Dashboard buttons now render as pills. Colours may look wrong in components that still reference `brand-blue` — expected.

- [ ] **Step 3: Commit**

```bash
git add src/index.css
git commit -m "feat: add accessible cyan tokens, semantic layer, and shared utilities"
```

---

### Task 3: Customer Portal CSS Overhaul

**Files:**
- Modify: `src/customer-portal.css`

- [ ] **Step 1: Replace the full contents of `src/customer-portal.css`**

```css
/* ==============================================
   Customer Portal — Cyan Rebrand
   Smarter Dog Grooming
   ============================================== */

/* --- Brand Tokens (portal-specific) --- */
:root {
  --sd-cyan-light: #00C2FF;
  --sd-cyan: #007AAB;
  --sd-cyan-dark: #005986;
  --sd-deep: #2D004B;
  --sd-teal: #2A6F6B;
  --sd-yellow: #FFCC00;
  --sd-yellow-dark: #D4A500;
  --sd-coral: #E8506A;
  --sd-coral-light: #FFF0F3;
  --sd-paper: #FAF9F6;
  --sd-white: #FFFFFF;
  --sd-dark: #2A1810;
}

/* --- Portal Wrapper --- */
.customer-portal {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  font-family: 'Montserrat', sans-serif;
  background: var(--sd-paper);
  color: var(--sd-dark);
  overflow-x: hidden;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* --- Header Band --- */
.portal-header {
  background: var(--sd-cyan);
  padding: 16px 20px 20px;
  position: relative;
  z-index: 2;
}

.portal-header-inner {
  max-width: 840px;
  margin: 0 auto;
}

.portal-header-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14px;
}

.portal-brand {
  font-family: 'Montserrat', sans-serif;
  font-size: 22px;
  font-weight: 800;
  color: var(--sd-white);
  letter-spacing: -0.5px;
}

.portal-brand span {
  color: var(--sd-yellow);
}

.portal-header-bottom {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
}

.portal-welcome {
  font-family: 'Montserrat', sans-serif;
  font-size: 26px;
  font-weight: 700;
  color: var(--sd-white);
  margin: 0;
  line-height: 1.2;
}

/* --- Main Content --- */
.portal-main {
  flex: 1;
  padding: 24px 16px 40px;
}

.portal-content {
  max-width: 560px;
  margin: 0 auto;
}

/* --- Responsive Grid --- */
@media (min-width: 640px) {
  .portal-content {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    max-width: 768px;
  }

  .portal-content > .portal-btn--cta,
  .portal-content > .portal-section--full {
    grid-column: 1 / -1;
  }
}

@media (min-width: 1024px) {
  .portal-content {
    max-width: 840px;
  }
}

/* --- Cards --- */
.portal-card {
  background: var(--sd-white);
  border-radius: 16px;
  padding: 20px 22px;
  margin-bottom: 16px;
  border-left: 3px solid var(--sd-cyan-light);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
}

@media (min-width: 640px) {
  .portal-card {
    margin-bottom: 0;
  }
}

.portal-card--teal {
  border-left-color: var(--sd-teal);
}

.portal-card--yellow {
  border-left-color: var(--sd-yellow);
}

.portal-card--muted {
  border-left-color: #CBD5E1;
}

.portal-card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 14px;
}

.portal-card-icon {
  color: var(--sd-cyan-dark);
  flex-shrink: 0;
}

.portal-card-title {
  font-family: 'Montserrat', sans-serif;
  font-size: 11px;
  font-weight: 700;
  color: #64748B;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  flex: 1;
  margin: 0;
}

/* --- Buttons --- */
.portal-btn {
  font-family: 'Montserrat', sans-serif;
  font-weight: 700;
  border: none;
  border-radius: 9999px;
  cursor: pointer;
  transition: transform 300ms ease, box-shadow 300ms ease;
  -webkit-tap-highlight-color: transparent;
}

.portal-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.portal-btn:active {
  transform: scale(0.95);
  box-shadow: none;
  transition-duration: 80ms;
}

.portal-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none !important;
  box-shadow: none !important;
}

.portal-btn--primary {
  background: var(--sd-cyan);
  color: var(--sd-white);
  padding: 10px 20px;
  font-size: 14px;
}

.portal-btn--secondary {
  background: var(--sd-white);
  color: var(--sd-cyan-dark);
  border: 2px solid var(--sd-cyan-dark);
  padding: 8px 18px;
  font-size: 13px;
}

.portal-btn--ghost {
  background: transparent;
  color: var(--sd-white);
  padding: 7px 16px;
  font-size: 13px;
  opacity: 0.85;
  border: 1.5px solid rgba(255, 255, 255, 0.3);
}

.portal-btn--ghost:hover {
  opacity: 1;
  border-color: rgba(255, 255, 255, 0.6);
}

.portal-btn--cta {
  background: var(--sd-yellow);
  color: var(--sd-deep);
  padding: 14px 24px;
  font-size: 17px;
  width: 100%;
  letter-spacing: 0.3px;
  box-shadow: 0 2px 8px rgba(255, 204, 0, 0.3);
}

.portal-btn--cta:hover {
  box-shadow: 0 4px 14px rgba(255, 204, 0, 0.4);
}

.portal-btn--danger {
  background: var(--sd-coral);
  color: var(--sd-white);
  padding: 10px 20px;
  font-size: 13px;
}

.portal-btn--small {
  padding: 6px 14px;
  font-size: 12px;
}

/* --- Animations --- */
@keyframes cardSlideUp {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes portalPulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

@keyframes portalBounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-8px); }
}

/* --- Loading State --- */
.portal-loading {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  font-family: 'Montserrat', sans-serif;
  background: var(--sd-paper);
}

.portal-loading-text {
  font-size: 16px;
  font-weight: 600;
  color: var(--sd-cyan-dark);
  animation: portalPulse 1.5s ease-in-out infinite;
}

.portal-loading-icon {
  color: var(--sd-cyan-light);
  margin-bottom: 12px;
  animation: portalBounce 1s ease-in-out infinite;
}

/* --- Skip Link --- */
.portal-skip-link {
  position: absolute;
  left: -9999px;
  top: 8px;
  z-index: 100;
  background: var(--sd-yellow);
  color: var(--sd-deep);
  font-family: 'Montserrat', sans-serif;
  font-weight: 700;
  font-size: 13px;
  padding: 8px 16px;
  border-radius: 9999px;
  text-decoration: none;
}

.portal-skip-link:focus {
  left: 16px;
}

/* --- Responsive --- */
@media (max-width: 400px) {
  .portal-welcome {
    font-size: 22px;
  }

  .portal-btn--cta {
    font-size: 15px;
    padding: 12px 20px;
  }

  .portal-card {
    padding: 16px 18px;
  }
}
```

- [ ] **Step 2: Check the portal renders**

Run: `npm run dev`, navigate to `/customer`
Expected: Portal header is now cyan, buttons are pills, cards have cyan left-borders. Fonts are Montserrat. Inline class colours in components may still show old purple — that's addressed in Task 4.

- [ ] **Step 3: Commit**

```bash
git add src/customer-portal.css
git commit -m "feat: rebrand portal CSS — cyan tokens, pill buttons, responsive grid"
```

---

### Task 4: Portal Component Inline Class Sweeps

**Files:** 13 customer portal component files (see file map)

This task uses find-and-replace across all portal component files. Each substitution is independent.

- [ ] **Step 1: Replace font classes across all portal components**

Run these replacements across all files in `src/components/customer/`, `src/components/auth/CustomerLoginPage.jsx`, `src/CustomerApp.jsx`, and `src/components/customer/booking/`:

| Find | Replace |
|------|---------|
| `font-['Sora',sans-serif]` | `font-['Montserrat',sans-serif]` |
| `font-['DM_Sans',sans-serif]` | `font-['Montserrat',sans-serif]` |
| `font-[Sora]` | `font-[Montserrat]` |

Files affected:
- `src/CustomerApp.jsx` — lines 81, 83, 130, 166, 169
- `src/components/auth/CustomerLoginPage.jsx` — lines 61, 68, 77, 84, 114, 121
- `src/components/customer/MyDetailsCard.jsx` — lines 29, 37, 47, 53, 63, 73, 79, 91, 99, 107
- `src/components/customer/DogsSection.jsx` — line 23
- `src/components/customer/AppointmentsSection.jsx` — lines 78, 79, 93, 108, 154, 183, 201, 210
- `src/components/customer/TrustedHumansSection.jsx` — line 18
- `src/components/customer/booking/BookingWizard.tsx` — line 278

- [ ] **Step 2: Replace colour classes across portal components**

Run these replacements across the same files:

| Find | Replace |
|------|---------|
| `text-brand-purple` | `text-brand-cyan-dark` |
| `bg-brand-purple` | `bg-brand-cyan` |
| `border-brand-purple` | `border-brand-cyan-dark` |
| `bg-purple-50` | `bg-cyan-50` |
| `hover:border-brand-purple` | `hover:border-brand-cyan-dark` |
| `hover:bg-purple-50` | `hover:bg-cyan-50` |

Files affected:
- `src/CustomerApp.jsx` — lines 83, 100, 103, 169
- `src/components/auth/CustomerLoginPage.jsx` — lines 68, 77, 84, 114, 121
- `src/components/customer/DogsSection.jsx` — line 23
- `src/components/customer/AppointmentsSection.jsx` — lines 78, 108, 154, 201
- `src/components/customer/TrustedHumansSection.jsx` — line 18
- `src/components/customer/booking/BookingWizard.tsx` — line 185, 278
- `src/components/customer/booking/DogSelection.tsx` — lines 62, 82, 103
- `src/components/customer/booking/ServiceSelection.tsx` — lines 51, 82, 90
- `src/components/customer/booking/DateSelection.tsx` — line 116
- `src/components/customer/booking/SlotSelection.tsx` — line 122
- `src/components/customer/booking/BookingConfirmation.tsx` — lines 63, 64, 95
- `src/components/customer/booking/AddDogInline.tsx` — lines 88, 130, 147

- [ ] **Step 3: Add `.portal-section--full` to full-span sections in `CustomerDashboard.jsx`**

Wrap `TrustedHumansSection` and `AppointmentsSection` with the full-span class. In `src/components/customer/CustomerDashboard.jsx`, change:

```jsx
          <TrustedHumansSection trustedHumans={trustedHumans} />
```

To:

```jsx
          <div className="portal-section--full">
            <TrustedHumansSection trustedHumans={trustedHumans} />
          </div>
```

And change:

```jsx
          <AppointmentsSection
```

To:

```jsx
          <div className="portal-section--full">
            <AppointmentsSection
```

And add a closing `</div>` after the `AppointmentsSection` closing tag.

- [ ] **Step 4: Verify portal at multiple widths**

Run: `npm run dev`, navigate to `/customer`
Check at:
- 375px (mobile) — single column, same as before
- 768px (tablet) — MyDetails + Dogs side by side, others full width
- 1200px (desktop) — same two-column grid, 840px max

- [ ] **Step 5: Commit**

```bash
git add src/CustomerApp.jsx src/components/auth/CustomerLoginPage.jsx src/components/customer/ -A
git commit -m "feat: rebrand portal components — Montserrat, cyan, responsive grid"
```

---

### Task 5: Staff Dashboard Brand-Blue → Brand-Cyan Sweep

**Files:** ~20 dashboard component files (see file map)

This task is a single find-and-replace operation across all non-portal files.

- [ ] **Step 1: Replace brand-blue with brand-cyan across all dashboard files**

Run these replacements across all files in `src/App.jsx`, `src/components/auth/LoginPage.jsx`, `src/components/auth/ResetPasswordPage.jsx`, `src/components/layout/`, `src/components/modals/`, `src/components/booking/`, `src/components/shared/`, `src/components/ui/`, `src/components/views/`:

| Find | Replace |
|------|---------|
| `brand-blue-dark` | `brand-cyan-dark` |
| `brand-blue` | `brand-cyan` |

**Important:** Replace `brand-blue-dark` FIRST (before `brand-blue`) to avoid double-replacing `brand-blue-dark` → `brand-cyan-dark` being caught by the second rule as `brand-cyan-dark` → `brand-cyan-dark` (which is harmless but the order matters for correctness if using a single-pass regex).

Files affected (56 references across ~20 files):
- `src/components/auth/LoginPage.jsx` — 7 refs
- `src/components/auth/ResetPasswordPage.jsx` — 5 refs
- `src/components/booking/AddBookingForm.jsx` — 2 refs
- `src/components/booking/BookingCardNew.jsx` — 3 refs
- `src/components/booking/GhostSeat.jsx` — 4 refs
- `src/components/booking/WaitlistPanel.jsx` — 2 refs
- `src/components/layout/AppToolbar.jsx` — 7 refs
- `src/components/layout/ClosedDayView.jsx` — 1 ref
- `src/components/layout/DashboardHeader.jsx` — 3 refs
- `src/components/layout/DayTab.jsx` — 2 refs
- `src/components/layout/MonthTab.jsx` — 2 refs
- `src/components/layout/WeekCalendarView.jsx` — 8 refs
- `src/components/modals/DatePickerModal.jsx` — 4 refs
- `src/components/modals/dog-card/DogDetailsSection.jsx` — 1 ref
- `src/components/modals/new-booking/BookingFormFields.jsx` — 1 ref
- `src/components/modals/new-booking/DogSearchSection.jsx` — 2 refs
- `src/components/shared/PullToRefresh.jsx` — 1 ref
- `src/components/ui/Legend.jsx` — 1 ref
- `src/components/ui/LoadingSpinner.jsx` — 1 ref
- `src/components/views/DogsView.jsx` — 2 refs
- `src/components/views/HumansView.jsx` — 2 refs
- `src/components/views/StatsView.jsx` — 5 refs
- `src/components/views/settings/shared.jsx` — 1 ref

- [ ] **Step 2: Verify dashboard renders**

Run: `npm run dev`, navigate to `/` (staff dashboard)
Expected: All blue UI elements are now cyan. Buttons are pill-shaped. Gradients shift from blue→blue-dark to cyan→cyan-dark. Tab navigation, headers, and cards all use the new colour.

- [ ] **Step 3: Commit**

```bash
git add src/App.jsx src/components/auth/LoginPage.jsx src/components/auth/ResetPasswordPage.jsx src/components/layout/ src/components/modals/ src/components/booking/ src/components/shared/ src/components/ui/ src/components/views/ -A
git commit -m "feat: rebrand dashboard — brand-blue to brand-cyan across all components"
```

---

### Task 6: Visual Verification

No code changes — this is a manual check.

- [ ] **Step 1: Check customer portal at 375px**

Expected: Single column. Cyan header. Montserrat font throughout. Yellow CTA pill button. Cards with cyan-light left borders. Loading spinner uses cyan.

- [ ] **Step 2: Check customer portal at 768px**

Expected: Two-column grid. MyDetailsCard and DogsSection side by side. CTA, TrustedHumans, and Appointments span full width. 768px max-width centred.

- [ ] **Step 3: Check customer portal at 1200px**

Expected: Same two-column grid, 840px max-width. No third column. Cards don't stretch beyond comfortable reading width.

- [ ] **Step 4: Check booking wizard**

Navigate to `/customer/book`. Expected: Step indicators and headings use Montserrat + cyan. Dog/service/date/slot selection cards use cyan borders and backgrounds on selected state.

- [ ] **Step 5: Check staff dashboard**

Navigate to `/`. Expected: Cyan gradients on header and day tabs. Pill buttons throughout. Calendar view uses cyan for selected states. All blue→cyan transitions complete.

- [ ] **Step 6: Check reduced motion**

In browser dev tools, enable `prefers-reduced-motion: reduce`. Expected: No animations or transforms on buttons, cards, or entrance animations.

- [ ] **Step 7: Check keyboard navigation**

Tab through the portal. Expected: Consistent 2px cyan-dark focus ring with 2px offset on every focusable element.
