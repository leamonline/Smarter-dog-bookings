> **Historical (archived 2 September 2026).** Design QA notes for the Daily Brief state-and-density refinement that followed PR #536. The screenshots it cites lived in the untracked `.superpowers/` working area. The shipped Daily Brief is documented in `docs/today-command-centre.md`.

# Design QA — Daily Brief state and density refinement

- Source visual truth: the pre-change Daily Brief captures from PR #536 at `.superpowers/sdd/annotation-qa/daily-brief-desktop-after.png` and `.superpowers/sdd/annotation-qa/daily-brief-mobile-after-latest.png`.
- Desktop implementation: `.superpowers/sdd/state-density-qa/desktop-1440-final.png`.
- Mobile implementation: `.superpowers/sdd/state-density-qa/mobile-430-final.png`.
- Combined comparison evidence: `.superpowers/sdd/state-density-qa/desktop-comparison.png` and `.superpowers/sdd/state-density-qa/mobile-comparison.png`.
- Viewports: desktop 1440 × 900 CSS px; mobile touch 430 × 971 CSS px.
- State: Daily Brief for Tuesday 14 July, closed date picker, deterministic offline sample bookings, action key collapsed.

## Findings

No actionable P0, P1 or P2 differences remain. The requested refinements are visible and coherent at both target widths:

- The tiny completion checkboxes have been removed. Each journey icon now communicates its own upcoming, current or completed state through its surface, border, colour and `aria-pressed` value.
- Normal appointment times use neutral brand purple. Coral and amber are reserved for late and confirmation-blocked exceptions.
- The customer-message action uses the established outlined message icon rather than an unexplained filled green bubble.
- Touch layouts expose a compact **Action key** affordance; desktop retains icon-only controls with hover and focus labels.
- Mobile booking cards no longer reserve vertical space for checkbox indicators or desktop hover labels. The measured first booking card is approximately 334 × 218 CSS px at the 430px viewport; the desktop card is approximately 736 × 154 CSS px.

## Required fidelity surfaces

- **Fonts and typography:** The existing Montserrat/system UI stack, weights and centred booking hierarchy are retained. Labels in the optional touch legend use the product's compact UI typography and do not compete with dog and booking details.
- **Spacing and layout rhythm:** Header and KPI geometry are unchanged. Removing secondary checkbox rows tightens booking cards, especially on mobile, while the existing four-column touch grid preserves 44px action targets and balanced gaps.
- **Colours and visual tokens:** Normal time, message and upcoming action states reuse existing purple, cream and slate brand tokens. Coral is now semantic for lateness, and yellow/amber for confirmation blockers; completed stages use brand teal or the existing current-stage treatment.
- **Image and icon fidelity:** All controls use existing Lucide icons; no custom-drawn or placeholder assets were introduced. The touch action key repeats the same icons as the journey row.
- **Copy and content:** “Need action” has a visible operational definition when filtered and an accessible description at rest. The distant-appointment label is “First up”; “Now” remains only for an appointment that is genuinely current.
- **Accessibility:** Journey actions keep accessible names, focus-visible labels and pressed state. The need-action filter is a real toggle with `aria-pressed`. Normal, late and blocked appointments expose state in their accessible names rather than colour alone.

## Full-view comparison evidence

The desktop and mobile source/implementation pairs were placed into combined, same-viewport comparison images and reviewed together. Desktop keeps the existing compact single-row journey while removing the checkbox sub-row. Mobile gains the action key and removes the empty label/checkbox allowance, bringing the first booking's second row into the initial viewport without shrinking its 44px controls. No horizontal overflow, clipping, unintended wrapping or broken navigation was visible.

## Focused-region evidence

The journey area was checked separately in `.superpowers/sdd/state-density-qa/action-key.png` and `.superpowers/sdd/state-density-qa/action-key-open-crop.png`. The collapsed help control is visually secondary, and the expanded legend maps all six stage icons to short labels without changing booking state.

## Interaction and browser checks

- Desktop, tablet and mobile Daily Brief journeys were exercised through Playwright with service workers blocked to avoid stale PWA assets.
- Need-action filtering, action-key expansion, journey progression, keyboard focus, appointment-state colours and message affordances were asserted.
- The relative-time strip is time-dependent; the fixed-clock component test verifies that an appointment hours away is labelled “First up”.
- No application console errors were observed in the final browser run.

## Comparison history

1. **Before:** booking stages used separate checkboxes, every time control was coral, the message action was a filled green bubble, and mobile cards reserved substantial vertical space for secondary controls.
2. **Implemented:** completion moved into each icon's state, exception colours became semantic, the message affordance became recognisable, the need-action count became a defined toggle, and touch gained a compact action key.
3. **Post-fix evidence:** the combined desktop and mobile comparisons show the requested changes with no P0/P1/P2 regressions. Component and responsive E2E tests cover the non-visual state behaviour.

## Follow-up polish

No P3 visual follow-up is required for this slice. Real production data may produce longer dog, breed, service or client names; the existing wrapping behaviour remains the relevant safeguard.

final result: passed
