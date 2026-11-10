# Historical findings rechecked on 10 November 2026

Status: Research. Base: `aa0929bd`. Current source evidence, not production deployment attestation. Fixed means the cited remedy exists; partial/unverified is deliberately not counted as fixed or regressed. No old screenshot is reused. No regression is asserted without evidence of an intervening fix.

# Recheck ledger — named June findings and archive scope

Checked 2026-11-10 against aa0929bd plus current audit worktree. Static code evidence only; no old screenshots reused and no browser writes. **Fixed** means the cited implementation now contains the remedy, not a claim of fresh device or assistive-technology verification. **Open** means a currently identifiable source issue; **unverified** is deliberately retained for claims requiring rendering, failure simulation or broader tracing. No finding is called regressed without proving an intervening fix.

The complete June digest is present: `docs/ux-review-assets/_code-findings-digest.md` (IDs [0]–[158], 159 confirmed claims), plus `_tap-target-worklist.md` (100 historical controls). This ledger covers **every named finding/theme in sections 4a–4e**, not all 159 digest entries. Digest claims also require scepticism: disabled controls are exempt from WCAG normal contrast requirements even though unreadable controls remain a usability problem, and non-modal dialogs do not inherently require modal focus trapping. Do not import the old severity numbers wholesale.

## June 4a — accessibility

| ID here | Named finding | Status | Current evidence / precise limit |
|---|---|---|---|
| JUN-A01 | Invisible placeholders | Fixed in global/shared treatment | `src/index.css:804–807` now explicit #64748b opacity1; login uses shared Input. Did not verify every local overriding placeholder rule. |
| JUN-A02 | Unreadable shared disabled buttons | Fixed in primitives | `src/components/ui/Button.jsx:27–52` neutral disabled fills/text; `src/index.css:789–792`; `src/customer-portal.css:1162–1169`. Custom opacity-only disabled buttons still exist (CustomerLoginPage.jsx:328), so no universal all-call-sites claim. |
| JUN-A03 | Status pipeline and inline picker fail to announce state | Fixed in cited controls | `BookingStatusBar.jsx:41–48,62–68` live region and radio state; `BookingCardNew.jsx:420–422,464–466` current status label/selected option. Screen-reader output untested. |
| JUN-A04 | Inline listbox lacks arrow keys | Fixed | `src/components/booking/BookingCardNew.jsx:439–453` ArrowUp/Down/Home/End navigation. |
| JUN-A05 | No keyboard alternative to drag rescheduling | Fixed alternative exists | `BookingCardNew.jsx:295–300` named booking-open button → detail `BookingActions.jsx:76–84` named Reschedule button. This is an alternative through the modal, not keyboard dragging. Exact end-to-end keyboard journey still needs testing. |
| JUN-A06 | Dogs/Humans searches unlabelled | Fixed | `DogsView.jsx:436` / `HumansView.jsx:591` use PageHeaderSearch, which composes labelled Input; validate its current accessible DOM in lead capture. |
| JUN-A07 | New Booking search/service/recurring/remove controls unlabelled | Fixed in cited controls | `new-booking/DogSearchSection.jsx:264` search label, :149 remove aria-label, :159 service aria-label; `BookingFormFields.jsx:66` associated recurring label. |
| JUN-A08 | Settings closure label unlabelled | Fixed | `HoursSettings.jsx:194` aria-label Closure label (optional). |
| JUN-A09 | New Booking validation lacks aria-live | Fixed cited instance; global claim unverified | `new-booking/BookingActions.jsx:29–31` role=status aria-live=polite; `BookingFormFields.jsx:56` also live. 'Several modals' is not a bounded component inventory; not claimed all fixed. |
| JUN-A10 | Settings Delete service non-semantic | Fixed by truthful read-only replacement | `PricingSettings.jsx:76–80` real labelled disabled button; current prices read-only (:64–70), so no active fake delete. |
| JUN-A11 | Large-dog slot pills non-semantic | Fixed by read-only replacement | `settings/CapacitySettings.jsx:3–8,59–82` read-only description of authoritative rules; interactive false switches removed. |
| JUN-A12 | Upcoming-closure pills non-semantic | Fixed semantics, targets remain open | `HoursSettings.jsx:166–175` real named remove button; tiny p0 target remains a different size issue. |
| JUN-A13 | Notification badges non-semantic | Fixed by read-only replacement | `NotificationSettings.jsx:3–6,27–40` explanatory list replacing ineffective switches. |
| JUN-A14 | Truncated directory alerts lose safety information | Fixed | `ui/SafetyAlertChip.jsx:27–38` full joined text in title and aria-label; :39–52 expands visually; DogsView.jsx:217 uses it. |
| JUN-A15 | Empty slot rows fade opacity70 until hover | Fixed cited row | `booking/SlotGrid.jsx:320–330` current class list has no old opacity70; explicit empty row heights and GhostSeat child. Child-level contrast still requires rendering. |
| JUN-A16 | Reports micro labels 10px | Fixed named token | `src/index.css:339–342` micro/caption12px; reports use text-micro e.g. `reports/RevenueTrend.jsx:43`, `DemandPattern.jsx:82`. This is not proof every arbitrary text size across Reports was audited. |
| JUN-A17 | Overview close fails focus restoration | Fixed infrastructure | `dashboard/OverviewDrawer.jsx:37` DrawerShell; `ui/AccessibleModal.tsx:206` FocusScope restoreFocus. Runtime opener focus still needs keyboard test. |

## June 4b — each named target family

| ID | Named finding | Status | Current evidence / precise limit |
|---|---|---|---|
| JUN-T01 | A–Z jump letters below44 | Open | `DogsView.jsx:81`, `HumansView.jsx:68`: 28px desktop/36px max-md, no coarse-pointer44. Improving them affects rail layout; needs layout judgement, not blanket enlargement. |
| JUN-T02 | Header icon buttons below44 | Fixed shared control, broad family unverified | AppToolbar header uses IconButton at affected sites; `ui/IconButton.jsx` coarse-pointer floor. Not every header's ad-hoc button enumerated. |
| JUN-T03 | Status stepper pill targets | Partly fixed; width unverified | `booking-detail/BookingStatusBar.jsx:103` min-height44 added, but five-column grid and no min-width44; rendered widths need measurement. Current phone labels remain10px, separate readability issue. |
| JUN-T04 | Mini-calendar dates | Open | `dashboard/MiniCalendarCard.jsx:123–132` min-height40, width from seven columns. Month arrows now IconButton (:64,70); dates still not44. |
| JUN-T05 | Previous/next day chevrons | Unverified whole family | Old `DayHeader.jsx` no longer exists. Present WeekCalendarView.jsx:324 calendar/overview target has pointer-coarse44. Need inspect current CalendarTabs arrows as a separate bounded check before saying all fixed. |
| JUN-T06 | To-do move/delete tiny targets | Fixed source | `modals/TodoModal.jsx:374,385,395` tap-target utility; `src/index.css:681–683`44px. |
| JUN-T07 | WhatsApp directory icons below44 | Fixed current directory actions | `DogsView.jsx:136–148` icon link; HumansView contact actions use min-h11/min-w11 around :248 onward. Glyph size is not hit-area size. |
| JUN-T08 | Other inline action icons below44 | Unverified blanket theme | Known counterexample `HoursSettings.jsx:166–175` remove closure p0; not every original digest icon mapped. Keep scoped open items rather than claiming all fixed. |
| JUN-T09 | To-do checkboxes tiny | Fixed enlarged hit area, overlap unverified | `TodoModal.jsx:350` pseudo-element inset12 extends20/24px checkbox to44/48px. Browser must check adjacent target overlap. |

## June 4c — layout and responsiveness

| ID | Named finding | Status | Current evidence / precise limit |
|---|---|---|---|
| JUN-L01 | No nav768–1279 | Fixed | `AppToolbar.jsx:95` desktop lg+; `MobileNavStrip.jsx:23` belowlg, so no md→xl hole. |
| JUN-L02 | Phone cannot reach right-rail workflows | Fixed alternate homes | `dashboard/BookingGridControls.jsx:39–43` reminders/waitlist/tasks badges; Inbox primary nav `navConfig.jsx:56–58`; `WeekCalendarView.jsx:332–338` delivery issues surfaced above phone schedule. |
| JUN-L03 |1024–1279 loses three-column sticky layout | Rejected as automatically defective; current responsive alternative exists | `DashboardShell.jsx:44` two columns lg, three xl; :53,61,70 per-column scrolling. A2 layout differs intentionally; fresh screenshots can reveal defects, but losing a third column alone is not a bug. |
| JUN-L04 | Settings omitted from bottom tabs | Fixed access, intended placement differs | `AppToolbar.jsx:337–345` mobile tools-menu Settings; `navConfig.jsx:79–83` explicitly settings via tools. Lack of dedicated primary tab is a decision, not unreachable settings. |
| JUN-L05 | Pricing90px columns overflow phone | Partly fixed; horizontal task friction open | `PricingSettings.jsx:23–25,46` overflow-x-auto wraps min-width440px fixed grid; it now scrolls instead of forcing document overflow. Rows read-only; responsive redesign needs observation. |
| JUN-L06 | Hours fixed grid overflows phone | Partly fixed; rendering unverified | `HoursSettings.jsx:102–107` overflow-x-auto plus min-width320px. At390 inside nested card padding it may still need horizontal scrolling; cannot claim document clipping. |
| JUN-L07 | Appointment modal fixed480px | Fixed | `BookingDetailModal.jsx:257` w[min(480px,93vw)]. |
| JUN-L08 | Overview max-w-sm overflows small landscape | Fixed bounds | `OverviewDrawer.jsx:41` max-width min(24rem,80vw). |
| JUN-L09 | Inbox ten-chip row clipped without affordance | Fixed source | `inbox/workspace/ConversationPane.jsx:156–159` overflow-x-auto, thin scrollbar, right-edge fade. Visibility of affordance needs visual check. |
| JUN-L10 | Reports clip/collide on phone | Unverified | `reports/RevenueTrend.jsx:20` still90px phone/110px sm plot height; that alone does not prove clipping; text labels have changed. Needs actual data/390px capture, cannot reuse June image. |

## June4d — functionality

| ID | Named finding | Status | Current evidence / precise limit |
|---|---|---|---|
| JUN-F01 | Dogs Name sort is no-op | Rejected (prior report itself retracted), no new failure established | Current offline DogsView.jsx:306 sorts localeCompare name; online useDogs.ts:77 passes dirSort. Did not re-run hosted RPC. |
| JUN-F02 | Inconsistent directory default sorts | Rejected (prior report retracted) | Current source preserves saved view/sort choices; no fresh contradictory evidence. Owner's stale localStorage is not a product regression. |
| JUN-F03 | A–Z count wrong | Fixed | `DogsView.jsx:347`, `HumansView.jsx:495` narrowed includes activeLetter; labels derive narrowed immediately below. |
| JUN-F04 | Inconsistent Settings Save/autosave model | Partly fixed, intended differences remain | Business/Hours explicit Save; Capacity/Pricing/Notifications now read-only. Does not establish every remaining tab uses same save mode. |
| JUN-F05 | No Settings validation | Fixed at cited business email; global unverified | `BusinessSettings.jsx:40–43` validates email; claim 'no validation' no longer true. Did not inventory all fields. |
| JUN-F06 | No Settings unsaved warning | Fixed tab/unload cases; app-route case unverified | `SettingsView.jsx:72–93,206–211` beforeunload plus tab discard dialog; no exhaustive navigation test. |
| JUN-F07 | Silent delete closes before completion | Fixed | `booking-detail/BookingActions.jsx:193–207` awaits onRemove, failed result keeps dialog, toast then closes on success. |
| JUN-F08 | Subtle booking autosave indicator | Fixed implementation, visual prominence unverified | `BookingActions.jsx:34–48` persistent live region with Saving/Saved words and tick; tests pin behaviour. |
| JUN-F09 | Archived Humans endless loading/no error | Fixed rejection handling; timeout unverified | `HumansView.jsx:454–470` catch sets error; :685–690 ErrorBanner retry. Never-resolving network still not bounded here. |
| JUN-F10 | Archived Dogs endless loading/no error | Open | `DogsView.jsx:310–319` fetch.then only, no catch; :554–556 Loading archived dogs while null. Rejected fetch leaves null/loading. No local runtime failure simulation done. |
| JUN-F11 | Cached modal retains edit state | Fixed for booking detail; broader family unverified | `BookingDetailModal.jsx:138–147` resets on booking.id; `useBookingEditState.ts:137–140` sets isEditing false. Same-ID cached reopen needs mount lifecycle test. |
| JUN-F12 | Delivery failure card lacks CTA | Fixed | `dashboard/DeliveryFailuresCard.jsx:58–68` clickable row via onSelectFailure; `WeekCalendarView.jsx:338,420` supplies handler. |

## June4e — visual/microcopy

| ID | Named finding | Status | Current evidence / precise limit |
|---|---|---|---|
| JUN-V01 | Inactive status labels faint | Fixed stated colour; live contrast unverified | `BookingStatusBar.jsx:103–108` inactive slate600/slate100, active named accent/onAccent. Phone label10px remains readability debt. |
| JUN-V02 | Checked-in/In-bath/Ready badges faint | Unverified per-status composite | Current status display palette governed/frozen; do not change or declare all pass from comments. Parent staff reviewer can inspect current badge screenshot. |
| JUN-V03 | Medium/large size white letters low contrast | Fixed | `SizeDot.jsx:11–17` dark medium/large fills, white letter; small charcoal. |
| JUN-V04 | Past date slate500/slate200 low contrast | Partly fixed token but composition unverified | `DayTab.jsx:18` now text-ink-muted; ancestor closed-date opacity60 at :68 can affect final rendering. Needs composited contrast, not token-only pass. |
| JUN-V05 | Cancel/Delete ambiguous neighbours | Fixed | `BookingActions.jsx:100–107` separate lower divider row; permanent-delete accessible label and confirmation. |
| JUN-V06 | Completed appointment always Total Due with no Paid | Fixed payment-state representation; all completed-but-unpaid states need preservation | Current `PaymentStateSection.jsx:151–210` explicitly Paid £/Paid in full vs deposit/balance. Completion alone must not imply payment; no blanket 'completed=paid' copy. Old PaymentsPickupCard replaced. |
| JUN-V07 | Trying again is US spelling | Rejected | Identical spelling in UK English; June quick-win literally says Trying again→Trying again. Current CustomerDashboard.jsx:336 is fine. |
| JUN-V08 | Generic Loading/Searching lacks object | Open in directory footer; broad scope unverified | `DogsView.jsx:636`, `HumansView.jsx:772` still Searching…; surrounding directory supplies context, so low severity rather than automatically confusing. |
| JUN-V09 | Missing filtered no-results state | Fixed | `DogsView.jsx:579–599`, `HumansView.jsx:720 onward` contextual empty states with clear filters/reset behaviour; search/filter loading distinct from confirmed empty. |
| JUN-P01 | Inconsistent loading/empty/error copy | Unverified blanket theme | Known improved component ErrorBanner; named unresolved items above. No all-surfaces copy inventory claimed from June. |
| JUN-P02 | Duplicated rail/Overview information | Unverified as harmful duplication | Current OverviewDrawer.jsx:61 onward still week/month/capacity; drawer can deliberately provide mobile alternative. Need viewport-specific simultaneous display, not code existence, to label redundant. |
| JUN-P03 | Capacity percentage displayed twice | Fixed named duplication | `DashboardShell.jsx:47–50` single LeftSidebar CapacityCard moved below schedule on phones; bounded source change removes old rail+footer duplicate. Recheck actual viewport screenshot for different remaining counts. |
| JUN-P04 | Missing calendar colour legend/non-colour cue | Partly fixed | `MiniCalendarCard.jsx:143–160` visible legend, `AvailabilityCalendar.jsx:157` date status accessible name plus legend :174–182. Need each calendar instance's visible non-colour cues, not only screen-reader names. |
| JUN-P05 | Skeleton/card heights mismatch | Unverified | Requires current screenshot/loading capture for each destination; do not use June shots. |
| JUN-P06 | Missing calm CTA focus-visible | Unverified broad theme | Global `src/index.css:534–545` and shared Button ring cover normal controls, but local outline-none/ring overrides need individually resolved computed style. |
| JUN-P07 | Brand-yellow text on white | Open candidate, context unverified | `booking/SlotRowMenu.jsx:250,369` yellow text utility remains; menu surface must be checked before calling contrast failure. ResetPasswordPage.jsx:155 yellow wordmark is decorative brand context, not same claim. |
| JUN-P08 | Search rolodex placeholder | Fixed | `HumansView.jsx:596` Search clients…; DogsView.jsx:441 descriptive name/breed/owner. |
| JUN-P09 | Inconsistent directory default sort theme | Rejected duplicate | Same retracted JUN-F02; don't repeat as separate issue. |
| JUN-P10 | No dark mode | Rejected as inherent defect / decision | No evidence that lack of dark mode impedes this salon task; a preference/research decision, not a regression. |

## Archive boundaries and identifiers

- `2026-08-05-daily-brief-UX_REVIEW_MANIFEST.json` **R1–R8 are recorded evidence runs**, not eight findings. Its evidence manifest has **E1–E22** source entries. The actual review has **ranked findings1–4**: Home-today unpaid warning; header label clipping; owner-name truncation; fixed-height empty lane whitespace. Scope is the August three-lane/four-group board, now replaced by chronological stack. **Status: superseded by component replacement, re-evaluate equivalent outcomes rather than mark each fixed from deletion.** Current `TodayHeader.jsx:68–114` attention/day totals grouping and current `DayCard.jsx` are the new targets. No archive screenshot is current evidence. The old R6 tool timeout is explicitly inconclusive, not a product failure.
- `2026-08-20-booking-wizard-UX_REVIEW_MANIFEST.json` **R1–R4 are evidence entries**, evidence manifest **E1–E24**, questions **Q1–Q4**. Actual ranked recommendations are **1–9**: deposit disclosure, cancellation deadline truth, size-block recovery link, muted contrast, calendar day targets, misleading success Cancel, customer sample isolation, stale draft size, incorrect harness comments. Current wizard persists, so scope is not globally superseded. Detailed status belongs with portal recheck; do not cite old static mocks R4 as real current states. In my bounded recheck, muted alias issue is fixed at token level (`index.css:331–332`), others need portal source/browser confirmation.
- `2026-04-12-tablet-front-desk-UX_AUDIT.md` uses numbered page sections and priority-table rows rather than a canonical ID list. Several named components/patterns changed; no blanket 'all fixed' declaration made. This ledger does not claim to revalidate that entire report.
- `daily-brief-state-density-design-qa.md` explicitly historical, cites untracked old screenshots and superseded lane implementation. Its 'implemented' checklist is dated history, not current screenshot verification.

No new High/Critical issue is asserted by this ledger. Open source items are candidates for current-run browser evidence and ranking. All paths above are relative to the repository root.


# June digest [0]–[79] current recheck

10 November 2026; aa0929bd plus audit worktree. Source-only recheck. Reuses already completed bounded checks in june-ledger.md (JUN identifiers below); extra sources inspected for remaining entries. Fixed means source remedy exists, not fresh assistive-technology verification. No regression claimed without intervening-fix evidence. Paths relative to repository. Historical severity is not adopted.

| Digest ID | Status | Current evidence and limits |
|---|---|---|
| 0 | fixed | JUN-A01: src/index.css:804–807 explicit placeholder colour/opacity; shared Input replaces login field. Local overrides not exhaustively inventoried. |
| 1 | fixed | JUN-A02: ui/Button.jsx:27–52 and index.css:789–792 readable neutral disabled state. Disabled controls exempt from normal WCAG contrast criterion; old Critical severity rejected. |
| 2 | fixed | JUN-L02: dashboard/BookingGridControls.jsx:39–43 workflow access, WeekCalendarView.jsx:332–338 phone delivery issues; Inbox primary nav. |
| 3 | fixed | modals/booking-detail/BookingHeader.jsx:97–98 role=button now has explicit profile/open-booking aria-label. |
| 4 | rejected | Non-modal dialogs do not inherently require aria-modal/body locking. Current BookingCardNew.jsx:97 notes popover is labelled region; AppToolbar.jsx:203,257 tools/account are menus. No present blanket modal-semantics failure. |
| 5 | fixed | JUN-A05: booking/BookingCardNew.jsx:295–300 open-detail button and booking-detail/BookingActions.jsx:76–84 Reschedule provide alternative. End-to-end keyboard path untested. |
| 6 | fixed | JUN-A04: BookingCardNew.jsx:439–453 ArrowUp/Down/Home/End handlers. |
| 7 | fixed | booking/BlockedSeatCell.jsx:7 says “Blocked seat, activate to unblock”. Hover copy need not itself be announced when accessible action/state already clear. |
| 8 | fixed | JUN-A03; BookingStatusBar.jsx:41–48 live region and radiogroup; state announcement on successful update. |
| 9 | fixed | BookingHeader.jsx:173 explicit focus-visible ring and offset on service select. |
| 10 | fixed | booking-detail/ReminderCard.jsx:113–115 shared Button min-h-11; :131 pickup SMS link min-h-11. |
| 11 | fixed | JUN-F08; BookingActions.jsx:34–48 always-mounted Saving/Saved status. Visual prominence requires screenshot. |
| 12 | fixed | JUN-F07; BookingActions.jsx:193–207 awaits removal and retains failure state before closing. |
| 13 | fixed | booking-detail/DeliveryFailureCard.jsx:166–186 aria-invalid/describedby, conditional red border/background, named role=alert error. |
| 14 | fixed | JUN-F11; BookingDetailModal.jsx:138–147 and useBookingEditState.ts:137–140 reset on booking identity. Same-ID cached reopen untested. |
| 15 | rejected | Historical claim equates min(480px,95vw) with unconditional480px, which is mathematically false. Current BookingDetailModal.jsx:257 bounds width min(480px,93vw). Any present clipping needs actual screenshot. |
| 16 | fixed | booking-detail/AppointmentDetailsCard.jsx:77–78 explicit override tooltip/aria-label; :108–111 warning triangle beside slot. Underlying size/status palette frozen. Visual full-state clarity not asserted. |
| 17 | fixed | JUN-V05; BookingActions.jsx:100–107 separate destructive row and labelled permanent-delete confirmation. |
| 18 | fixed | booking-detail/ServicesAddonsCard.jsx:86–91 now says Standard price, dog's usual price with guide, or one-off price with usual; component test asserts branches. |
| 19 | fixed | JUN-A15; SlotGrid.jsx:320–330 no old empty-row opacity70. Child contrast unverified. |
| 20 | unverified | JUN-V04; DayTab.jsx:18 now text-ink-muted, but ancestor closed-date opacity at :68 needs composited contrast. |
| 21 | rejected | aria-selected already expresses listbox current selection; adding aria-current/live wrapper is not mandatory. Current BookingCardNew.jsx:420–422 also names current status, :464–465 aria-selected. No demonstrated present screen-reader failure. |
| 22 | fixed | BookingCardNew.jsx:291 now uses SizeDot dim13 with visible letter. Absolute legibility at13px remains separate screenshot question; old bare colour-only span replaced. |
| 23 | fixed | JUN-V03; ui/SizeDot.jsx:11–17 darkened medium/large backgrounds. No colour changes authorised by this audit. |
| 24 | still open | Partial: ui/ErrorBoundary no old slate400/11px match, but PhotoGalleryModal.jsx:193 still text-caption text-slate-400 notes; PhotoLightbox.jsx:60 and120 slate400 empty/notes prompts. Final composite contrast requires screenshot. |
| 25 | fixed | JUN-A06; DogsView.jsx:436 PageHeaderSearch supplies accessible name. |
| 26 | rejected | Inactive/disabled UI is exempt from WCAG normal non-text/text contrast requirements. May be usability preference; not established AA failure. Existing disabled rail semantics retained. |
| 27 | fixed | JUN-A14; ui/SafetyAlertChip.jsx:27–52 full accessible name/title and expansion; DogsView.jsx:217. |
| 28 | fixed | modals/AddDogModal.jsx:359–365 Size auto/unknown feedback now role=status aria-live=polite aria-atomic. |
| 29 | fixed | DogsView.jsx:450–467 filter group wraps with gap2; min-h-11, aria-pressed and visible size labels. Whether visually cramped requires screenshot; do not apply old proposed smaller targets. |
| 30 | superseded | HumansView.jsx:204–211 replaces old coral/80 no-dogs button with human-empty-pack min44 action; old class absent. New custom CSS/8px help text requires separate current review, not a claim of equivalent contrast passing. |
| 31 | rejected | Original evidence itself acknowledges disabled attribute correct. Disabled contrast exemption applies. No unsupported screen-reader defect retained. |
| 32 | fixed | JUN-T07; HumansView.jsx contact actions min-h11/min-w11, with named label; glyph size is not target size. |
| 33 | fixed | HumansView.jsx:770 footer now role=status aria-live=polite around dynamic counts/searching. |
| 34 | fixed | JUN-F09; HumansView.jsx:454–470 rejected fetch caught; :685–690 error/retry. Never-settling request timeout remains unverified. |
| 35 | fixed | HumansView.jsx:191–195 now full-width SafetyAlertChip with min-h11; expansion/full accessible text via ui/SafetyAlertChip.jsx:27–52. Old max45% FlagChip replaced. |
| 36 | fixed | JUN-V09; DogsView.jsx:579–599 / HumansView.jsx:720 onward contextual no-match and clear/reset recovery. |
| 37 | fixed | modals/WaitlistModal.jsx:19 loading prop; :129–131 distinct Loading the waitlist; WeekCalendarView.jsx:495 passes loading={waitlistLoading}. |
| 38 | rejected | “Trying again” identical UK/US; old recommended rewrite identical. No defect. |
| 39 | fixed | ui/LoadingSpinner.jsx:3 now accepts label with default Loading… and role=status at :5. All caller labels not enumerated; generic fallback is not inherently wrong. |
| 40 | fixed | JUN-A07; new-booking/DogSearchSection.jsx:149 remove aria-label. |
| 41 | fixed | JUN-A07; DogSearchSection.jsx:264 search accessible label. |
| 42 | fixed | JUN-A09; new-booking/BookingActions.jsx:29–31 role=status aria-live; BookingFormFields.jsx:56 dynamic status. |
| 43 | fixed | JUN-A07; BookingFormFields.jsx:66 recurring associated label. |
| 44 | fixed | NewBookingModal.jsx:714–720 subtitle now live status. Current drawer not necessarily four discrete screens, so avoid imposing fabricated step counts. |
| 45 | fixed | JUN-A17; OverviewDrawer.jsx:37 DrawerShell uses AccessibleModal.tsx:206 restoreFocus. Opener runtime test unverified. |
| 46 | fixed | JUN-P04; MiniCalendarCard.jsx:143–160 visible legend; calendar date accessible labels. Each palette's perceptual distinction unverified. |
| 47 | fixed | JUN-L08; OverviewDrawer.jsx:41 bound min(24rem,80vw). |
| 48 | fixed | views/reports/RevenueTrend.jsx:45–53 bar tabIndex0, explicit focus-visible ring; tooltip group-focus-within at :43. |
| 49 | fixed | JUN-A16; index.css:339–342 micro/caption now12px; RevenueTrend.jsx:23,64 uses caption. Every arbitrary chart label not inventoried. |
| 50 | superseded | Old ReportsView.jsx removed; current ReportsLayout.jsx uses link cards with h14 and base text at :22. Old contrast evidence itself gave5.2:1, already normal-AA passing. No equivalent current period-control failure established. |
| 51 | superseded | Old WeeklySnapshot.jsx not current file; RevenueTrend.jsx:20 now90px phone/110px sm. Actual current label clipping not verified; component replacement is not proof every chart now fits. |
| 52 | fixed | JUN-L04; AppToolbar.jsx:337–345 mobile tools Settings entry, settings not unreachable merely absent from primary strip. |
| 53 | rejected | JUN-L03; DashboardShell.jsx:44 now two columns lg/three xl with independent scrolling. Three-column absence alone not a defect; screenshots may identify actual loss. |
| 54 | superseded | JUN-A13; settings/NotificationSettings.jsx:27–40 truthful read-only explanatory list replaces ineffective clickable spans. |
| 55 | superseded | JUN-A11; settings/CapacitySettings.jsx:59–82 read-only authoritative rules replaces false interactive slot pills. |
| 56 | fixed | JUN-A12; HoursSettings.jsx:166–175 named real remove button; p0 target still separate open size issue. |
| 57 | superseded | JUN-A10; PricingSettings.jsx:76–80 real labelled disabled button; pricing read-only instead of fake clickable div. |
| 58 | fixed | JUN-A08; HoursSettings.jsx:194 aria-label Closure label (optional). |
| 59 | unverified | Blanket “all fields no infrastructure” no longer true: BusinessSettings.jsx:40–43 email validation/error; HoursSettings.jsx:209–211 error message, input labels. Per-time ordering/min/max and inline aria associations not exhaustively validated. |
| 60 | fixed | JUN-F06; SettingsView.jsx:72–93 beforeunload/tab discard dialog; :206–211 tab guard. App-route transitions unverified, so not claim every navigation guarded. |
| 61 | still open | JUN-L05; PricingSettings.jsx:23–25,46 overflow-x-auto/min440. No forced page overflow now, but horizontal phone table task friction remains; screenshot required. |
| 62 | unverified | JUN-L06; HoursSettings.jsx:102–107 overflow-x-auto/min320 protects document; nested phone clipping/scroll task needs rendered evidence. |
| 63 | fixed | JUN-F12; DeliveryFailuresCard.jsx:58–68 row onSelectFailure; WeekCalendarView handler supplied. |
| 64 | fixed | dashboard/TomorrowRemindersCard.jsx:55 stacks phone row flex-col; :86 break-words before sm:truncate; :91 separate padded time. Actual long-data rendering still lead's task. |
| 65 | unverified | dashboard/UtilityTabs.jsx:71–76 active yellow/ink, inactive coral-dark/white, text-micro. Contrast check must use current resolved dark token/composite; old “without contrast check” isn't evidence of failure. |
| 66 | still open | JUN-T01; DogsView.jsx:81 / HumansView.jsx:68 rail remains28 desktop/36 phone, below product44 floor. |
| 67 | fixed | JUN-T06; TodoModal.jsx:374,385,395 tap-target utility index.css:681–68344px. |
| 68 | unverified | Original DayHeader removed. Current WeekCalendarView.jsx:295–317 week chevrons present; CalendarTabs uses DayTabs instead of old day arrows. Do not blanket-mark all navigation targets fixed without computed geometry. |
| 69 | still open | JUN-T04; MiniCalendarCard.jsx:123–132 min-h40 and7-column widths, below product44 floor in some layouts; actual width needs measurement. |
| 70 | unverified | JUN-T03; BookingStatusBar.jsx:103 min-height44, grid5 cols :47. Historical calculation16px height ignores py2/line-height. Current widths/10px phone label legibility need screenshot. |
| 71 | fixed | modals/shell/HeaderIconButton.jsx:12 w11 h11 belowlg; old iPad portrait32px cliff removed. Desktop-lg coarse-pointer target remains separately unverified. |
| 72 | fixed | JUN-T09; TodoModal.jsx:350 pseudo-hit-area expands checkbox to44/48px; adjacent overlap needs browser verification. |
| 73 | unverified | Old family not bounded; Todo targets fixed, Pricing controls read-only, but Hours remove closure remains p0. Neither all-fixed nor whole-app failure supported. |
| 74 | fixed | booking/GhostSeat.jsx:7–8 role=menu/label; :18 child role=menuitem. Full arrow-key menu behaviour separate. |
| 75 | fixed | BookingStatusBar.jsx:22–37 arrows/Home/End focus navigation and :48 handler; Enter/Space commits deliberately. |
| 76 | superseded | AppToolbar.jsx:203 current tools menu role=menu; old shortcut dialog removed. Non-modal dialog aria-modal not intrinsically required anyway. |
| 77 | rejected | Original evidence says AccessibleModal FocusScope contain already exists; confusing focus-wrap claim had no concrete trace. Current shared modal FocusScope still owns containment. Fresh runtime focus test needed to allege failure. |
| 78 | unverified | BookingDetailModal.jsx:214 manual useBookingSave and :241 autosave remain separate; booking-detail/useBookingDetailAutosave.ts:105–108 enabled=isEditing without shared saving mutex. Possible overlap remains; actual stale overwrite needs ordering/repro, not assumed from two callbacks. No write-path fix authorised. |
| 79 | rejected | Plain warning shell is not inherently confusing: booking-detail/ExitConfirmDialog.jsx:14 explicit Discard changes title, :23 safe Keep editing autofocus, :30 danger Discard, escape disabled. Extra tint/icon is preference absent evidence of wrong action. |

No High/Critical new claim established here. Rejected rows correct overclaims rather than hiding unresolved usability questions. No file in the repository changed by this helper.


# June digest rechecks [80]–[158]

Read-only code recheck on 10 November 2026 in audit worktree based on aa0929bd. Covers every numbered entry in this range. Current source is evidence of implementation, not new visual or assistive-technology validation. “Still open” sometimes means a narrow original source fact survives while its original severity/consequence is unproven; the notes say which. “Rejected” means the old finding's claimed defect is unsupported or contradicted by its own/current evidence, not a finding that was fixed. No regression claimed without an intervening verified fix. Paths below are relative to the repository root. Some audit fixes may be in progress concurrently: verify line numbers against final diff before publishing.

| June ID | Status | Current evidence and calibrated conclusion |
|---|---|---|
| [80] | still open | `src/components/modals/booking-detail/BookingHeader.jsx:117` still hides renderPrice in edit mode. This is an intentional simplification candidate; actual confusion/price transparency needs current edit screenshot, not an assumed error. |
| [81] | unverified | `src/components/booking/BookingCardNew.jsx:293–300` still truncates name (now max-width50%) but supplies full accessible name and opens details. Ultra-narrow <300px failure not tested; primary brief starts375px. |
| [82] | unverified | `src/components/booking/SlotRowMenu.jsx:154–161,189–205` calculates fully booked and accessible name. Original “fully booked but empty of bookings, 4 dogs in4 seats” scenario is contradictory under current two-seat model. Visual differentiation requires capture; don't repeat original impact. |
| [83] | fixed | `src/components/dashboard/BookingGridControls.jsx:62–78` bar/count now visible at phone widths (w16, sm:w24); no hidden-sm wrapper. |
| [84] | unverified | `src/components/booking/SlotGrid.jsx:230` retains bg-sky50/60 alternation; low-contrast row separation is a visual hypothesis, not an evidenced user failure. |
| [85] | still open | `src/components/booking/BlockedSeatCell.jsx:7–20` has named unblock control and visible Blocked/Unblock, but still text-slate400. Old missing-name assertion is false; subtle label contrast remains candidate, not measured here. |
| [86] | rejected | `src/App.jsx:204`, `src/components/auth/ResetPasswordPage.jsx:155` retain yellow Dog wordmark; logo/logotype text has a WCAG contrast exemption. Old blanket compliance violation and suggested dark-yellow7:1 were unjustified. Readability can still be discussed separately. |
| [87] | still open | `src/components/modals/booking-detail/ServicesAddonsCard.jsx:86,124,127` still slate400 useful price/add-on copy; `src/components/modals/PhotoLightbox.jsx:120` Tap to add notes slate400. Original hex for slate400 was wrong; measure rendered contrast rather than reusing old ratio. |
| [88] | still open | `src/components/modals/AddDogModal.jsx:344–352` dynamic custom breed has aria-label and Enter breed placeholder, no persistent visible label of its own. Screen-reader labelling already exists; visual labelling improvement only. |
| [89] | fixed | `src/components/views/DogsView.jsx:97–111` Unarchive min-h11/min-w11, including inline mode now used at:228–230. |
| [90] | fixed | `src/components/views/DogsView.jsx:135–143` WhatsApp anchor size11 (44px), named. |
| [91] | rejected | Live search need not have submit; a single-line input never adds a newline on Enter. Current `src/components/ui/PageHeader.jsx:164–173` type=search with accessible name. No functional submit gap demonstrated. |
| [92] | fixed | `src/components/views/DogsView.jsx:365–369,651–658` one loadingMore state drives visible shared Button.loading for either auto or manual pagination. Original argument that button loading appears only after manual click is incorrect. |
| [93] | rejected | `src/supabase/hooks/dogs/useDogsDirectory.ts:170–185` assigns letters returned by whole-result RPC while appending rows. Original evidence itself says RPC computes full filtered-set letters; replacing with page merge is not a proven fix. No current false-disabled-letter case established. |
| [94] | fixed | `src/components/views/DogsView.jsx:193–218` alert chip is below identity/breed/size, max-w-full; old competing inline max45% layout removed. |
| [95] | fixed | `src/components/views/DogsView.jsx:623–627` explicitly replaces top24 with top4 after main became scroll container. |
| [96] | unverified | `src/components/ui/EmptyState.jsx:37`; `src/components/views/DogsView.jsx:585–586` still render arbitrary query in title without break-all. Long unbroken query could overflow, but long normal text can wrap; no fresh capture. |
| [97] | rejected | `src/components/views/HumansView.jsx:61–74` unavailable alphabet letters are genuinely disabled and therefore exempt from normal text-contrast minimum. They are slate400 now; original disabled-opacity compliance premise is false. Active rail target size is a separate open finding. |
| [98] | fixed | `src/components/modals/AddHumanModal.jsx:166–179` header is warm paper with shared HeaderIconButton; original white-ring-on-teal-gradient case removed. |
| [99] | rejected | `src/components/views/HumansView.jsx:779–785` does not locally override focus; `src/index.css:534–536` global3px focus-visible outline applies. Absence of local utility is not absence of focus. Runtime clipping not tested. |
| [100] | superseded | `src/components/views/HumansView.jsx:143–165` full labelled DogRoster replaced +N DogChips. No current opaque overflow count. |
| [101] | fixed | `src/components/views/HumansView.jsx:630–642` sort choices visibly labelled and aria-pressed with active background; persistence across search is not inherently wrong. |
| [102] | rejected | `src/components/modals/AddHumanModal.jsx:47–58` dog search is synchronous local useMemo filtering, not API-per-keystroke. Debouncing would add needless latency absent measured expensive local work. |
| [103] | fixed | `src/components/views/HumansView.jsx:232–239` list email title present; grid email uses break-all/whitespace-normal and mailto anchor. |
| [104] | fixed | `src/components/views/HumansView.jsx:720–741` distinguishes no archived, query mismatch and true empty; Clear search supplied. Old emoji default removed. |
| [105] | superseded | `src/components/views/HumansView.jsx:143–165` full DogRoster, no +N clipping container. |
| [106] | fixed | `src/components/modals/AddHumanModal.jsx:327–332` uses semantic feedback-warning tokens and explains non-blocking duplicate. Warning rather than error is appropriate for two real people sharing name. |
| [107] | fixed | `src/components/views/inbox/workspace/ConversationPane.jsx:214–226` query-specific no-results and clear-search action. Old claim that an underlined link is inherently insufficient is rejected; current recovery exists. |
| [108] | still open | `src/components/modals/new-booking/DogSearchSection.jsx:370–383` gives useful try another name hint and creation options but no Clear search. Minor convenience only; editing existing search is already a recovery path. |
| [109] | unverified | Old title names HumanCardModal but evidence names directory DogChips. Current `src/components/modals/human-card/DogsPanel.jsx:1+` and directory `HumansView.jsx:143–165,683–685` differ; no async dog-hydration failure freshly traced. Do not invent missing-loading defect from mismatched old target. |
| [110] | rejected | `src/components/views/DogsView.jsx:554–556` explicitly shows Loading archived dogs. Old “no loading state” title contradicts its own evidence of loading text. Failed-fetch handling remains a separate open issue (`DogsView.jsx:313–315`). |
| [111] | still open | `src/components/ui/LoadingSpinner.jsx:3–7`, `src/components/views/DogsView.jsx:556`, `src/components/views/settings/CalendarSettings.jsx:77` still mix contextual and generic labels/ellipsis forms. Low-impact consistency, not functional failure. |
| [112] | unverified | Old entry supplied no evidence. Current `src/components/modals/new-booking/DogSearchSection.jsx:318–325` has an explicit No human listed—carry on button inside search results. Missing prominence cannot be judged statically. |
| [113] | fixed | `src/components/ui/ErrorBanner.jsx:13–18` configurable title/retryLabel and calmer generic fallback; operation-specific callers e.g. `DogsView.jsx:541–545`. Old “always generic” statement was already contradicted by its evidence. |
| [114] | still open | `src/components/views/DogsView.jsx:634–636` Searching… remains generic. Search input context makes it understandable; cheap copy polish, not a blocker. |
| [115] | still open | `src/components/views/reports/ReportsInsightsView.jsx:115–121` names low-booking threshold and numbers-only state, but no action/period suggestion. Original report is now split; proposed guidance needs knowledge of actual threshold, not “book more” filler. |
| [116] | still open | Dogs improved `src/components/views/DogsView.jsx:587–595`; Humans `HumansView.jsx:721–734` still says No humans just yet/Add a client for filter-only empty results while active filter/footer context lives elsewhere. Narrow residual; don't claim both directories fail identically. |
| [117] | still open | `src/components/views/inbox/workspace/ConversationPane.jsx:189–198` still “usually clears within a minute” and old-dashboard fallback plus Try again. Empirical recovery-time promise unsubstantiated here. |
| [118] | rejected | `src/components/modals/new-booking/TimeSlotPicker.jsx:105,113` matching disabled/aria-disabled redundant but valid, no user harm shown. Not a reportable accessibility defect by itself. |
| [119] | fixed | `src/components/modals/new-booking/DogSearchSection.jsx:156–160` Service for dog accessible name. |
| [120] | rejected | `src/components/layout/AppToolbar.jsx:161,223–227` accessible N hint plus visible Handy shortcuts. Original “not exposed in UI” title contradicted by own desktop-help evidence. Phone-only help preference is not same defect. |
| [121] | rejected | `src/components/modals/new-booking/DogSearchSection.jsx:112,140–143` warning emoji accompanied by full textual alerts immediately below. Decorative emoji aria-hidden could reduce repetition, but missing warning-content fallback claim is false. |
| [122] | rejected | `src/components/dashboard/MiniCalendarCard.jsx:76–79,98–112,123–128` date buttons include full weekday/date accessible names. This is not an ARIA table/grid, so requiring columnheader/scope on standalone weekday divs is not justified. |
| [123] | rejected | `src/components/dashboard/OverviewDrawer.jsx:24–30` date selection updates day and closes; visible selected date elsewhere is the feedback. A toast after navigation is not inherently necessary. Need an observed stale date/focus failure before reporting. |
| [124] | superseded | `src/components/dashboard/LeftSidebar.jsx:26–40`, `OverviewDrawer.jsx:60–79` still offer same overview via dock/drawer, but drawer is transient alternative. Current rail duplication issue between1024–1279 explicitly removed (:18–25). Reusing data in optional drawer is not automatically clutter. |
| [125] | unverified | Old entry supplied no evidence. Current `src/components/dashboard/CapacityCard.jsx:81–85` statusLabel is an accessible quantity description; no fresh redundant visible label example established. |
| [126] | unverified | `src/components/dashboard/CapacityCard.jsx:94–107` still quiet teal text but includes ArrowRight and pointer-coarse44px floor. Needs screenshot to judge affordance; don't reuse incorrect old contrast. |
| [127] | still open | `src/components/views/reports/ReportWidgets.jsx:45–57` equal positive cur/prev still yields down arrow and adverse0% badge; cur=prev=0 may produce emdash via earlier delta branch. Suppression/no-change neutral state remains absent. |
| [128] | rejected | `src/components/views/reports/ReportWidgets.jsx:66–68` flex-wrap can move Trend below value; it does not disappear. No hidden-on-phone class; actual clipping would need fresh capture. |
| [129] | still open | `src/components/views/reports/ReportWidgets.jsx:141–145` three-status palette now uses common status edges (colour drift fixed), but `BookingHealth.jsx:59–75` enumerates only those three while `src/hooks/useReportsData.ts:433–438` counts all past statuses. Incomplete coverage residual; no token changes on audit branch. |
| [130] | fixed | `src/components/views/reports/RevenueTrend.jsx:20–25` y-axis now w9, caption12px, three ticks; old w7 removed. Extreme large values/actual clipping untested. |
| [131] | unverified | `src/components/views/reports/DemandPattern.jsx:35–43` seven flex children with caption labels; neither collision nor sufficient room established without current375px screenshot. Old report admitted labels fit. |
| [132] | unverified | `src/components/views/reports/KeyInsights.jsx:68–72` still6px bullets and12px text, but that meets current text minimum; harder-to-scan subjective claim needs current screenshot. |
| [133] | still open | `src/components/views/reports/CustomerRanking.jsx:18–21` name remains truncate without title/full-name action. Whether any name actually truncates requires sample long name; don't quote real one. |
| [134] | superseded | `src/components/layout/MobileNavStrip.jsx:22–64` labelled top strip replaces fixed bottom tabbar. Original bottom-safe-area/scroll-affordance scenario no longer exists. |
| [135] | superseded | `src/components/ui/PageShell.jsx:41–68` app-frame chrome/main scroll ownership replaces pb20→md:pb5 and old fill-height hook. No original breakpoint cliff. |
| [136] | still open | `src/components/views/settings/CapacitySettings.jsx:28–31` explanatory subheading remains bold paragraph; `settings/shared.jsx:26–32` CardHead title itself div. Heading semantics debt survives, low impact. |
| [137] | unverified | Old entry had no concrete evidence. Current `src/components/views/settings/CalendarSettings.jsx:70` h3 under PageHeader h1; missing h2 may be structural polish but no inaccessible hierarchy/runtime defect established. |
| [138] | superseded | `src/components/views/settings/PricingSettings.jsx:63–70` now disabled/read-only; no changes-save-as-you-type claim. Other settings save models are independently documented in theme ledger. |
| [139] | fixed | `src/components/views/SettingsView.jsx:119–138` now no-wrap horizontal scroll with thin scrollbar, shrink0 tabs44px. Old multirow wrapping removed. |
| [140] | unverified | `src/components/views/settings/PricingSettings.jsx:59–71` still absolute “from £” at left2 and input pl10, now caption12px and read-only. Overlay/zoom issue needs capture; not proved from absolute positioning alone. |
| [141] | unverified | `src/components/dashboard/RightRailCard.jsx:284–298`; global `src/index.css:534–536` supplies focus. Parent overflow-hidden(:210) is not proof inner CTA's outline clips; needs focused screenshot. |
| [142] | rejected | `src/components/dashboard/RightRailCard.jsx:206–208` correctly exposes loading region aria-busy; `UtilityTabs.jsx:91–107` contains that card. An additional busy state on the tab itself is optional, not inherently missing semantics. |
| [143] | rejected | `src/components/dashboard/WhatsAppInboxCard.jsx:30–51` has min-height44, no fixed/max height; natural content can grow. `RightRailCard.jsx:278–279` likewise wraps naturally. “No max-height implies hard clipping” is incorrect; no actual clipped state demonstrated. |
| [144] | fixed | `src/components/views/DogsView.jsx:135–143` size11 WhatsApp, `HumansView.jsx:248+` contact actions min-h11/min-w11. Duplicate of[90] family. |
| [145] | fixed | `src/components/views/settings/PricingSettings.jsx:76–80` tap-target utility gives44px despite w8/h8; control also disabled since service editing removed. |
| [146] | fixed | `src/components/modals/TodoModal.jsx:285` shared HeaderIconButton, not raw w7; shared target floor. |
| [147] | fixed | `src/components/views/DogsView.jsx:217`, `HumansView.jsx:192–195` shared SafetyAlertChip min-h11/min-w11, no old tiny local FlagChip/AlertChip. |
| [148] | rejected | `src/components/layout/CalendarTabs.jsx:53–57` named Day navigation tablist; an extra heading immediately before every labelled tablist is not mandatory. Old title itself contradicted correct aria-label in description. |
| [149] | rejected | `src/components/layout/DayTab.jsx:50–59` label includes loading and aria-busy correctly; old title missing-label contradicts implementation. Redundancy is harmless here, no tested duplicate announcement. |
| [150] | rejected | `src/components/ui/SizeDot.jsx:30–33` specific Small/Medium/Large dog label plus title for pointer users. Title and aria-label coexist appropriately; removing title is not a demonstrated UX improvement. |
| [151] | unverified | `src/components/booking/SlotGrid.jsx:338–345` still9px Now label; rendered width/clipping untested. Small text is a credible readability residual but truncation was hypothetical. |
| [152] | fixed | `src/components/views/DogsView.jsx:400+` uses FloatingDecor; `src/components/decor/index.jsx:75–78` aria-hidden=true on decorative wrapper. |
| [153] | unverified | `src/components/ui/Skeleton.jsx:23–39` still140px skeleton; DogsView redesigned cards `src/components/views/DogsView.jsx:193–233` have variable content. Actual shift requires slow-loading capture and measured final height, not old168px assumption. |
| [154] | still open | `src/components/views/DogsView.jsx:531–535` horizontal overflow rail has no local edge fade/scroll cue. Current scrollbar visibility/actual overflow need device screenshot; old “wraps” title inaccurate. |
| [155] | still open | `src/components/ui/InlineError.jsx:12` text warning glyph vs `ErrorBanner.jsx:25` emoji variant remains; tiny visual-family inconsistency, both decorative aria-hidden. Not an accessibility blocker. |
| [156] | still open | `src/components/modals/new-booking/BookingFormFields.jsx:78–80` still promises rest of year, while `NewBookingModal.jsx:509–514` generates floor52/interval dates from selected start (approximately next year). Old description wrongly said October generates2–3 dates; genuine discrepancy is calendar-year wording versus rolling52-week generation. |
| [157] | still open | `src/components/layout/AppToolbar.jsx:223–227` Handy shortcuts lists N/T/arrows, not Esc; `OverviewDrawer.jsx:33–39` shared drawer still supports Escape. Documentation convenience only, not missing keyboard close behaviour. |
| [158] | still open | `src/components/views/settings/shared.jsx:54–68` links label via aria-labelledby, but renders sublabel without ID/aria-describedby. Original Auto-confirm example removed, yet primitive still lacks description association for current consumers. |

## Missing October staff findings requested by lead

| Prior ID | Status | Rechecked evidence and limit |
|---|---|---|
| Oct12 staff F14 walk-ins have no booked till entry | rejected as booking defect; business-accounting decision remains unverified | User explicitly states walk-ins are never booked. `src/components/modals/new-booking/DogSearchSection.jsx:162–165` uses bookable SERVICES, consistent with brief; `src/components/views/reports/WeeklyCashUp.jsx:204–207` explicitly says “Expected takings from booked dogs — not money taken.” This fixes the misleading whole-salon takings interpretation; no absence-of-walk-in-accounting defect inferred. Whether owner wants separate walk-in cash accounting is a product decision; do not propose adding non-seat booking rows on this branch. |
| Oct12 staff F16 dead calendar payment chooser / deposit gross | still open, partial | `src/components/booking/BookingCardNew.jsx:162,240–255,486` still defines payChooserOpen and markPaid, passing neither deposit nor explicit amount. No setPayChooserOpen(true) found in file; cannot label reachable billing defect without proving opener. Detail `src/components/modals/booking-detail/PaymentStateSection.jsx:157,173–176` calculates amountToCollect but markPaid supplies settledTotal; may record gross rather than balance. Need payment-ledger contract interpretation before calling wrong, and engine/write changes are off-limits. |
| Oct12 staff F18 deploy reload loses draft | unverified | `vite.config.js:40,72–76` retains autoUpdate/skipWaiting/clientsClaim; `src/hooks/useBookingSession.ts:72–73,123–125` holds draft in React state. No installed-PWA update/reload experiment run; SW activation alone is not proof every tab reloads. User explicitly prohibits guessing installed-app behaviour; keep hypothesis, no severity inflation. |

## Scope limits

This range contains79 IDs, all represented exactly once above. No browser or database used. Reports' visual issues, long-query overflow, focused-outline clipping and installed-PWA update behaviour intentionally remain unverified. These code rechecks can support the parent report's history appendix but must not be portrayed as79 newly reproduced UX defects.


## Re-check of prior website audit (12 October, report 07)

| Prior ID | Current disposition | Evidence / limit |
|---|---|---|
| A1 public service name/price mismatch | Fixed for rendered customer service facts; historical static head still has bath & tidy before prerender stamps it | servicesData.js 8-46; FAQPage.jsx 41; llms.txt 53-71. Current tests pin approved facts #1073. Do not change them. |
| A2 wrong crawler phone/email and phone-call claim | Fixed in llms.txt and contact fallback | llms.txt 11,41,148-150; salonFacts.js:6-7. Do not reproduce phone literals in report unnecessarily. Structural generation still not evident; say corrected, not magically single-source. |
| A3 hours source ambiguity | Still a decision, not proved misinformation | fallback Mon–Wed 08:30–15:00 (salonFacts.js:9-12), bookable slots stop 13:00. These may validly mean premises hours vs last drop-off. Live configured hours unknown; do not conflate or silently change. |
| A4 dropped AI concierge prefill | Fixed for reachable homepage by removal from composition; dead component remains | SmarterDogHomepage imports/renders no AIConciergeSection at :4-49. AIConciergeSection still contains dead recommendation/booking logic. Generic service-context handoff remains, but do not report active multi-field form losing data. |
| A5 client-only SEO/stale sitemap | Mostly fixed | package build runs prerender; scripts/prerender creates per-route HTML/head. sitemap dates now 2026-11-03 and includes community. /houndsly redirect still in sitemap. Source index head still says Premium and bath & tidy but prerender stamps route head; don't call it live preview without checking built output. |
| A6 fonts/performance/alt residuals | Partly open, partly rejected old weak evidence | Google Fonts remain (index.html:10-18); compression siblings remain (prerender.mjs:23-24); scaffold SVG remains. Navigation and popup images demonstrably have alt. Old “no alt on same line” was never proof of missing alt. Coarse minimum rules only max-width, not pointer query; minimum width not provided. |
| A7 obsolete Bluehost publish | Fixed from governing docs/workflow history at current base; operational secret deletion not checked | CLAUDE.md describes retirement 20 October #999. Need parent verify .github/workflows/website.yml if reporting exact absence. |
| A8 stale website docs | Partly open | website/README.md still says Node 18/20 (:33) and npm install (:43); MAINTENANCE now says npm ci (:135). @emailjs/browser remains dependency. Treat contributor friction as outside top customer/staff ten. |
| A9 tooling duplication | Still intentional boundary / needs decision | Separate package/lock/router/CSS remain; user explicitly forbids merging them. No implementation on this branch. |
| A10 staff entrance | Keep; no UX defect established | footer staff silhouette has aria-label/title, same-origin STAFF_LOGIN_URL. |

June review and archived UX reviews principally cover app surfaces rather than this independent marketing application. Parent should carry their app findings via respective reviewers, not manufacture website equivalents.



## Prior findings re-check (October 12 customer report)

| Prior | Current status | Evidence / qualification |
|---|---|---|
| F1 account refusals misclassified capacity | Fixed in source | BookingWizard:849–865 excludes account refusals; migration 20261019120000 adds DETAIL codes. Production deployment not queried. |
| F2 reschedule/cancel late dead end | Partly open, partly superseded | Reschedule card still no deadline check; late cancellation rule now allows before start, so old cancel refusal must not be repeated. |
| F3 switches unenforced | Fixed in current source | newest 20261110140000_portal_switches_read_typed_settings.sql reads typed allow_customer_* fields, SDR05; deployed migration unverified. Intake UI gate not independently rechecked. |
| F4 horizon UI-only | Existing mechanism, not fully revalidated | Wizard reads policy horizon at 308–321. Do not repeat server-enforcement absence from negative search alone; scope needs deeper SQL trace. |
| F5 trusted humans permanent placeholder | Still open | TrustedHumansSection:93. |
| F6 duplicate create on dropped response | Unvalidated prior hypothesis | Do not promote. Current create(inputs) call at wizard773 has no client request ID, but no race reproduction or full latest SQL inventory done. |
| F7 generic 'booking change' failure | Still open | wizard917. |
| F8 success WhatsApp-only guidance + pseudoref | Partly fixed | receiptChangeGuidance at wizard119–147 now policy-sensitive and dashboard-aware; pseudoref still at975–977/1096. |
| F9 stale address/postcode, stale saved baseline | Fixed | CustomerDashboard:31–45,125–179,181–186; saved server profile adopted; MyDetailsCard uses AddressPicker. |
| F10 breed edit silently resets eligibility | Still open | DogsSection:92–108/136–142; above. |
| F11 add dog field mismatch and promise | Still open | AddDogInline collects name+breed only; false confirmation promise at84. Required signup DOB/sex is policy choice. |
| F12 waitlist write-only without dog context | Still open (front-end confirmed) | wizard930–933 passes only human/date; success1024 claims named dog added. Dashboard doesn't show/remove waitlist. Schema duplicate guarantees not fully rechecked. |
| F13 cancel labels/stepper/calendar busy | Still open | BookingCard262–280; wizard1140–1148 progressbar; AddToCalendarButton45–52 no aria-busy. Stepper now only decorative paws in children so progressbar itself gives valid progress; do not overstate list role as severe defect. |
| F14 four sequential requests blocking all | Fixed | Dashboard hook190–193 concurrent independent trusted read, older count133 non-blocking; dogs→bookings dependency remains appropriate. |
| F15 required email/draft retention/chain | Still open, wording refine | onboarding125–155 required email; draft137–140; useDraftPersistence28 seven-day; signout620 directly calls onSignOut. Saved drafts are per account, not exposed to another signed-in account by normal UI; don't overstate as cross-account leak. |
| F16 no wait expectation | Fixed customer-facing | PendingApprovalGate60–63 says Mon–Wed + WhatsApp link72–80. Explicit comment68–70 owner chose soft timing; do not replace with invented one-working-day SLA. Staff SLA signal not rechecked. |
| F17 historical prices recomputed | Fixed | AppointmentsSection21–26/81 uses stored paidAmount only. |
| F18 no OTP resend | Fixed | CustomerLoginPage264–290 resend handler,701–707 control/status. |
| F19 compromised password reload | Intended prior observation | No new finding without auth-specific review; outside UI branch. |
| F20 device-local today | Still open in source | SlotSelection113/127/139 and wizard700 use toDateStr(new Date()); DateSelection uses londonDate119. Server remains authority; no runtime abroad reproduction. |
| F21 docs/channel inconsistency | Partly open | Welcome still 'text you'; other doc issues need owner/root doc review. |
| F22 security observations | Outside this UX helper validation | Do not reassert telemetry abuse/SQL cap findings without security trace; no new security claims. |

## August wizard review re-check

- Deposit-before-commitment missing: fixed (BookingConfirmation154–169, total149 conditional). Snapshot source proves deposit amount/per-dog, no injected timing assumptions.
- Wrong 'day before' cancellation guidance: fixed (BookingConfirmation172–190 server deadline note; new late cancel rule explicitly stated).
- No unconfirmed-size recovery link: fixed (DogSelection150–176) and auto staff request now exists.
- Secondary-token contrast: prior fixed colour cannot be repeated without fresh computed colours/contrast; primary browser reviewer should measure.
- 34px calendar cells: CSS calendar still fluid aspect-ratio grid375–385; 44px rule near604 inspect and measure fresh rather than reuse 34px figure.
- Closed numeral low contrast: still rgba(31,31,31,.28) at402, but disabled controls contrast exempt; legibility concern only.
- No portal sample mode: still open as above; customerClient offline guard absent.
- Stale draft dog sizes: selectedDogs initialises draft at267; repeat seed revalidation exists for different path. Full restore reconciliation not proved; avoid blanket 'fixed'.
- Harness misleading comments: fixed; it explicitly warns production connection11–18.



## Verified previous-finding rechecks

| Previous finding | Current status and evidence |
|---|---|
| Oct12 staff F1 false success after drag refusal | Fixed. SlotGrid.jsx:73–100 checks null/false before success. |
| F2 false success after reschedule refusal | Fixed. BookingDetailOverlays.jsx:163–184 preserves picker and suppresses success. |
| F3 calendar status fire-and-forget and wrong skip rule | Fixed. BookingCardNew.jsx:176–209 awaits result, uses changedFields and shared requiresCareSkipConfirmation. |
| F4 whole-row writes on status action | Fixed in cited status paths, mitigated more broadly. useBookings.ts:666–674 calls columnsToWrite; useBookingActions.ts:129–130 sends changedFields. No general updated_at guard at useBookings.ts:739–749; do not repeat original critical whole-row assertion unchanged. |
| F5 duplicate confirmation | Still open, ST-02. |
| F6 staff move does not automatically contact owner | UI still closes with “Booking rescheduled”, no manual-contact guidance (BookingDetailOverlays.jsx:181–184; RescheduleModal.jsx:204–205); confirm server policy with message reviewer. Keep programme STOP/manual-contact decision in mind: automation cannot be labelled safe fix. |
| F7 cancellation disclosure | Still open UI, dispatch pending message reviewer, ST-08. |
| F8 multiple move methods / groom notes stamp | Still open stamp and touch limitation; ST-09; modal itself means phone still has move alternative. |
| F9 recurring partial outcomes | Still open, ST-01. |
| F10 dead legacy four-zone board shipped | Fixed. TodayView now uses stack only; StaffRoutes no board route. |
| F11 Booking Desk in owner nav | Fixed as navigation claim. navConfig primary six sections, StaffRoutes no booking-workspace route. Legacy files can exist without being exposed. |
| F12 prior-day backlog placement | Still open ST-11. |
| F13 four day-oriented views | Partly fixed by removal of Booking Desk and legacy board; backlog remains separate. Don't repeat four-view count. |
| F15 appointment notes absent from detail | Still open: AppointmentDetailsCard.jsx:145,176 displays editData.groomNotes only; booking.notes still shown only in StackCard.jsx:213–219. |
| F17 no-show no Undo | Fixed. useBookingActions.ts:498–527 adds Undo. |
| F19 failure feedback offline elsewhere | Fixed original named paths through F1–F3; no blanket claim about every control. |
| Oct12 inbox #1 dead settings | Fixed major parts. NotificationSettings.jsx:3–6,26–46 is read-only; HoursSettings.jsx:98 distinguishes website hours; BookingRulesSettings.jsx:482 removed Auto-confirm. |
| #2 no team administration | Fixed original absence claim. TeamSettings.jsx implements owner-only invite/list; SettingsView.jsx:172 routes owner Team tab. Not a full RLS audit. |
| #3 grooming notes missing Today | Fixed. TodayView.jsx:166 supplies; StackCard.jsx:222–229 renders Usual groom. |
| #4 unmatched no link | Still open ST-07. |
| #6 no upcoming context | Still open ST-06. |
| #7 hardcoded template approval | Still open. TemplatePicker.jsx:12,27–28,53–56 uses WHATSAPP_PICKER_TEMPLATES; no runtime status in component. Server may fail safely; no delivery bypass claimed. |
| #9 resend overclaim | Partly fixed: DeliveryFailureCard.jsx:106 now “Resent. It'll clear here once it's confirmed delivered.” Message-outcome code requires separate review. |
| #10 hardcoded 14/day report label | Still open ReportsInsightsView.jsx:184. Fix derives from config, not just rewording unless label simplified truthfully. |
| #11 fourteen report panels expanded | Fixed major density issue. ReportWidgets.jsx:16–35 collapses detailed reports at all widths by default. |
| #18 inbox small targets/type | Partly fixed: global input size 16px on phone/coarse (index.css:525–529), some 32/36px raw targets persist ST-05. |
| June no keyboard alternative to drag | Refined: drag remains pointer-only but modal Reschedule has semantic date/slot buttons and confirms. Do not equate drag itself lacking keyboard with no way to move a booking. |
| August Daily Brief four empty lanes | Superseded UI fixed by replacing board with one stack and one empty state (TodayView.jsx:531–539). |

Other Oct12/J une/archive findings were not all rechecked by this bounded helper. Parent should explicitly mark unchecked items rather than invent fixed/open/regressed statuses. No finding was labelled regressed without a verified prior fix and fresh failure.



## Prior findings rechecked

- 12 October C3 / Edge F1 cancellation Twilio free-text path: **fixed in current code**, not repeated as open. `notify-booking-cancelled/handler.ts:49,134,346–478` uses approved template gated to salon cause plus SMS/email fallback; SMS fallback candidate query covers cancelled (`reminder-sms-fallback/handler.ts:206–240`). WhatsApp flag default off is intentional; production setting not verified.
- Edge F2 no Twilio delivery callback: **implementation fixed / live enabling unknown**. `_shared/twilio.ts:182–187` sets StatusCallback when `TWILIO_STATUS_CALLBACK_URL` configured. Do not state no callback exists. No production configuration inspected.
- I11 / Edge F13 retired ready notification accessible through resend: **fixed**. `resend-booking-notification/index.ts:24–28` map has confirmed/cancelled/reminder only; current functions inventory contains no notify-booking-ready entry.
- H4 STOP bypass: **fixed in sender architecture checked**, not rerun as security audit. Current handler has number-level opt-out guard and STOP acknowledgement policy (`whatsapp-send/handler.ts:656–699`); `agentRisk.ts:651–652` includes one acknowledgement fallback. Delivery not exercised.
- I10 reschedule communication gap: **still a decision/manual-contact boundary**, not authorised automation. Booking-update template exists (`whatsappTemplates.js:121–132`); roadmap STOP remains. Staff reviewer should verify current reschedule UX separately.
- F12 welcome read-before-send/idempotency and stale CHECK comment: **still open in source** (`notify-customer-welcome/index.ts:210–221,285–290`). Duplicate welcomes possible on overlapping invocations; not a demonstrated customer incident, not promoted to High UI finding. Needs sender/database work, excluded.
- T1/F8 copy/pipeline duplication: **still open, partly consolidated**, current automatic message renderers are separate from manual `src/lib/reminders/templates.js`. Concrete consequences appear in MSG-01/03; a pipeline rewrite is beyond this UI branch.



