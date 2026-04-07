# Settings Page Redesign

## Overview

Redesign the Settings page (`SettingsView.jsx`) from 4 sparse cards into 8 well-grouped, visually polished cards on a single scrollable page. Add jump links for quick navigation, new settings sections (business info, hours, booking rules, customer portal, notifications), and bring the visual treatment in line with the rest of the app.

## Current State

The existing Settings page has 4 cards:
1. **Your Account** — display name, phone, email, password reset
2. **Salon Operations** — single field (pickup offset), feels empty
3. **Services & Pricing** — functional but plain pricing table
4. **Capacity Engine** — 2-2-1 toggle and large dog slot times (cramped layout)

Problems: sparse sections, no visual hierarchy between cards, missing settings that a salon needs, inconsistent with the polish level of the rest of the app.

## Redesigned Structure

### Jump Links Bar

A horizontal bar of pill-shaped links at the top of the page, one per card section. Each link scrolls to the corresponding card. Each link has an emoji icon prefix for scannability. Styled as small rounded pills with hover state (teal highlight).

### Card 1: Your Business

Customer-facing salon details.

Fields:
- **Salon name** (text input)
- **Phone** and **Email** (side-by-side row)
- **Address** (full-width text input)
- Save button

Data: new `salon_config` or similar — stored alongside existing config. For initial implementation, store in the same config object that `onUpdateConfig` manages.

### Card 2: Opening Hours & Closures

Weekly schedule and holiday dates.

**Hours grid:**
- One row per day (Monday to Sunday)
- Each row: day name | open time input | close time input | toggle-closed button
- Sunday shown as closed by default (red "CLOSED" tag spanning the time columns)
- The toggle button (x icon) marks a day as closed/open

**Closures section** (below hours, separated by a subtle divider):
- Label: "Upcoming Closures"
- Pink pills showing each closure: "25 Dec 2026 — Christmas Day" with a remove button
- "+ Add closure" button opens a date picker + label input

Data: `businessHours` object keyed by day (`{ monday: { open: "08:00", close: "17:00", closed: false }, ... }`), `closures` array (`[{ date: "2026-12-25", label: "Christmas Day" }, ...]`). Both in config.

### Card 3: Your Account

Unchanged from current implementation. Display name, phone, email, password reset. Already works with Supabase auth — no data model changes needed.

### Card 4: Services & Pricing

Same pricing table as current, with visual improvements:
- Size-coloured dots in the column headers (gold dot for Small, teal for Medium, pink for Large) using `SIZE_THEME` colours
- Centred price inputs in each cell
- Save button at the bottom

Data: unchanged — uses existing `config.pricing` object.

### Card 5: Booking Rules

Consolidates the old "Salon Operations" card with new booking rule fields.

Fields (inline label-left, input-right layout):
- **Advance booking window** — number input + "weeks" suffix. How far ahead customers can book.
- **Minimum cancellation notice** — number input + "hours" suffix. Minimum notice before a customer can cancel.
- **Default pick-up offset** — number input + "mins" suffix. Moved here from old Salon Operations card.
- **Auto-confirm bookings** — toggle. When off, new bookings need manual approval.

Data: `advanceBookingWeeks`, `minCancellationHours`, `autoConfirm` added to config alongside existing `defaultPickupOffset`.

### Card 6: Capacity Engine

Same functionality as current, better layout:
- Toggle row: "Enforce 2-2-1 strict capacity" with sublabel explaining what it does
- Below: label "Large Dog Approved Slots" with description text
- Slot chips displayed as pink pills (using `BRAND.coralLight` / `BRAND.coral`), hover to highlight, click to remove
- Add slot: time input + "+ Add" button inline with chips

Data: unchanged — uses existing `config.enforceCapacity` and `config.largeDogSlots`.

### Card 7: Customer Portal

Toggles controlling what customers see in their portal.

Toggle rows:
- **Show upcoming bookings** — on by default. Sublabel: "Customers can see their scheduled appointments"
- **Show past booking history** — on by default. Sublabel: "Customers can view previous appointments"
- **Allow rebooking** — off by default. Sublabel: "Customers can rebook a previous service directly"
- **Allow cancellations** — on by default. Sublabel: "Customers can cancel within the notice window"

Data: `customerPortal: { showUpcoming: true, showHistory: true, allowRebooking: false, allowCancellations: true }` in config.

### Card 8: Notifications

Toggle each notification type on/off, with channel badges showing delivery method.

Toggle rows:
- **Booking confirmation** — on by default. Channels: WhatsApp, Email. Sublabel: "Sent immediately when a booking is made"
- **Day-before reminder** — on by default. Channel: WhatsApp. Sublabel: "Sent the evening before the appointment"
- **Ready for collection** — on by default. Channels: WhatsApp, SMS. Sublabel: "Notify owner when their dog is finished"
- **Follow-up / review request** — off by default. Channel: Email. Sublabel: "Sent 24 hours after the appointment"

Channel badges are small coloured pills: WhatsApp (green), Email (blue), SMS (gold).

Data: `notifications: { bookingConfirmation: { enabled: true, channels: ["whatsapp", "email"] }, ... }` in config.

Note: this card defines the settings UI only. The actual sending logic (WhatsApp API, email, SMS) is out of scope for this redesign. The toggles store preferences; the notification infrastructure is a separate project.

## Visual Design

### Card Pattern

Every card follows the same structure:
1. **Card header**: icon badge (36px, rounded, coloured background) + title (uppercase, 800 weight, #1E6B5C) + description (13px, grey)
2. **Card body**: 20px-24px padding, content varies per card

Icon badge background colours:
- Your Business: `#E6F5F2` (teal light)
- Hours & Closures: `#E0F7FC` (blue light)
- Your Account: `#E0F7FC` (blue light)
- Services & Pricing: `#FFF8E0` (yellow light)
- Booking Rules: `#E6F5F2` (teal light)
- Capacity Engine: `#FDE8EE` (coral light)
- Customer Portal: `#E6F5F2` (teal light)
- Notifications: `#FFF8E0` (yellow light)

### Back Button

Replace tick icon with `←` arrow text. Same blue-light styling (`BRAND.blueLight` background, `BRAND.blueDark` text).

### Inputs

All inputs follow the existing app pattern: 1.5px border, 8px radius, #E5E7EB border, teal focus border. No changes to the input styling system.

### Toggle Rows

Consistent pattern: left side has label (14px, 600 weight) + sublabel (12px, grey), right side has toggle track. Separated by 1px bottom border.

## Scope Boundaries

**In scope:**
- Restructure SettingsView.jsx into 8 card sections
- Add jump links navigation
- Add all new form fields and toggles
- Store new settings in config (same `onUpdateConfig` pattern)
- Visual polish: card headers with icons, size dots on pricing, better slot chip layout

**Out of scope:**
- Notification sending infrastructure (WhatsApp API, email service, SMS gateway)
- Logo upload for business info
- Staff management
- Actual enforcement of booking rules in the customer booking flow (that's a separate feature — this just stores the settings)
- Actual enforcement of customer portal toggles (same — separate feature)
- Mobile responsiveness overhaul (the app is primarily desktop; basic responsive behaviour via existing patterns is fine)

## File Changes

- `src/components/views/SettingsView.jsx` — major rewrite, restructured into 8 sections
- `src/constants/index.js` — may need new default config values for new settings fields
- No new files needed — this is a single-view redesign
