# Approved UX Improvements Roadmap

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement these plans task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the UX directions approved after the 14 July 2026 application audit without broadening the scope into a redesign.

**Architecture:** The approved work crosses independent staff workflows, so it is split into five plans. Each plan produces working, testable software and can be reviewed or released independently; the order below starts with the smallest operational correction and leaves the shared modal primitive until last.

**Tech Stack:** React 19, React Router 7, React Aria 3, Tailwind CSS 4, Vitest, Testing Library, Playwright.

## Global Constraints

- Use UK English in interface copy.
- Preserve the current Smarter Dog visual system, tokens, controls, and route shell.
- Do not change the Bookings schedule density; decision 2 was “none”.
- Do not remove the Humans size legend in this tranche; that change was not explicitly approved.
- Do not change New Booking’s quiet initial search state; option 7B is already implemented and needs regression coverage only.
- Keep production data, migrations, legal wording, supplier settings, and identifiable customer-record inspection out of scope.
- Verify desktop, tablet, and mobile layouts before completion.

---

## Plans and execution order

1. [Today KPI accuracy](./2026-07-14-today-kpi-accuracy.md) — small, operationally important.
2. [Optional-dog Add client flow](./2026-07-14-add-client-optional-dog.md) — medium, primary creation workflow.
3. [Directory actions and grouped mobile settings](./2026-07-14-directory-settings-clarity.md) — medium, two independent interface clean-ups in one navigation tranche.
4. [Reports routes and concise insights](./2026-07-14-reports-information-architecture.md) — large, route and page restructuring.
5. [React Aria modal isolation](./2026-07-14-modal-isolation.md) — medium, shared infrastructure with broad regression risk.

## Approved decision mapping

| Decision | Approved direction | Plan |
|---|---|---|
| 1 | Show actual on-site dogs and booked dogs together | Today KPI accuracy |
| 2 | No schedule-density change | Explicitly excluded |
| 3 | One Add client flow; dog and booking information optional | Add client optional dog |
| 4 | Directory cards become articles with explicit profile and contact actions | Directory and settings clarity |
| 5 | Separate Cash-up and Insights routes; concise overview with expandable detail | Reports information architecture |
| 6 | Group Settings sections on mobile; retain desktop tabs | Directory and settings clarity |
| 7 | Results only after typing | Already present; regression assertion in Add client plan |
| 8 | React Aria modal isolation | Modal isolation |

## Release gates

- [ ] Run every targeted test command listed in the five plans.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run lint`.
- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Inspect Today, Add client, Humans, Dogs, Reports, Settings, New Booking, and representative stacked modals at 1440×900, 768×1024, and 390×844.
- [ ] Confirm no application code outside the named plans changed.
