# Responsive Inbox as the Booking Desk communication workspace

**Date:** 2026-08-02

**Status:** Approved for implementation planning

**Branch:** `codex/booking-desk-inbox-replacement`

**Base:** Booking Desk phase 1–3 commit `39451c9e` (PR #579 remains unchanged)

## Outcome

Rebuild the existing `/inbox` screen as a compact, responsive three-pane
workspace for all active conversations. The conversation list, complete
message thread and existing booking/customer tools stay together without
changing any booking calculation, persistence, pricing, messaging integration
or Supabase query.

This is a presentation and interaction tranche. It does not perform the later
route/nav cutover or remove the existing `/booking-workspace` preview page.
Those actions remain separate because this brief requires approval before any
route change or file deletion.

The attached brief supersedes the earlier idea of opening booking tools
automatically: detected booking intent may add a quiet suggestion indicator,
but never opens, moves or focuses a panel.

## Starting point and file map

Repository root:
`/Users/leamonline/Developer/Smarter-dog-bookings`

Current Inbox: a responsive two-pane conversation list and full thread, with
booking actions embedded in the thread and customer context docked at wide
sizes or opened as a slide-over.

### Existing composition

- `src/App.jsx` — mounts `/inbox`, the app toolbar and the shared context row;
  its route table is not changed in this tranche.
- `src/components/layout/AppToolbar.jsx` — supplies the desktop app nav and
  mobile navigation around the Inbox; consumed as existing chrome.
- `src/components/layout/AppContextRow.jsx` — supplies the page context row
  above the Inbox shell; consumed as existing chrome.
- `src/components/views/inbox/InboxView.jsx` — current Inbox entry point and
  orchestrator for selection, filters, thread actions and customer context.
- `src/components/views/inbox/InboxFilterChip.jsx` — existing list filters.
- `src/components/views/inbox/conversation-list/ConversationListItem.jsx` —
  current conversation row and its multiple competing indicators.
- `src/components/views/inbox/thread/ComposePanel.jsx` — current reply composer;
  it presently owns a draft locally.
- `src/components/views/inbox/thread/MessageBubble.jsx` — renders inbound and
  outbound messages, delivery state and failed-send copy.
- `src/components/views/inbox/thread/DraftPanel.jsx` — existing AI draft review
  controls.
- `src/components/views/inbox/thread/BookingActionPanel.jsx` — existing pending
  booking-action review controls.
- `src/components/views/inbox/thread/TemplatePicker.jsx` and
  `WindowClosedBanner.jsx` — existing template/window controls.
- `src/components/views/inbox/customer-context/CustomerContextPanel.jsx` —
  existing customer and dog detail surface.
- `src/components/views/inbox/customer-context/SlideOverPanel.jsx` — existing
  customer context overlay.
- `src/components/views/inbox/customer-context/BookAppointmentModal.jsx` —
  existing staff booking UI and write path; its booking behaviour is untouched.
- `src/components/views/inbox/hooks/useCustomerContext.js` — loads existing
  customer context; its query is untouched.
- `src/components/views/inbox/hooks/useFillViewportHeight.js` — measures the
  usable Inbox height and will be extended for dynamic viewport/keyboard
  presentation only.
- `src/components/views/inbox/hooks/useSlotCapacityPreview.js`,
  `slotCapacityPreview.js` and
  `src/components/views/inbox/thread/BookingCapacityPreview.jsx` — consume the
  existing capacity result; retained without changing the calculation.
- `src/supabase/hooks/useWhatsAppInbox.js` — authoritative conversation,
  message and action data source; consumed without changing selections,
  filters or mutations.
- `src/components/views/booking-workspace/BookingWorkspaceView.jsx` — current
  preview-only Booking Desk presentation and existing diary/slot-selection UI.
- `src/components/views/booking-workspace/bookingWorkspaceModel.js` — existing
  request/intent and proposed-slot presentation model.
- `src/components/ui/PageHeader.jsx` — shared page-heading primitives.

### Planned files

The implementation plan may consolidate names, but it must preserve these
responsibilities and the boundaries below.

Modify:

- `src/components/views/inbox/InboxView.jsx` — make it the single data/action
  orchestrator for the new shell.
- `src/components/views/inbox/conversation-list/ConversationListItem.jsx` —
  compact row and single winning status.
- `src/components/views/inbox/thread/ComposePanel.jsx` — controlled draft,
  five-line growth and focus handle.
- `src/components/views/inbox/thread/MessageBubble.jsx` — failed-send Retry
  presentation using the existing manual-send callback.
- `src/components/views/inbox/hooks/useFillViewportHeight.js` — `100dvh`
  fallback plus `visualViewport` keyboard measurements.
- `src/components/views/booking-workspace/BookingWorkspaceView.jsx` — extract
  and reuse its diary/slot presentation without changing engine calls.
- The component tests beside each changed component.

Create:

- `src/components/views/inbox/workspace/InboxWorkspaceShell.jsx` — responsive
  pane grid, overlays, headers, dividers and scroll ownership.
- `src/components/views/inbox/workspace/ConversationPane.jsx` — list header,
  filters, keyboard selection and independently scrolling rows.
- `src/components/views/inbox/workspace/ThreadPane.jsx` — dominant full thread,
  sticky composer and Booking/Customer entry controls.
- `src/components/views/inbox/workspace/BookingCustomerPane.jsx` — persistent
  Booking and Customer section headers with one expanded body.
- `src/components/views/inbox/workspace/useInboxWorkspaceState.js` — one local
  reducer store for pane and per-conversation working state.
- `src/components/views/inbox/workspace/inboxWorkspaceModel.js` — pure status,
  timestamp and reply-insertion helpers.
- Focused tests beside the new shell, state hook and pure model.

No file is deleted.

### Dependencies on Booking Desk PR #579

This branch deliberately starts from Booking Desk phase 1–3 commit `39451c9e`.
The planned presentation extraction from
`src/components/views/booking-workspace/BookingWorkspaceView.jsx` is preferable
to copying its diary and proposed-slot UI into Inbox: extraction leaves one
presentation consuming the existing capacity and slot-selection results,
whereas copying would create two implementations that could drift while both
appear to offer the same booking workflow.

That reuse makes PR #579 an explicit dependency. This branch must stay stacked
on it and cannot merge independently first. If PR #579 changes, rebase this
branch onto the revised #579 head, review the extraction against those changes
and rerun its focused model/component tests before continuing. Do not preserve
the old presentation by copying it around an upstream conflict.

Booking suggestions intentionally use the request/intent data already derived
by `bookingWorkspaceModel.js`. `src/utils/parseBookingHintsFromMessage.js` has a
different, narrower job: it extracts a possible date and time from one message
to pre-fill a booking form; it does not decide whether a conversation is an
active new-booking request or distinguish that request from a cancellation,
reschedule, closed conversation, pending create action or structured draft
intent. Reusing `bookingWorkspaceModel.js` therefore avoids adding a second
intent classifier and keeps the suggestion consistent with Booking Desk's
request queue. This is a second dependency on PR #579 and follows the same
rebase-and-review rule if that PR changes.

## Boundaries

### Do not touch

- `src/engine/**`, including `capacity.ts`, `slotGrid.ts`, `occupancy.ts` and
  `pricing.ts`.
- `src/constants/salon.ts` and all pricing/policy constants.
- `supabase/**`, including schema, migrations, functions and tests.
- Query/select clauses or mutation semantics in
  `src/supabase/hooks/useWhatsAppInbox.js`.
- Query/select clauses in
  `src/components/views/inbox/hooks/useCustomerContext.js`.
- Capacity behaviour in
  `src/components/views/inbox/hooks/useSlotCapacityPreview.js`,
  `src/components/views/inbox/hooks/slotCapacityPreview.js` and
  `src/components/views/inbox/thread/BookingCapacityPreview.jsx`.
- Booking/write behaviour in
  `src/components/views/inbox/customer-context/BookAppointmentModal.jsx`.
- `/inbox` or `/booking-workspace` route definitions, feature-flag semantics,
  navigation labels and production environment settings.

Also out of scope: data-model additions, deposit derivation, new warning or
intent detection, search backend work, multi-user claiming/presence, push
notifications, WhatsApp/Chatwoot integration changes and dependencies.

## Information architecture

The shell fills the remaining viewport beneath the existing app chrome. It has
one outer surface with dividers, not cards nested inside cards.

1. **Conversations** — all active conversations by default, with existing
   filters and search available in a compact header.
2. **Thread** — the selected conversation's complete loaded message history,
   existing draft/booking-action controls and reply composer. This is always
   the visually dominant pane.
3. **Booking / Customer** — one contextual rail with two persistent 44px
   section headers. One section occupies the scrollable body; the other header
   remains visible and is always one tap away.

Customer is the initial expanded section on a normal first load. A manual tap
on Booking opens Booking. A detected intent changes only the Booking header's
indicator and never changes the expanded section.

## Responsive shell

The shell owns `overflow: hidden`. The conversation list, message history and
context body each own `overflow-y: auto` and `overscroll-behavior: contain`.
The document must not gain an Inbox scrollbar.

The CSS baseline is
`height: calc(100dvh - var(--inbox-shell-top) - var(--inbox-bottom-gap))`.
The height hook measures the shell's actual top beneath app chrome rather than
assuming a fixed toolbar height. On browsers with `visualViewport`, it narrows
that available height to the visible viewport while the keyboard is open.
`100vh` is never used.

| Viewport | Layout |
|---|---|
| `>=1440px` | `300px` conversations / flexible thread with `min-width: 560px` / `360px` Booking-Customer rail |
| `1024–1439px` | `300px` conversations / flexible thread; context is a `380px` right overlay with scrim |
| `768–1023px` | `280px` conversations / flexible thread; context is a full-height, right-anchored overlay, `min(520px, 100%)`, with scrim |
| `<768px` | One full-width pane at a time: conversations -> thread -> Booking or Customer |

At 1024–1439px and 768–1023px, scrim tap and Escape close the context overlay
and restore focus to the trigger that opened it. At mobile size, each deeper
pane has an explicit Back control in its header.

Breakpoint changes alter only presentation. They do not remount the composer,
clear a draft, reset a date or lose proposed slots.

## Workspace state

`useInboxWorkspaceState` is a view-local `useReducer`; no global-state package,
storage dependency or persistence layer is added.

It owns:

- selected conversation ID;
- current mobile pane and overlay state;
- expanded right-rail section;
- a draft string keyed by conversation ID;
- chosen date and proposed slots keyed by conversation ID; and
- a session-only set of conversation IDs whose Booking suggestion was
  dismissed.

Keying drafts and slot choices by conversation prevents customer A's working
reply from appearing when customer B is selected. Selection, resize and pane
changes preserve the map. Sending successfully clears only the selected
conversation's draft; failed sends preserve it.

On mobile, moving from list to thread installs one same-URL history sentinel.
Browser/hardware Back consumes that sentinel and dispatches one pane-back step.
If another depth remains (Booking/Customer -> thread), the sentinel is
re-installed; thread -> conversations returns to the original history entry.
This changes neither pathname nor query string and avoids trapping normal Back
when already at the conversation list. Tests cover the `popstate` lifecycle and
listener cleanup.

## Conversation list

The default collection is the existing active-conversation set. Existing
filters remain secondary controls and their underlying semantics are unchanged.

Each 64–72px row contains only:

- customer name;
- one-line, truncated latest-message preview;
- relative age;
- exactly one winning status badge; and
- when applicable, the separate WhatsApp reply-window constraint described
  below.

Status is a pure presentation selection in this order:

1. `has_failed_message` -> **Failed send**;
2. `needs_human_review` -> **Action needed**;
3. `has_pending_draft` -> **Draft pending**;
4. `has_pending_booking_action` -> **Booking action pending**;
5. `unread_count > 0` -> **Unread** (include the count in accessible text);
6. existing lifecycle state -> **Closed** when `closed_at` is present,
   otherwise **Snoozed** for `state === "snoozed"` or **Taken over** for
   `state === "human_takeover"`.

For the **Action needed** winner, the visible label stays compact but its
`title` and `aria-label` carry the existing decoded `reviewTitle` unchanged.
That preserves the current distinction between an AI-requested handoff, a
high-risk draft, both conditions together, and the approval fallback. This
tranche authors no replacement reason strings.

The same `has_pending_booking_action` field intentionally earns a conversation
row badge and contributes to the Booking suggestion: the row communicates that
staff action is waiting, while the Booking header provides the contextual way
to act on it. They are two surfaces for one existing fact, not two detectors.
Other competing dots/pills are removed so the one-badge rule is literal. When
none of these source statuses is present, the row shows no badge rather than
inventing a neutral state.

`state` already reaches the row: `useWhatsAppInbox` selects it from
`whatsapp_conversations`, retains it when spreading each result into the list
model, and `InboxView` passes that complete conversation object as `conv`.
Rendering takeover or snoozed therefore requires no Supabase selection change.

### Row signals outside status precedence

The one-badge rule applies to competing **statuses**, not to the existing
WhatsApp reply-window constraint. Keep `inboxWindowBadge(conv)` as a separate,
compact row element for both `closing_soon` and `template_needed`. It may appear
beside the winning status because it answers a different question: how staff
are still allowed to reply. Removing it would make staff discover the closing
or closed free-form window only when a send is refused and a template is
required.

Two current signals are deliberately removed from the compact row:

- `lead_status === "records_created"` no longer renders the **New** pill. Staff
  lose the list-level prompt to spot-check an autonomously created customer and
  dog before approving the first booking; the underlying records and customer
  context remain available in the workspace.
- `closure_suggested_at` / `closure_suggested_reason` no longer render the
  suggested-close chip. Staff lose the daily background pass's list-level
  recommendation, but the conversation remains active and the existing manual
  completion control remains available in the thread.

The relative timestamp has the absolute timestamp on both `title` and an
explicit `aria-label`. Up/Down moves the roving selection through visible rows,
scrolling the active row into view. Enter opens it. Pointer selection and
existing list filtering continue to work.

## Thread and composer

The centre pane renders the complete message array already loaded by
`useWhatsAppInbox`, oldest to newest; it does not truncate to Booking Desk's
current three-message preview. Existing message types, reactions, media,
templates, AI drafts and booking-action review controls remain available.

The message scroller owns the vertical space. The composer is a sibling pinned
to the bottom of the thread pane, not part of the scrolling message history.
Incoming messages keep the current reading position unless the user is already
near the bottom; this avoids a disruptive jump.

`ComposePanel` becomes controlled by the reducer and exposes a ref for focus.
Its textarea:

- starts at one line;
- grows to five computed line heights;
- then uses internal vertical scrolling;
- sends on Enter, preserving the existing WhatsApp-style binding;
- inserts a newline on Shift+Enter; and
- retains the current draft on send failure.

When iOS changes `window.visualViewport.height` or `offsetTop`, the shell height
updates in the same animation frame. The thread scroll anchor is preserved and,
when the composer is focused, the composer is scrolled into the visible area
without scrolling the document.

## Booking suggestion and context rail

Existing booking-intent/request data from `bookingWorkspaceModel.js` determines
whether the Booking header may show a dot and **Booking suggested**. There is no
new text classification or detection.

The indicator:

- never opens the rail or overlay;
- never changes the expanded section;
- never changes selected conversation;
- never steals focus; and
- stays dismissed for that conversation until the Inbox component unmounts,
  even if realtime messages arrive.

The suggestion label includes a separate 44px **Dismiss suggestion** control
with an accessible name; dismissing the entire Booking overlay is not treated
as dismissing the suggestion.

On wide desktop, both section headers remain in the fixed 360px rail. Below
1440px, thread-header buttons open the same Booking or Customer section in the
overlay/mobile pane. Whichever trigger opened it regains focus on dismissal.

The Booking body reuses the existing read-only diary and slot choices from the
Booking Workspace. Existing engine outputs determine which slots can be
chosen. The Customer body reuses `CustomerContextPanel`. Presentation may be
extracted into reusable components, but the source data and action callbacks
are unchanged.

## Insert into reply

When at least one existing proposed slot is selected, **Insert into reply**:

1. groups the choices by date in their displayed order;
2. formats each line as `Weds 6 Aug — 9:00am / 10:30am`, using the established
   conversational date/time voice and joining specific times with ` / `;
3. appends the result to the selected conversation's draft, separated by one
   blank line when the draft is non-empty;
4. focuses the composer; and
5. closes the Booking overlay/pane below 1440px, returning to the thread.

It does not send, save a booking, clear the chosen slots or modify availability.
Repeated taps append again because the requested behaviour is append, not
replace or deduplicate.

This date wording has one deliberate owner in the shared Inbox helpers.
Customer-facing message text uses the long conversational forms `Tues`, `Weds`
and `Sept`; UI chrome continues to use `en-GB` locale formatting. The long form
is intentional brand voice, not a locale bug.

## Safety and failure presentation

The UI consumes only safety facts that already reach the component. It does not
derive, query or persist a new one.

- **Capacity violation:** an existing blocking capacity result is shown in red
  and disables slot insertion/send until the existing acknowledgement path is
  satisfied. No 2-2-1 calculation is recreated in the view.
- **Opted out:** render the blocking red state only if an existing loaded object
  supplies an opt-out flag. The current Inbox/customer-context selections do
  not expose `whatsapp_opted_out`; because query changes are forbidden, this
  tranche cannot add a pre-send opt-out banner. The existing server-side send
  boundary remains authoritative.
- **Outside salon hours / slot in the past:** render amber, non-blocking copy
  only if an existing presentation flag supplies it. Do not infer either state
  from the clock, date or schedule in this tranche.
- **Failed send:** the list's winning badge and the failed message's inline
  error use the existing `status === "failed"` and error text. Selecting Retry
  first opens an inline confirmation with **Send again** and **Cancel**; nothing
  is sent on the first tap. Confirmation is required because the original may
  have reached Meta while only its status callback failed, in which case an
  immediate retry could send the customer the same message twice. Confirming
  calls the existing manual reply sender with the failed message's displayed
  text. This is explicitly a new outbound send and a new message row, not a
  resend or status change on the original row, and it introduces no resend
  endpoint or message query. On success, the original bubble remains as an
  accurate historical failed attempt but replaces its actionable error with
  **Original send failed · Sent again successfully** and removes Retry; the new
  outbound message renders as its own bubble. If the sender rejects the new
  send (for example, the WhatsApp reply window requires a template), the
  original inline failure and Retry remain and the current template controls
  remain available.

The opt-out and warning omissions are deliberate consequences of the brief's
“existing flags only” and “no query changes” constraints, not invented safe
defaults.

## Deferred follow-ups

These omissions are accepted for this presentation-only tranche but are logged
as explicit follow-up work:

- **Pre-send WhatsApp opt-out warning:** unblock by adding
  `whatsapp_opted_out` to the joined human fields in the conversation select
  and passing that trusted value to the composer. Until then, staff discover
  the server-side block only after pressing Send instead of seeing it before
  composing or confirming a retry.
- **Outside-salon-hours warning:** unblock when the existing messaging/send
  boundary exposes a stable outside-hours eligibility flag for presentation.
  Until then, staff receive no proactive amber timing warning in Inbox and see
  only the existing send-boundary result.
- **Past-slot warning:** unblock when the existing booking/slot source exposes
  an authoritative past-slot flag alongside a proposed slot. Until then, staff
  receive no amber warning before inserting a stale proposed time into a reply;
  existing booking and capacity enforcement remains unchanged.

## Accessibility and interaction details

- Every interactive target is at least 44px in both dimensions.
- All keyboard-operable controls have a visible `focus-visible` ring.
- Pane headings and regions have stable accessible names.
- Overlay focus is contained while open; Escape dismisses only the topmost
  overlay.
- Scrims are buttons or otherwise have equivalent keyboard dismissal, never
  click-only anonymous elements.
- Selecting a conversation updates the thread heading and moves focus only
  after an explicit open action; realtime updates never move focus.
- Status, warnings and selection never rely on colour alone.
- Reduced-motion preferences disable non-essential sheet animation.

## Visual treatment

Use the existing Tailwind/brand tokens and shared typography. Add only local
CSS custom properties needed for pane widths, shell height and the keyboard.

- One white workspace surface with `slate-200` dividers.
- No nested card shells around the list, thread or context sections.
- Compact headers, consistent 12/16/24px spacing rhythm and restrained status
  colour.
- The thread remains calm and widest; the list is information-dense but
  scannable; Booking/Customer stays secondary until opened.

## Verification

### Automated behaviour

- Pure status precedence renders exactly one winner in this order: failed send,
  needs human review, draft pending, booking action pending, unread, then
  takeover/snoozed/closed conversation state; no source status renders no
  badge.
- The Action needed winner preserves the existing decoded `reviewTitle` in both
  `title` and `aria-label` without adding reason copy.
- `inboxWindowBadge(conv)` remains independent of status precedence and renders
  `closing_soon` or `template_needed` alongside a winning status when both are
  present.
- The row deliberately omits the autonomous-onboarding **New** pill and the
  suggested-close chip while leaving their underlying data and actions intact.
- Conversation-row timestamp exposes relative visible and absolute accessible
  values.
- Up/Down/Enter selection works across a filtered list.
- Escape and scrim dismiss context and restore trigger focus.
- Booking intent never opens a panel; session dismissal survives message
  updates and conversation switches.
- Draft, date and proposed slots survive conversation switches, pane changes
  and breakpoint transitions without leaking between conversations.
- Mobile `popstate` steps Booking/Customer -> thread -> conversations before
  allowing route exit.
- Slot insertion appends the exact grouped UK format, focuses the composer and
  closes the overlay below 1440px.
- Composer grows through five lines, then scrolls; Enter sends and Shift+Enter
  inserts a newline.
- Failed Retry requires confirmation, creates a new send, preserves the
  original failure on rejection, and marks the original attempt as sent again
  successfully when the new send succeeds.
- `visualViewport` resize/scroll events update visible height and clean up
  listeners.

### Manual viewport matrix

Verify the real preview at widths `1440`, `1280`, `1024`, `834` and `390`:

- pane widths, overlays and one-pane navigation match the breakpoint table;
- each pane scrolls independently and the document does not scroll;
- all context triggers and Back controls work with pointer and keyboard;
- state survives crossing each breakpoint in both directions; and
- at 390px, open the on-screen keyboard, type a five-plus-line draft, insert
  slots and confirm that the composer remains visible without thread/page jump.

### Completion gate

Run the focused component/model tests first, then the repository's lint,
type-check, full test and build commands. Completion requires `npm run build`
with no type or lint errors and a clean manual viewport matrix. No migration is
created or run.

## Stop conditions

Stop and ask before deleting a file, changing a route or running a migration.
If the same step fails twice, report both attempts instead of trying a third
approach. During implementation, report each completed tranche as
`✅ [what was done]` followed by the exact files touched.
