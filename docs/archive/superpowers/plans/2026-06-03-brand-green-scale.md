# Brand-green scale & success-colour swap — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reserve green for "success / confirmed / done" by introducing an accessible brand-green scale anchored on `#00D94A` and swapping genuine success/confirmed emeralds to it — leaving the dashboard tone layer and other functional emeralds untouched.

**Architecture:** Add a numbered `--color-brand-green-50…900` scale to the existing Tailwind v4 `@theme` block in `src/index.css` (the single `--color-brand-green` token stays; `500` equals it). Then do a 1:1 step-for-step class swap (`emerald-N` → `brand-green-N`) at a tight, vetted set of success/confirmed sites. Colour changes are mechanical + visually verified; the one logic guard is a Badge component test.

**Tech Stack:** React 19, Tailwind CSS v4 (`@theme` design tokens), Vitest + Testing Library.

---

## Scale (validated for WCAG AA)

| Step | Hex | Step | Hex |
|------|-----|------|-----|
| 50  | `#ECFDF3` | 500 | `#00D94A` (brand anchor) |
| 100 | `#CFF8DE` | 600 | `#009A39` |
| 200 | `#A3EFC1` | 700 | `#0A7D30` |
| 300 | `#5FE293` | 800 | `#0B5C26` |
| 400 | `#1ECF64` | 900 | `#08401C` |

Contrast: soft chip (text-800 on bg-100) 7.05:1; outline (text-700 on white) 5.26:1; solid bold (white on bg-600) 3.70:1 — at or above the emerald it replaces.

## Swap list (16 sites / 9 files) — "success / confirmed / done" only

Rule: `emerald-N` → `brand-green-N`, same numeric step. Any emerald shadow `rgba(16,185,129,a)` → `rgba(0,217,74,a)`.

| File:line | What it is |
|-----------|-----------|
| `src/components/ui/Badge.jsx:14,22,30` | shared `success` tone (soft/solid/outline) — **keystone** |
| `src/components/views/inbox/thread/BookingCreatedCard.jsx:41,49` | "booking created/applied" card |
| `src/components/dashboard/TomorrowRemindersCard.jsx:56,65,69` | reminder "sent" row + "sent"/"confirmed" check icons |
| `src/components/views/inbox/thread/MarkCompleteButton.jsx:75` | "Mark complete" affordance |
| `src/components/dashboard/BookingHistoryCard.jsx:85,86` | "Booked/created" event dot + pill |
| `src/components/modals/booking-detail/BookingHeader.jsx:57,72` | "Paid" / deposit-paid badge |
| `src/components/modals/BookingDetailModal.jsx:845` | "Customer confirmed via WhatsApp" banner |
| `src/components/modals/NewBookingModal.jsx:412` | booking-created info banner |
| `src/components/modals/send-reminder/SendReminderModal.jsx:223` | "reminder sent" info panel |

## Explicitly LEFT as emerald (do NOT touch)

- **Dashboard tone layer (22):** `RightRailCard.jsx`, `RightRailCalmRow.jsx`, `RightRailPreview.jsx`, `WhatsAppInboxCard.jsx` accent, `PanelShell.jsx`, `TomorrowRemindersCard` tone accent. Deliberate calm/active/attention system.
- **Functional, not success (58):** filter chips, toggles, risk pill, capacity/utilisation bands, today/active indicators, channel labels, selection states (`InboxFilterChip`, `DayTab`, `MiniCalendarCard`, `RiskPill`, `ConversationGateToggle`, `utilisation.ts`, etc.).
- **WhatsApp channel green (7):** `WhatsAppComposer.jsx` (template preview + Send-WhatsApp button), `BookingDetailModal.jsx:518` thread link. This is channel branding, not success — candidate for the `brand-whatsapp` token in a separate pass, **not** brand-green.
- **Metric bands (3):** `WeeklyRevenueCard.jsx:14`, `ReportWidgets.jsx:16`, `UiKitchenSink.jsx:90` — left for consistency with the `utilisation.ts` colour bands, which stay emerald.
- **Booking proposal** (`BookingActionPanel.jsx`) — recoloured to brand yellow/purple/coral in the inbox plan, not here.

---

## Task 1: Add the brand-green scale tokens

**Files:**
- Modify: `src/index.css` (the `@theme` block, near the existing `--color-brand-green: #00D94A;` at line ~84)

- [ ] **Step 1: Add the numbered scale** beside the existing single token. Keep `--color-brand-green` as-is.

```css
  --color-brand-green: #00D94A;
  /* Numbered success scale (green == confirmed/done). 500 == --color-brand-green. */
  --color-brand-green-50: #ECFDF3;
  --color-brand-green-100: #CFF8DE;
  --color-brand-green-200: #A3EFC1;
  --color-brand-green-300: #5FE293;
  --color-brand-green-400: #1ECF64;
  --color-brand-green-500: #00D94A;
  --color-brand-green-600: #009A39;
  --color-brand-green-700: #0A7D30;
  --color-brand-green-800: #0B5C26;
  --color-brand-green-900: #08401C;
```

- [ ] **Step 2: Verify the build picks up the tokens.** Run: `npm run build` — Expected: completes with no "unknown utility" errors. (Tailwind v4 generates `bg-brand-green-100` etc. from these.)

- [ ] **Step 3: Commit.**

```bash
git add src/index.css
git commit -m "Add accessible brand-green scale (success/confirmed colour)"
```

## Task 2: Swap the Badge `success` tone (keystone) — TDD

**Files:**
- Modify: `src/components/ui/Badge.jsx:14,22,30`
- Test: `src/components/ui/Badge.component.test.jsx`

- [ ] **Step 1: Write the failing test.**

```jsx
import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Badge } from "./Badge";

describe("Badge success tone uses brand-green, not emerald", () => {
  it.each(["soft", "solid", "outline"])("%s variant", (variant) => {
    const { container } = render(<Badge tone="success" variant={variant}>OK</Badge>);
    const cls = container.firstChild.className;
    expect(cls).not.toMatch(/emerald/);
    expect(cls).toMatch(/brand-green/);
  });
});
```

- [ ] **Step 2: Run — expect FAIL.** Run: `npx vitest run --project=component src/components/ui/Badge.component.test.jsx` — Expected: FAIL (classes still contain `emerald`).

- [ ] **Step 3: Swap the three success rows.**

```jsx
//   soft.success:
    success: "bg-brand-green-100 text-brand-green-800 border-brand-green-200",
//   solid.success:
    success: "bg-brand-green-600 text-white border-transparent",
//   outline.success:
    success: "bg-white text-brand-green-700 border-brand-green-300",
```

- [ ] **Step 4: Run — expect PASS.** Same command. Expected: PASS (3 cases).

- [ ] **Step 5: Commit.**

```bash
git add src/components/ui/Badge.jsx src/components/ui/Badge.component.test.jsx
git commit -m "Swap Badge success tone from emerald to brand-green"
```

## Task 3: Swap the remaining success/confirmed sites

For each file in the swap list (excluding Badge, done in Task 2), replace each `emerald-N` with `brand-green-N` (same number) at the listed lines only. Leave every other emerald in the file alone.

- [ ] **Step 1:** Edit each file/line per the swap table above. Example (`BookingHeader.jsx:57`): `text-emerald-700 bg-emerald-50 border-emerald-200` → `text-brand-green-700 bg-brand-green-50 border-brand-green-200`.
- [ ] **Step 2: Guard against stragglers** in the swapped files: confirm the only emerald removed are the listed lines. Run: `git diff --unified=0 | grep -i emerald` — Expected: only *removed* (`-`) lines, none added, and none from "leave" files.
- [ ] **Step 3: Typecheck + lint.** Run: `npx tsc --noEmit && npx eslint <changed files>` — Expected: clean.
- [ ] **Step 4: Commit.**

```bash
git commit -am "Swap confirmed/paid/sent indicators to brand-green"
```

## Task 4: Visual verification

- [ ] **Step 1:** Run the app (`npm run dev`) and check: a success Badge, a "Booked" history dot, the "Paid" badge, and the "Customer confirmed" banner all read as the brand green; dashboard right-rail tone cards and filter chips are unchanged (still emerald).
- [ ] **Step 2:** Confirm no emerald remains where green should mean success: `grep -rn "emerald" src` shows only tone-layer/functional/channel/metric sites from the "leave" list.

---

## Self-review notes
- Spec coverage: delivers "green == confirmed" via the keystone Badge swap + 8 semantic sites; leaves the tone layer per the agreed boundary.
- The 1:1 step mapping is safe because the scale was contrast-tuned to match emerald's steps.
- Overlap with the inbox plan: `BookingCreatedCard` and `MarkCompleteButton` live in the inbox tree but are simple indicator swaps here; the inbox plan restructures layout, not these indicators.
