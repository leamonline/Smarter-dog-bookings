# UX Audit Report — SmarterDog Booking App

**Date:** 12 April 2026
**Auditor:** Claude (via Cowork)
**URL:** https://smarterdog.vercel.app
**Context:** Tablet-first salon front desk app. Staff are standing, busy, often have wet hands. Primary device is iPad/tablet.

---

## Summary

The app has strong bones — the booking grid, dog/human directories, and card-based modals are well-structured and the colour coding by dog size is genuinely clever. Responsive behaviour is solid at both tablet and phone widths, with a proper bottom nav bar appearing on mobile. However, there are several blocking bugs and consistency gaps that undermine daily usability. The two biggest are a broken search in the New Booking Modal (makes it nearly impossible to book via the normal flow) and a Settings page rendering bug that hides most of the page content below the first two sections. The modal system works well conceptually but lacks consistency in patterns like close buttons, escape key behaviour, and form state management.

---

## Top 5 Issues (by severity)

### 1. Dog search in New Booking Modal is broken (Critical — Blocker)
When typing a dog's name in the New Booking Modal search field, the UI permanently displays "Searching..." and never returns results. The dropdown works fine when left empty (shows all dogs), but typed search is completely non-functional. This is the primary booking creation flow — staff can't create bookings through the intended UI path. They must either scroll the full dog list or rely on workarounds.

**Impact:** Blocks the core workflow. A salon with 50+ dogs can't efficiently find a dog to book.
**Fix complexity:** Medium — likely a debounce/filter bug in the search handler or a cold-start issue with the dog list query.

### 2. Settings page renders blank below first two sections (Critical — Bug)
The Salon Settings page is a single long-scroll layout with 8 sections (Your Business, Hours & Closures, Your Account, Services & Pricing, Booking Rules, Capacity Engine, Customer Portal, Notifications). Only the first two sections ("Your Business" and "Opening Hours & Closures") are visually rendered. Everything below appears as blank whitespace despite the content existing in the DOM. The tab navigation highlights the correct tab but doesn't scroll to visible content. Staff cannot visually access or edit Services & Pricing, Booking Rules, Capacity Engine, Customer Portal, or Notifications settings.

**Impact:** Entire settings sections are inaccessible via normal interaction.
**Fix complexity:** Likely a CSS overflow, height calculation, or lazy-rendering bug. The DOM elements exist at correct positions but aren't painting.

### 3. Add Human Modal pre-fills with stale data (High — Bug)
When opening the Add Human Modal, the form fields are pre-populated with data from a previously viewed or edited human record. The form should open blank for a new entry. This could lead to accidental duplicate entries or overwriting existing records.

**Impact:** Data integrity risk — staff might save incorrect records without noticing pre-filled fields.
**Fix complexity:** Low — clear form state in the modal's `onOpen` or `useEffect` hook.

### 4. Dog Card grooming history inconsistency (Medium — Bug)
The grooming history section in the Dog Card Modal behaves inconsistently across dogs. For Fox, it shows "Loading..." indefinitely at desktop width. For Charlie, it loads correctly at mobile width showing actual booking history. This suggests either a data-fetching race condition, a dog-specific data issue, or a viewport-dependent rendering bug.

**Impact:** Staff can't reliably check a dog's grooming history before booking, which is important for choosing the right service and anticipating behaviour.
**Fix complexity:** Medium — needs investigation into the history-fetching logic per dog record.

### 5. No visible loading or empty state feedback on booking grid (Medium — UX)
The main booking grid shows empty dashed-outline slots with + and block icons, but there's no contextual message like "No bookings today" or "Tap + to add a booking". For a new user or a genuinely empty day, the grid of identical empty cells gives no guidance. The "0 dogs booked" text in the header is the only signal, and it's easy to miss.

**Impact:** Onboarding friction. Staff unfamiliar with the app won't immediately understand what they're looking at.
**Fix complexity:** Low — add a contextual empty state message when all slots are empty.

---

## Modal-by-Modal Notes

### A. Booking Detail Modal
**Status:** Could not test — the search bug in New Booking Modal prevented creating a booking to open this modal. No existing bookings were present on the current week's data.

**Recommendation:** Needs testing once the search bug is fixed. This is the most-used modal in daily operations.

### B. Dog Card Modal
**Information hierarchy:** Good. Header with dog name, breed, age prominently displayed in a teal gradient banner. Sections flow logically: Owner → Groom Notes → Price → Trusted Humans → Grooming History → Edit button.

**Density:** Appropriate. Each section has clear labels (OWNER, GROOM NOTES, PRICE, etc.) in teal caps with adequate spacing.

**Visual grouping:** Sections separated by subtle horizontal rules. The gradient header provides strong visual anchoring.

**Touch readiness:** The X close button is reasonably sized. The Edit button at the bottom is full-width and prominent. Owner name and phone are displayed but not tappable (could be improved — tapping a phone number should initiate a call).

**Consistency:** The modal pattern (gradient header + scrollable body + action button) is consistent across dog and human cards.

**Polish:** The alert triangle icon for dogs with alerts is a nice touch. The "Loading..." state for grooming history on some dogs needs fixing. No custom price shown when absent (just blank, which is fine).

### C. Human Card Modal
**Information hierarchy:** Header shows full name. Sections: Phone, Email, Preferences (SMS/WhatsApp toggles), Dogs (linked dog cards), Dogs Trusted With, Trusted Humans.

**Density:** Slightly too dense at desktop width — requires scrolling to see all sections. The Dogs, Dogs Trusted With, and Trusted Humans sections could be collapsed by default.

**Touch readiness:** Contact details are displayed but the phone number isn't a tappable tel: link. The Contact Popup (accessible via the header) is well-designed with clear on/off toggles for SMS and WhatsApp.

**Consistency:** Follows the same gradient header + body + Edit button pattern as Dog Card. Good.

**Polish:** The Contact Popup overlay is clean and well-positioned. Email is a proper mailto: link. Toggle states use checkmark/cross icons which are immediately readable.

### D. New Booking Modal
**Information hierarchy:** Dog search at top → Service selection → Slot selection → Size selection → Notes. Logical flow.

**Critical bug:** Dog search is broken (see Top 5, Issue 1). The dropdown shows all dogs when the field is empty, but typing causes permanent "Searching..." state.

**Touch readiness:** Dropdown items are adequately spaced. Service and size selectors use standard HTML selects which are touch-friendly.

**Consistency:** Uses a different modal style (side panel rather than centred overlay) which is appropriate for a multi-step form.

### E. Add Dog Modal
**Information hierarchy:** Good progressive flow: Name → Breed → Age → Size → Owner (dropdown) → Groom Notes → Custom Price → Alerts section.

**Density:** The form is long but well-spaced. At desktop, requires scrolling to reach the alerts section and submit button.

**Touch readiness:** Form inputs are full-width and well-sized. The Owner dropdown uses a standard select. The Alerts section with add/remove is functional.

**Polish:** The size selector could benefit from visual indicators (colour dots matching the booking card size colours) rather than plain text options.

### F. Add Human Modal
**Critical bug:** Form pre-fills with stale data from a previous record (see Top 5, Issue 3).

**Information hierarchy:** Name → Surname → Phone → Email → SMS toggle → WhatsApp toggle. Clean and logical.

**Touch readiness:** Good — toggles are appropriately sized, inputs are full-width.

**Polish:** The stale data bug severely undermines trust in this modal.

### Settings View (not a modal — full page)
**Critical bug:** Content below Hours & Closures section doesn't render visually (see Top 5, Issue 2).

**Information hierarchy (from DOM text extraction):** Eight well-organised sections covering all salon configuration needs. Each section has a teal heading, subtitle, and relevant form fields.

**Tab navigation:** The horizontal tab bar highlights the selected tab but doesn't reliably scroll to the section. The tabs function more as visual indicators than navigation aids.

**Recommendation:** Consider switching to a proper tabbed interface where each tab shows only its section content, rather than a long-scroll page with anchor links. This would eliminate the rendering bug and make navigation more predictable.

---

## Consistency Audit

### What's consistent (good)
- **Colour language:** Size dots (yellow/small, teal/medium, pink/large) used consistently on booking cards and dog cards
- **Typography:** Font weights and sizes are consistent across modals — extrabold for names, semibold for labels, regular for values
- **Modal pattern:** Gradient header (teal for dogs/humans, blue for system modals) + scrollable body + action button at bottom
- **Escape key dismissal:** All modals now close on Escape (recently fixed)
- **Brand colours:** The blue/teal/coral palette is used consistently throughout
- **Bottom nav on mobile:** Clean icon-based navigation appearing at 375px with proper active state highlighting

### What's inconsistent (needs attention)
- **Close button styles:** Some modals use an X button in the header (Dog Card, Contact Popup), others use backdrop click only, others use both. Should be standardised — every modal should have both X button and backdrop click.
- **Form state on open:** Add Human pre-fills with stale data; Add Dog appears to open clean. Both should open with blank/default state.
- **Loading states:** Dog Card grooming history shows "Loading..." on some dogs but works on others. Stats view handles the zero-data state well with actual £0 values rather than spinners.
- **Empty states:** The booking grid has no empty state message. The Stats "Top Customers" section shows "No booking data yet" which is good. The Dogs/Humans directories don't need empty states as they have data, but would benefit from one if the list were empty.
- **Date formats:** Grooming history uses DD-MM-YYYY format; the booking header uses "Monday 6th April" format. Both are fine for UK but should be documented as intentional.
- **Button styles:** Primary actions use brand-teal (Edit buttons) or brand-blue (Confirm buttons). The "Save changes" on Settings uses teal. This split is mostly logical but could be more deliberate.

---

## Responsive Assessment

### 768px (Tablet — Primary Use Case)
- **Booking grid:** Adapts to 2-column slot layout. Day strip shows all 7 days plus calendar/waitlist. Good.
- **Header badges:** Revenue and Book Now badges slightly overlap at this width. Minor visual issue.
- **Dog/Human directories:** Cards fill available width nicely. Search bar and Add button remain accessible.
- **Navigation:** Desktop nav bar is still visible (Bookings, Dogs, Humans, Stats). Hamburger menu present.

### 375px (Phone)
- **Navigation:** Switches to bottom tab bar with icons — excellent pattern for one-handed use.
- **Booking grid:** Still shows 2 columns of slots which is tight but functional.
- **Day strip:** Horizontally scrollable, "APRIL" calendar button partially visible at edge — could benefit from a scroll indicator.
- **Dog Card Modal:** Fills the screen well, all content accessible by scrolling. X close button visible.
- **Revenue/Book Now badges:** Centred below the date header, scale appropriately.

### Overall
Responsive behaviour is genuinely good. The app works at all three breakpoints without breaking layouts or losing functionality. The mobile bottom nav is a smart addition.

---

## Quick Wins (effort vs impact)

| Fix | Effort | Impact |
|-----|--------|--------|
| Fix dog search filter in New Booking Modal | Medium | Critical — unblocks core workflow |
| Clear Add Human form state on open | Low | High — prevents data corruption |
| Fix Settings page rendering below fold | Medium | Critical — unlocks all settings |
| Add empty state message to booking grid | Low | Medium — improves onboarding |
| Make phone numbers tappable (tel: links) in modals | Low | Medium — useful for quick calls |
| Standardise close button (X + backdrop) on all modals | Low | Medium — consistency |
| Add scroll indicator to mobile day strip | Low | Low — polish |
| Add visual size indicators to Add Dog size selector | Low | Low — polish, but nice brand consistency |

---

## Notes on Data Integrity

- The booking grid currently shows the week of 6–12 April 2026, with Monday selected. All days show "0 dogs" and Thu–Sun show "Closed". The app correctly handles closed days (greyed out in the date picker, red text in the day strip).
- The Stats view handles zero-data gracefully — shows £0 values, "avg 0.0 bookings per monday", and "No booking data yet" rather than errors or blank states. This is good defensive design.
- The "Book Now" badge on the booking header appears to be a decorative/branding element rather than a functional button. If it's meant to trigger booking creation, it should be more obviously interactive. If decorative, it takes up valuable header space on smaller screens.
