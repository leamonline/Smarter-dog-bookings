# UI/UX improvements — design

**Date:** 2026-06-03
**Source:** UI/UX review (four friction points), each verified against the code before accepting.

## Background

A UI/UX review flagged four friction points. Each was checked against the actual code; the verification reshuffled the effort/value, so the plan below does **not** treat them as four equal tasks:

| # | Item | Review's effort | Verified reality |
|---|------|-----------------|------------------|
| 1 | Customer date hint | Small | Real. Static copy can contradict live closures. Small. |
| 2 | Inbox declutter | Medium | Real — the one substantial piece. Now also carries a **behaviour change**: AI drafts must only ever be generated on an explicit click. |
| 3 | Proposal colour (emerald) | Small | Real, but emerald is a deliberate app-wide "functional tone" layer, not a one-off. Scope chosen deliberately (below). |
| 4 | Dashboard prioritisation | Medium | **Mostly already built.** A tone system already sorts by urgency and collapses to one "All clear" row. Minimal/optional. |

## Goals

- The customer date hint can never claim the salon is open on a day that's actually closed.
- The inbox shows one pending action at a time, keeps the composer always visible, and makes booking-proposal state unmistakable.
- AI replies are generated **only** on an explicit staff click — the API is never called without one, in any mode.
- The booking proposal uses the brand palette; green is reserved to mean "confirmed".

## Non-goals

- No app-wide colour rewrite. The dashboard's emerald/amber/sky urgency-tone layer is intentional and stays.
- No dashboard rebuild — the prioritisation it needs already exists.
- No new AI capabilities. This narrows AI behaviour (manual-only), it doesn't extend it.

---

## Item 1 — Customer date hint (Small)

**Problem.** [`DateSelection.tsx:20-36`](src/components/customer/booking/DateSelection.tsx:20) builds the hint once at module load from the static `defaultOpen` flags in [`salon.ts:16-24`](src/constants/salon.ts:16), producing e.g. *"We're open Monday–Wednesday."* The greyed-out days in the picker, however, come from the live `get_open_days` RPC. The two can disagree — the hint can name an open day that's actually closed, or omit one that's open.

**Approach (recommended): make the hint generic and always-true.** Drop the "We're open X–Y" claim. Keep the part that explains the picker: *"Closed days are dimmed — pick any available day."* The calendar itself already shows which days are open, so the hint's only job is to explain the dimming. This removes the entire class of bug and is the smallest change.

**Alternative (richer, more code):** derive the open-days summary from the fetched `get_open_days` rows for the visible range. Always accurate, but the sentence becomes range-dependent and awkward when hours vary week to week. Recommend against unless the at-a-glance day list is missed.

**Related note (out of scope):** the static `defaultOpen` flags also act as the picker's *fallback* for dates beyond the loaded range (`getDefaultOpenForDate`). That fallback is a separate, deeper concern and is **not** part of this change.

**Acceptance:** the hint contains no hardcoded day names; it reads sensibly whatever the live closures are.

---

## Item 2 — Inbox declutter + click-first AI (Medium — the main piece)

Five surfaces currently stack in one scrolling column (AI-mode in the header, draft panel, booking proposal, generate-reply button, composer), each in its own colour, with the composer **not** pinned. See mockup shared in chat. Five sub-parts:

### 2a — Pin the composer
The reply box sits at the bottom of the detail pane and never scrolls away; the thread scrolls above it. Today it's the last item in a long scroll ([`InboxView.jsx:650`](src/components/views/inbox/InboxView.jsx:650), no sticky positioning).

### 2b — Click-first generation
The composer starts **empty** with a **"Generate AI reply"** button. The API fires only on click. On click, the returned draft fills the composer as editable text, with a small strip above it: *AI draft · why held · Regenerate · Dismiss*. (Folding the draft into the composer is the chosen model; the separate amber `DraftPanel` goes away. Flag at review if you'd rather keep the draft as its own card.)

### 2c — Remove automatic drafting (backend)
Today, a conversation in **AI-auto** mode auto-generates a Claude draft on every inbound message via a DB trigger → `whatsapp-agent` ([`supabase/functions/whatsapp-agent/index.ts:2081`](supabase/functions/whatsapp-agent/index.ts), gated on `conversation.state === 'ai_handling'`). Change: `whatsapp-agent` calls Claude **only** when `force_draft` is set (the explicit-click path via `whatsapp-generate-reply`). The automatic `ai_handling` drafting branch is removed.

**Care:** `whatsapp-agent` does more than drafting (state management, intent, opt-outs). Only the *Claude-generation-on-auto* path is removed; the rest of the agent's inbound handling stays intact.

**Consequence:** with nothing auto-drafting, "AI auto" mode and the "Allow autonomous bookings" toggle become inert. The `AIModeSelector` ([`AIModeSelector.jsx`](src/components/views/inbox/AIModeSelector.jsx)) should be **removed or reduced** to reflect that AI assistance is now always manual, rather than left as dead controls. (Autonomous-booking auto-apply is part of the same hands-off behaviour and should be disabled too — confirm at review.)

### 2d — One action at a time
Inactive panels collapse to a single tap-to-open line (e.g. *"Why this was held ›"*) instead of stacking open. Only the action that needs attention is expanded.

### 2e — Explicit booking-proposal state
A clear status pill on the proposal — *"Proposed · awaiting your OK"* — so it's never ambiguous whether a booking is suggested, applied, or declined. Apply/Decline actions stay.

**Acceptance:** composer always visible; no API call occurs on conversation open or inbound; clicking Generate produces a draft in the composer; at most one action panel expanded; booking proposal shows an explicit state pill; mode selector no longer offers dead auto controls.

---

## Item 3 — Brand colour for the proposal + "confirmed" (Small)

**Scope (chosen):** recolour the booking proposal from emerald to the brand palette (yellow primary action, purple ink, coral for decline/caution), **and** switch emerald → `brand-green` (`#00D94A`) anywhere emerald currently signals *confirmed/success* (e.g. the success variant in [`Badge.jsx`](src/components/ui/Badge.jsx), the "created" event dot, success states). **Leave the dashboard's emerald/amber/sky urgency-tone layer alone** — that's deliberate and not "success" colour.

**Net effect:** green comes to mean exactly one thing — confirmed — across the staff app.

**Acceptance:** the booking proposal uses brand tokens only; emerald no longer appears as a "success/confirmed" signal; the dashboard tone cards are visually unchanged.

---

## Item 4 — Dashboard (optional, recommend defer)

The review asked for urgency-first prioritisation and less broad-list noise. The right rail **already** does this: `RightWorkflowSidebar` resolves a tone per card, sorts attention → active → calm, and collapses to a single "All clear" row when everything is calm ([`RightWorkflowSidebar.jsx:117-155`](src/components/dashboard/RightWorkflowSidebar.jsx:117)); calm cards already render compact and muted ([`RightRailCard.jsx`](src/components/dashboard/RightRailCard.jsx)).

**Only candidate tweak:** when *some* (not all) cards are calm, they still render as individual compact cards. They could instead group into a condensed strip like the all-calm row. This is marginal and speculative.

**Recommendation:** defer unless real clutter has been felt in use. Listed for completeness, not because it's needed.

---

## Risks & trade-offs

- **Losing autonomy.** Removing auto-drafting means every reply needs a click — more control, full API-cost control, but no hands-off drafting. This is the explicit, intended trade-off.
- **Backend blast radius.** `whatsapp-agent` is large and does more than drafting. The change must surgically remove only the auto-generation branch; needs test coverage around inbound handling that *isn't* drafting.
- **Colour regressions.** The emerald sweep must distinguish "success/confirmed" emerald (change it) from "functional tone" emerald (leave it). Easy to over-reach.
- **Mobile height.** Proposal + composer pinned together can get tall on a phone; the collapse-to-one-line behaviour (2d) is what keeps it manageable.

## Testing approach

- **Unit/component:** date hint renders no day names; composer empty-vs-filled states; Generate button triggers exactly one API call; colour tokens applied where expected.
- **Backend:** `whatsapp-agent` does not call Claude on an inbound without `force_draft`; still performs non-drafting inbound handling.
- **Manual / e2e:** open a conversation → no network call to generate; click Generate → draft appears; apply/decline a proposal; check mobile pinned-zone height.

## Build order (suggested)

1. Item 1 (date hint) — isolated, fastest, ship independently.
2. Item 3 (colour) — isolated, low risk.
3. Item 2 (inbox + click-first + backend) — the real project; do last, in its own branch.
4. Item 4 — only if chosen.
