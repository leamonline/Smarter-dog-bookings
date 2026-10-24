Status: Active
Issue: #1078
Base: main, branched 2026-10-24
Last verified: 2026-10-24
Owners: src/index.css, src/customer-portal.css, src/components/ui/, src/components/modals/shell/, src/constants/, website/src/, .design-sync/
Dependencies: None
Related requirements: REQ-A11Y-001 (status text alongside colour)
Related ADRs: ADR 009 (independent website palette)

# Accessible design-system tokens and components

## Goal
Resolve the eight findings recorded in #1078 without modifying booking rules, customer data, or deployment behaviour. Keep the charcoal, sun-yellow, teal, coral and sky identity.

## Why
Several tokens explicitly acknowledge insufficient text or border contrast while remaining selectable for semantic use. Both staff and portal actions have live low-contrast combinations, and semantic safety-alert colours are coupled to a magic hex.

## Current behaviour
- `src/index.css` is the booking application's Tailwind v4 token source. The global focus outline was low-contrast gold and a meaningful border token also used yellow.
- `src/components/ui/Button.jsx`, `.btn-danger`, and portal CTA styles need distinct ink/fill pairings.
- `src/components/ui/BookingStatusBadge.tsx` already keeps unknown raw statuses, but previously displayed the same visual tone as Collected.
- `src/components/modals/shell/alertTints.js` selected warning tints by colour string, including the unknown-size fallback hex.
- Website palette is independent by ADR 009; its yellow/coral constants had drifted from the booking app.

## Desired behaviour and scope
1. Charcoal focus and meaningful selection borders on light surfaces; inverse white outline on dark headers. Yellow remains available as a decorative accent.
2. Normal-size text/fill pairs pass 4.5:1, including white/dark coral and charcoal/bright green. Keep semantic success and WhatsApp text shades readable.
3. Inline links and shared link buttons are underlined without requiring hover.
4. Add automated tests that calculate actual WCAG ratios against the CSS source and assert key component usage.
5. Unknown booking statuses say “Unknown: …” and have their own warm neutral treatment rather than Collected slate.
6. Model alert presentation with `tone` while retaining `color` for compatibility.
7. Make charcoal `--color-brand-ink` canonical and retain old names as compatibility aliases; align independent website colour constants and correct stale Figma kit conventions.
8. Increase 10px/11px micro text to 12px on narrow screens; give primary button controls 44px touch targets, without applying that floor to decorative pills.

## Non-goals
No dark theme, wholesale type redesign, global button migration, customer booking semantics, database changes, schema/migration work, or automatic production deploy.

## Relevant code and architecture
The canonical UI source is `src/index.css`, portal classes remain in `src/customer-portal.css`, reusable actions in `src/components/ui/Button.jsx`, booking status mapping in `BookingStatusBadge.tsx`, and alert metadata in `src/constants/salon.ts`. Website retains its own palette under `website/src/constants/colors.js` per ADR 009. Keep legacy Tailwind class names during migration.

## Data/database changes
None.

## API changes
None.

## UI changes
Colour pairings, focus indicators, keyboard link affordance, touch sizes, mobile metadata scale, unknown-status wording and appearance, alert palette decoupling. Unknown status is still an anomalous state and is not treated as complete.

## Security/privacy considerations
Presentation-only. No customer records, secrets or authenticated endpoints touched.

## Dependencies and risks
Focus styles can be overridden by local utility classes; bright CTAs may have custom styles; button geometry may influence dense layouts. Status-word changes could affect snapshots. Responsive changes may create wrapping on narrow phone screens. The independent website palette's constants are intentionally not imported from the booking app.

## Migration/rollout
Draft PR only. No merge or deployment by this work. Maintain backward-compatible token/class names. Roll back by reverting the PR. Before merge, inspect keyboard focus and touch targets in staff Today, Inbox, modal flows and customer portal at 320px, 390px and desktop, in high zoom and forced-colour mode. Confirm both production apps after approved release.

## Implementation sequence
1. Update semantic CSS colour pairs, rings and links; keep aliases.
2. Fix shared staff, portal and website components.
3. Separate unknown status and semantic alert tones.
4. Update source-linked contrast tests, status tests, website palette tests and usage conventions.
5. Run CI and manual interaction checks; obtain owner approval before merge.

## Testing
Focused: `npm run test -- src/designTokens.a11y.test.ts src/components/ui/BookingStatusBadge.component.test.tsx src/components/modals/shell/alertTints.test.js` plus `npm run website:test`. Repository bar: `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`, `npm run check:docs`. Visual/assistive-technology checks remain required even if unit tests pass.

## Observability
CI test outcomes and pre/post screenshots only, without customer records. Document any failed manual acceptance checks on #1078; do not mark complete based on contrast calculations alone.
