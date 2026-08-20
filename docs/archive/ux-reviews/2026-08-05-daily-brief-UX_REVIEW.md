# UX Review

## 1. Review scope and evidence

Interface reviewed: The current Daily Brief (`/today`) three-lane status board for a selected date (staff dashboard), exactly as frozen in `PRODUCT_UX_CONTEXT.md` / `UX_EVIDENCE_MANIFEST.json`.

Workflow reviewed: Staff scan lane warnings and the live "due to arrive" marker to find who needs action, then move each dog through Arriving → With us → Ready to go → Home today, resolving confirmation, welfare and payment exceptions, on today's date or a chosen date.

States reviewed: a populated/busy day across all four lanes, a near-empty real-today day, a fully closed day, the unknown/legacy-status recovery panel, and a past selected date's "Home on this date" behaviour. Not reviewed: loading skeletons, request-failure banners, realtime cross-device moves, the mini-invoice and unpaid-collection modals, and any click-triggered state change (see Material gaps).

Viewports reviewed: 390×844 (phone), 1024×900 (tablet, `md`/`lg` band), 1440×900 (desktop, `xl` band).

Evidence used: E1-E22 (frozen context) plus R1-R8 (registered below).

Visual evidence provenance:

- Evidence ID: R1
- Source type: development-harness
- Location: `http://localhost:5174/today?date=2026-08-05`, offline harness (`VITE_FORCE_OFFLINE=1`, port 5174, the `.claude/launch.json` "offline" configuration)
- Commit or version: `main@6d73281a5010737725c60bc6f24bfdf7536f26e6`
- Viewports: 390×844
- States: today (2026-08-05, Wednesday) with the harness's sparse Wednesday sample data
- Exercised: page load, screenshot, full-page text/accessibility-tree read
- Limitations: development harness with mock sample data; no authentication, no production data, no database integration, and no real-user or end-to-end behaviour is proven

- Evidence ID: R2
- Source type: development-harness
- Location: `http://localhost:5174/today?date=2026-08-03`
- Commit or version: `main@6d73281a5010737725c60bc6f24bfdf7536f26e6`
- Viewports: 390×844
- States: a populated sample Monday spanning Arriving, With us, Ready to go, Home on this date, and the unknown-status recovery panel
- Exercised: page load, screenshot, full-page text read, accessibility-tree read (`read_page`, interactive filter)
- Limitations: development harness with mock sample data; no authentication, no production data, no database integration, and no real-user or end-to-end behaviour is proven; only one populated sample day exists in the fixture

- Evidence ID: R3
- Source type: development-harness
- Location: same URL as R2, resized in-session
- Commit or version: `main@6d73281a5010737725c60bc6f24bfdf7536f26e6`
- Viewports: 1024×900
- States: same populated sample Monday as R2
- Exercised: viewport resize, screenshot
- Limitations: development harness with mock sample data; no authentication, no production data, no database integration, and no real-user or end-to-end behaviour is proven

- Evidence ID: R4
- Source type: development-harness
- Location: same URL as R2, resized in-session
- Commit or version: `main@6d73281a5010737725c60bc6f24bfdf7536f26e6`
- Viewports: 1440×900
- States: same populated sample Monday as R2
- Exercised: viewport resize, screenshot
- Limitations: development harness with mock sample data; no authentication, no production data, no database integration, and no real-user or end-to-end behaviour is proven

- Evidence ID: R5
- Source type: development-harness
- Location: `http://localhost:5174/today?date=2026-08-06`
- Commit or version: `main@6d73281a5010737725c60bc6f24bfdf7536f26e6`
- Viewports: 1440×900, 390×844
- States: a closed, non-open day with zero bookings
- Exercised: page load, screenshot, full-page text read
- Limitations: development harness with mock sample data; no authentication, no production data, no database integration, and no real-user or end-to-end behaviour is proven

- Evidence ID: R6
- Source type: development-harness
- Location: R1/R2 URLs above
- Commit or version: `main@6d73281a5010737725c60bc6f24bfdf7536f26e6`
- Viewports: 390×844
- States: attempted date-picker open, attempted Home-today disclosure expand
- Exercised: `left_click` on the "Choose date" button, its calendar icon, and the "Show 1 dog sent home" toggle (three separate attempts)
- Limitations: development harness with mock sample data, no authentication, no production data, and no real-user or end-to-end behaviour is proven; additionally, in this specific session every click attempt returned a tool-level timeout with no observable DOM change (no `role="dialog"` element appeared; `aria-expanded`/label text never changed), while screenshot, scroll, resize, keyboard `Escape` and navigation all worked normally in the same session — this is registered as an inconclusive interaction gap, not a confirmed product defect

- Evidence ID: R7
- Source type: development-harness
- Location: R2 URL above
- Commit or version: `main@6d73281a5010737725c60bc6f24bfdf7536f26e6`
- Viewports: 390×844
- States: same populated sample Monday as R2
- Exercised: `read_page` accessibility-tree extraction (interactive filter)
- Limitations: development harness with mock sample data; no authentication, no production data, no database integration, and no real-user or end-to-end behaviour is proven; confirms accessible names/structure only, not actual screen-reader output or keyboard traversal

- Evidence ID: R8
- Source type: development-harness
- Location: R2 URL above
- Commit or version: `main@6d73281a5010737725c60bc6f24bfdf7536f26e6`
- Viewports: 390×844
- States: same populated sample Monday as R2
- Exercised: `getComputedStyle`/canvas-based colour sampling on two text elements
- Limitations: development harness with mock sample data; no authentication, no production data, and no real-user or end-to-end behaviour is proven; the sampling method could not reliably resolve Tailwind v4 OKLCH-based translucent (low-opacity) background colours against the true composited page background, so only one of the two attempted measurements is reported with confidence

Material gaps:

- Click-triggered state changes (date-picker open, Home-today disclosure, every journey/action button, every "More" menu, the mini-invoice and unpaid-collection modals) could not be confirmed to work or fail in this session (R6). Given the frozen context names "Choose date" as the trigger for three of the four documented workflow branches (future/past/closed dates), this is the most consequential open gap in this review.
- No loading-skeleton, request-failure, or realtime cross-device move state was observed live; these remain Supported interpretation from code (E3, E13) only.
- Screen-reader output, real keyboard-only tab order, and 200%-zoom/text-scaling reflow were not tested.
- Exact WCAG contrast ratios could not be measured for translucent tinted badges (R8); only one plain opaque-on-opaque pair was confidently measured.
- Only one populated sample weekday (Monday) exists in the offline fixture, so a "typical" day could not be cross-checked against a second busy day.

Assumptions that could not be avoided:

- Treated the offline harness's rendered layout and copy as representative of production, since it mounts the same component tree against different data — consistent with the repository's own stated use of this mode for visual verification (E1).
- Treated the R6 click-interaction gap as a session/tooling limitation rather than a confirmed product defect, in the absence of corroborating evidence either way; it is carried forward as an unresolved item, not as a finding.

## 2. Design thesis

Supported interpretation:

> This interface should help **authenticated salon staff** achieve **an accurate, moment-to-moment picture of every dog's real-world stage (arrived, in-salon, ready, collected) and any outstanding payment, for the selected date** by keeping **the next actionable dog and its lane** dominant while **date navigation, availability management, and each card's own secondary actions** appear only when relevant.

Evidence: context §9, §12; E3-E5, E13.

## 3. Current-design assessment

### What works and should be preserved

Observed: R1-R5, confirmed against code (E4, E5, E13).

- **Dog-first, outcome-led cards.** Every populated card leads with the dog's name and a specific action verb ("Check in", "Start groom", "Ready for collection", "Mark collected") — Observed R2, corroborated by accessible names in R7 ("Check in Rex", "Start Bella's groom", "Mark Charlie ready for collection"). This matches the stated design thesis directly: staff never have to interpret a generic "Next step".
- **Payment stays visually independent of progress.** Bella and Charlie both show "£32 due" while actively being checked in or moved to Ready — Observed R2 — with no visual suggestion that money is blocking their care progress.
- **The unknown-status recovery panel earns its prominence.** A single mis-recorded sample booking (Milo, no status) produced a distinctly bordered "1 booking needs its status fixed" panel with a named "Fix booking" action, positioned above the lanes rather than silently dropped — Observed R2. This is a rare, genuinely exceptional state, and it reads as one.
- **Welfare information surfaces without an extra click.** "🚩 Bites / Nips" and "🚩 Allergic to oatmeal shampoo" render directly on the relevant cards — Observed R2 — keeping safety-relevant information at the point of decision rather than behind "More".
- **Honest, calm empty and closed states.** A near-empty real "today" and a fully closed Thursday each collapse to one message rather than three empty lane panels — Observed R1, R5 — matching the approved rule precisely (E13).
- **Consistently labelled regions and actions.** Every lane, card and control carries a specific accessible name (`"{lane}, {n} dogs"`, `"{dog}, {time}, {lane}"`, `"Mark {dog} collected"`) rather than a generic one — Observed R7.
- **The three active lanes each surface their own same-day warning.** "6 to confirm", "2 unpaid", "1 waiting" sit directly in the lane heading, so staff see the day's shape before reading a single card — Observed R2.

### Friction

Supported interpretation, grounded in Observed evidence (R1-R4) and code (E4, E5):

- The header's operational-status labels can visually clip below their intended words at the phone width tested.
- Home-today is the one lane, of four, that carries no same-day warning signal on its own collapsed heading, even when a dog it contains has an outstanding balance.
- A long owner name can truncate exactly where the surname — the part most likely to disambiguate two similarly-named contacts — sits.
- A lightly populated desktop lane can show a large empty area beneath its one card, because every active lane currently shares one fixed height regardless of how many cards it holds.

### Problem character

Visual (header-label clipping, the desktop empty-space effect) and a small structural omission (Home-today's missing warning is a one-line gap in an already-approved pattern, not an architecture problem). None of the four is a data-model or workflow-logic issue.

## 4. Attention and hierarchy map

| Level | Intended focus | Current evidence | Conflict | Required prominence change |
| --- | --- | --- | --- | --- |
| 1 | The next actionable dog, live-marked when the date is today | Observed R2: the live divider attaches correctly; the card itself is dog-first and action-led | None found | None |
| 2 | The three active lane groupings and their warnings | Observed R2-R4: each lane heading shows title, count and a warning where relevant (e.g. "2 unpaid") | Home-today is structurally a fourth grouping in the same visual rhythm, but never carries a warning even when one is warranted | Extend the existing per-lane warning pattern to the Home-today heading (see §5, Rank 1) |
| 3 | Date/availability/filter controls and each card's secondary actions | Observed R1-R5: Choose date and Manage availability sit below the header stats; Call/More sit at the foot of each card | Structural placement is sound; whether these controls actually respond to a tap could not be confirmed this session (R6) | None to hierarchy; verify the interaction gap (§1 Material gaps) |
| 4 | Daily-progress footer and the two advisory notes | Observed R2: renders last, after Home-today, exactly as the frozen context describes | None found | None |

## 5. Prioritised improvements

| Rank | Priority | Problem | Evidence | Affected user | Proposed change | User benefit | Reduces | Trade-off | Confidence | Constraint status |
| ---: | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | High | Home-today's collapsed heading shows a dog count but no warning, so a dog that went home with money still owed gives no signal until someone manually expands "Show" | E5, R2 | Staff doing end-of-day or later cash-up checks | Reuse the existing `laneWarning` mechanism (already driving "2 unpaid" / "6 to confirm" on the other three lanes) to add an "{n} unpaid" warning to the Home-today heading whenever its collected dogs include an unresolved balance | An unpaid departure is visible at a glance, in the same place staff already look for every other lane's warning, without opening anything | Ambiguity, memory burden, error probability | Minimal — one additional warning computation reusing an existing, approved pattern; no new UI element type | High | Within approved structure (extends a pattern already implemented and approved for the other three lanes; E13's Home-today spec already requires the underlying balance data to be visible once expanded) |
| 2 | High | At 390px, the header's "All on time" and "Need action" labels can clip mid-word ("All on ti…", "NEED ACTI…") even though the underlying text is intact for screen readers | R1, R2 | All phone-width staff reading the header's at-a-glance summary | Shorten the visible copy at narrow widths (e.g. "On time" / "Action") or allow the label to wrap onto a second line instead of forcing a single-line ellipsis | The header's headline "what's going on today" summary stays legible on the viewport this review's own evidence treats as the primary observed one | Interpretation, unnecessary visual competition | Small copy/CSS change; needs a shorter English string or a wrap rule at this exact breakpoint | High | Implemented but open to challenge (a spacing/copy detail, not a named decision in E12 or E13) |
| 3 | Medium | A long owner name (e.g. "Mark Johnson" → "Mark Johns…") can truncate before the surname, in a product where two dogs can share one owner and a similar first name | R2; E20 (the original screenshot shows two different dogs both owned by "Linden Wade") | Staff calling/contacting an owner, or matching a dog to its household on a busy board | Prioritise the surname when space is tight — e.g. truncate the dog's breed (shown elsewhere on the card) before the owner's surname, or allow the meta line to wrap on very narrow cards | Staff can always identify which specific person they are about to call or message | Ambiguity, error probability | Minor layout change to the card's meta row; needs a decision on which field yields space first | Medium | Implemented but open to challenge |
| 4 | Low | Every active lane with at least one card stretches to a shared fixed height on desktop, so a lane with only one card (e.g. Ready to go) shows a large empty block beneath it | R4; E5 (`xl:h-[min(66vh,44rem)]` applied whenever `count > 0`) | Desktop staff scanning the board | Base the lane's height on its own content up to the existing maximum, only introducing the internal scrollbar once a lane's own cards genuinely exceed that height | A quieter, more proportionate board; less "is something missing here" hesitation on a light day | Unnecessary visual competition | Needs a real multi-day content survey before picking a new rule, since this review saw only one populated sample day | Medium | Implemented but open to challenge (the exact height rule is current implementation, not a wording in the approved brief) |

## 6. Refined interaction model

### Before and after

| Stage | Current interaction | Refined interaction | Why |
| --- | --- | --- | --- |
| 1 | Staff glance at the header to gauge the whole day (Late/On site/Ready/Action) | Same, with full-word labels preserved at phone width | Preserves the "at a glance" thesis on the viewport this review's evidence treats as primary (R1, R2) |
| 2 | Staff glance at lane headings to see which lanes need attention (Arriving/With us/Ready to go) | Same three lanes, plus Home-today now carrying its own warning when relevant | Extends an already-trusted pattern to the one place it was silently missing, rather than inventing a new signal type |
| 3 | Staff read a card's owner name to decide who to call | Same, with the surname protected from truncation ahead of lower-value text | Keeps the actual decision-relevant information (who, specifically, to call) intact under space pressure |

### Branches, defaults, disclosure, validation, commitment, cancellation, undo, and recovery

Proposed refinement: none of the four ranked recommendations changes a branch, default, validation rule, commitment point, or recovery path. Each is a presentation-layer addition or adjustment to already-approved mechanics (E4's `requiresCareSkipConfirmation`, E13's per-lane warning pattern, E16's modal contract) — none require new confirmation states or alter what is reversible.

## 7. Refined interface structure

| Region | Role | Content priority | Persistence | Responsive transformation | Why it deserves space |
| --- | --- | --- | --- | --- | --- |
| Header (date, salon-open state, operational-status grid, secondary totals) | Orient staff to the whole selected date before any single dog | Primary | Persistent, sticky above the lanes | Stacks its two rows on phone; unchanged structurally at wider widths (R1-R5) | It answers "what does today look like" before any card does |
| Active lanes (Arriving / With us / Ready to go) | Group dogs by real-world stage | Primary | Persistent while populated | 1-column phone → 2-column tablet (Ready to go spans) → 3-column desktop (R2-R4) | This is the actual work queue |
| Home-today | Compact history of the day's completed visits | Secondary, rising to primary only when an unresolved balance exists (proposed) | Persistent but collapsed by default | Unchanged across viewports observed | Keeps completed visits available without competing with active ones |
| Daily-progress footer + advisory notes | Whole-day totals and periodic nudges | Tertiary | Persistent, always last | Unchanged across viewports observed | Deliberately subordinate — confirmed by DOM/visual order in every state observed |

No structural change is proposed: no new page, modal, drawer, tab, or navigation destination. All four ranked recommendations sit inside these existing regions.

## 8. Refined wireframes

### Structural wireframe: Home-today heading, with warning (proposed)

```text
[Home today | 3 dogs | 1 unpaid]                          [Show ⌄]
```

- User intention: glance at the day's completed visits and know immediately whether anything is still owed.
- Dominant focal area: the warning text itself, styled identically to the other three lanes' warnings (same coral, same position, same "· {n} {word}" pattern).
- Visible actions: "Show"/"Hide" toggle, unchanged.
- Hidden or deferred information: which specific dog(s) are unpaid — stays behind "Show", exactly as today.
- System feedback: none needed; this is a static computed label, recalculated whenever the board recomputes (same mechanism as the other lanes).
- Next transition: tapping "Show" reveals the existing per-row balance detail (E5's `PaymentState` per row), unchanged.
- Evidence basis and limitations: extends E5's existing `laneWarning` function and `StatusLane` heading markup to a fourth call site; no rendered mockup of this exact state exists, so exact spacing/typography is not prescribed here.

### Structural wireframe: header operational-status row, non-truncating (proposed, phone width)

```text
[ On time      ] [ 0        ] [ 0        ] [ Action     ]
[ LATE          ] [ ON SITE  ] [ READY    ] [ 6 need it  ]
```

- User intention: read the whole day's operational state in one glance without an unexplained ellipsis.
- Dominant focal area: whichever cell is non-zero/non-calm (unchanged from current logic — only copy length changes).
- Visible actions: the Action cell remains a tappable filter toggle when its count is greater than zero, unchanged.
- Hidden or deferred information: none — this is strictly a copy-length and wrap adjustment, not a new disclosure state.
- System feedback: none needed.
- Next transition: unchanged — tapping the Action cell filters the board, exactly as today.
- Evidence basis and limitations: the exact final wording is a proposal, not a rendered fact; the underlying data and states are Observed (R1, R2) and unchanged by this proposal.

## 9. Component and state specification

### Home-today lane heading (extended)

- Purpose: orient staff to the day's completed visits and flag any that still owe money, at a glance, without opening the list.
- Content: lane title ("Home today" / "Home on this date"), dog count, an optional warning ("{n} unpaid"), and the Show/Hide toggle.
- Default state: warning hidden when every collected dog for the date is paid (mirrors the other three lanes today).
- Interaction states: unchanged — Show/Hide toggle, keyboard-operable, `aria-expanded`.
- Validation: none; the warning is a derived read, not user input.
- Accessibility behaviour: the warning text should be included in the region's existing accessible name (`"{title}, {n} dogs"` → extend to include the unpaid count) so screen-reader users get the same signal sighted users do, not only a visual coral label.
- Responsive behaviour: unchanged from the current heading's responsive treatment (Observed R1-R5: consistent single-row heading at every tested width).
- Loading behaviour: unchanged — the heading is part of the same board render as the lanes; no separate loading state is introduced.
- Failure behaviour: unchanged — if payment data for a given booking is unavailable, that booking is simply excluded from the warning count, the same way `PaymentState` already degrades per row.
- Success behaviour: the warning appears/disappears immediately as the underlying board recomputes, with no separate confirmation needed (it is not a user action).
- Relationship to neighbouring components: reuses `laneWarning`'s exact pattern from `StatusLane` (E5); intentionally identical in tone and placement to "2 unpaid" / "6 to confirm" so staff do not have to learn a second warning convention.

### Header operational-status label (adjusted copy/wrap only)

- Purpose: give staff the day's Late/On site/Ready/Action counts in one scannable row.
- Content: a value (count or calm-state word) and a short label, unchanged in meaning.
- Default state: calm-state wording ("All on time" / "All calm") when the relevant count is zero — Observed R1, R2.
- Interaction states: the Action cell becomes a toggle button once its count is greater than zero — Observed R2 (unchanged by this proposal).
- Validation: none.
- Accessibility behaviour: unchanged — the DOM text is already complete regardless of visual truncation (Observed R1: `get_page_text` returned the full "All on time" even while the screenshot showed "All on ti…"); this proposal only fixes what sighted users see.
- Responsive behaviour: the fix applies specifically at the phone widths where clipping was Observed (R1, R2); wider widths were not seen to clip.
- Loading behaviour: unchanged.
- Failure behaviour: unchanged.
- Success behaviour: unchanged.
- Relationship to neighbouring components: purely a copy/wrap change inside the existing `OperationalFact`/action-cell markup (E6); no new component.

## 10. Information-density and complexity audit

| Change type | Element or decision | Proposed treatment | Why simplification is safe |
| --- | --- | --- | --- |
| Contextual | Home-today warning badge | Rendered only when the unresolved-balance count is greater than zero; absent otherwise | Mirrors the exact existing pattern already approved for the other three lanes (E5); adds nothing to the common, all-paid case |
| Preserved complexity | Four-lane structure and per-lane sort rules | No change proposed | Each lane maps to one genuine operational stage; collapsing them back into one feed would undo the change E13 was written to make |
| Preserved complexity | Full journey history kept behind "More", not a five-icon grid | No change proposed | Already minimal per card; keeps one primary, one secondary action visible, consistent with E13 rule 2 |
| Deferred | Exact desktop lane height/min-height value | Treated as a follow-up visual-QA task once more real or sample content is available | This review observed only one populated sample day; picking a precise new height threshold now would be a guess, not evidence-led |
| Removed | — | None proposed | No element in this review's scope was found safe or necessary to remove |

## 11. Accessibility review

| Risk or requirement | Severity | Affected users | Evidence | Proposed correction | Requires implementation testing? |
| --- | --- | --- | --- | --- | --- |
| Colour contrast of translucent (low-opacity) coral/amber tinted badges (lane warnings, "Needs confirmation") is unverified | Medium | Low-vision users; any user in poor lighting | R8 (measurement attempt inconclusive for OKLCH translucent backgrounds); the pattern itself is a recognised contrast risk regardless of this session's measurement gap | Measure the actual composited contrast of each tinted badge against its true rendered background using browser devtools' contrast checker, and adjust opacity/colour if any pair falls under 4.5:1 for its text size | Yes |
| Actual touch-target sizing (44px minimum) is documented (E13, E16) but not independently measured on a rendered page | Low | Touch/motor-impaired users on phone and tablet | Context §17; not independently re-measured this session | Spot-measure the rendered primary/secondary action buttons and the Home-today toggle against 44×44px in a real browser | Yes |
| Screen-reader output and real keyboard-only tab order are undemonstrated beyond the accessible-name tree | Medium | Screen-reader and keyboard-only users | R7 (names/structure only, not traversal or announcement behaviour) | Run an actual screen-reader pass (VoiceOver/NVDA) and a keyboard-only pass across all four lanes, the live-arrival marker, and the three modals | Yes |
| 200% zoom / text-scaling reflow is unverified | Low-Medium | Low-vision users relying on browser zoom | Not tested this session | Zoom the rendered page to 200% at phone and desktop widths and confirm the board reflows without lost content or horizontal scroll | Yes |
| The Home-today heading's proposed warning text (Rank 1, §5) must be exposed to assistive technology, not only shown visually | Medium if unaddressed | Screen-reader users | §9 (component spec) | Include the warning in the region's accessible name, not as a colour-only or visual-only addition | No — addressable at implementation time within the same change |

## 12. Edge cases and recovery

| Trigger | Interface state | Feedback | Preserved input | Recovery | Duplicate or harmful-action prevention |
| --- | --- | --- | --- | --- | --- |
| Selected date has zero active bookings (Observed R1, real "today") | One calm "No bookings on this date" card; header stats all read zero/calm | Plain text, no error styling | N/A | Choose date / Manage availability remain available | N/A |
| Selected date is closed with zero bookings (Observed R5) | Same single calm empty message; header shows "Salon closed" / "No online slots · bookings closed" | Plain text | N/A | Choose date / Manage availability remain available | N/A |
| A booking's status falls outside the four active statuses (Observed R2, Milo) | Separate coral "1 booking needs its status fixed" panel above the lanes, with a named "Fix booking" action; excluded from every lane's count | Explicit heading + one-line explanation | N/A | "Fix booking" opens the existing booking detail (E5) | Booking cannot silently sit in the wrong lane or be double-counted (E5 `excludedCount`) |
| Selected date is in the past (Observed R2, 2026-08-03 relative to real-today 2026-08-05) | Stored statuses render as-is; still-actionable cards (e.g. "Start groom") remain tappable; "Home on this date" label replaces "Home today" | Timing labels fall back to state words ("Waiting") rather than a fabricated duration (Supported interpretation, E4/E13) | N/A | Staff can still correct a historical record via the same actions | Lateness/live-marker copy is suppressed rather than fabricated from the current clock (E13, "Past date") |
| Booking load fails after a prior successful load (Supported interpretation, not observed this session) | Last confirmed board stays visible with a failure banner | Explicit banner + Retry | Previously loaded rows are not blanked | Retry re-issues the same fetch (E3) | N/A |
| Staff attempt to mark a Ready dog collected while a balance is still due (Supported interpretation, E13/E16, not observed this session — no unpaid Ready dog existed in the sample data) | A compact dialog offers "Take £{amount}" / "Mark collected anyway" / "Cancel" | Explicit copy: "Collection and payment are separate. Continuing will not mark this booking paid." | Booking stays in Ready to go until a choice is made | Cancel returns to the board unchanged | Cannot be silently bypassed; both outcomes are explicit user choices |
| A remote device changes a booking's lane while this staff member is viewing the board (Supported interpretation, E13, not observed this session) | Card moves once to its new lane | One toast + one `aria-live` announcement naming the dog, old lane and new lane | Focus/scroll position is preserved | N/A (informational) | Local vs remote echo de-duplication prevents a duplicate toast for the viewer's own action |

## 13. Responsive behaviour

| Viewport or input | Remains primary | Moves or collapses | Becomes contextual | Remains persistent | Context preservation |
| --- | --- | --- | --- | --- | --- |
| Phone, 390×844, touch (Observed R1, R2) | The next actionable card; lanes stack in fixed order (Arriving → With us → Ready to go → Home) | Header's two rows stack; header-label truncation observed at this width (§5 Rank 2) | The Need-action filter chip only becomes a toggle once its count is non-zero | Header, Choose date/Manage availability | Single continuous vertical scroll; no active-lane tabs (Observed R1, R2) |
| Tablet, 1024×900, touch/pointer (Observed R3) | Same active lanes, now two per row | Arriving/With us pair up; Ready to go spans the row beneath | Same as phone | Same as phone | Document scroll remains the only vertical scroll container (Observed R3) |
| Desktop, 1440×900, pointer/keyboard (Observed R4) | All three active lanes in one row | Ready to go returns to its own single column | Same as phone | Same as phone | Each populated lane shares a fixed height with independent overflow scroll once its own content exceeds it (Observed R4; see §5 Rank 4 for the resulting empty-space effect on a lightly populated lane) |

Real-world device priority remains unknown (no analytics, research, or owner decision was available in either the discovery or this review); the three viewports above are reported as implementation optimisation, Observed as implemented, not as a priority ranking.

## 14. Signature interaction

Proposed refinement: when a staff member's own action moves a card into a different lane and both the origin and destination lanes are visible in the current viewport (tablet/desktop's multi-column layout), let the card visually travel from its old position to its new one over roughly 150-250ms, rather than the lane simply re-rendering the card in its new place with no transition. The existing toast and `aria-live` announcement (E3, E13) continue to fire immediately and are never delayed by the animation.

Accessibility and repeated-use rationale: respects `prefers-reduced-motion` by skipping straight to the final position with no animation; never blocks or slows the next action (it is purely visual, non-modal, and the underlying state change is already complete before the animation starts); stays useful on the fiftieth use because it reinforces "your tap just moved this dog" at the exact moment of highest attention (right after tapping), without adding any new step, click, or waiting time.

## 15. Acceptance criteria

- AC-01: At any viewport, when Home-today contains at least one dog with an unresolved outstanding balance, the collapsed Home-today heading displays a warning (e.g. "1 unpaid") styled like the other three lanes' warnings.
- AC-02: At any viewport, when every dog in Home-today is fully paid, no warning renders next to the Home-today heading.
- AC-03: At 375-430px viewport widths, the header's Late/On site/Ready/Action operational-status grid renders its full word set with no mid-word ellipsis, in the default English locale.
- AC-04: Given the Need-action count is greater than zero at a phone viewport, when the header renders, then the "Need action" label text is not visually clipped at the current 9-10px scale.
- AC-05: Given a due-or-arriving card whose owner display name would overflow the available width, when the card renders, then the owner's surname remains visible or reachable without opening the booking, even if another field on the same line is shortened instead.
- AC-06: At desktop viewports (≥1280px), when an active lane contains fewer cards than would fill its current fixed height, then the lane's unused space is reduced relative to today's behaviour, and every lane containing at least one card still renders without a nested scrollbar shorter than its own content requires.
- AC-07: Given a staff member's own action moves a card to a newly visible lane on tablet/desktop, when the move completes, then the card animates to its new position within 300ms; given `prefers-reduced-motion` is set, when the same move completes, then the card repositions instantly with no animation; in both cases the existing toast and `aria-live` announcement fire without added delay.
- AC-08: Given a booking whose status is outside the four active lane statuses, when the board renders, then it appears only in the unknown-status recovery panel with a "Fix booking" action and is excluded from every lane's dog count (Observed R2).
- AC-09: Given a selected date the salon has marked closed with zero bookings, when the board renders, then it shows one combined empty message rather than a separate empty panel per lane (Observed R5).

## 16. Final assessment

Supported interpretation: the current Daily Brief three-lane board is a coherent, evidence-backed implementation of its own design brief (E13) — dog-first cards, outcome-led actions, payment kept independent of lane, honest empty/closed/unknown-status states, and consistent accessible naming were all directly Observed in this session (R1-R7), not merely inferred from code.

Proposed refinement: the four ranked items in §5 — a same-day unpaid warning on Home-today, non-truncating header labels at phone width, surname-safe owner-name truncation, and content-based desktop lane height — each sit inside the existing structure and extend patterns already approved elsewhere on the same board.

Deliberately preserved: the four-lane structure and its sort rules, the one-primary/one-secondary/one-overflow card action model, the unknown-status recovery panel's prominence, and the responsive column transformation (1 → 2 → 3 columns) confirmed live at all three tested viewports.

Unresolved: whether the date-picker, the Home-today disclosure, and every journey/action button actually respond to a click in a real browser session — this review's own click attempts were inconclusive (R6) and should be re-verified in an authenticated or at least genuinely interactive session before this is treated as settled either way. The exact desktop lane-height threshold (§5 Rank 4, §10) is deferred pending a broader content survey. Screen-reader traversal, keyboard-only traversal, 200% zoom reflow, and exact contrast ratios for translucent badges remain untested (§11).

Owner approval required: none. All four ranked recommendations extend already-approved patterns within the current three-lane structure; none adds a page, modal, drawer, tab, or new workflow branch, so the structural-change gate is not triggered.

Remaining barrier to a world-class professional standard: confirming, in a real interactive session, that every control on this board actually does what its code says it should — the one gap this review could not close was verifying its own clicks, which is precisely the class of defect that would otherwise be invisible to a review built from static evidence alone.
