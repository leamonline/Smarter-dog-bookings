# SmarterDog Salon Dashboard — Launch Plan

## Current Status

The app is **feature-complete** with a working React frontend, Supabase backend integration, authentication, booking management, dog/human directories, and a settings panel. It runs in offline mode with sample data when no Supabase credentials are configured.

---

## Phase 1: Infrastructure Setup (Day 1–2)

### 1.1 Create Supabase Project
- [ ] Sign up / log in at [supabase.com](https://supabase.com)
- [ ] Create a new project (choose region closest to your users)
- [ ] Note the **Project URL** and **Anon Key** from Settings → API

### 1.2 Run Database Migrations
Run these in order via Supabase SQL Editor:
- [ ] `supabase/migrations/001_initial_schema.sql` — core tables, triggers, RLS policies
- [ ] `supabase/migrations/002_auth_staff_profiles.sql` — auth integration + staff profiles
- [ ] `supabase/migrations/003_phase5_schema.sql` — size + confirmed columns

### 1.3 Configure Environment
- [ ] Create `.env.local` in project root:
  ```
  VITE_SUPABASE_URL=https://your-project.supabase.co
  VITE_SUPABASE_ANON_KEY=your-anon-key-here
  ```

### 1.4 Create First Admin User
- [ ] Enable Email Auth in Supabase → Authentication → Providers
- [ ] Sign up through the app's login page
- [ ] In Supabase dashboard, update the `staff_profiles` row to set `role = 'owner'`

### 1.5 Seed Sample Data (Optional)
- [ ] Run `npm run seed` to populate demo dogs, humans, and bookings
- [ ] Verify data appears in the dashboard

---

## Phase 2: Configuration & Customization (Day 2–3)

### 2.1 Salon Settings
- [ ] Set actual pricing for each service (Full Groom, Bath & Brush, Bath & Deshed, Puppy Cut) by dog size
- [ ] Configure large dog slot rules (the 2-2-1 capacity system)
- [ ] Set default pickup offset time
- [ ] Toggle capacity enforcement on/off as needed

### 2.2 Operating Hours
- [ ] Configure which days the salon is open (default: Mon–Wed open, Thu–Sun closed)
- [ ] Adjust slot times if 08:30–13:00 doesn't match your hours

### 2.3 Staff Accounts
- [ ] Create accounts for all staff members
- [ ] Assign roles (owner vs staff) — owners get access to Settings

---

## Phase 3: Testing & QA (Day 3–5)

### 3.1 Functional Testing
- [ ] Create, edit, and cancel bookings across multiple days
- [ ] Walk a booking through all statuses: Not Arrived → Checked In → In Bath → Ready for Pick-up → Completed
- [ ] Test capacity enforcement (try overbooking, large dog rules)
- [ ] Add/edit/delete dogs and humans
- [ ] Test trusted contacts and pickup person assignment
- [ ] Verify payment status tracking works correctly

### 3.2 Auth & Permissions
- [ ] Test login/logout flow
- [ ] Verify staff cannot access owner-only settings
- [ ] Test session persistence (refresh browser, reopen tabs)
- [ ] Confirm RLS policies prevent cross-tenant data access

### 3.3 Device Testing
- [ ] Test on desktop browsers (Chrome, Firefox, Safari)
- [ ] Test on tablet (primary use case for salon front desk)
- [ ] Test on mobile phones
- [ ] Verify responsive layout at all breakpoints

### 3.4 Edge Cases
- [ ] Test offline behavior when Supabase is unreachable
- [ ] Test with slow network connections
- [ ] Test concurrent bookings (two staff booking same slot)

---

## Phase 4: Deployment (Day 5–6)

### 4.1 Build
```bash
npm install
npm run build    # outputs to /dist
```

### 4.2 Deploy (choose one)

**Option A: Vercel (Recommended — easiest)**
- [ ] Connect GitHub repo to Vercel
- [ ] Set environment variables (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)
- [ ] Deploy — Vercel auto-detects Vite config

**Option B: GitHub Pages**
- [ ] Add `base` to `vite.config.js` matching repo name
- [ ] Set up GitHub Actions to build and deploy on push

### 4.3 Custom Domain (Optional)
- [ ] Purchase/configure domain
- [ ] Add DNS records pointing to hosting provider
- [ ] Enable HTTPS (automatic on Vercel)

### 4.4 Post-Deploy Verification
- [ ] Verify login works on production URL
- [ ] Confirm Supabase connection is live
- [ ] Test a full booking flow end-to-end
- [ ] Check all views load correctly (Dashboard, Dogs, Humans, Settings)

---

## Phase 5: Go Live (Day 6–7)

### 5.1 Final Data Setup
- [ ] Remove any seed/test data from production database
- [ ] Enter real dogs, humans, and upcoming bookings
- [ ] Configure actual salon schedule for the week

### 5.2 Staff Onboarding
- [ ] Walk staff through the booking workflow
- [ ] Show how to check dogs in, update status, and mark completed
- [ ] Demonstrate the Dogs and Humans directories
- [ ] Share the production URL and login credentials

### 5.3 Launch
- [ ] Set the salon as open for business days
- [ ] Start taking bookings!
- [ ] Monitor for issues in the first few days

---

## Phase 6: Troubleshooting & FAQs

### 6.1 Login & Authentication Issues

**"I can't log in / the login page just spins"**
- Check that `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set correctly in `.env.local` (or your hosting provider's environment variables). They must start with `https://` and `eyJ...` respectively.
- In the Supabase dashboard, go to Authentication → Providers and confirm Email Auth is enabled.
- If you've recently redeployed, the environment variables may not have propagated — redeploy or restart the dev server.

**"I'm logged in but I can't see Settings"**
- Only users with `role = 'owner'` in the `staff_profiles` table can access Settings. Check the user's row in Supabase → Table Editor → staff_profiles.

**"Session keeps expiring"**
- Supabase tokens last 1 hour by default. The app should auto-refresh them. If it doesn't, check that the browser isn't blocking third-party cookies (some privacy extensions do this). Try a private/incognito window.

### 6.2 Booking & Capacity Issues

**"I can't book a large dog into a slot that looks empty"**
- Large dogs have special slot rules defined in `LARGE_DOG_SLOTS` (`src/constants/salon.js`). Only slots 08:30, 09:00, 12:00, 12:30, and 13:00 accept large dogs, and some of those use 2 seats.
- The 2-2-1 rule also applies: you can't have more than 2 consecutive double-booked slots. If the surrounding slots are already double-booked, the engine blocks it.

**"A booking disappeared"**
- Check if it was cancelled rather than deleted — cancelled bookings may be filtered from the default view. Look in Supabase → Table Editor → bookings for the date in question.
- If using offline mode (no Supabase), all data lives in memory and is lost on page refresh. This is by design for demo/testing only.

**"Status won't update"**
- Booking statuses must follow the sequence: Not Arrived → Checked In → In the Bath → Ready for Pick-up → Completed. The app may prevent skipping steps. If it's stuck, check the browser console for Supabase errors (usually a network or RLS issue).

### 6.3 Database & Connection Issues

**"Everything says 'offline mode' even though I set up Supabase"**
- The app checks for both `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` at startup (`src/supabase/client.js`). If either is missing or empty, it falls back to offline mode silently. Check spelling — the prefix must be `VITE_` for Vite to expose them.
- After changing `.env.local`, you must restart the dev server (`npm run dev`). Vite doesn't hot-reload environment variables.

**"RLS policy error" or "permission denied for table"**
- Row Level Security policies are set up in `001_initial_schema.sql`. If you've manually edited tables or policies in Supabase, you may have broken them. Re-run the relevant migration SQL to restore policies.

**"Data isn't syncing between tabs/devices"**
- Real-time subscriptions require that Supabase's Realtime feature is enabled for each table. In Supabase dashboard, go to Database → Replication and make sure the relevant tables (bookings, dogs, humans) have replication enabled.

### 6.4 Deployment Issues

**"Build fails with 'process is not defined'"**
- This is a Vite thing — it doesn't polyfill Node globals. Make sure you're using `import.meta.env.VITE_*` (not `process.env.*`) everywhere. If a dependency expects `process`, you may need to add a `define` block in `vite.config.js`.

**"Works locally but not on Vercel"**
- The most common cause is missing environment variables. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in your hosting provider's settings, then redeploy.
- Confirm `vercel.json` is present and correct.

**"Page not found on refresh (404)"**
- This is a client-side routing issue. `vercel.json` should include rewrite rules that send all routes to `index.html`. Check that this file is present and correctly configured.

---

## Phase 7: Ongoing Maintenance & Backups

### 7.1 Database Backups

**Automatic backups (Supabase-managed):**
- Supabase Free tier: daily backups, retained for 7 days
- Supabase Pro tier: daily backups, retained for 30 days, with point-in-time recovery (PITR)

**Manual backup process (recommended weekly):**
- [ ] Go to Supabase dashboard → Settings → Database → Backups
- [ ] Download the latest backup file and store it securely (e.g. encrypted cloud storage)
- [ ] Alternatively, use `pg_dump` via the connection string if you want a local copy:
  ```bash
  pg_dump "postgresql://postgres:[PASSWORD]@db.[PROJECT_REF].supabase.co:5432/postgres" > backup_$(date +%Y%m%d).sql
  ```

**Restore process:**
- For minor issues: use Supabase's dashboard restore feature
- For full recovery: create a new Supabase project and run the backup SQL against it, then update environment variables

### 7.2 Monitoring

**What to check weekly:**
- [ ] Supabase dashboard → Reports: check API request counts and error rates
- [ ] Supabase dashboard → Auth: review active users and any failed login spikes
- [ ] Supabase dashboard → Database: check storage usage (free tier limit is 500 MB)

**What to check monthly:**
- [ ] Review Supabase usage against plan limits (API requests, storage, bandwidth)
- [ ] Check for Supabase platform updates or deprecation notices
- [ ] Review browser console for any recurring JavaScript errors (ask staff to screenshot if they see red errors)

### 7.3 Updating the App

**Dependency updates:**
```bash
npm outdated          # See what's out of date
npm update            # Update within semver ranges
npm audit             # Check for security vulnerabilities
npm audit fix         # Auto-fix where possible
```

- Run updates in a development environment first, test thoroughly, then deploy
- Pay particular attention to `@supabase/supabase-js` updates — major versions may include breaking API changes
- Pin React and Vite to known-good versions; don't blindly update to new majors

**Schema changes:**
- Always create a new numbered migration file (e.g. `004_your_change.sql`)
- Test the migration against a staging Supabase project before running on production
- Never edit existing migration files — they're a historical record

### 7.4 Security Practices

- [ ] Rotate the Supabase anon key if you suspect it's been exposed (Settings → API → Regenerate)
- [ ] Never commit `.env.local` to git (it should be in `.gitignore`)
- [ ] Review RLS policies quarterly — ensure no table is accidentally public
- [ ] Keep staff accounts to a minimum; remove leavers promptly
- [ ] Use strong, unique passwords for all Supabase and hosting accounts
- [ ] Enable 2FA on Supabase dashboard and hosting provider accounts

### 7.5 Uptime & Incident Response

If the app goes down:
1. **Check Supabase status** at [status.supabase.com](https://status.supabase.com) — if it's a platform outage, the app will fall back to offline mode automatically
2. **Check hosting provider status** (Vercel status page)
3. **Check the browser console** for error messages — screenshot them for debugging
4. **Fall back to manual bookings** (pen and paper) if needed — the app is a tool, not the business

---

## Phase 8: Detailed Timeline & Owners

This maps each phase to a target date range and who's responsible. Adjust dates to your actual start date.

| Phase | Tasks | Target Days | Owner | Dependencies |
|-------|-------|-------------|-------|-------------|
| **1. Infrastructure** | Supabase setup, migrations, env config, first admin | Days 1–2 | Leam (or technical person) | None |
| **2. Configuration** | Pricing, operating hours, staff accounts | Days 2–3 | Leam + salon owner | Phase 1 complete |
| **3. Testing** | Functional, auth, device, edge case testing | Days 3–5 | All staff (coordinated by Leam) | Phase 2 complete |
| **4. Deployment** | Build, deploy to Vercel, domain setup | Days 5–6 | Leam | Phase 3 sign-off |
| **5. Go Live** | Data entry, staff onboarding, launch | Days 6–7 | Salon owner + Leam | Phase 4 complete |
| **6. Stabilisation** | Monitor for bugs, gather feedback, quick fixes | Days 7–14 | Leam (with staff reporting) | Phase 5 complete |
| **7. Compliance review** | Complete the App Compliance Code (see below) | Days 7–21 | Salon owner + legal advisor | Phase 5 complete |

### Critical Path

The things that will actually hold up launch, in order:

1. **Supabase project creation and migrations** — everything else depends on this
2. **First admin user** — can't configure anything without it
3. **Pricing and schedule configuration** — must be accurate before real bookings
4. **Staff device testing** — the tablet at the front desk is the primary use case; if it doesn't work well there, nothing else matters
5. **Go-live data entry** — real dogs and humans must be in the system before day one

### Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Supabase free tier hits limits | Low (initially) | Medium | Monitor usage weekly; upgrade to Pro if >50k API calls/month |
| Staff find the app confusing | Medium | High | Run a 30-minute hands-on training session; create a one-page quick reference card |
| Internet goes down at salon | Medium | Medium | App falls back to offline mode with sample data; keep a paper backup system |
| Data loss | Low | Critical | Weekly manual backups + Supabase auto-backups; test restore process once |
| Browser compatibility issue | Low | Medium | Test on the actual devices before go-live; Chrome is the safest bet |

---

## Phase 9: UK Legal Compliance Checklist

This section references the **App Compliance Code** (`app-compliance-code.txt`), which outlines UK legal requirements across 8 areas. The compliance code document currently has section headings but needs its detailed rules filling in. Here's a checklist of what must be addressed before (or shortly after) launch.

### 9.1 Data Protection (UK GDPR / DPA 2018 / PECR 2003)

The app stores personal data: names, phone numbers, email addresses, physical addresses, social media handles, and notes about dogs and their owners.

- [ ] **Privacy notice**: Create and display a clear privacy notice explaining what data you collect, why, and how long you keep it. Link to it from the app's login/signup page.
- [ ] **Lawful basis**: Document your lawful basis for processing data (likely "legitimate interests" for existing customers, "consent" for marketing messages)
- [ ] **Data minimisation**: Review the `humans` table — only collect what you genuinely need. Fields like `fb`, `insta`, `tiktok` are optional; make sure they stay optional and aren't required.
- [ ] **Right to deletion**: Have a process for deleting a customer's data if they request it (cascade deletes from `humans` will handle dogs and bookings via the schema's `ON DELETE CASCADE`)
- [ ] **Right to access**: Be able to export a customer's data if they ask for it (a Supabase SQL query can do this)
- [ ] **PECR consent**: If you plan to send SMS/WhatsApp marketing, you need explicit opt-in consent. The `sms` and `whatsapp` boolean fields on `humans` can track this — make sure they default to `false` and are only set to `true` with clear consent.
- [ ] **ICO registration**: Register with the Information Commissioner's Office if you haven't already ([ico.org.uk](https://ico.org.uk))

### 9.2 Consumer Rights (CRA 2015 / CCR 2013 / CPR 2008)

- [ ] **Clear pricing**: Prices displayed in the app (from `PRICING` in `salon.js`) must be accurate and inclusive. The "+" suffix (e.g. "£42+") is fine, but make sure customers understand what might cause the price to go up.
- [ ] **Cancellation terms**: If customers will book through a future portal, you'll need a clear cancellation/refund policy. Document it now even for staff-managed bookings.
- [ ] **Service descriptions**: Each service (Full Groom, Bath & Brush, etc.) should have a clear description of what's included, so there's no ambiguity.

### 9.3 Electronic Commerce (E-Commerce Regs 2002)

- [ ] **Business identification**: The app (or its associated website) must clearly show: business name, geographic address (183 Kings Road, OL6 8HD), contact email, and any registration numbers.
- [ ] **Acknowledgement of orders**: When a booking is confirmed, the customer should receive acknowledgement (currently the staff confirms verbally — if you add a customer portal later, this becomes a harder requirement).

### 9.4 Accessibility (Equality Act 2010)

- [ ] **Colour contrast**: The booking status colours in `BOOKING_STATUSES` should meet WCAG AA contrast ratios. Check with a tool like [webaim.org/resources/contrastchecker](https://webaim.org/resources/contrastchecker/).
- [ ] **Screen reader support**: Ensure the app uses semantic HTML and ARIA labels where needed (particularly for the booking grid and status buttons).
- [ ] **Keyboard navigation**: All actions should be reachable via keyboard, not just mouse/touch.
- [ ] **Reasonable adjustments**: Be prepared to take bookings by phone/in-person for customers who can't use the app.

### 9.5 AI & Automated Messaging (UK GDPR Art 22 / Equality Act 2010)

- [ ] If you use AI-generated replies (e.g. via the Smarter Dog Replies skill), make sure a human reviews them before sending — don't fully automate customer communications.
- [ ] Don't make significant decisions about customers (e.g. refusing service) based solely on automated processing.

### 9.6 Communications (Communications Act 2003 / PECR 2003)

- [ ] Don't send unsolicited marketing messages without consent.
- [ ] Include an easy opt-out mechanism in any marketing messages.
- [ ] Keep records of consent (the `sms` and `whatsapp` fields, plus when/how consent was given).

### 9.7 Intellectual Property (CDPA 1988)

- [ ] Ensure all images, icons, and content in the app are either original, licensed, or from open-source/free-to-use sources.
- [ ] If using AI-generated images for the app, check the licence terms of the AI tool used.

### 9.8 Security (Computer Misuse Act 1990 / UK GDPR)

- [ ] Supabase handles encryption at rest and in transit — confirm HTTPS is enforced on your production URL.
- [ ] RLS policies are enabled on all tables (set up in the migration files) — verify they're active in production.
- [ ] Don't store passwords yourself — Supabase Auth handles this. Never log or display passwords.
- [ ] Have a breach response plan: who to notify (ICO within 72 hours if personal data is compromised), how to notify affected customers.

### 9.9 Action: Complete the Compliance Code

The file `app-compliance-code.txt` has the right structure but the detailed rules under each part are currently blank. Priority actions:
- [ ] Fill in Part 1 (Data Protection) before launch — this is the highest-risk area
- [ ] Fill in Parts 2–4 before launch
- [ ] Fill in Parts 5–8 within 2 weeks of launch
- [ ] Schedule an annual review of the full document
- [ ] Consider getting a solicitor to review the completed document

---

## Future Enhancements — Expanded Roadmap

### Tier 1: High Priority (Months 1–2 post-launch)

**SMS/WhatsApp Notifications**
- Integration options: Twilio (SMS + WhatsApp Business API), or MessageBird
- The `humans` table already has `sms` and `whatsapp` boolean fields for consent tracking
- Suggested messages: booking confirmation, day-before reminder, "your dog is ready for pickup"
- Effort estimate: 2–3 days for a developer
- Compliance note: requires explicit opt-in consent (PECR 2003)
- Sub-tasks:
  - [ ] Choose a messaging provider and set up an account
  - [ ] Create message templates for each trigger point
  - [ ] Build a Supabase Edge Function (or external service) to send messages on booking status changes
  - [ ] Add a "Send reminder" button to the booking card
  - [ ] Test end-to-end with real phone numbers

**Booking History & Rebooking**
- The `bookings` table already stores all past bookings — just needs a UI to surface them
- "Rebook" button: pre-fills the booking form with the same dog, service, and size from a past appointment
- Effort estimate: 1–2 days
- Sub-tasks:
  - [ ] Add a "History" tab to the dog profile view
  - [ ] Display past bookings sorted by date (most recent first)
  - [ ] Add a "Rebook" button that opens the new booking modal pre-filled
  - [ ] Optionally show lifetime visit count and total spend per dog

### Tier 2: Medium Priority (Months 2–4)

**Customer-Facing Booking Portal**
- A separate lightweight page (or route within the app) where dog owners can:
  - See available slots for the next 2 weeks
  - Request a booking (staff confirms it, rather than auto-confirm)
  - View their upcoming bookings
- Effort estimate: 5–7 days (significant piece of work)
- Compliance note: triggers Consumer Contracts Regulations (cancellation rights, clear T&Cs)
- Sub-tasks:
  - [ ] Design the customer-facing UI (keep it simple — mobile-first)
  - [ ] Create a public Supabase role with read-only access to availability data
  - [ ] Build booking request flow (customer submits → staff approves/rejects)
  - [ ] Add email/SMS confirmation on approval
  - [ ] Write terms and conditions for online booking
  - [ ] Add a privacy notice and cookie consent if needed

**Analytics Dashboard**
- Key metrics: bookings per day/week/month, revenue by service, busiest time slots, most frequent customers, cancellation rate
- Effort estimate: 3–4 days
- Sub-tasks:
  - [ ] Build summary queries against the `bookings` table
  - [ ] Create a new "Analytics" view with charts (Recharts or Chart.js)
  - [ ] Add date range filtering
  - [ ] Owner-only access (use existing role check)

**Google Calendar Sync**
- Use Google Calendar API to push bookings as events to a shared staff calendar
- Effort estimate: 2–3 days
- Sub-tasks:
  - [ ] Set up Google Cloud project and Calendar API credentials
  - [ ] Build sync logic (create event on booking, update on status change, delete on cancellation)
  - [ ] Add a toggle in Settings to enable/disable sync
  - [ ] Handle token refresh and error states

### Tier 3: Lower Priority (Months 4+)

**Dark Mode**
- The colour system in `src/constants/brand.js` can be extended with dark variants
- Effort estimate: 1–2 days
- Sub-tasks:
  - [ ] Define dark theme colour palette
  - [ ] Add a theme toggle in Settings
  - [ ] Update all inline styles/constants to use theme-aware values
  - [ ] Test all views in dark mode (especially booking status colours for contrast)

**TypeScript Migration**
- Incremental migration: rename `.js` → `.ts`/`.tsx` files one at a time
- Effort estimate: 3–5 days (can be done gradually)
- Benefits: catch bugs at build time, better IDE support, easier onboarding for future developers
- Sub-tasks:
  - [ ] Add TypeScript + type-checking to the Vite config
  - [ ] Start with `src/constants/` and `src/engine/` (pure logic, no JSX)
  - [ ] Move to hooks (`src/supabase/hooks/`)
  - [ ] Finally migrate components

**Automated Payments (Stripe/Square)**
- Accept deposits at booking time or full payment at pickup
- Effort estimate: 5–7 days (payments are always more complex than expected)
- Compliance note: PCI DSS compliance handled by Stripe/Square if using their hosted checkout
- Sub-tasks:
  - [ ] Choose payment provider (Stripe is the most developer-friendly)
  - [ ] Create payment intents on booking creation
  - [ ] Add payment status to booking cards
  - [ ] Handle refunds on cancellation
  - [ ] Update the `payment` field on `bookings` to track actual payment status vs. just "Due at Pick-up"

**Unit & E2E Tests**
- Priority: capacity engine logic (most critical business logic) → hooks → component rendering
- Effort estimate: 3–4 days for good initial coverage
- Sub-tasks:
  - [ ] Set up Vitest for unit tests
  - [ ] Write tests for `capacity.js` (2-2-1 rule, large dog slots, seat counting)
  - [ ] Write tests for `utils.js` helper functions
  - [ ] Set up Playwright for E2E tests
  - [ ] Write E2E test for full booking flow (create → status updates → complete)

---

## Key Architecture Notes

- **Capacity Engine** (`src/engine/capacity.js`): Enforces the 2-2-1 rule — max 2 consecutive double-booked slots, with special handling for large dogs via `LARGE_DOG_SLOTS`
- **Offline Fallback**: App works without Supabase using in-memory state + sample data (`src/data/sample.js`). Triggered when `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY` is missing.
- **Auth**: Supabase Auth with `staff_profiles` table for role-based access (owner vs staff)
- **State Management**: React hooks + Supabase real-time (no Redux/Zustand needed)
- **Database**: 7 tables (`humans`, `human_trusted_contacts`, `dogs`, `bookings`, `salon_config`, `day_settings`, `staff_profiles`) with Row Level Security policies enabled
- **Slot System**: 10 half-hour slots from 08:30 to 13:00, configurable per day via `day_settings`
- **Services**: Full Groom, Bath & Brush, Bath & Deshed, Puppy Cut — each with size-based pricing
