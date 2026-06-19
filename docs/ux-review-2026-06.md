# SmarterDog Dashboard — Full UX/UI & Functionality Review

**Date:** 19 June 2026 · **Scope:** staff dashboard at `smarterdog.vercel.app` (desktop, iPad, iPhone) · **Goal:** a concrete P0/P1/P2 roadmap to 10/10.

**Method.** Two streams, then merged. **(1) Live walkthrough** in the logged‑in staff browser — every major screen and state at desktop width, plus the responsive bands; non‑destructive (no saves/cancels/deletes on real bookings). **(2) Code‑grounded audit** — 14 parallel reviewers over the React 19 / Vite / Tailwind v4 source, each finding adversarially re‑checked against the code (184 candidates → **159 confirmed**, 25 rejected). Every recommendation names a file (and line where known); the complete per‑finding list with evidence is in [docs/ux-review-assets/_code-findings-digest.md](docs/ux-review-assets/_code-findings-digest.md), and the raw live notes are in [docs/ux-review-assets/_live-notes.md](docs/ux-review-assets/_live-notes.md).

**Honesty note on device emulation.** The authenticated browser's viewport was locked at 1680 px (window resize was ignored and zoom keystrokes were intercepted), so pixel‑accurate iPad/iPhone *screenshots* weren't captured live. The responsive findings rest on (a) one real sub‑`xl` state observed live at 1054 px CSS — including a DOM dump proving the navigation is absent — and (b) the code audit of the actual breakpoint CSS, which is authoritative for tap targets, safe‑area and sheet behaviour. If you want true on‑device captures, open the app on a real iPad/iPhone and I'll guide a focused pass.

---

## 1. Executive summary

**Overall: 6.5 / 10.** This is a genuinely capable product with a strong point of view. On a wide desktop it's close to excellent: a rich three‑column shell, a standout Reports section, a best‑in‑class WhatsApp Inbox (24‑hour‑window countdown, AI‑reply *off by default*, customer‑context panel), a clearly‑explained Capacity Engine, and a well‑structured booking flow (the `N` shortcut works, the type‑ahead is fast, recurring + multi‑dog are handled). The gap to 10/10 is almost entirely about **the experience away from a wide desktop** and **accessibility**: the interface largely assumes a ≥1280 px screen, and touch‑target / contrast / labelling discipline hasn't caught up with the feature richness. The 10/10 bar — "a salon owner could run their entire day from a phone with zero confusion" — is not yet met, mainly on iPad.

Confirmed issues: **3 Critical, 71 Major, 74 Minor, 11 Polish.** The five highest‑impact gaps between today and 10/10:

1. **iPad has no primary navigation (768–1279 px).** The full top nav only renders at `xl` (≥1280) and the mobile bottom‑tab nav only renders below `md` (<768). In between — which is **both iPad portrait (820) and landscape (1180)** — there is no way to reach Dogs, Humans, Reports or Inbox. *Live DOM proof: at 1054 px the only top‑bar controls were Overview, New booking, Settings, Account.* `src/components/layout/AppToolbar.jsx`. **This single issue is why an iPad can't run the day.**
2. **Pervasive accessibility debt.** Two contrast failures are Critical on their own (placeholder text and disabled‑button text are effectively invisible); on top of that, form inputs across the New Booking / Dogs / Humans / Settings modals lack associated labels, error regions lack `aria-live`, several "buttons" are non‑semantic, and there's no keyboard alternative to drag‑and‑drop rescheduling.
3. **Touch targets are too small almost everywhere on phone/iPad** — the A–Z rail, icon buttons (WhatsApp, edit, alerts), status pills, prev/next chevrons, mini‑calendar dates and to‑do controls all fall below the 44×44 px minimum. This is the difference between "works on a phone" and "delightful on a phone".
4. **The Settings save model is inconsistent and unguarded** — explicit "Save changes" on one tab, silent autosave on another, autosave‑with‑notice on a third, with no field validation and no "unsaved changes" warning when navigating away.
5. **A cluster of control issues erodes trust** — the A–Z filter left a wrong "X dogs registered" count (**now fixed**), the Inbox filter row overflows and clips, and Reports shows tiny 10 px chart labels and +628% deltas off a near‑zero baseline. _(Two items originally listed here — the Dogs "Name" sort and a directory default-sort mismatch — were investigated and found NOT to be bugs; see §4d.)_

The encouraging part: a large share of the Major findings are **quick wins** (token bumps, `aria-label`/`htmlFor` additions, min‑size utility classes). A focused week or two clears most of the list.

---

## 2. Per‑area × device scorecard

Scores are 1–10. Desktop = ≥1280 px; iPad = 768–1279 px; iPhone = <768 px.

| Area | Desktop | iPad | iPhone | One‑line rationale |
|---|:---:|:---:|:---:|---|
| Bookings / daily schedule | 8 | 5 | 6 | Clean, information‑rich grid; capacity bar hides on phone, empty rows fade on hover (no touch), small tap targets. |
| Appointment detail modal | 7 | 6 | 5 | Well‑structured; faint pipeline steps, "Total Due" on completed bookings, subtle save state, fixed 480 px width overflows small phones. |
| Overview slide‑out | 7 | 6 | 6 | Useful; drawer width can overflow tablet landscape, focus not restored on close, duplicates left‑rail data on desktop. |
| New Booking modal | 8 | 6 | 6 | Fast type‑ahead, strong flow; calendar signals open/closed by colour alone, several unlabeled inputs. |
| Dogs directory | 7 | 6 | 5 | Filters + alert chips good; "Name" sort no‑op, filtered count label wrong, list view breaks with an alert chip, tiny tap targets. |
| Humans directory | 7 | 6 | 5 | Consistent with Dogs but inconsistent defaults; 12 px WhatsApp icon, filter pills don't announce state. |
| Reports | 8 | 5 | 4 | Excellent analytics on desktop; 10 px chart labels, trend badges vanish on mobile, charts clip, misleading deltas. |
| Settings (9 tabs) | 7 | 4 | 4 | Clear content; pricing/hours grids overflow on tablet/phone, inconsistent save, no validation, no unsaved‑changes guard. |
| Inbox / side panels | 8 | 5 | 3 | Outstanding desktop inbox; right‑rail panels unreachable below `md`, filter row overflows, AI summary clips on mobile. |
| **Navigation (cross‑cutting)** | 8 | **2** | 6 | Full nav ≥1280 and bottom‑tab <768 are both good; the 768–1279 band has **no section nav at all**. |

**Blended: Desktop ≈ 7.6 · iPad ≈ 5.0 · iPhone ≈ 5.0.**

---

## 3. What's already excellent (keep it)

So the roadmap reads in context — these are real strengths, not faint praise:

- **Reports.** KPI tiles with deltas + low‑N suppression, a "this week so far" banner, daily‑revenue and demand‑pattern charts, and genuinely useful, on‑brand auto‑insights ("Thu is quietest — a good candidate for promotions"). Custom‑built, no chart library.
- **WhatsApp Inbox.** Three‑pane thread with a **24‑hour‑window countdown**, **AI reply off by default** with clear opt‑in copy, private conversation notes, and a customer‑context panel (dog, grooming notes, Book‑appointment CTA). This is a differentiator.
- **Capacity Engine.** The 2‑2‑1 rule is explained in plain English *with a worked example* — exactly right for a non‑technical owner.
- **Booking flow.** `N` opens New Booking with search auto‑focused; type‑ahead matches name/breed/owner; multi‑dog, recurring and capacity‑override confirmation are all handled.
- **Foundations.** `prefers-reduced-motion` respected, `env(safe-area-inset-*)` handled, react‑aria focus trapping in modals, a real design‑token system in [src/index.css](src/index.css), inline alert chips that surface dog safety flags.

---

## 4. Annotated findings (by category)

Grouped Critical → Major; representative Minor/Polish summarised by theme. Devices in brackets. Full line‑level evidence for all 159 is in the digest file.

### 4a. Accessibility

**Critical**
- **Placeholder text invisible.** `slate-400` placeholder on white inputs fails AA badly. *Fix: use `slate-500`+ for placeholders.* [All] — quick win.
- **Disabled‑button text unreadable.** `slate-400` on `slate-200` is ~1:1. *Fix: darker disabled text or a clearer disabled treatment.* [All] — quick win.

**Major (selected)**
- **Status pipeline / inline picker don't announce state** to screen readers, and the inline status picker (`role="listbox"`) lacks arrow‑key navigation. `BookingCardNew.jsx`, `booking-detail/BookingStatusBar.jsx`. [All]
- **No keyboard alternative to drag‑and‑drop** rescheduling of booking cards. `src/components/booking/SlotGrid.jsx`. [All]
- **Unlabeled inputs** (no `htmlFor`/`id` or `aria-label`): Dogs/Humans/New‑Booking search, service & recurring selects, "remove dog", Settings closure‑label input. [All] — mostly quick wins.
- **Error regions lack `aria-live`** so validation/info updates are silent. New Booking, several modals. [All]
- **Non‑semantic "buttons"**: Settings "Delete service", large‑dog slot pills, upcoming‑closure pills, notification badges aren't keyboard‑operable. `views/settings/*`. [All]
- **`AlertChip` truncation drops safety info** ("Reactive to dogs +3") with no screen‑reader fallback — a welfare risk, not just a11y. `Dogs directory`. [All]
- **Empty slot rows fade to `opacity-70`** by default and only reach full contrast on hover — invisible logic on touch. `SlotGrid.jsx:220`. [All]
- **Reports chart labels are 10 px** (`--text-micro`) — below legible size. `views/reports/*`. [All]
- **Focus not restored** when the Overview drawer closes. `dashboard/OverviewDrawer.jsx`. [All]

### 4b. Tap targets (touch) — almost all Major, almost all quick wins
Below 44×44 px and called out individually in the digest: **A–Z jump‑bar letters; header icon buttons; status‑stepper pills; mini‑calendar dates; prev/next day chevrons (`w-9 h-9`); to‑do move/delete (down to 5×5); WhatsApp icon (12 px on desktop, undersized on mobile); inline action icons (`w-5 h-5`/`w-6 h-6`); to‑do checkboxes.** *Fix pattern: a shared `min-h-11 min-w-11` (44 px) touch‑target utility on interactive controls, padding the hit area without growing the glyph.* [iPad/iPhone]

### 4c. Layout & responsive

**Critical**
- **No primary navigation in 768–1279 px** (covers iPad portrait **and** landscape). Top nav is `hidden xl:flex`; bottom‑tab nav is `md:hidden`; nothing bridges the gap. `src/components/layout/AppToolbar.jsx`. *Live proof at 1054 px: only Overview / New booking / Settings / Account in the DOM.* [iPad]
- **Right‑rail panels unreachable below `md`** — Inbox summary, reminders, waitlist, tasks have no mobile home. `dashboard/RightWorkflowSidebar.jsx`, `UtilityTabs.jsx`. [iPhone]

**Major (selected)**
- **Breakpoint cliff at 1024–1279** loses the three‑column sticky layout. `dashboard/DashboardShell.jsx`. [iPad]
- **Settings omitted from the mobile/tablet bottom tab bar.** [iPad/iPhone] — quick win.
- **Pricing table and Hours grid use fixed column widths** (`90px`) and overflow on tablet/phone. `views/settings/PricingSettings.jsx`, `HoursSettings.jsx`. [iPad/iPhone]
- **Appointment modal fixed at 480 px** overflows small phones. `modals/BookingDetailModal.jsx`. [iPhone]
- **Overview drawer `max-w-sm`** can overflow small landscapes. [iPad/iPhone]
- **Inbox filter row (10 chips) overflows and clips** with no scroll affordance. `views/inbox/InboxView.jsx`. [All]
- **Reports charts clip on mobile** — fixed 90 px heights, `w-7` Y‑axis, colliding day labels. [iPad/iPhone]

### 4d. Functionality

**Major (selected)**
- ~~**Dogs "Name" sort is a no‑op**~~ — **VERIFIED NOT A BUG (2026-06-19).** Traced `DogsView.jsx` → `useDogs.ts` (refetch effect deps include `dirSort`) → `search_dogs_directory` RPC (orders by `lower(name)` when `sort:'name'`). The live "no reorder" was a screenshot taken ~1s after the toggle, before the async refetch returned. No code change.
- ~~Inconsistent directory default sorts~~ — **VERIFIED NOT A BUG.** Dogs default `dirSort` is `"name"` (alphabetical) unless `localStorage.dogsDirSort==='recent'`; Humans default is first-name. Both alphabetical by default — the live mismatch was this reviewer's stale `localStorage`.
- **A–Z filter left a wrong count** — `narrowed` omitted `activeLetter`, so a letter-only view read "X dogs registered" instead of "X matching dogs". **FIXED** in `DogsView.jsx` + `HumansView.jsx` with regression tests. [All]
- **Inconsistent Settings save model** — explicit Save (Business) vs silent autosave (Capacity) vs autosave‑with‑notice (Pricing); **no field validation**, **no unsaved‑changes warning** on navigate‑away. `views/settings/*`. [All]
- **Silent delete** — the appointment modal closes before the delete completes, with no confirmation feedback. `booking-detail/BookingActions.jsx`. [All]
- **Subtle autosave indicator** in the appointment modal; easy to miss whether an edit saved. [All]
- **Archived‑humans / archived‑dogs lists show "Loading…" with no timeout or error state.** [All]
- **Edit mode can persist** across modal re‑open if the component is cached. [All]
- **Delivery‑failures card lacks a CTA** to act on the failure. `dashboard/DeliveryFailuresCard.jsx`. [All]

### 4e. Visual & microcopy

**Major (selected)**
- **Status‑pill and size‑dot contrast** — inactive pipeline steps and Checked‑in/In‑bath/Ready labels are faint on pale tints; white text on medium/large size dots is insufficient; past‑date pills (`slate-500` on `slate-200`, 3.86:1) fail AA for body text. `constants/salon.ts`, `ui/SizeDot.jsx`, `layout/DayTab.jsx:18`. [All]
- **Destructive‑action order** — Cancel and Delete sit ambiguously together; Delete should be clearly separated/last. [All]
- **"Total Due £42" persists on completed bookings** with no "Paid" status surfaced. `booking-detail/PaymentsPickupCard.jsx`. [All]
- **US spelling "Trying again"** in error copy (brand is UK English). [All] — quick win.
- **Generic "Loading…/Searching…"** copy that doesn't say what's loading; inconsistent across modals. [All]
- **Missing empty state for filtered‑out searches** in Dogs/Humans (no "no results / clear filters"). [All] — quick win.

**Minor/Polish themes (85 findings):** microcopy consistency (loading/empty/error states, contextual error titles), redundant data (left rail vs Overview drawer; capacity % shown twice), calendar colour semantics without a full legend, skeleton heights not matching cards, focus‑visible states on calm‑tone CTAs, brand‑yellow text on white, the "Search rolodex…" placeholder, inconsistent directory default sorts, and the absence of dark mode (a deliberate decision to confirm, not necessarily a defect).

---

## 5. The path to 10/10 (P0 / P1 / P2)

### P0 — must fix (blocks "run the day from any device" / accessibility floor)
1. **Bridge the 768–1279 navigation gap.** Problem: iPad has no section nav. Change: render the primary nav (or a compact menu/bottom‑tab) for `< xl` as well, **and** add Settings to the mobile bottom tab. Impact: makes iPad usable at all — the biggest single jump. *Larger structural item.* `AppToolbar.jsx`, `DashboardShell.jsx`.
2. **Surface the right‑rail panels on mobile.** Problem: Inbox/Reminders/Waitlist/Tasks vanish below `md`. Change: route them into the mobile layout (a tab or a reachable section). `RightWorkflowSidebar.jsx`/`UtilityTabs.jsx`.
3. **Fix the two Critical contrast failures** (placeholder `slate-400`→`slate-500`+, disabled text) — token‑level, an hour's work.

### P1 — high impact (the bulk of the climb)
4. **Touch‑target sweep.** Add a 44 px min hit‑area utility and apply it to every control listed in §4b. Quick, mechanical, large payoff on iPad/iPhone.
5. **Accessibility labelling sweep.** Add `htmlFor`/`id` or `aria-label` to all inputs/selects/icon buttons; `aria-live` on error regions; make the non‑semantic "buttons" real buttons; arrow‑key support + state announcement for the status picker/stepper; a keyboard path for rescheduling.
6. **Status/size colour contrast.** Darken the faint status‑step labels and size‑dot text to meet AA; pair the size dot's colour with its already‑present letter at a legible size.
7. **Unify the Settings save model.** Pick one pattern (recommend autosave‑with‑clear‑status everywhere, or explicit‑save everywhere), add field validation, and warn on navigate‑away with unsaved edits.
8. **Fix the directory + control bugs.** Make Dogs "Name" sort actually reorder; correct the post‑filter count label and add a "show all" reset; align the two directories' default sort.
9. **Reports & Inbox on mobile.** Bump chart label sizes off `--text-micro`, keep trend badges on mobile, make chart heights/axes responsive, suppress/cap deltas when the prior period is near‑zero; make the Inbox filter row scroll/wrap.
10. **Modal/grid responsiveness.** Make the appointment modal fluid (not fixed 480 px), and the Pricing/Hours grids reflow on tablet/phone.
11. **Destructive‑action safety.** Separate Delete from Cancel and add post‑delete feedback; surface payment status (and stop showing "Total Due" once paid/completed).
12. **AlertChip safety fallback.** Never truncate a dog's safety alert without a screen‑reader‑readable full value (and ideally a tap‑to‑expand).

### P2 — polish (the last mile to "delightful")
13. Microcopy pass: consistent, contextual loading/empty/error states; UK spelling; "what's loading" specificity; explain active filters in empty states; rename "Search rolodex…".
14. Calendar colour legend + a non‑colour cue for open/closed days (also helps the New Booking calendar).
15. Remove redundant data (left rail vs Overview drawer; doubled capacity %), match skeleton heights, add focus‑visible to calm‑tone CTAs, replace brand‑yellow‑on‑white text.
16. Decide on dark mode — either commit to it or note it as out of scope.

---

## 6. Quick wins (shippable in ~a day)

Almost all are token/attribute/class changes (≈40 of the Major findings are tagged quick‑win in the digest):

- Contrast tokens: placeholder, disabled text, past‑date pills, size‑dot text. *(hours)*
- Add Settings to the mobile bottom tab bar; swap Cancel/Delete order. *(small)*
- `aria-label`/`htmlFor` on the worst‑offending inputs and icon buttons; `aria-live` on error divs. *(small, repetitive)*
- A 44 px touch‑target utility applied to the A–Z rail, chevrons, WhatsApp/edit/alert icons, status pills. *(small)*
- "No results / clear filters" empty state for filtered Dogs/Humans; fix "Trying again" → "Trying again" (UK), and the post‑filter count label. *(small)*
- Make the Inbox filter row horizontally scrollable; hide zero‑count filters. *(small)*

**Larger, structural (plan as projects, not a day):** the 768–1279 navigation architecture; surfacing the workflow rail on mobile; unifying the save model + validation + dirty‑state guard; making Reports charts responsive; a keyboard rescheduling path; the mobile collapse of the three‑pane Inbox.

---

## 7. Appendix
- Full per‑finding list with file:line evidence and adversarial verdicts: [docs/ux-review-assets/_code-findings-digest.md](docs/ux-review-assets/_code-findings-digest.md)
- Live walkthrough notes: [docs/ux-review-assets/_live-notes.md](docs/ux-review-assets/_live-notes.md)
- Counts by area (C/Major/Minor/Polish): Contrast 2/2/2/0 · Side panels 1/3/3/0 · A11y semantics 0/5/3/3 · Appointment modal 0/11/4/0 · Bookings 0/4/5/1 · Dogs 0/5/9/3 · Humans 0/6/10/0 · Microcopy 0/4/11/1 · New Booking 0/5/4/1 · Overview 0/3/5/1 · Reports 0/4/7/0 · Responsive 0/2/2/0 · Settings 0/9/5/1 · Tap targets 0/8/4/0.
