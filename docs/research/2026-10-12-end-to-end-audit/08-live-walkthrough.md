# 08 — Live walkthrough (desktop / phone / tablet)

Smarter Dog Bookings, production build of commit at 2026-10-12 07:48 (+01:00), built with `VITE_FORCE_OFFLINE=1` (sample data) and the E2E env (`VITE_E2E_BOOKING_POLICY_RPC=1`, `VITE_E2E_WHATSAPP_UNREAD=12`, `VITE_E2E_PENDING_SIGNUPS=7`). Served with `vite preview` on `127.0.0.1:4173`, driven by Playwright (Chromium at `/opt/pw-browsers/chromium`), clock frozen at **Mon 12 Oct 2026 09:15 Europe/London** so the Today stack shows the rich Monday fixture and elapsed-time lines are deterministic.

All artefacts live under `scratchpad/walkthrough/`: `harness.mjs`, `journeys.mjs` (8 journeys), `calendar2.mjs` (supplementary calendar journey, see Method), `results-{desktop,phone,tablet}.json`, `results-calendar2-{desktop,phone,tablet}.json`, `run-*.out` logs, and ~470 screenshots under `shots/<viewport>/<journey>/NN-step.png`. Paths below are relative to `scratchpad/walkthrough/shots/`.

## 1. Method

- Three viewports: **desktop 1440×900** (mouse), **phone 390×844** (touch, DPR 2), **tablet 820×1180** (touch, DPR 2). Locale en-GB.
- Each journey runs in a fresh browser context (no storage carried over), records console errors/warnings, page errors, failed requests and all responses (count + bytes), takes a screenshot after every step, and runs a lightweight accessibility audit (axe is not in the repo): unnamed buttons/links, images without alt, unlabelled form fields, interactive targets smaller than 36px, heading outline, landmarks, `lang`, and focusable elements left inside `aria-hidden` subtrees.
- "Taps" = user-initiated clicks/keypresses the harness performed, counted per step; typing is not counted.
- **Important correction to the earlier desktop run.** The first visit to `/staff` in a tab session is redirected to `/staff/today` by a `sessionStorage` flag (`sd-today-landed`, `src/App.jsx` ~L310). The original "calendar" journey's first step was `goto('/staff')`, so every step of that journey — on all three viewports — actually ran against the **Today stack**, and its slot-menu / booking-detail / move / cancel / day-settings steps silently found nothing (`clicked:false`). I wrote `calendar2.mjs`, which visits `/staff` twice (or clicks the Bookings nav link) and re-ran the calendar proper on all three viewports. Findings below use `calendar2` for calendar evidence; the old `calendar` journey is still useful for the New-booking drawer, multi-dog and Needs-attention/workspace steps, which do not depend on the view.
- Two harness artefacts to ignore in the logs: `today/14 nala-didnt-show` (Playwright strict-mode: two "Didn't show" buttons exist in the DOM) and `today/18 luna-booking-details` (locator matched Bella's collapsed-card button first). Also, `page.goto` to the URL already open is treated by Chromium as a reload, so the "back → about:blank" results in `today/19` and `today/30` are not app behaviour.

## 2. What could not be reached

- **The customer portal beyond `/book/login`.** In offline/sample mode the phone-OTP step calls Supabase; pressing Continue shows the inline error **"Not connected."** (`desktop/customer/03-continue.png`). There is no sample-data sign-in path, and the e2e specs confirm it: `e2e/smoke.spec.ts` only asserts that `/book`, `/customer` and `/stafflogin` land on the right screens; `e2e/booking-modal-continuity.spec.ts` exercises the customer booking shell only through the **staff dev preview** `/staff/dev/booking-wizard-shell-preview`. So the dashboard, dog/contact management, the real wizard and signup-approval screens were not walked. The dev preview (`desktop/customer/11-wizard-preview.png`) renders the confirmation step with fixture data (dated "Monday 15 June 2099") and was used only to look at the shell.
- **Staff sign-in screen.** Offline mode has no auth gate, so `/stafflogin` lands on the calendar, not the sign-in page; login UX, "Forgot password", Turnstile on staff login were not seen.
- **Anything server-owned**: Needs Attention ("Needs a live connection to check previous days"), Humans "Awaiting approval", Settings → Booking Rules / Customer Portal (show "E2E booking-policy RPC failed." because this build asked for the E2E stub endpoint `/__e2e/booking-policy-rpc`, which `vite preview` 404s — a build-config artefact, not a product bug), Calendar Sync feed URL, WhatsApp sends, booking persistence (every write ends in the toast "Demo data — changes won't save").
- `/staff/booking-workspace` renders an **empty `<main>`** (innerHTML 78 bytes) on all viewports (`desktop/calendar/30-booking-workspace.png`). The route is gated by `FEATURE_FLAGS.booking_workspace_enabled && (isOwner || (DEV && !isOnline))` (`src/App.jsx` L240) and the else-branch is `<Navigate to="/today">`, yet the URL stays on `/staff/booking-workspace` and nothing renders. I did not read further to explain the blank page; it is reachable by URL in a production bundle and shows nothing, which is worth a look.

## 3. First-load experience

(`first-load` journey; identical numbers on all three viewports.)

- **Page title is `SmarterDog — Salon Bookings` on every route**, including `/book/login` and `/reset-password` (`first-load/09-titles-per-route`). Browser history, tab strip and screen readers cannot tell Today, Inbox, a dog profile and the customer login apart. Confirmed.
- **Loading sequence (desktop):** blank at 0 ms → "Loading…" text at 150 ms → full shell with the demo banner, nav and Today header at 400 ms. The Today view itself is a lazy chunk (`TodayView-*.js`, 115 KB) so the first paint is the shell, then content.
- **Request budget:** 50 requests, **896 KB** transferred on a cold load of `/staff/today` (scripts 35 / 577 KB; CSS 3 / 216 KB; fonts 5 / 81 KB; images 2 / 15 KB). Largest: `react-vendor` 217 KB, `index.css` **215 KB**, `TodayView` 115 KB, `App` 104 KB, `router` 38 KB, `NetworkOfflineBanner` 35 KB. A single 215 KB stylesheet for every route is the most obvious weight.
- **Reload:** 49 requests / 895 KB again; the harness counted 0 resources with `transferSize === 0`, i.e. nothing came from the service worker or HTTP cache in this headless preview. The SW was registered and `activated` (scope `/staff/`), so this may be a preview-server/headless artefact; verify in production DevTools before treating it as a bug.
- **PWA:** manifest `/app/manifest.json` (name "SmarterDog — Salon Bookings", `start_url` and `scope` `/staff/`, `display: standalone`, 4 icons, theme `#F7EFE6`), `apple-touch-icon` and `apple-mobile-web-app-capable=yes` present, viewport `viewport-fit=cover, interactive-widget=resizes-content`, `lang="en"`.
- **Offline/sample banner:** a full-width yellow "Demo data — changes won't save. The salon's database isn't connected." bar sits above the header on every staff page (phone: two lines, ~125 px). On phone the banner + header + nav strip occupy ~380 of 844 px before any content (`phone/today/02-read-stack.png`).
- **Console / network noise on every page:** `404 /__e2e/booking-policy-rpc` (build artefact), `404 /_vercel/insights/script.js` (the Vercel Analytics script is requested unconditionally, so any non-Vercel host logs an error), Cloudflare Turnstile `api.js` blocked by the sandbox on `/book`, and two "preloaded but not used" warnings for `poppins-700.woff2` and `montserrat-400.woff2` on the customer login. **No uncaught page errors on any viewport in any journey.**

## 4. Staff journeys

### 4.1 Landing / Today (`today`, 28 taps, ~42 s per viewport)

- `/staff/today` → H1 "Daily Brief", date header "Monday 12 October ▾", "Salon open", "Manage availability — No online slots today", summary chips `1 late · 1 waiting · £148 due · 3 arriving · 2 with us · 1 ready · £84 collected`, then a red banner "**2 bookings need their status fixed — it has no place on the board** Milo 10:00 Pepper 12:30", then 7 cards in appointment order: 08:30 Bella Arrived, 08:30 Max Expected (45 min late), 08:30 Nala Reconfirmed, 09:00 Luna Ready/Paid, 09:00 Charlie Arrived, 12:00 Rex Expected, 12:30 Pepper No-show (`desktop/today/02-read-stack.png`, `phone/today/02-read-stack.png`).
- Worked well: one-word status per card, elapsed line ("45 min late", "waiting 0 min"), safety note repeated inside the expanded card, owner phone as a tel link, "Open full invoice" mini-invoice (base price, deposit, add-ons, take-now, method) that closes on Escape and returns focus to the trigger (`today/21`, `today/22`).
- Friction: the banner wording "it has no place on the board" is internal jargon (the "board" is the retired salon board); staff just need "Milo is still Booked at 10:00 — mark him Arrived or No-show". Clicking Milo opens the detail modal with the five status pills (`desktop/today/23-milo-warning-link.png`) — fine, but the banner itself does not say that is the fix.
- Date picker: "Monday 12 October ▾" opens a month grid; on phone it is a full-screen sheet with a lone "Today" button at the bottom (`phone/today/28-date-picker.png`). Picking Tuesday → `/staff/today?date=2026-10-13`, 3 cards, chips "1 to confirm · 3 arriving". Good.
- "Manage availability" did not open anything the harness could see (`clicked:false`, `today/31`) — the button has an accessible name "Manage availability — No online slots today" but on the Today page the click produced no dialog. Unverified whether it is a link to the calendar; worth a manual check.
- a11y: H1 present, `main` + 2 `nav` landmarks, skip link works and visibly appears on focus (`resilience/15-skip-link`). Small targets on Today: phone-number links 90×18, "Change the price for Bella" 29×44, "Dismiss notification" 9×16.

### 4.2 Card actions (Max: Expected → Collected)

Taps from a collapsed card to money in the till: expand (1) → **Arrived** (1) → **Mark ready** (1) → "Max is ready — message their humans?" **Not now** (1) → **Check out** (1) → **Cash £42** (1) → **Collected · £42 cash** (1) = **7 taps**; each step raised an Undo toast and Undo really reverted ("Max moved back to arriving"). The collected summary at the bottom updated to "£84 · 3 dogs" and expands to per-dog lines (`today/12-collected-summary-open`).

- Bug (phone, High): **toasts stack over the primary action.** After three quick status changes, three green toasts sit in the middle of the card and cover "Check out" and "Call Dave" (`phone/today/08-max-ready-not-now.png`, `phone/today/12-collected-summary-open.png`). On desktop they stack bottom-right and only cover Pepper's card (`desktop/today/14-nala-didnt-show.png`). One toast with the latest message, or a top-anchored, auto-collapsing stack, would fix it.
- The expanded action row on phone wraps to three lines with "Didn't show" orphaned on its own (`phone/today/03-expand-max-expected.png`); on tablet all five fit on one line.
- The "Ready" prompt ("Would you like to message their humans…? Send message / Not now") is a nice moment; "Not now" is the safe default.

### 4.3 Week / day calendar (`calendar2`, 23–25 taps)

- Desktop `/staff?date=…` (`desktop/discover/02-_staff.png`): day header with ‹ › and Today, left rail (mini month, Capacity 71% today / 31% this week, Next available), centre day grid (one row per slot, two seat columns, status pill per card, "+ Book" ghost seats, "Closed" seat), right rail ("Inbox clear", "No bookings tomorrow", "Waitlist empty", "Recent booking activity"). Phone/tablet replace the mini month with a **week strip of day tabs** (Mon 12 · 10, Tue 13 · 3, Wed 14 —, Thu–Sun closed) plus a month-view button (`tablet/calendar2/02-second-staff-visit.png`, `phone/calendar2/02-second-staff-visit.png`); on phone the two seat columns stack into one column per slot. No horizontal scroll on any viewport.
- Slot box click → dark popover "8:30 — Override & book / Close from here…" (`desktop/calendar2/04-slot-menu.png`, `phone/calendar2/08-slot-menu.png`). Escape closes it.
- Status pill is a native `<select>` ("Change status, currently Arrived": Booked / Reconfirmed / Arrived / Ready / Completed) — keyboard-friendly, one tap to change.
- Day settings (drawer on desktop, full-screen on phone): Close this day (with "10 bookings would need rearranging"), Close part of the day, Add an extra slot, Print day sheet (`desktop/calendar2/24-day-settings.png`, `phone/calendar2/28-day-settings.png`). Clear.
- Message day: "Message the day's customers" broadcast with day field (shown as **10/12/2026**, i.e. US order, in an en-GB browser — the native date input renders in the browser locale, but it is worth checking what the real iPad shows) and a template preview; "Send to all" disabled until a reason is typed (`desktop/calendar2/27-message-day.png`). Good guard.
- Day navigation: ‹ › and Today and mini-month picks all update `?date=` **by replacing the history entry**: after Next → Today → pick 14 → pick 15, Back went straight to the page before the calendar (`calendar2/33`, and `calendar/32 next-week-prev-week` returned to `/staff/needs-attention`). Probably deliberate, but the browser back button never returns to the previous day.
- Wrong URLs under `/staff/*` (`/staff/not-a-route`, `/whatever`) render the calendar with the bogus path left in the address bar (`resilience/16-legacy-redirects`); no "not found" and no URL correction.
- a11y on the calendar: **no H1** (headings start at H2 "Capacity"); 61 small targets on desktop, mostly the mini-month day buttons (27×40) and card buttons "Open booking for Bella" 31×16 / 36×20 and "1 notes" 16×16 (`calendar2/03-a11y-calendar`). The booking cards are opened via a tiny name-sized button rather than the whole card.

### 4.4 New booking — count the taps (`calendar` 07–13, `calendar2` 06–10)

Existing customer, from the header **New booking** button (desktop drawer / phone full-screen sheet): New booking (1) → type "bel" → pick "Book Bella with Sarah Jones" (1) → service `<select>` defaults to Full Groom (0, optional 1) → date defaults to today (0) → scroll past the month grid → tap a time (1) → **Confirm Booking** (1) → "Send a booking confirmation?" dialog (Auto / WhatsApp / SMS / Email / Don't send) → **Confirm booking** (1) = **5 taps + typing**, 6 with a service change.

From a "+ Book" ghost seat on the calendar: seat (1) → type + pick dog (1) → Confirm (1) → channel dialog Confirm (1) = **4 taps**, because the slot is pre-filled ("New booking 9:30am · Mon, 12 Oct").

Observations:
- **Confirm Booking is disabled with no explanation until a time is picked**, and the time grid sits below a full month calendar, below the fold on phone and desktop alike (`desktop/calendar/12-after-confirm-state.png`, `phone/calendar/12-after-confirm-state.png`). The harness pressed Confirm with a dog + service chosen and got `wasDisabled:true` and no message. A "Pick a time" hint next to the button, or auto-selecting the next free slot, would remove the dead end.
- **Over-capacity times are a one-tap override** inside the drawer: chips carry "8:30am — over capacity, click to override" and selecting one just turns it red with a small "over" caption; Confirm proceeds to the channel dialog with no extra warning (`phone/calendar2/12-book-from-slot-choose-time.png`, `desktop/calendar2/09-book-from-slot-confirm.png`). The slot popover's explicit "Override & book" is the better pattern; the drawer should at least say "This overbooks 8:30".
- Picking a large dog from an empty "+ Book" seat whose partner seat is "Closed" immediately flags that slot "over" (Rex at 9:30) — correct per the engine, but the ghost seat invited the booking.
- The "Send a booking confirmation?" dialog is a good, explicit step (`desktop/calendar2/09`). "Auto — best method" is pre-selected.
- Search results are precise ("Book Bella with Sarah Jones (owner)", "… with Dave Smith (trusted)"), and the dog card shows size, breed, owner and the allergy alert.

### 4.5 Multi-dog (`calendar` 14–18)

"+ Add another dog" opens "Dave Smith's other dogs: Just this one dog for them / + New dog for Dave Smith / Cancel" (`desktop/calendar/16-multi-dog-pick-second.png`) — it only offers the *same owner's* dogs, there is no search box, so the harness could not add Luna (different owner) and the step timed out. That is probably intended (a group booking is one owner), but the label "+ Add another dog" does not say so, and when the owner has one dog the panel is a dead end ("Just this one dog for them").

### 4.6 Booking detail → move → cancel (`calendar2` 11–25)

- Detail modal (`desktop/today/23-milo-warning-link.png`, `phone/calendar2/15-open-bella-card.png`): header with status badge, price, photo / edit / close icon buttons, "Message" link, five status pills, Appointment details (time, owner, pick-up person, grooming notes), Trusted humans, Services & payment, Reminder, sticky footer **Reschedule / Cancel / Delete booking**. Phone: full-screen, footer stays visible. Bella's pick-up person shows **"H1"** — a raw sample-data id leaking through `resolveBookingDisplay` territory (`phone/calendar2/15`).
- Reschedule = "Move booking": month grid → "Times — Tuesday 13 October" 08:30…13:00 → **Confirm Move** → toast + card moves to Tuesday (`desktop/calendar2/15-reschedule-pick-time.png`, `phone/calendar2/19`). **5 taps** including opening the card. The copy "Fully-booked times can be overbooked" is honest.
- Cancel: "Cancel this booking? … Who requested the cancellation? Choose… / Cancellation reason / Keep booking / Yes, cancel it". Pressing "Yes, cancel it" without answering shows "Choose who requested it and give a reason." (`desktop/calendar2/20-detail-cancel-confirm.png`). Good validation, but the dialog stacks on the detail modal and the reason field has no visible box on phone (`phone/calendar2/24` — the label "Cancellation reason" floats over empty space).
- The detail modal on the calendar is **not URL-backed** (URL stays `/staff?date=…`), unlike human/dog profiles (`/staff/humans/h1`, `/staff/dogs/d7`) which survive refresh and close on Back (`directories/07`, `/08`). Refreshing with a booking modal open loses it (`resilience/02`, `/04`).
- a11y: while any modal is open, 59–97 focusable controls remain in the `aria-hidden` background (`calendar2/detail-a11y`, `day-settings-a11y`, `directories/dogs-dialog-a11y`), and keyboard Tab from the New-booking drawer's last control ("Cancel") walks out into the header, nav and calendar (`resilience/10-kb-tab-order`: "OUTSIDE! button:New client, Tools and settings, Account menu, Previous day…"). `aria-modal` is not set. Focus does return to the trigger on Escape, and the `N` shortcut opens the drawer with focus in the search box (`resilience/13`).

### 4.7 Needs attention

`/staff/needs-attention`: H1 "Needs Attention", one line "Needs a live connection to check previous days.", a lone refresh icon button (`desktop/calendar/29-needs-attention.png`). Nothing else could be assessed offline. The phone Menu lists it under "Needs Attention"; desktop hides it in the "Tools and settings" menu with Settings.

### 4.8 Booking workspace

Blank `<main>` on every viewport (see §2). It is linked only for owners (`navConfig ownerFeature`), but typing the URL gives an empty page rather than a redirect.

### 4.9 Inbox (`inbox`, 10 taps)

- Desktop: three panes — list with search and filter chips (All 3 · Awaiting reply 2 · Failed sends 1 · Unread 2 · Drafts 1 · Done 0), thread, right rail (Booking suggested / Customer card with notes, dog, Call / WhatsApp / Email, Profile, Update notes, Trusted contacts) (`desktop/inbox/02-open-sarah.png`). The AI draft block explains *why* it was held ("the intent (booking_query) isn't on the auto-send allowlist…") and offers Approve & send / Edit first / Reject. Composer hint "Enter to send · Shift+Enter for new line" and "Window closes in 23h 42m". Approve/Send end in the demo toast.
- The right rail says "**Booking from Inbox is not available yet. Use the diary to make a booking.**" — an honest dead end but a dead end nonetheless, on the screen where a booking request is being read.
- Unknown number thread shows an "Unmatched contact — No customer match yet" panel (`inbox/09`). New message: "Type at least 2 characters. Meta only lets you send approved templates when starting a thread." (`inbox/11`).
- Filter chips update the URL (`?filter=awaiting_reply`) — good for Back.
- Phone (`phone/inbox/01-land-inbox.png`, `/02-open-sarah.png`): master → detail with a "←" back button; browser Back also returns to the list. **Bugs:** (a) the AI-draft action buttons "Approve & send / Edit first / Reject" are **clipped behind the sticky composer** — only their top halves show (`phone/inbox/02`); (b) the filter chips overflow off the right edge with no scroll affordance ("Failed sends" cut mid-word); (c) a 140 px-tall white bar at the top holds nothing but the "New message" button; (d) "Waiting time unavailable" appears in red on every conversation row, which reads as an error rather than "SLA unknown".
- Tablet shows list + thread side by side but drops the right rail; the "Booking" and "Customer" become chips in the thread header (`tablet/inbox/02-open-sarah.png`). The thread header truncates the name to "Sarah …".
- a11y: H1 "Inbox" then jumps to H3 "Sarah Jones" (no H2); 7–9 targets under 36 px (Mark complete 137×32, Approve & send 131×34, Reject 67×34).

### 4.10 Humans (`directories` 01–11)

- Grid/List toggle, "7 humans registered", search by name ("sar" → 1) and by phone fragment ("900113" → Emma Wilson) both work; search shows "Searching…" in the status region. Cards: avatar initials, phone, email, call + WhatsApp icons, dog tile with size dot, "1 No-show (Oct 2023)" warning, "View profile" (`desktop/directories/01-humans.png`).
- Profile modal is URL-backed (`/staff/humans/h1`), survives refresh, Back closes it. Stats (Bookings 1 lifetime · Last visit · Next appt · Total £0), dogs with "Add a dog they own / Link to a dog", Contact with copy icons, Channels, Reminder preferences, AI messaging toggle, sticky "New booking" CTA on phone (`phone/directories/04-humans-open-profile.png`). Edit → notes textbox → Save worked (demo).
- "Add client · Step 1 of 3": First name / Surname / Phone with **placeholders that look like real values ("Amanda", "Booth", "07985 630521")** — easy to think the form is pre-filled (`desktop/directories/10-add-client.png`).
- Phone: the search box placeholder truncates to "Search clie" (`phone/directories/01-humans.png`); the Awaiting-approval panel takes a full card to say it is unavailable offline.

### 4.11 Dogs (`directories` 12–18)

- Search ("rex" → "Showing 1 of 1 match"), size badge, owner phone + WhatsApp. Profile `/staff/dogs/d7`: Dog details (Sex / Colour / Neutered / Microchip / Vet / Groom notes / Last groomed / Custom price — mostly "—" in sample data), Trusted humans, Grooming history, "Recurring Bookings" button (`desktop/directories/14-dogs-open-profile.png`, `phone/directories/14`).
- Edit form is comprehensive (name, breed combobox, birth month/year, 8 alert toggles, size, sex, neutered, pregnant, colour, microchip, vet, notes, custom price, "Archive this dog", "Delete permanently…") and Save works (demo). The harness could not find a "groom notes" textbox by label (the textarea has no accessible name: `textarea:` in the inventory).
- "Recurring Bookings" opens a second modal (Service & price, first appointment date, time grid 08:30–13:00, "Book First Appointment") — note the dog profile's primary CTA is *recurring* bookings, not a one-off booking.
- Small targets: owner name link 95×20, phone 75×17, "View groom photos" / "Edit Rex" 32×32.

### 4.12 Reports (`reports-settings` 01–06)

- `/staff/reports` → `cash-up`: Cash-up / Insights segmented control, "Weekly cash-up — Expected takings from booked dogs — not money taken", ‹ This week ›, per-day lists with payment chips (Deposit paid / Due at pick-up / Paid in full) (`desktop/reports-settings/01-reports-cashup.png`). Previous week works ("Week of · 5 Oct – 7 Oct").
- Insights: 7/30/90-day toggle, four KPI tiles (Expected £387, Bookings 9, Avg per dog £43, Capacity 5%), Key insights bullets, Size mix, "Show detailed reports" accordion (`desktop/reports-settings/03-reports-insights.png`). Each KPI shows a grey "—" delta where a trend arrow would go; "vs £0 prev period" reads oddly with sample data.
- Phone: tiles stack 2×2, Key insights is collapsed by default, cash-up rows truncate "Sarah Jones · Full Groom …" so the time is lost (`phone/reports-settings/01`, `/03`).
- a11y clean (H1 Reports → H2 → H3, 2 small targets).

### 4.13 Settings — every tab (`reports-settings` 07–20)

11 tabs: Your Business · Hours & Closures · Holidays · Your Account · Services & Pricing · Booking Rules · Capacity Engine · Customer Portal · Notifications · AI Messaging · Calendar Sync.

| Tab | What it showed | Notes |
|---|---|---|
| Your Business | Salon name, Phone (WhatsApp), Email, Address, Save | **4 unlabelled inputs** (uppercase captions are not `<label for>`; a11y audit) and three of them show placeholder-grey text, so it is unclear whether phone/email/address are set (`desktop/reports-settings/08`). |
| Hours & Closures | Weekly hours Mon–Fri 08:00–17:00, Sat 09:00–14:00, Sun closed, Closures "+ Add", Save | Shows the `DEFAULT_BUSINESS_HOURS` template (Mon–Sat) while the salon books Mon–Wed 08:30–13:00 — the mismatch CLAUDE.md warns about is visible to staff. **Phone: the end-time inputs are clipped at the right edge of the card** (`phone/reports-settings/09-tab-hours-closures.png`). |
| Holidays | Explanatory paragraph + "Reload holidays" | Needs live data. |
| Your Account | Display name, phone, email, Save; password instructions ("sign out and choose Forgot password?") | Password change is a 4-step detour. |
| Services & Pricing | Read-only table "Prices are read-only for now. Changes need a coordinated release…" | Honest; the "from £" inputs are empty in demo. |
| Booking Rules / Customer Portal | "E2E booking-policy RPC failed." | Build artefact (see §2). |
| Capacity Engine | Explanation of the 2-2-1 rule | Text only. |
| Notifications | Per-event WhatsApp / Email / SMS toggles | Fine. |
| AI Messaging | Master switch + "blocked because…" explanation | Clear. |
| Calendar Sync | "Unable to generate feed URL. Ensure Supabase is connected." + how-to | The how-to references "Open in Calendar App above" which does not exist in this state. |

Other: Save → toast "Demo data — changes won't save." (`reports-settings/19`). **Tabs are not in the URL**: Back from Settings goes to the previous page (`/staff/reports/insights`), and a refresh returns to the first tab. On phone the 11 tabs are a horizontal scroll strip showing ~2.5 tabs with no scroll indicator (`phone/reports-settings/07-settings.png`); on tablet ~5.5 (`tablet/reports-settings/07`).

### 4.14 Menus and dev routes

- Desktop header: "Tools and settings" menu = Needs Attention · Settings; "Account menu" = Customer Portal only (no sign-out visible offline). Phone/tablet "Menu" = New client · Week overview · Needs Attention · Settings · Customer Portal ↗ (`phone/reports-settings/22-account-menu.png`).
- `/staff/dev/right-rail-preview`, `/compose-preview`, `/new-client`, `/customer-dashboard-cards-preview` all render **only the day header** with an empty body in this production build (`reports-settings/23`, `/25`); `/staff/dev/booking-wizard-shell-preview` renders a long customer-wizard fixture page with a "2099" booking (`desktop/customer/11`). These are reachable without any gate in a production bundle.

### 4.15 Back button, refresh, resize, keyboard (`resilience`)

- Refresh with New-booking drawer open → drawer gone, page intact (`resilience/02`). Refresh with `/staff/humans/h1` open → modal reopens (`directories/07`). Back from a profile modal closes it (`directories/08`). Back from Settings → previous route.
- Resize with a human profile modal open: 1440 → 390 turns it into a full-screen 390×844 sheet with no horizontal scroll, back to 1440 re-centres it at 1040×760; Escape closes (`resilience/06`, `/07`).
- Keyboard: Enter on "New booking" opens the drawer with focus in `#dog-search-input`; `aria-labelledby=new-booking-title`; **no `aria-modal`, no focus trap** (Tab leaves after "Cancel"); Shift+Tab from the first control goes to the page behind; Escape closes and restores focus to the previously focused element; `n` reopens it. **No visible focus ring** was computed on the header/day buttons reached by Tab (`outline: solid 0px`, no box-shadow — `resilience/10`). Skip link is first in tab order, becomes visible on focus and lands on `main#main-content`.

## 5. Customer journey

- `/book`, `/book/new`, `/book/dashboard`, `/book/definitely-not-here`, `/customer/x`, `/customer/book` all → **`/book/login`** ("Let's get started"). `/` → `/staff?date=…` (calendar). `/today` → `/staff/today`. `/stafflogin` → `/staff` (no login offline). `/reset-password` (with or without a recovery hash) → "⏱️ Link expired — That reset link has expired or isn't valid anymore. Back to sign in" (`desktop/customer/08`): the page has **no H1, no landmarks** and the only control is the link.
- Login page (`desktop/customer/01-book-landing.png`, `phone/customer/01`): logo, "CUSTOMER PORTAL", H1 "Let's get started", two lines of copy, "+44" prefix + numeric input, "Quick security check" Turnstile box (test key: "For testing only. If seen, report to site owner" is visible in the widget — that is the offline build's test site key, but confirm production uses the real key), yellow Continue, "← Back to Smarter Dog website" → `https://smarterdog.co.uk`. Phone layout is clean; the card fills the width with the back link below the fold.
- Validation: "12345" → "That number doesn't look quite right. Try a UK mobile starting with 07." inline, but the input has **no `aria-invalid` / `aria-describedby`** (`customer/04`). Valid number + Continue → "Not connected." (offline). Continue is enabled before the Turnstile has verified.
- No landmarks on the customer pages (`main: 0, nav: 0`, no skip link); "← Back to Smarter Dog website" is a 230×20 link.

## 6. Phone vs desktop / tablet

- Nothing produced horizontal page scroll on any viewport, and modals become full-screen sheets on phone with sticky footers — the responsive foundation is sound (`phone/calendar2/15`, `phone/today/23`).
- Phone-specific breakages: toast stack covering actions (§4.2); AI-draft buttons hidden behind the composer and filter-chip overflow in Inbox (§4.9); Hours & Closures end-time inputs clipped (§4.13); 11 settings tabs in a 2.5-tab strip; "Search clie" placeholder; orphaned "Didn't show" button; ~45% of the first screen taken by banner + header + nav on Today.
- Phone replaces the mini-month with a week strip and the desktop right rail disappears (Inbox-clear / No bookings tomorrow / Waitlist hints are phone-invisible).
- Tablet (820 px) is the best of the three: two-column calendar, side-by-side inbox, five status actions on one row (`tablet/today/03-expand-max-expected.png`); its only loss is the inbox right rail and the settings tab overflow.
- Tap targets: the calendar's "Open booking for X" button is 31×16 on phone (36×20 tablet) — far below 44 px; the status `<select>` and "+ Book" ghost seats are comfortably large.

## 7. Ten most important observations

| # | Observation | Evidence | Difficulty | Priority |
|---|---|---|---|---|
| 1 | **Modals and drawers do not trap focus and leave 59–97 focusable controls in the `aria-hidden` page behind them** (New booking drawer, booking detail, day settings, dog profile). Keyboard and screen-reader users tab out of the dialog into the header and calendar. Add `aria-modal="true"` + a focus trap, or make the background `inert`. | `desktop/resilience/10-kb-tab-order.png`, `calendar2/detail-a11y`, `directories/dogs-dialog-a11y` | Medium | Critical |
| 2 | **Phone Inbox clips the AI-draft actions behind the sticky composer and lets filter chips overflow unseen.** The three buttons that resolve a held draft are the point of the screen. | `phone/inbox/02-open-sarah.png`, `phone/inbox/01-land-inbox.png` | Small | High |
| 3 | **Toasts stack over the card's primary action on phone** (three Undo toasts cover "Check out"). Collapse to one toast or anchor them away from the working card. | `phone/today/08-max-ready-not-now.png`, `phone/today/12-collected-summary-open.png` | Small | High |
| 4 | **New-booking Confirm is silently disabled until a time is picked, and the time grid is below the fold.** Show "Choose a time" next to the button or pre-select the next free slot; from a "+ Book" seat the flow is already one tap shorter because the slot is pre-filled. | `desktop/calendar/12-after-confirm-state.png`, `phone/calendar/12-after-confirm-state.png`, `calendar2/06–09` | Small | High |
| 5 | **Every route is titled "SmarterDog — Salon Bookings"**, including the customer login and reset page. Per-route titles ("Today · SmarterDog", "Inbox (12) · SmarterDog", "Sign in · Smarter Dog") are a few lines and help history, tabs and assistive tech. | `desktop/first-load/09-titles-per-route` | Small | High |
| 6 | **Over-capacity booking is a one-tap chip in the drawer with no confirmation**, while the slot popover makes the same act an explicit "Override & book". Align them: an "over" chip should ask "Overbook 8:30?" before Confirm. | `phone/calendar2/12-book-from-slot-choose-time.png`, `desktop/calendar2/09-book-from-slot-confirm.png` | Small | High |
| 7 | **Settings tabs are not URL-addressable and overflow on phone/tablet** (11 tabs, ~2.5 visible, no indicator; refresh/Back lose the tab). Put the tab in the URL and give the strip a fade/scroll cue or a dropdown on narrow screens. The Hours & Closures end-time inputs are clipped on phone. | `phone/reports-settings/07-settings.png`, `phone/reports-settings/09-tab-hours-closures.png`, `reports-settings/20` | Medium | Medium |
| 8 | **Blank or placeholder pages reachable by URL in the production bundle**: `/staff/booking-workspace` (empty `<main>`), four `/staff/dev/*` previews (header only), and unknown `/staff/*` paths that render the calendar under the wrong URL. Redirect or 404 them. | `desktop/calendar/30-booking-workspace.png`, `reports-settings/23-dev-routes`, `resilience/16-legacy-redirects` | Small | Medium |
| 9 | **No visible focus indicator on header/calendar buttons when tabbing** (computed outline 0, no box-shadow), and tiny targets where it matters: "Open booking for X" 31×16 on phone, phone links 90×18, "Dismiss notification" 9×16, mini-month days 27×40. Make the whole booking card the button and set a global `:focus-visible` ring. | `resilience/10`, `phone/calendar2/03-a11y-calendar`, `desktop/today/02-read-stack.png` | Medium | Medium |
| 10 | **Copy that assumes the retired "board" and raw ids leaking:** "2 bookings need their status fixed — it has no place on the board"; pick-up person "H1" in Bella's booking; Add-client placeholders that look like filled values ("Amanda / Booth / 07985 630521"); "Waiting time unavailable" in red on every inbox row; Hours & Closures showing Mon–Sat 08:00–17:00 for a Mon–Wed salon. | `desktop/today/02-read-stack.png`, `phone/calendar2/15-open-bella-card.png`, `desktop/directories/10-add-client.png`, `phone/inbox/01`, `phone/reports-settings/09` | Small | Medium |

Lower-priority notes worth a ticket each: first-load CSS is a single 215 KB file for every route (Medium/Low); `/_vercel/insights/script.js` is requested unconditionally and 404s off-Vercel (Small/Low); day navigation replaces history so Back never returns to the previous day (Small/Low, likely deliberate); the customer login input lacks `aria-invalid`/`aria-describedby` and the customer pages have no landmarks (Small/Medium); "Manage availability" on Today did not open anything in the harness (unverified, manual check).

## 8. What I'd change first

1. Focus trap + `aria-modal` on the shared modal/drawer primitive (fixes #1 everywhere at once).
2. Phone Inbox layout: scrollable chip row with fade, draft actions above the composer, drop the empty header bar.
3. Single-toast policy on the Today stack.
4. "Choose a time" hint + explicit overbook confirmation in the New-booking drawer.
5. Route-specific `<title>`s via the router.
