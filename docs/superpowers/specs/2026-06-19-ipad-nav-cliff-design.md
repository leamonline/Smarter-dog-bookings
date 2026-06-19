# iPad navigation cliff — design (2026-06-19)

## Problem
Primary section navigation is unreachable at **768–1279px** (iPad portrait *and* landscape). The full top-nav is `hidden xl:flex` (≥1280) and the mobile bottom-tab is `md:hidden` (<768), so the 768–1279 band shows only the compact top bar (logo · Overview · New booking · Settings gear · Account) — **no links to Dogs / Humans / Inbox / Reports**. DOM-verified live at a 1054px viewport.

## Decision
Extend the existing, fully-tested **bottom tab bar** to cover the whole sub-desktop range (<1280) — the "bottom tab on iPad" pattern. User-chosen; lowest risk; reuses tested UI with no new components.

## Changes
1. `src/components/layout/AppToolbar.jsx` bottom `<nav>` (~L376): `md:hidden` → `xl:hidden` — show the 5-tab bar (Bookings/Dogs/Humans/Inbox/Reports) at all widths <1280.
2. `src/components/layout/AppToolbar.jsx` tab row inner `<div className="flex">` (~L379): add `max-w-xl mx-auto` so tabs cluster centrally on wide iPad-landscape rather than stretching edge-to-edge; remains full-width on phones (max-width doesn't constrain below 576px).
3. `src/App.jsx` AppFrame (~L588): `pb-20 md:pb-5` → `pb-20 xl:pb-5` — move the content-padding cliff to match, so content clears the now-visible bar across the whole <1280 range (fixes the audit's "pb-20→pb-5 at md" clipping note).
4. `src/contexts/ToastContext.jsx` toast container (~L95): `bottom-20 md:bottom-6` → `bottom-20 xl:bottom-6` — keep toasts clear of the bar across <1280 (the bar is now present there); they drop low only at ≥1280.

## Out of scope (unchanged)
- **Settings** stays on the compact top-bar gear (shown at all <1280 widths) → keep 5 tabs; don't crowd phones with a 6th. Settings remains reachable everywhere.
- **Overview / New booking / Account** already sit on the compact top bar at iPad widths.
- **Phone (<768)** and **desktop (≥1280)** behaviour: unchanged.

## Verification
`npm run build` + CI (incl. `e2e` + `agent-tests`) + Vercel preview: at iPad portrait (820) and landscape (1180) the bottom tab bar is visible with all five sections reachable and no content hidden behind it; phone (<768) and desktop (≥1280) are visually unchanged.

## Risk
Low — breakpoint + padding only, reusing tested UI. A bottom tab bar on a wide iPad-landscape is a slightly phone-ish pattern (mitigated by the centred, capped tab row).
