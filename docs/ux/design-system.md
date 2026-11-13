# Current design-system rules

Status: Active
Last verified: 2026-10-27
Scope: Shared staff controls, customer action semantics and exported-kit guidance

## Source of truth

Current components, `src/index.css` and `src/customer-portal.css` describe what
renders. This page, [buttons](buttons.md), [radius/elevation](radius-and-elevation.md)
and the [modal standard](../modal-standard.md) describe the intended rules.
Dated screenshots and exported token snapshots are evidence of their recorded
revision, not current production or a complete component API catalogue.
The October critique bundle combined older `main@c9c81be` token metadata with
a working-tree snapshot: do not assign it one invented immutable revision.

## One identity, distinct surfaces

Use charcoal ink, warm paper, sky surfaces and sun-yellow lead actions.
Staff navigation is currently light; a charcoal-header description in an old
export is not authority to repaint it. Keep staff and portal CSS separate.
Montserrat is body/UI, Poppins is headings, Barlow Condensed is a limited hero
face. The Quicksand descriptions are historical. Caveat is a retained legacy
font token, not a default accent. Do not introduce checkerboard decoration,
extra illustration or branded loading effects in this consistency slice.

## Actions and controls

- Yellow is the lead-action colour in staff and customer products, including
  booking confirmation. Charcoal is strong secondary. Success and WhatsApp
  keep their existing green meanings; status, dog-size and safety colours are frozen.
- Use `Button` and `IconButton`. `PageHeaderAction` delegates to `Button`, defaults
  to `strong`, and accepts `variant="primary"` for a screen's lead. Buttons are
  pills; inputs and segmented-control frames use 10px `radius-control`.
- Use `Field` with `Input`, `Textarea` or `Select`: these exist. Field connects
  label/hint/error. `PageHeaderSearch` composes Input and IconButton, retains its
  accessible name and input ref, and returns focus to search after clearing.
- Dogs/Customers put view/key/Add controls in the first phone row and search in a
  full-width second row. Count remains available to assistive technology and
  appears visually at wide widths. Directory footer counts remain unchanged.
- Use the shared charcoal focus recipe, with white focus on dark surfaces.
  Yellow is not a focus indicator. Disabled controls use a readable neutral
  fill/text pair instead of fading the entire control.
- Coarse-pointer targets are at least 44 by 44px. Useful text never drops below
  12px; micro and caption are 12px at every width. Shared staff inputs use 16px
  on coarse pointers and 13px on fine pointers; portal inputs stay 16px.
- Do not copy old raw-button modal examples. Use shared controls inside the
  shell. Existing shell geometry is an encapsulated exception to the general
  radius/shadow scale, pending a separate pixel-preserving token migration.

## Feedback and copy

Staff copy is calm and specific: name what failed, then the recovery action.
ErrorBanner's generic fallback is only for an unknown operation; supply a title
and operation-specific retry label at real call sites. Retry and dismiss use
shared controls and wrap on narrow screens. Do not promise input preservation
unless the caller actually preserves it. A failure to send is not proof of
non-delivery: do not introduce automatic resends or claim nothing was sent.

Loading, failure and successfully empty results are separate states. Skeletons
remain neutral and follow the destination layout; the old ceiling-grid claim
is not the current implementation. EmptyState defaults to no icon (`null`).
Prefer text or the existing silhouette where justified; do not add emoji merely
to decorate an empty result. “Nothing booked. Blue skies.” belongs only to a
confirmed empty result, never a failed request or a narrowed search.
`EmptyState` takes `mark="dog"` (the salon silhouette, decorative) only for a true
"nothing here yet"; a search or filter with no matches gets plain words and a
"Clear search" action, so it never suggests the salon has no work. Save and
confirm failures say what failed, say what is still on screen, and where the
result is unknown (a booking, a client) tell staff to check before trying again.

`SafetyAlertChip` accepts `items` and `className`, not a semantic tone, and
keeps its frozen colours. On the day card the safety note is `SafetySummary`: a
full-width target at least 44px high (`--spacing-touch-target`) inside the
unchanged 144px header. It shows up to two recorded warnings, one per line, in
`text-caption` (never below 12px), ordered by `orderSafetyFacts`
(`src/engine/safetyOrder.ts`): handling restrictions such as Pregnant first,
then the recorded behaviour warnings, then free text nobody categorised, then
the softer caution and information notes. Order comes only from the tone staff
recorded; nothing is inferred from age, breed or a diagnosis, and no warning is
reworded or dropped. When the warnings cannot all be read (more than two, or a
line too wide) it says “Review safety instructions before handling · N alerts”
with the real count; that is a prompt to open the full list, not a claim that
everything is visible. Tapping opens the drawer, which keeps every note in full.
Beside a safety note an undeliverable-message flag shrinks to an icon, because
safety keeps the width. Directory cards still use `SafetyAlertChip`; their
layout needs its own verification before they adopt the summary.

`ToggleChip` is the on/off pill (a filter, an add-on, a channel): a real button with
`aria-pressed`, a tick when pressed so colour is never the only signal, and the
44px touch floor. For one choice from several use a segmented control. `MenuItem`
is one row of a `role="menu"`: a real `role="menuitem"` button, with a `danger`
tone for the single destructive row. The menu still owns opening, Escape and
placement. The `menusAndToggles` ratchet counts the hand-written ones left.

## Today screen hierarchy

Keep the selected date and availability action first; below 640px they share one line, with a short weekday date ("Wed 18 November", "Wed 18 Nov" below 360px) so neither wraps nor truncates, while the date button's accessible name keeps the full date. Keep actionable attention
segments prominent and separate from the labelled Day totals group. Put salon
open/closed state, online availability status, day shape and collected total in
that quieter group; none is removed or available only through an accessible name.
Over-capacity and unknown-status/deposit warnings remain visible before the dog
stack. Preserve count calculations, status labels, chronology and highlight
behaviour. This refinement changes TodayHeader only: DayCard's 144px normal
header and all stack geometry/expansion calculations remain unchanged.

## Security check

Do not promise a challenge needs no clicks: an interactive prompt may appear.
Widget failure clears the token and supplies truthful guidance, success clears
the error and expiry removes the success message. CAPTCHA remains fail-closed;
a visitor holding a valid OTP can still verify when resend CAPTCHA is unavailable.
See the [capture investigation](../research/2026-10-27-sign-in-security-check.md).

## Keep it current

Run `npm run check:design-system` and lower ceilings only when the measured
counts fall. There are six ratchets. Usage cards should document real props,
keyboard/touch behaviour and limits, not only a category label. Regenerate
screenshots during the next actual design sync; do not mark an export synced
merely to silence drift reporting.
