# UX Review

## 1. Review scope and evidence

**Interface reviewed:** The customer self-service booking wizard (`/customer` portal, `BookingWizard`) — five steps plus terminal screens, at `main@c1da6852`.

**Workflow reviewed:** An approved customer selects up to four dogs, chooses a service per dog, picks a date from capacity-aware 28-day pages, chooses a drop-off time, and commits — after which the wizard writes through `create_customer_booking_group` behind three `BEFORE INSERT` gates and shows a terminal screen.

**States reviewed:** wizard shell at two fill states and empty; the real `DateSelection` in its incomplete-availability (degraded) state; the desktop summary sidebar empty, partial and full; static reconstructions of the success screen and the calendar legend. Every other state was reviewed from implementation and tests, not rendered.

**Viewports reviewed:** 390×844 (phone) and 1280×720 (desktop) rendered; the 640–1023px band assessed from CSS only.

**Evidence used:** E1–E24 from the frozen context, plus R1–R4 registered below.

**Visual evidence provenance:**

- **Evidence ID:** R1
- **Source type:** development harness
- **Location:** `http://localhost:5174/dev/booking-wizard-shell-preview`
- **Commit or version:** `main@c1da6852`, 2026-08-20
- **Viewports:** 1280×720
- **States:** wizard shell empty, partial and full; real `BookingSummarySidebar` at all three
- **Exercised:** page load, accessibility-tree read, full-text extraction, computed-style and geometry probes on the two-column grid
- **Limitations:** the harness mounts static placeholders in place of steps 1, 2, 4 and 5, and runs inside the **staff** app shell rather than the customer portal shell. It establishes nothing about production routing, authentication, live data or end-to-end behaviour.

- **Evidence ID:** R2
- **Source type:** development harness
- **Location:** `http://localhost:5174/dev/booking-wizard-shell-preview`
- **Commit or version:** `main@c1da6852`, 2026-08-20
- **Viewports:** 390×844
- **States:** same harness content at phone width
- **Exercised:** viewport resize, computed-style probes, bounding-box measurement of all calendar day and navigation buttons, WCAG contrast computation against resolved backgrounds, document-overflow check
- **Limitations:** measurements are of the harness's rendered instance, not of an authenticated production session; screenshot capture failed because the browser pane stayed hidden, so no image evidence exists. Proves nothing about production, live data or end-to-end behaviour.

- **Evidence ID:** R3
- **Source type:** development harness
- **Location:** `http://localhost:5174/dev/booking-wizard-shell-preview` — the real `DateSelection` instance
- **Commit or version:** `main@c1da6852`, 2026-08-20
- **Viewports:** 390×844 and 1280×720
- **States:** incomplete-availability (degraded) state, reached because all three availability RPCs returned `42501 permission denied` to an unauthenticated caller
- **Exercised:** accessible-name extraction from 28 day buttons, `data-state` inspection, contrast measurement of open and closed day numerals, verification that the legend is withheld and the honest hint shown
- **Limitations:** the *complete* availability state was never rendered, so open/full/closed together were never seen at once. The degradation cause here is an unauthenticated caller, not a production outage. Establishes nothing about production, live data or real-user behaviour.

- **Evidence ID:** R4
- **Source type:** static reconstruction
- **Location:** `src/components/dev/BookingWizardShellPreview.jsx` — `SuccessScreenMock` and `CalendarStatesMock`
- **Commit or version:** `main@c1da6852`, 2026-08-20
- **Viewports:** 390×844 and 1280×720
- **States:** success screen; calendar open/fully-booked/closed with legend
- **Exercised:** visual and structural inspection of hand-copied markup
- **Limitations:** these are hand-maintained copies of markup that lives inline in `BookingWizard.tsx`, not the components themselves. They can drift from the real screens without any test failing, so they are treated as indicative of intended appearance only.

**Material gaps:**

1. **No authenticated state of the wizard was rendered.** Steps 1, 2, 4 and 5 — including the commitment point — were assessed entirely from implementation and passing component tests (E18).
2. **No real-world device evidence.** Context Q2 remains open; no viewport is treated as primary.
3. **No assistive-technology testing.** Screen-reader output, keyboard order through a 28-day grid, and 200% reflow were not exercised.
4. **The customer portal has no offline/sample mode** (E11), which is precisely why gaps 1 and 3 could not be closed.

**Assumptions that could not be avoided:**

- That the passing 38-test component suite (E18) accurately reflects rendered behaviour for the steps that were never rendered. The tests are specific and well-targeted, so this is a reasonable but unverified assumption.
- That production `salon_config` carries the documented defaults (`minCancellationHours: 24`, `allowCancellations: true`). The live values were not queried, so recommendation 2 is stated against the default and is *worse*, not better, if the settings have been changed.

## 2. Design thesis

**Supported interpretation:**

> This interface should help **an approved dog owner booking a few times a year, on their own phone, with no accumulated familiarity** achieve **a real appointment secured at a time they chose, understanding exactly what happens next** by keeping **the single decision currently being made** dominant while **the accumulating booking, its price, and the rules that govern it** appear only when they change what the customer would do.

Two facts from the frozen context discipline everything below. First, use is **entirely optional** — WhatsApp always remains available and the wizard itself signposts it, so friction does not slow a task, it silently converts a self-service booking into staff work. Second, the surface already holds itself to an explicit, test-pinned **truthfulness standard**. The most valuable findings are therefore not imported taste but places where the interface falls short of its own standard.

## 3. Current-design assessment

### What works and should be preserved

**Observed:** at 390px the layout collapses to a single column with the summary sidebar removed from the flow and no horizontal document overflow; at 1280px it resolves to a `644px 320px` grid with the sidebar sticky (R1, R2). The mechanism matters: the sidebar is always in the DOM and hidden by CSS, and the inline running total is *suppressed* once the sidebar appears, so the estimated total is never shown twice (E10). That is a deliberate deduplication most responsive implementations get wrong.

**Observed:** every calendar day button carries a complete accessible name — `"Friday 21 August, closed"` — rather than a bare numeral (R3). A screen-reader user paging a 28-day grid gets the weekday, date, month and bookability in one utterance.

**Supported interpretation:** four preserved mechanisms carry most of this surface's quality.

1. **Failure is distinguished from absence.** Step 4 refuses to render a fetch failure as "fully booked", because doing so would nudge a customer onto a waitlist when a slot may well be free (E7). Step 3 withholds the open/full/closed legend whenever availability could not be fully checked, replacing it with an honest hint (E6) — **observed** rendering that exact hint in R3.
2. **Post-commitment honesty is enforced by tests.** The success screen refuses "All booked in!" when a deposit is outstanding, and claims less again ("Appointment saved") when deposit status cannot be read (E3, E18).
3. **The reschedule identity is durable.** The booking UUID lives in the query string so a refresh cannot silently convert a reschedule into a second booking; when only display state survives, the wizard **refuses and recovers** rather than guessing (E3).
4. **Non-colour state cues already exist.** Fully-booked days carry a strikethrough alongside the coral tint, with a source comment stating that this is deliberate (E10).

These should survive any change proposed below.

### Friction

**Supported interpretation:** the friction on this surface is almost entirely **informational, not interactional**. The controls are well-built, well-named and well-sized apart from one measured exception. What the interface gets wrong is *what it says at the moment of commitment* — and in both cases the root cause is identical: **a sentence hardcoded in the component asserts a fact that the server actually governs, and that the client either already holds or could hold.**

- Step 5 says the price is "paid at pick-up" for every customer, while `depositRequired` has already been fetched one step earlier and thrown away (E8, E16).
- Step 5 says cancellation is possible "up until the day before", while the server enforces a configurable `minCancellationHours` (default 24) measured from the appointment's **start time**, and staff can disable online cancellation entirely (E8, E24).

Both sit in the same paragraph of the same screen, at the one point in the flow where the customer's understanding becomes a commitment.

### Problem character

**Mixed, weighted heavily to behavioural and content.** The two critical findings are content-truthfulness defects with a behavioural cause (a fetched fact discarded; a server rule duplicated as static prose). The accessibility findings are visual and measurable. No structural problem was found — the five-step architecture is sound and nothing below proposes changing it.

## 4. Attention and hierarchy map

| Level | Intended focus | Current evidence | Conflict | Required prominence change |
| --- | --- | --- | --- | --- |
| 1 | The decision currently being made — dog list, service cards, date grid, or time list | Each step renders its choices in a `wizard-card` directly under a focused step heading; focus moves to that heading on every step change (E3, R1) | None | None — preserve |
| 2 | The accumulating booking and its cost | Sticky sidebar ≥1024px; a single inline total line below that, with the duplicate suppressed (E9, E10, R1) | None on desktop. On mobile the accumulating booking is a single line of text, but no evidence establishes that this is insufficient | None without an answer to context Q2 |
| 3 | Back / Continue, step-of-5 progress, Cancel | Fixed action row; `role="progressbar"` paw stepper; Cancel in the header (E3) | None | None — preserve |
| 4 | Rules that govern the commitment — price basis, deposit, cancellation window | Price basis is stated correctly. **The deposit is absent entirely, and the cancellation window is stated incorrectly** (E8, E16, E24) | **Material.** Two facts that change what the commitment means are ranked below decoration, or missing | **Promote to level 2 on step 5 only** — beside the total, where the customer is deciding whether to commit |

## 5. Prioritised improvements

| Rank | Priority | Problem | Evidence | Affected user | Proposed change | User benefit | Reduces | Trade-off | Confidence | Constraint status |
| ---: | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Critical | Step 5 states the price is "paid at pick-up" for everyone, but a deposit-flagged owner is only told a deposit is due *after* committing — despite `depositRequired` already being fetched at step 4 and discarded | E8, E16, E3, E18 | Deposit-required customers | Thread the `depositRequired` flag from step 4 into step 5 and, when true, replace the payment line with a deposit statement naming the amount and that the appointment is held until it is paid. Phrase it conditionally and never render the absence of the flag as "no deposit required", since the read fails open | The customer learns what commitment means before making it, not after | Ambiguity, error probability, recovery effort | One extra prop and a conditional; the pre-commit amount is advisory until the trigger stamps the authoritative figure | High | Within approved structure; extends the existing test-pinned honesty standard |
| 2 | Critical | Step 5 promises cancellation "from your dashboard up until the day before", but the server allows it only until `minCancellationHours` (default 24) before the appointment's **start time**, and only while `allowCancellations` is on — both staff-configurable | E8, E24 | All customers, most sharply anyone booking an early morning slot | Correct the sentence to match the rule. Minimum: state the notice period rather than a day boundary. Better: derive the sentence from the configured settings, and omit the promise entirely when online cancellation is switched off | The customer is not told they retain an option the server will refuse | Ambiguity, error probability, recovery effort | Deriving it needs the settings read into the wizard; a corrected static sentence is nearly free but drifts if settings change | High | Within approved structure; corrects a false statement |
| 3 | High | A dog with an unconfirmed size is disabled with "Size not confirmed — message us first" and **no link**, while the pregnancy case two lines below provides a WhatsApp link | E4 | Customers whose dog has no confirmed size — disproportionately new customers | Give the unconfirmed-size case the same WhatsApp affordance the pregnancy case already has, reusing `SALON_WHATSAPP_URL` | The blocked customer can act immediately instead of leaving to work out how | Taps or clicks, context loss, time to completion | None of consequence — the link and constant already exist in this component | High | Within approved structure; corrects an internal inconsistency |
| 4 | High | The secondary text token `--color-sd-ink-light` (`#6B7891`) measures 4.45:1 on white and 4.23:1 on the wizard's tinted backdrop — below the 4.5:1 AA threshold for normal-size text — across the step helper, the incomplete-availability hint, the weekday headers and the sidebar empty state | R2, E10 | Anyone with reduced contrast sensitivity, and anyone reading a phone in bright light | Darken the token to approximately `#67738B`, which measures 4.77:1 on white and so retains headroom on the tinted backdrop. Hue and character are preserved; only lightness changes | Secondary guidance becomes reliably readable, including the sentence that explains degraded availability | Interpretation, error probability | The token is used in 14 files, so the change is app-wide and needs a visual pass beyond this surface | High | Challenges a technically entrenched design token — the change is small but its blast radius is not |
| 5 | Medium | Calendar day buttons render 34×34px with a 4px gap at 390px, while the same component's month-navigation buttons are 44×44px — on the most-tapped control in the flow | R2, R3 | Touch users, and anyone with reduced motor precision | Raise the day cell to at least 44×44px at phone widths, accepting a taller grid, or reduce the page from 28 days so the same width yields larger cells | Fewer mis-taps on the one control every booking must use repeatedly | Error probability, taps or clicks, recovery effort | A 44px grid is roughly 30% taller and may push the Continue action below the fold on small phones | Medium-high | Within approved structure; **priority depends on context Q2** — this rises to High if phone use is confirmed dominant |
| 6 | Medium | Closed-day numerals measure 1.89:1 against their background at 13px. Disabled controls are exempt from WCAG 1.4.3, so this is not an AA failure — but four of every seven days are closed, and the numeral is the customer's means of orienting in the month | R2, R3 | Anyone with reduced contrast sensitivity | Raise closed-day text enough to be legible while keeping it clearly recessed relative to open days — the receded treatment is deliberate and should survive, only the numeral needs to remain readable | The customer can locate a target date by number rather than by counting cells | Interpretation, memory burden | Reduces the visual contrast between open and closed days, which currently does useful scanning work | Medium | Within approved structure; the receded intent is explicitly commented and must be preserved |
| 7 | Medium | The customer portal has no offline/sample mode and no end-to-end coverage, so the product's only customer write path is its least-verified surface. `customerClient.ts` ignores `VITE_FORCE_OFFLINE`, and the offline guard test asserts only the staff client | E11, E12, E13, E19, E23 | All customers, indirectly — regressions here reach production unverified | Mirror the staff client's offline guard onto the customer client and extend `offlineTestGuard.test.ts` to assert both, then add a customer sample-data path so the wizard can be rendered and E2E-tested without production | Regressions in the booking flow are caught before customers meet them; future reviews can assess real states | Error probability, recovery effort | Engineering work with no direct user-visible benefit; requires a sample dataset for the portal | High | **Requires owner decision** — context Q3 |
| 8 | Low | A restored draft replays the dog `size` captured when the draft was saved. If staff corrected that size in the meantime, the client-side availability preflight runs on a stale value. The server takes size authoritatively from `dogs.size`, so no wrong booking is written — but the customer can be offered a time the server then refuses | E3, E1, E16 | Returning customers resuming an older draft after a staff correction | On draft restore, reconcile `selectedDogs` against the freshly fetched dog list and drop or refresh any entry whose size has changed | A refusal at the commitment point is avoided rather than explained | Error probability, recovery effort | A small reconciliation step on restore; a dog whose size changed must be re-confirmed, which is mildly disruptive but correct | Medium | Within approved structure |
| 9 | Low | The dev harness's source comments state that offline mode nulls the customer Supabase client and that this is why the real `DateSelection` cannot reach its complete branch. Both are false: the client is live, and the true cause is that the availability RPCs are correctly restricted to authenticated callers | E21, E23, E11, E14 | Future reviewers and contributors, who inherit a false safety belief | Correct the comments to state that the customer client is live in this harness, that its requests reach production and are refused, and that this is why the complete branch is unreachable | Prevents the next person concluding the portal is isolated when it is not | Interpretation, error probability | None | High | Within approved structure |

## 6. Refined interaction model

### Before and after

| Stage | Current interaction | Refined interaction | Why |
| --- | --- | --- | --- |
| 1. Select dogs | Blocked dogs state a reason inline; only the pregnancy case offers a way to act | Both blocked cases state the reason **and** offer the same WhatsApp route | An instruction the customer cannot act on is a dead end, and the means already exists two lines away (E4) |
| 2. Choose services | Unchanged | Unchanged | Size-filtered options, the apply-to-all shortcut and starting-price framing all work as intended (E5) |
| 3. Pick a date | Capacity-aware grid; legend withheld and an honest hint shown when availability is incomplete | Unchanged in behaviour; day cells enlarged at phone widths and closed numerals made legible | The logic is right; only the rendered ergonomics measured short (R2, R3) |
| 4. Choose a time | Fetches per-human rules including `depositRequired`, then uses only preferred and blocked slots | Same fetch, but `depositRequired` is carried forward instead of discarded | The fact is already in hand; keeping it costs nothing and enables the step-5 correction (E16) |
| 5. Confirm | "From £X (paid at pick-up)" and "cancel up until the day before" for every customer | Payment line reflects a deposit when one is required; cancellation sentence states the real notice period, or is omitted when cancellation is disabled | The commitment point must describe the commitment being made (E8, E16, E24) |

### Branches, defaults, disclosure, validation, commitment, cancellation, undo, and recovery

**Proposed refinement:** leave the branch architecture untouched and change only what step 5 discloses.

- **Branches.** The three branches — new booking, reschedule, approval-request — already diverge correctly in copy, commitment meaning and terminal screen (E3). The deposit and cancellation corrections apply to the new-booking branch; the reschedule branches already carry their own accurate banners about what stays held.
- **Defaults and disclosure.** Nothing new should be disclosed earlier than step 5. A deposit warning at step 1 would be a policy announcement to a customer who has not yet decided to book anything; at step 5 it is decision-relevant. This is the disclosure principle the review method asks for — show the decisions required now, not everything at once.
- **Validation.** The pre-commit client re-check against fresh reads is the right mechanism and should stay. Recommendation 8 extends the same instinct backwards to draft restore.
- **Commitment.** Preserve the existing duplicate-submission prevention: the button disables and its label changes while submitting (E8).
- **Cancellation, undo, recovery.** There is no undo after commitment by design; the recovery path is the dashboard's cancel or reschedule. That makes the accuracy of the cancellation sentence at step 5 a matter of whether the customer's recovery expectation is real.

## 7. Refined interface structure

| Region | Role | Content priority | Persistence | Responsive transformation | Why it deserves space |
| --- | --- | --- | --- | --- | --- |
| Wizard header | Orientation and exit | Step title, step-of-5 kicker, Cancel | Every step | Unchanged across viewports | A once-a-quarter user needs to know where they are and how to leave without committing |
| Paw stepper | Progress | Five states with a `progressbar` role | Every step | Unchanged | Sets the expected length of the flow at a glance; already carries non-colour cues (E3) |
| Step body | **Primary focus** | The current decision only | Replaced each step | Full width below 1024px; 644px column above | This is the task; nothing should compete with it |
| Inline total | Running cost | One line, from step 2 | Steps 2–5, mobile only | Suppressed once the sidebar appears | Keeps cost visible without duplicating the sidebar figure (E10) |
| Summary sidebar | Accumulated booking | Dogs, services, date, drop-off, estimated total | Steps 1–5, ≥1024px | Hidden below 1024px | Uses reclaimed desktop width for context rather than stretching the form (E9, R1) |
| **Commitment facts** | **Rules governing this commitment** | **Price basis; deposit when required; the real cancellation window** | **Step 5 only** | **Same at every viewport** | **This is the change: two facts that alter what committing means currently sit absent or wrong (E8, E16, E24)** |
| Action row | Progression | Back, Continue / Confirm | Every step | Unchanged | Stable placement matters more than prominence for a repeated linear flow |

## 8. Refined wireframes

Visual evidence exists for the shell, the sidebar and one `DateSelection` state only (R1–R3). Step 5 — where both critical findings sit — was **never rendered**, so it is presented as a structural wireframe: regions, content order, state and actions only, with no prescription of colour, spacing, type or iconography.

### Structural wireframe: step 5, deposit required

```text
Wizard header
  Cancel  ·  "Step 5 of 5"  ·  "Confirm booking"
Paw stepper (4 done, 1 current)

Helper line
  "One last check before we book it in."

Summary card
  When      Tuesday, 8 September 2026 at 10:00am
  Alfie     Full Groom · from £42
            Boston Terrier · Small

  Total     From £42
  Deposit   £10 to hold this appointment          <-- NEW, conditional
            "We'll hold Alfie's slot; the rest is paid at pick-up."

Commitment note
  "Cancelling online needs at least 24 hours' notice
   before your drop-off time."                     <-- CORRECTED

Action row
  [ Back ]                            [ Confirm booking ]
```

- **User intention:** decide whether to commit.
- **Dominant focal area:** the summary card — specifically the When line and the cost block.
- **Visible actions:** Back, Confirm booking, Cancel.
- **Hidden or deferred information:** bank details and the payment reference, which remain post-commitment because they are only authoritative once the trigger has stamped them (E3).
- **System feedback:** on submit, the button disables and its label changes; on refusal, a `role="alert"` banner appears above the step body.
- **Next transition:** the deposit-held terminal screen, whose wording is already correct and test-pinned (E18).
- **Evidence basis and limitations:** structure from E8; the deposit fact and its availability from E16; the cancellation rule from E24. **This screen was never rendered**, so no visual claim is made — only content, order and conditionality.

### Structural wireframe: step 5, no deposit required

```text
Summary card
  When      Tuesday, 8 September 2026 at 10:00am
  Alfie     Full Groom · from £42
  Total     From £42 (paid at pick-up)             <-- unchanged

Commitment note
  "Cancelling online needs at least 24 hours' notice
   before your drop-off time."                     <-- CORRECTED
```

- **User intention and focal area:** as above.
- **Hidden or deferred information:** nothing further.
- **System feedback:** unchanged.
- **Evidence basis and limitations:** the payment line is correct as it stands (E8); only the cancellation sentence changes. Where `allowCancellations` is off, the note should be omitted rather than reworded (E24).

### Structural wireframe: step 1, a dog that cannot be selected

```text
Dogs card
  [ Alfie      Boston Terrier · Small          (o) ]
  [ Bella      Breed not set                       ]   disabled
      "Size not confirmed — message us first"
      "message us on WhatsApp"                       <-- NEW link
  [ Coco       Cockapoo · Medium                    ]   disabled
      "Pregnant — message us below"
      (existing WhatsApp note below the list)
  [ + Add another pup ]
```

- **User intention:** work out why a dog cannot be booked, and what to do about it.
- **Dominant focal area:** the blocked row and its reason.
- **Visible actions:** select an eligible dog, add a dog, or open WhatsApp from either blocked case.
- **Hidden or deferred information:** none — the reason must stay adjacent to the dog it concerns.
- **System feedback:** the reason is inside the row, so it is part of the control's accessible name.
- **Next transition:** either a selectable dog is chosen, or the customer leaves for WhatsApp with the context intact.
- **Evidence basis and limitations:** structure and both existing reason strings from E4. Not rendered; whether a disabled row's inner link is reachable by keyboard **requires implementation testing** — if it is not, the link must sit outside the disabled control.

## 9. Component and state specification

### `BookingConfirmation` (step 5)

- **Purpose:** present everything the customer is about to commit to, and the rules that govern that commitment.
- **Content:** date and drop-off time; per-dog service, price and size; total; **deposit when required**; **the accurate cancellation window**.
- **Default state:** total shown as "From £X (paid at pick-up)" when no deposit applies.
- **Interaction states:** idle; submitting (button disabled, label "Booking…" or "Sending…"); error (a `role="alert"` banner above the step body).
- **Validation:** none entered here — the pre-commit re-check runs on submit and can bounce the customer back to step 4 with a plain-language message (E3).
- **Accessibility behaviour:** step heading receives focus on entry; the error banner announces via `role="alert"`. A newly added deposit block should be part of the summary card's reading order, not a live region — it is present on arrival, not an update.
- **Responsive behaviour:** identical at all viewports; the sidebar repeats the total above 1024px but must not repeat the deposit line, consistent with the existing no-duplicate-total rule (E10).
- **Loading behaviour:** none — all data is already in hand by step 5.
- **Failure behaviour:** if the deposit flag could not be read at step 4 (`getBookingRules` returns `null`), show the ordinary payment line and rely on the existing post-commit handling. Absence of the flag must never be rendered as a positive "no deposit required" (E16).
- **Success behaviour:** hands off to the terminal screens, whose deposit and unknown-status wording is already correct (E3, E18).
- **Relationship to neighbouring components:** consumes `depositRequired` from the `getBookingRules` call `SlotSelection` already makes (E7, E16); the cancellation sentence should derive from the same salon settings the server enforces (E24).

### `DateSelection` day cell

- **Purpose:** communicate, and allow selection of, a bookable date.
- **Content:** the date numeral; state carried by `data-state`.
- **Default state:** open — measured 17.31:1 contrast, selectable (R3).
- **Interaction states:** open, selected (`aria-pressed`), fully booked (disabled, coral, strikethrough), closed (disabled, receded).
- **Validation:** only `open` days are selectable; the server re-validates at commit.
- **Accessibility behaviour:** accessible names verified as `"Friday 21 August, closed"` and equivalents (R3). Preserve the strikethrough as the non-colour cue distinguishing fully-booked from closed (E10).
- **Responsive behaviour:** currently 34×34px at 390px with a 4px gap; recommendation 5 raises this at phone widths.
- **Loading behaviour:** skeleton rows with `aria-busy` and an `sr-only` "Loading availability…" (E6).
- **Failure behaviour:** legend withheld, honest hint shown, days fall back to the Monday–Wednesday heuristic — **observed** in R3.
- **Relationship to neighbouring components:** feeds the date into step 4, which re-derives availability from scratch rather than trusting step 3.

## 10. Information-density and complexity audit

| Change type | Element or decision | Proposed treatment | Why simplification is safe |
| --- | --- | --- | --- |
| Removed | Nothing | — | No element on this surface was found to be redundant; the one genuine duplication (the estimated total) is already suppressed by CSS (E10) |
| Combined | Payment basis and deposit at step 5 | One cost block stating the total, and — when applicable — the deposit that holds the appointment | They answer the same customer question ("what do I pay, and when?"); splitting them would invite the reader to stop after the first line |
| Deferred | Bank details and payment reference | Remain post-commitment | They are only authoritative once the trigger has stamped them; showing a guess pre-commit would be a new truthfulness problem (E3) |
| Contextual | The cancellation sentence | Shown only when online cancellation is enabled; worded from the configured notice period | A promise that does not apply is worse than no promise (E24) |
| Preserved complexity | The five-step order, including services before dates | Unchanged | Availability is computed from dogs and sizes, not services, so step 2 is not technically required before step 3 — but the order is strongly established, test-covered, and reflects a sound "choose what you are buying before when" model. Reordering would be a structural workflow change requiring the full gate, and the evidence does not justify one |
| Preserved complexity | Draft persistence plus the `beforeunload` warning | Unchanged | Belt-and-braces on an interruptible flow where losing selections costs a booking; the source already frames the warning as a backstop (E3) |

## 11. Accessibility review

| Risk or requirement | Severity | Affected users | Evidence | Proposed correction | Requires implementation testing? |
| --- | --- | --- | --- | --- | --- |
| Secondary text at 4.23–4.45:1, below the 4.5:1 AA threshold for normal text | High | Reduced contrast sensitivity; bright-light reading | R2, E10 | Darken `--color-sd-ink-light` to approximately `#67738B` (4.77:1 on white) | No — measured directly |
| Calendar day targets 34×34px against 44×44px navigation in the same component | Medium | Touch users; reduced motor precision | R2, R3 | Raise day cells to at least 44×44px at phone widths | No — measured directly |
| Closed-day numerals at 1.89:1 | Medium | Reduced contrast sensitivity | R2, R3 | Raise the numeral's contrast while keeping the state clearly recessed | No — measured directly |
| A disabled dog row's explanatory link may be unreachable by keyboard | Medium | Keyboard-only and switch users | E4 | If the link cannot be focused inside a disabled control, place it outside the row | **Yes** |
| Keyboard traversal across a 28-day grid where most cells are disabled | Medium | Keyboard-only users | E6, R3 | Verify that paging and selection are achievable without excessive tabbing; consider roving focus if not | **Yes** |
| Screen-reader announcement of the paging range and the degraded-availability hint | Low-medium | Screen-reader users | E6, R3 | Verify that `aria-live="polite"` on the range line and `role="status"` on the hint announce as intended | **Yes** |
| 200% zoom and text scaling on a 28-day grid | Medium | Low-vision users | E10, R2 | Verify reflow at 200%; the fixed seven-column grid is the likeliest failure point | **Yes** |
| Non-colour state cues | **Already satisfied** | Colour-vision deficiency | E10 | Preserve the fully-booked strikethrough | No |
| Focus management on step change | **Already satisfied** | Keyboard and screen-reader users | E3 | Preserve heading focus | No |
| Reduced-motion support | **Already satisfied** | Vestibular sensitivity | E3, E10 | Preserve both media blocks and the `aria-hidden` confetti | No |

## 12. Edge cases and recovery

| Trigger | Interface state | Feedback | Preserved input | Recovery | Duplicate or harmful-action prevention |
| --- | --- | --- | --- | --- | --- |
| Availability read fails at step 3 | Grid falls back to the Monday–Wednesday heuristic; legend withheld | `role="status"` hint stating the preview is incomplete and the date will be re-checked — **observed** (R3) | All selections | Continue; step 4 re-derives availability independently | Step 3 never asserts a day is bookable when it could not check |
| Availability read fails at step 4 | No slots listed | `role="alert"`: "We couldn't check availability just now." Waitlist deliberately **not** offered | All selections | Retry via Back and forward | A network blip is never rendered as "fully booked" (E7) |
| Day genuinely full | Empty state naming the date | "Fully booked on …" with a waitlist offer | All selections | Waitlist, or pick another day | Waitlist offered only on a real full day |
| Same-day cutoff lapses mid-flow | Today shows no times | Empty state: "Today's last-minute times have gone" | All selections | Choose another day | Filter fails **closed** — an errored RPC yields nothing rather than unbookable times (E3, E7) |
| Slot taken while deciding | Bounced to step 4 | Plain-language message; denial logged | All selections except the slot | Choose another time | Client re-check before write (E3) |
| Server trigger refuses | Error banner at step 5 | `friendlyDenialMessage`; engine text logged, never shown | Everything | Adjust and retry | Raw trigger language never reaches the customer (E3) |
| Deposit read-back fails after commit | "Appointment saved" terminal | Directs the customer to the dashboard rather than claiming confirmation | Booking is committed | Dashboard shows the deposit panel | Test-pinned against claiming confirmation (E3, E18) |
| Refresh during a reschedule | Invalid-reschedule recovery screen | "This reschedule link isn't valid…" | Nothing — deliberately | Return to dashboard and restart | Refuses to guess rather than creating a second booking (E3) |
| Interruption and return | Draft restored at the saved step | Selections reappear | Everything | Continue | Draft cleared on terminal states; disabled entirely during a reschedule (E3) |
| Draft restored after a staff size correction | Selections reappear with the **stale** size | None | Everything | Server takes size authoritatively, so no wrong booking is written — but a refusal may occur at commit | **Gap** — recommendation 8 reconciles on restore (E3, E1) |
| Deposit-required customer at step 5 | Ordinary payment line | None | — | — | **Gap** — recommendation 1 (E8, E16) |
| Customer relying on the stated cancellation window | Sentence promising "the day before" | None | — | Refused at the dashboard with `SDC02` | **Gap** — recommendation 2 (E8, E24) |

## 13. Responsive behaviour

| Viewport or input | Remains primary | Moves or collapses | Becomes contextual | Remains persistent | Context preservation |
| --- | --- | --- | --- | --- | --- |
| 390×844, touch — **observed** (R2) | The current step's decision, full width | Summary sidebar removed from the flow (`display:none`); grid collapses to one column; no horizontal overflow | The estimated total appears as a single inline line from step 2 | Header, stepper, action row | Draft persistence carries selections across interruption; the inline total is the only cross-step artefact |
| 640–1023px, touch — CSS only (E10) | As above | Content capped at 640px; sidebar still hidden | As above | As above | Identical to phone with more margin. **Not rendered — inferred from CSS** |
| 1280×720, pointer — **observed** (R1) | The current step's decision in a 644px column | Sidebar appears as a 320px sticky column at `top:32px` | The inline total is **suppressed** so the figure is never duplicated | Header, stepper, action row, sidebar | The sidebar makes the accumulating booking continuously visible, removing the need to remember earlier steps |

**Proposed refinement:** none to the transformation itself — it is well-judged and the deduplication is better than most. The only responsive change proposed is recommendation 5, raising day-cell size at phone widths, and its priority is explicitly conditional on context Q2 being answered.

## 14. Signature interaction

**Proposed refinement:** at step 5, when a deposit is required, present the deposit as part of the cost block with the appointment framed as **held rather than confirmed** — the same distinction the post-commitment screen already draws, moved one step earlier so it informs the decision instead of explaining it afterwards.

**Accessibility and repeated-use rationale:** it adds no motion, no new control and no extra tap. It is static content present on arrival, so it needs no live region and cannot interrupt a screen-reader user mid-utterance. On repeated use it does not become noise, because it appears only for the customers it concerns and only at the step where it changes a decision. It survives novelty because it is information rather than delight — and it makes the flow's most important moment consistent with the honesty standard the rest of the surface already meets.

## 15. Acceptance criteria

- **AC-01:** Given a customer whose `humans.deposit_required` is true, when they reach step 5, then the cost block states the deposit amount and that the appointment is held until it is paid, before any confirm action is available.
- **AC-02:** Given `getBookingRules` returned `null` for the current customer, when they reach step 5, then the ordinary payment line is shown and no statement is made that a deposit is or is not required.
- **AC-03:** Given `minCancellationHours` is 24, when a customer reaches step 5, then the cancellation note states a notice period measured from the drop-off time and does not use a day-boundary phrasing.
- **AC-04:** Given `customerPortal.allowCancellations` is false, when a customer reaches step 5, then no online-cancellation promise is displayed.
- **AC-05:** Given a dog whose size is not one of the recognised sizes, when step 1 renders it, then the row exposes both the reason and an operable link to the salon's WhatsApp, and that link is reachable by keyboard.
- **AC-06:** At 390×844, every selectable calendar day control measures at least 44×44 CSS pixels.
- **AC-07:** At 390×844 and 1280×720, all non-disabled text rendered in `--color-sd-ink-light` measures at least 4.5:1 against its resolved background.
- **AC-08:** At 390×844, a closed day's numeral is distinguishable from its background at a measured ratio of at least 3:1 while remaining visually recessed relative to an open day.
- **AC-09:** Given `VITE_FORCE_OFFLINE=1`, when the application starts, then `customerSupabase` is null and no request is issued to any Supabase host; `offlineTestGuard.test.ts` asserts this for both clients.
- **AC-10:** Given a persisted draft whose stored dog size differs from the current `dogs.size`, when the wizard restores it, then the restored selection reflects the current size or the dog is dropped from the selection.
- **AC-11:** At 1280×720, when a deposit line is shown at step 5, then the summary sidebar does not also render a deposit line.
- **AC-12:** Given availability could not be fully checked, when step 3 renders, then no open/full/closed legend is displayed and a status message states that the preview is incomplete.

## 16. Final assessment

**Supported interpretation:** this is a carefully built surface whose governing principle — never assert something the system has not established — is already encoded in tests and visible in the code at almost every turn. Step 4 refuses to mislabel a failure as a full day. Step 3 withholds its legend rather than imply certainty. The success screen declines to celebrate when a deposit is outstanding, and declines again when it cannot tell. The reschedule flow refuses to guess. That is an unusually disciplined standard, and it is the reason this review found no structural problems and proposes no new page, modal, tab or destination.

**Proposed refinement:** hold the commitment screen to the standard the rest of the surface already meets. Both critical findings are the same defect wearing different clothes — a sentence hardcoded in a component asserting a fact the server governs. One of those facts is already fetched one step earlier and thrown away; the other is a configurable setting duplicated as static prose. Fixing them requires no new structure and no extra network call. Everything else proposed is measurement-led ergonomics: a design token 0.05 short of AA, day targets 10px short of the size the same component uses for its own navigation buttons, and closed dates that are hard to read.

**Deliberately preserved:** the five-step order and its rationale; the four-dog cap; the failure-versus-absence distinction; the withheld legend; the fully-booked strikethrough; the durable reschedule identity; draft persistence and its disabling during a reschedule; the suppressed duplicate total; every existing live region, focus behaviour and reduced-motion block.

**Unresolved:** real-world device priority (Q2) genuinely gates the ranking of recommendation 5, and the wizard already emits the funnel telemetry that could answer it. Whether the customer client should honour `VITE_FORCE_OFFLINE` (Q3) is an engineering decision with a UX consequence: until it is made, this surface cannot be rendered in its real states, and this review's four material gaps cannot be closed.

**Owner approval required:** Q1 (pre-commitment deposit disclosure), Q2 (device priority), Q3 (offline isolation), Q4 (cancellation-window copy). None blocks the recommendations above; Q1 and Q4 shape *how* recommendations 1 and 2 are implemented rather than *whether*.

**Remaining barrier to a fully verified standard:** not design judgement but observability. The product's only customer write path has no offline mode, no end-to-end coverage, and — as this review found — a development harness whose own comments misdescribe its isolation. Four of this review's material gaps trace to that single cause. Closing it would let the next review of this surface assess what customers actually see, rather than what the implementation and its tests say they should.
