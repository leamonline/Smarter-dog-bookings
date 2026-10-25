Status: Proposed
Issue: None yet
Base: main, 2026-10-25
Last verified: 2026-10-25
Owners: src/components/ui/, src/components/views/today/stack/, src/components/booking/, src/index.css, src/customer-portal.css, .design-sync/
Dependencies: None
Related requirements: REQ-A11Y-001 (status text alongside colour)
Related ADRs: ADR 009 (independent website palette)

# Design system: the two screens staff read all day, and one set of tokens

## Goal
Finish what the design-system review started (the form controls, the colour clean-up, the type floor). Two things are left that are too large to slip into a clean-up: the screens the salon actually runs on are not in the kit, and the staff and portal sides still speak two token vocabularies.

This plan changes no booking rule, customer data or deployment behaviour. It is a proposal: nothing here is built.

## Constraint that shapes everything
`CLAUDE.md` says the booking app and the customer portal must not have their **CSS, routing, auth or service workers merged**. So Part C unifies the token *vocabulary* (names and values) and keeps `customer-portal.css` a separate stylesheet. It must not be read as a licence to fold the portal into the staff stylesheet.

## Part A: the `/today` dog card

### Where it stands
`StackCard.jsx` is 423 lines with roughly 25 props. It is the card staff scan at arm's length, and its header comment records hard-won rules: the safety note is always visible as words (never a tooltip), the balance shows from Ready onward as bold tabular figures with the word "due", urgency is weight and wording rather than a new hue, and an undeliverable WhatsApp message shares the safety row so the fixed header height never moves.

It cannot be dropped into the design-system bundle as it stands: it calls data hooks (`useBookingDeliveryFailure`, `useUnreachableHumans`), reads the board engine (`tokenActions`) and holds its own state. The kit bundles only `src/components/ui/`, which is deliberately free of those.

### Proposal
Split it in two, behaviour unchanged:
1. **`DayCard`** (presentational, in `src/components/ui/`): time, who, what, where in the day, the status word (`BookingStatusBadge`), the timing line, the safety row, the balance, the fixed header. It takes plain data and callbacks only.
2. **`StackCard`** (stays where it is): the hooks, the engine lookups and the actions. It renders `DayCard`.

Then the design system can show the card in every state it must survive: each status, on time and late, with and without a safety note, with a balance, with an undeliverable message.

### Done when
- `DayCard` has no import from `supabase/`, `engine/` or a hook.
- The existing `dayStack.component.test.jsx` (617 lines) passes unchanged: the split is a refactor, not a redesign.
- The fixed header height is asserted for every state, so a new row can never move the cards below it.
- A design-system preview renders the full state matrix.

## Part B: the calendar slot

### Where it stands
`SlotGrid.jsx` (494 lines) and `BookingCardNew.jsx` (562 lines) draw the weekly calendar, including each slot's seats. The 2-2-1 capacity rule, the large-dog seat costs, blocked seats, partial-day closures and last-minute openings all show up as visual states here. They are the product.

### Proposal
Extract a presentational **`SlotRow`** and **`SeatCell`** that take a *resolved* state from the capacity engine (open, booked, blocked, closed, limited by 2-2-1, last-minute) and draw it. They must not recompute capacity.

### Hard rule
The capacity engine exists three times (`src/engine/capacity.ts`, `supabase/functions/_shared/capacity.ts`, the Postgres trigger) and is on the "explain before changing" list. **This plan does not touch it.** The cells only render what the engine already decided. If extracting them tempts a change to how a state is derived, stop and raise it separately.

### Done when
- `SeatCell` renders every state from props alone, with each state carrying text or an icon as well as colour.
- `SlotGrid.component.test.jsx` passes unchanged.
- A design-system preview shows the states side by side.

## Part C: one token vocabulary

### Where it stands
Portal names are still a second scheme. Measured on 2026-10-25:
- 22 `--sd-*` shorthand names with about 349 uses, and 19 `--color-sd-*` names with about 51 uses, across 24 files.
- The heaviest: `--sd-navy` (128), `--sd-ink-light` (47), `--sd-navy-soft` (37), `--sd-cyan-dark` and `--sd-yellow` (19 each).
- Most are aliases of canonical tokens (`sd-navy` → `color-brand-ink`, `sd-yellow` → `color-brand-yellow`), so they carry a name, not a value. Two do not yet: `--sd-ink-light` is its own `#626D84` and `--sd-mute` its own `#94A3B8`, not the canonical `#57677C` (`color-text-muted`) and `#90A1B9` (`color-text-placeholder`). They only become aliases once the grey merge (#1105) lands.

### Proposal, in order
1. **Rename by codemod, behind a ratchet.** Replace `--sd-navy` with `--color-ink`, `--sd-yellow` with `--color-brand-yellow`, and so on, for every alias whose value is **already identical**. Keep `--sd-ink-light` and `--sd-mute` out of the codemod until #1105 makes them identical: renaming them first would change portal text colours, which this step must not do. (Doing step 1 on top of #1105, as #1107 does, is what lets them join.) No pixel changes. A test counts remaining `--sd-*` names and may only go down, like the raw-control and small-text ratchets.
2. **Make the surface a mode, not a naming scheme.** The portal sits on cream paper and the staff canvas on slate-50. Scope that difference with a surface attribute (for example `[data-surface="paper"]`) that re-points `--color-surface`, the border and the muted text, instead of carrying a parallel set of names.
3. **Keep the genuinely portal-only values** (the tint washes, the washi-tape colours, the portal shadows) as `--color-sd-*` until they are used outside the portal, and document them as portal-only.
4. **Retire the shorthand block** in `index.css` once its uses reach zero.

### Done when
- `--sd-*` shorthand uses are zero and `customer-portal.css` still builds as its own file.
- The portal's screens are visually identical (compare screenshots before and after step 1; they are a rename).
- The contrast-claims test still passes with no edits to its numbers.

## Order, and what it needs from you
1. Part C step 1 first: mechanical, zero visual change, shrinks the surface for everything else.
2. Part A: biggest daily benefit, and the test net (617 lines) is the strongest of the three.
3. Part B last: the most delicate, because of the capacity engine next door.

Each part is its own PR. Parts A and B each need a design call on the card's and cell's props before building; this plan deliberately stops short of fixing those, so review them first.

## Risks
- A card refactor that quietly changes the fixed header height shifts every card below it. The height assertion in Part A exists for this.
- A rename codemod over 24 files is only safe if it is limited to aliases of identical value. Anything whose value differs is a design decision, not a rename.
- The design system is a synced snapshot. Run `/design-sync` after each part, or its previews drift from the code again.

## Out of scope
The capacity engine, the booking write path and RLS, the website's independent palette (ADR 009), merging the portal's stylesheet into the staff one, and any colour that carries operational meaning (status, dog size, safety alerts).
