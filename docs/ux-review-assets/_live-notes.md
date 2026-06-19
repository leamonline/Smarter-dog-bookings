# Live walkthrough notes (Stream 1)

Device classes: Desktop 1440×900 (spot 1280/1920) · iPad 820×1180 + 1180×820 · iPhone 390×844 (spot 360/430).
App: https://smarterdog.vercel.app/ — logged-in staff session, Browser 1. Non-destructive only.

## Desktop (1440×900)

### Bookings / daily schedule
- Landing day Fri 19 Jun = **Closed**. Day-strip: Mon15(13) Tue16(9) Wed17(7) Thu18(—) Fri19(— selected/gold) Sat20(— red) Sun21(— red).
  - FINDING (Visual/Minor): a *selected* closed day shows the gold selected ring, not the red "closed" colour used by Sat/Sun. A closed selected day loses its closed signal in the strip. file: DayTab.jsx / CalendarTabs.jsx.
  - Closed-day empty state is clear ("Salon closed / No appointments on this day" + "Open this day" CTA). Good.
  - Day-count colour coding: open days = grey circle; closed = red circle. Counts shown below.

### Booking grid (Mon 15, 13 dogs)
- Capacity pill "13 dogs booked" + green bar "13/14". Clear.
- Cards: size dot + name + breed + owner + service + price + status pill(caret) + top accent bar (size-coloured: gold=small, teal=medium). A second small dot appears after some names (Sonny/Willow) — likely alert/flag indicator; redundant-looking next to size dot. Verify.
- All 8:30 slot stacks 4 dogs (multi-seat). Time pill on left per row.

### Appointment detail modal (Harvey)
- Structure: header (photo/edit/close icons) → status pipeline (Booked→Checked in→In bath→Ready→Completed) → Appointment details → Services & add-ons → Payment & pickup → Reminder → Reschedule/Cancel/Delete. Well organised, footer actions pinned.
- FINDING (Accessibility/Contrast, Major): inactive pipeline steps render as faint light-grey text on near-white pills — likely <3:1, hard to read which steps remain. file: booking-detail/BookingStatusBar.jsx.
- FINDING (Functionality/Minor→Major): "TOTAL DUE £42" label persists on a COMPLETED booking; Payment & Pickup shows only "Pick-up Human", no payment status (Paid/Deposit/Due). Ambiguous whether money is owed after completion. files: booking-detail/PaymentsPickupCard.jsx, ServicesAddonsCard.jsx.
- FINDING (Visual/Polish): header shows "APPOINTMENT  COMPLETED" — reads like two tabs but is label+status; mild ambiguity. BookingHeader.jsx.
- Reminder card ("Reminder sent · 14 Jun, 19:00" + Message <owner>) is clear and useful.

### Inline status picker
- Expands in place to a full-width vertical list of all 5 statuses in their colours; tall pills = good tap target. CONFIRMS contrast issue: Checked in/In bath/Ready labels faint on pale tints. file: BookingCardNew.jsx.

### New Booking modal
- "N" SHORTCUT WORKS (overturns seed assumption) — opens modal, search auto-focused. Good.
- Pre-populates dog suggestions before typing (recent dogs) with owner + phone. Type-ahead by name/breed/owner works ("cocker" → all Cocker Spaniels).
- After selecting: dog card + service dropdown (Full Groom — £46+) + add-on chips (Flea Bath +£10, Sensitive Shampoo, Anal Glands) + month calendar + available-times row. Compact, strong flow.
- FINDING (Accessibility/Major): the date calendar marks open vs closed days by COLOUR ALONE (green available / pink closed), no icon/label/legend → fails for colour-blind users. files: new-booking/AvailabilityCalendar.jsx.
- FINDING (Visual/Minor): available time slots show a cryptic tiny "over" label (over-capacity) — unclear microcopy. new-booking/TimeSlotPicker.jsx.

### Overview slide-out
- Slides from left: Week pills + month calendar + Capacity (This day 93% FULL green / This week 69% STEADY yellow) + Next available (Mon 22 Jun 8:30 → nav). Informative.
- FINDING (Visual/Major, a11y): month calendar colour semantics (green/coral date numbers + green dot under day) have NO legend and aren't self-evident; colour-only. files: dashboard/MiniCalendarCard.jsx.

### NAVIGATION (investigate)
- At 1440px the top bar shows ONLY: logo, "Overview", "+ New booking", settings gear, account. NO Dogs/Humans/Reports/Inbox primary nav links visible. Bottom tabs show Inbox/Reminders/Waitlist/Tasks (workflow), not section nav.
- The 3-column DashboardShell (left mini-cal/revenue/capacity rail + right workflow rail) is NOT rendered at 1440 — capacity lives in Overview drawer; workflow widgets are bottom tabs. Suggests desktop multi-column + full nav need a WIDER breakpoint than 1440. POTENTIAL CRITICAL: how does a 1440 laptop user reach Dogs/Humans/Reports? Confirm via read_page + 1920 spot-check.

### VIEWPORT METHOD NOTE
- Claude extension side panel caps page at 1054 CSS px at 100% zoom in this browser. Using browser zoom to hit device CSS widths: 75%→1680 (desktop), ~90%→~1170 (iPad landscape), ~125%→~843 (iPad portrait), 250–300%→~351–421 (iPhone). DevTools-MCP (true emulation) is a separate unauth'd Chrome, unusable for the logged-in app. Mobile/tablet findings = responsive CSS-viewport emulation + code audit for touch/DPR/safe-area.

### TRUE DESKTOP (≥1280 / xl) — at 1680 CSS
- Full layout confirmed: top nav (Bookings/Dogs/Humans/Inbox[1]/Reports/Settings + New booking + calendar icon + account); LEFT rail (Week overview, mini-cal WITH legend "Today/Selected/Bookings", Capacity, Next available, Revenue); CENTER grid; RIGHT rail (WhatsApp inbox card, No bookings tomorrow / Waitlist empty / No open tasks, RECENT BOOKING ACTIVITY feed). Rich and well-composed.
- NUANCE: left-rail mini-calendar HAS a legend; the Overview DRAWER's month calendar (compact mode) did NOT — and neither explains the green/coral date-NUMBER colour (open/closed). Legend partial.

### *** RESPONSIVE CLIFF (likely CRITICAL — confirm on iPad) ***
- Full primary nav = `hidden xl:flex` (≥1280). Bottom-tab nav = `md:hidden` (<768). The 768–1279 band (iPad portrait 820 + landscape 1180!) showed ONLY Overview + New booking + gear + account in the top bar at 1054 — NO Dogs/Humans/Reports/Inbox links and no bottom section tabs (those were workflow: Inbox/Reminders/Waitlist/Tasks). If confirmed, iPad users cannot reach Dogs/Humans/Reports. files: layout/AppToolbar.jsx (xl:flex / xl:hidden / md:hidden), DashboardShell.jsx. VERIFY at 820 + 1180.

### Dogs Directory (desktop)
- Header "1054 dogs registered", search, filters (S/M/L/Unset, Has alert, Incomplete profile), SORT Name/Recently added (default Recently added), Grid/List, A-Z rail. Cards: size badge + name + breed + owner + phone + WhatsApp icon + size-coloured top accent. Alert chips coral "⚠ Nervous/Anxious", "Sensitive paws", "Reactive to dogs +3"; "INCOMPLETE" badge (Scarlet, no breed). Strong.
- FINDING (Functionality/Major, VERIFY): switching SORT to "Name" did NOT reorder the unfiltered list (identical order Coco/Maud/Tipi/Jack before & after click). Likely Name-sort no-op on full list. file: views/DogsView.jsx (sort).
- FINDING (Functionality/Minor): A-Z rail FILTERS to a letter (not scroll-jump) — good for 1054 records; within-letter is alphabetical. But after filtering, header reads "46 dogs registered" (wrong word; should be visible/filtered count) and there's no obvious "show all"/clear reset. file: views/DogsView.jsx, AlphabetRail.
- List view works (rows: name + breed·owner·phone + WhatsApp + alert chip).

### Reports (desktop)
- 7/30/90 toggle (30 default). "This week so far" banner (£1176, 29 bookings, 48% filled, £41/dog) + day bars + Insight. KPI tiles: Revenue £8860 (↑628%), Bookings 199 (↑637%, 130 customers), Avg/dog £45 (↓1%, "estimated from base prices"), Seat fill 23%. Daily-revenue bar chart. KEY INSIGHTS bullets (on-brand, useful). SIZE MIX (54/41/5). SERVICE MIX (Full Groom £8787/197, Bath&De-shed £73/2, "No activity: ..."). DEMAND PATTERN (peak day Tue, hourly bars, peak slot 8:30am). TOP CUSTOMERS, BOOKING HEALTH. Genuinely excellent analytics.
- FINDING (Visual/Minor): KPI deltas +628%/+637% off a near-zero prior period are misleading; suppress/cap deltas when baseline is tiny (low-N). file: views/reports/ReportWidgets.jsx / RevenueTrend.jsx.
- FINDING (Layout/Minor→Major): desktop top nav is NOT sticky — scrolls away on long pages (Reports, directories), forcing scroll-to-top to navigate. file: layout/AppToolbar.jsx (no sticky/fixed on top bar).
- Charts are custom SVG/HTML; legible on desktop. Day-bars use colour-intensity for peak without value labels (hourly list has numbers). Check small-screen legibility.

### Settings (desktop)
- Tabs render fine: Your Business / Hours & Closures / Your Account / Services & Pricing / Booking Rules / Capacity Engine / Customer Portal / Notifications / Calendar Sync.
- Your Business: salon name set; PHONE/EMAIL/ADDRESS show empty placeholders (public profile looks unfilled — data, but affects portal). "Save changes" button always enabled (no dirty-state).
- Capacity Engine: excellent plain-English "What the 2-2-1 rule means" + worked example + strict toggle (ON) + large-dog approved-slot pills (12:00/12:30/13:00 ×, time input + Add). 
  - FINDING (Functionality/Minor): links to "docs/capacity-engine.md" — dev-facing repo path; a non-technical owner may get 404/raw file. VERIFY link target. file: views/settings/CapacitySettings.jsx.
  - FINDING (Functionality/Major): inconsistent SAVE model — Your Business uses an explicit "Save changes" button; Capacity Engine has NO save button (autosave). Mixed mental model across the 9 tabs risks lost or unclear saves. files: views/settings/* + shared.jsx (useConfigSaver).
  - Large-dog × pills are small — check tap target on touch.

- Services & Pricing: editable table (Small/Medium/Large "from £X" inputs), per-row ×, + Add service, "Changes save as you type." note. Good. CONFIRMS save-model inconsistency → 3 patterns: explicit Save (Business), autosave+notice (Pricing), autosave+silent (Capacity). file: views/settings/*.
- (Nav Inbox badge "1" intermittently shows/hides between views — minor.)

### Inbox (desktop)
- List + status filters (All/Awaiting reply/Closing soon/Failed sends/Snoozed/Unread/Drafts/Bookings/Needs review/Suggested). 
- FINDING (Layout/Major): the 10 filter chips OVERFLOW horizontally and clip ("Suggested" cut off) with no visible scroll/wrap; many zero-count filters add noise. file: views/inbox/InboxView.jsx + conversation-list/.
- FINDING (Visual/Minor): list preview shows "(no text)" for media/empty messages — unclear. 
- THREAD (3-pane: list + thread + customer context): Mark complete, Snooze, message bubbles, "Generate reply" (AI OFF by default — privacy-conscious, good), composer ("Enter to send · Shift+Enter"), **"Window closes in 23h 46m"** WhatsApp 24h indicator (excellent). Right context: conversation note, "First-time visitor — Daisy on file", Call/WhatsApp, Open full profile, Book appointment CTA, email/address, dog + grooming notes. Rich & well-designed.
- NOTE: 3-pane is desktop-only; must collapse on tablet/phone — verify.

### Humans Directory (desktop)
- "830 humans registered", search "Search rolodex...", filters (New customers/Flagged/No dogs/No phone/WhatsApp), SORT First name(default)/Surname, Grid/List, A-Z rail, SIZE legend. Cards: name + phone + WhatsApp + dogs (size dots) or "No dogs registered — add one" green CTA.
- FINDING (Functionality/Minor): inconsistent default sort between directories — Humans defaults to First name (rail aligns, alphabetical), Dogs defaults to Recently added (rail mismatches). Pick one model. files: HumansView.jsx vs DogsView.jsx.
- FINDING (Visual/Polish, brand voice): search placeholder "Search rolodex..." (jargon/dated) vs Dogs "Search by name, breed or owner" — inconsistent + off-brand. file: HumansView.jsx.

## iPad (responsive band 768–1279)

### TOOLING LIMITATION (be transparent in report)
- Authenticated browser viewport LOCKED at 1680 CSS px: resize_window reported success but never changed innerWidth; browser zoom (cmd+-/0/=) intercepted by Chrome, not applied. DevTools-MCP emulation = separate unauth'd Chrome. So pixel-accurate iPad/iPhone *screenshots* weren't achievable live. Responsive findings = (1) one real sub-xl state observed live at 1054 CSS (top bar + read_page DOM), (2) the Stream 2 CODE audit of the actual breakpoint CSS (AppToolbar xl:flex/xl:hidden/md:hidden, DashboardShell, safe-area, sheet anim, tap-target classes). Offer user true-device follow-up.

### *** CONFIRMED CRITICAL — nav dead-zone 768–1279 ***
- HARD EVIDENCE: at viewport 1054x805 (read_page filter=interactive) the ONLY top-bar controls were: link "/", button "Open overview", button "New booking", button "Settings", button "Account menu". NO Dogs/Humans/Inbox/Reports links anywhere in the interactive DOM. Bottom area = workflow tabs (Inbox/Reminders/Waitlist/Tasks), NOT section nav.
- Code model: top section-nav = `hidden xl:flex` (≥1280); mobile bottom-tab section-nav = `md:hidden` (<768). So 768–1279 (iPad portrait 820 AND landscape 1180, plus 13–14" laptops/any reduced width) shows NEITHER → no way to reach Dogs/Humans/Reports/Inbox. CRITICAL. file: layout/AppToolbar.jsx. (Code audit to confirm exact logic + whether any hidden menu exists.)
- This is the single highest-impact gap: the user's stated iPad use is directly broken for cross-section navigation.

## iPhone (<768) — via code audit + bottom-tab model
- Code: md:hidden fixed bottom-tab nav (Bookings/Dogs/Humans/Inbox/Reports) with pb-[env(safe-area-inset-bottom)]; modal→sheet at <40rem; 16px input font to avoid iOS zoom. Detailed touch/tap-target/safe-area findings deferred to Stream 2 code audit (authoritative for these).


