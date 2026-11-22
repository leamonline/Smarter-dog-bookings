# Current design-system rules

Status: Active
Last verified: 2026-11-22
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

Use charcoal ink, warm paper, sky blue and sun yellow, taken from the salon's
printed flyer. On 22 November 2026 the owner approved the
[flyer visual language](../plans/active/2026-11-22-flyer-visual-language.md),
which brings the flyer's character into both the staff dashboard and the
customer portal at the same level of boldness. It rolls out in steps; where a
rule below names a step, today's rendering holds until that step ships, and the
plan holds the exact values.

Staff navigation stays light; a charcoal-header description in an old export is
not authority to repaint it. Keep staff and portal CSS separate. Every page sits
on warm paper with white rounded cards (the staff calendar moves to paper in
step 3).

Montserrat is body/UI and Poppins is headings; staff page titles stay Poppins
700. Hero lines (sign-in, step titles, confirmations, true empty and done
states) move to Poppins 900 in step 2, replacing Barlow Condensed. Caveat 700 is
the handwritten accent: at most one short line per hero screen, in blue or ink,
never carrying a name, date, price or instruction. The Quicksand descriptions
are historical.

Flyer motifs are allowed by role, and each has a place it never goes:

- The segmented stripe frames the top of a screen. Never inside content.
- The yellow swash underlines a page or step title, or sits behind one or two
  words on a hero moment. Never behind a figure staff act on, never shaped like
  a button.
- Service mascots appear beside their bookable service and on true empty or done
  states. Never as decoration on a failed or filtered result.
- A taped polaroid frames a dog's own photo where it is the hero. Never in lists.

Calendar rows, day-stack strips, inbox threads and side panels carry no
decoration. No checkerboard anywhere. No branded loading effects: skeletons stay
neutral and still. Motion is limited to hero moments (the swash drawing in, a
polaroid settling, one mascot bounce) and is removed under
`prefers-reduced-motion`.

## Actions and controls

- Yellow is the lead-action colour in staff and customer products, including
  booking confirmation, and means only "press this". Charcoal is strong
  secondary. Success and WhatsApp keep their existing green meanings.
- Brand blue (`--color-brand-cyan`) is the brand partner: links, the active tab,
  and the ring and tick on a selected item, over the sky tint. Selection moves
  from charcoal to blue in step 2 (portal) and step 3 (staff); a tick or check
  stays, so colour is never the only signal. The brighter flyer blue
  (`--color-brand-cyan-light`) is decoration only and never text.
- Safety colours are frozen. Status and dog-size colours change once, in step 3,
  to the approved values in the plan: one hue per status, Confirmed in periwinkle
  so it never reads as selected, and only Large dogs coloured (navy). Outside that
  change they are frozen too. The status word and the size letter are always
  shown.
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

Hero lines may carry the flyer's wit ("Come scruffy. Leave gorgeous.", "All
groomed."). Everything else stays plain: labels, buttons, instructions, errors and
anything with a consequence.

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
to decorate an empty result. From steps 2 and 3 a true empty or done state may
show a service mascot instead of the silhouette, under the same conditions. “Nothing booked. Blue skies.” belongs only to a
confirmed empty result, never a failed request or a narrowed search.
`EmptyState` takes `mark="dog"` (the salon silhouette, decorative) only for a true
"nothing here yet"; a search or filter with no matches gets plain words and a
"Clear search" action, so it never suggests the salon has no work. Save and
confirm failures say what failed, say what is still on screen, and where the
result is unknown (a booking, a client) tell staff to check before trying again.

`SafetyAlertChip` accepts `items` and `className`, not a semantic tone, and
keeps its frozen colours. On the day card the safety note is words at the start
of the strip's second line (`DayCard`): the most important warning, then "+N"
for the rest, ordered by `orderSafetyFacts` (`src/engine/safetyOrder.ts`):
handling restrictions such as Pregnant first, then the recorded behaviour
warnings, then free text nobody categorised, then the softer caution and
information notes. Order comes only from the tone staff recorded; nothing is
inferred from age, breed or a diagnosis, and no warning is reworded or dropped.
The line truncates from the end, so the owner's surname gives way before the
warning does. Every warning is in the strip's accessible name, and the lifted
card lists each one in full. It was a separate 44px button (`SafetySummary`)
until November 2026; the strip became the card's only tap target, so the
summary became words inside it and the component was removed. Directory cards
still use `SafetyAlertChip`.

`ToggleChip` is the on/off pill (a filter, an add-on, a channel): a real button with
`aria-pressed`, a tick when pressed so colour is never the only signal, and the
44px touch floor. For one choice from several use a segmented control. `MenuItem`
is one row of a `role="menu"`: a real `role="menuitem"` button, with a `danger`
tone for the single destructive row. The menu still owns opening, Escape and
placement. The `menusAndToggles` ratchet counts the hand-written ones left.

## Today screen hierarchy

Keep the selected date and availability action first; below 640px they share one line, with a short weekday date ("Wed 18 November", "Wed 18 Nov" below 360px) so neither wraps nor truncates, while the date button's accessible name keeps the full date. Previous-day and next-day arrows flank the date; with them in the row, phones show "Wed 18 Nov", 640–767px "Wed 18 November" and 768px up the full date, and below 400px the Availability button drops its clock icon so the line still fits at 360px. Back to today appears on the attention line only while another date is showing. Keep actionable attention
segments prominent and separate from the labelled Day totals group. Put salon
open/closed state, online availability status, day shape and the till total
("£84 taken", never "collected", which belongs to the dogs that have gone home) in
that quieter group; none is removed or available only through an accessible name,
with one exception: on a closed day the online status is not repeated, because a
closed salon always means online booking is closed (the database refuses every
customer booking on a closed date), and the Availability button's name keeps it.
"Salon closed" is neutral muted ink, not alarm red. An empty day drops the
"Everything's on track" reassurance and lets the empty state speak: the next open
day on a closed day, Manage availability on an open today, and what needs a
person (unread messages, approvals, the Later notes opened). The page sits on the
warm paper painted on the scroll area, so it reaches the same edges as the
full-bleed header; grey text on that paper uses `text-ink-muted` (5.1:1), never
`slate-500` (4.2:1) or lighter.
Over-capacity and unknown-status/deposit warnings remain visible before the dog
stack. Preserve count calculations, status labels, chronology and highlight
behaviour. Since November 2026 every DayCard is 128px — a 72px strip and a
56px read-only face — and the stack overlaps them by exactly the strip
(`stackLayout.ts`). Anything staff must read without lifting a card belongs in
that 72px strip, in its two lines: time, name, balance and status pill; then
safety, delivery problem, breed · service · surname and the timing ("1 hr 50
min late", "waiting 25 min", "On the way"). Nothing essential goes in the face,
which only the last card shows.

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
