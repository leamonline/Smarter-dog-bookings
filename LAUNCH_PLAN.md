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

**Option B: Netlify**
- [ ] Connect GitHub repo to Netlify
- [ ] Set build command: `npm run build`
- [ ] Set publish directory: `dist`
- [ ] Add environment variables

**Option C: GitHub Pages**
- [ ] Add `base` to `vite.config.js` matching repo name
- [ ] Set up GitHub Actions to build and deploy on push

### 4.3 Custom Domain (Optional)
- [ ] Purchase/configure domain
- [ ] Add DNS records pointing to hosting provider
- [ ] Enable HTTPS (automatic on Vercel/Netlify)

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

## Future Enhancements (Post-Launch)

These are not blockers but would improve the product over time:

| Priority | Enhancement | Description |
|----------|------------|-------------|
| High | SMS/WhatsApp notifications | Send booking confirmations and reminders (contact preferences already scaffolded) |
| High | Booking history & rebooking | Quick rebook from past appointments |
| Medium | Customer-facing portal | Let dog owners book online directly |
| Medium | Analytics dashboard | Track revenue, popular services, busiest days |
| Medium | Google Calendar sync | Staff calendar integration |
| Low | Dark mode | Infrastructure exists, needs implementation |
| Low | TypeScript migration | Improve code reliability and developer experience |
| Low | Automated payments | Stripe/Square integration for deposits and payments |
| Low | Unit & E2E tests | Capacity engine tests, Cypress/Playwright for workflows |

---

## Key Architecture Notes

- **Capacity Engine** (`src/engine/capacity.js`): Enforces the 2-2-1 rule — max 2 consecutive double-booked slots, with special handling for large dogs
- **Offline Fallback**: App works without Supabase using in-memory state + sample data
- **Auth**: Supabase Auth with staff_profiles table for role-based access
- **State Management**: React hooks + Supabase real-time (no Redux/Zustand needed)
- **Database**: 7 tables with Row Level Security policies enabled
