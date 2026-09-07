# SmarterDog — Salon Booking Platform

A booking and management platform for dog grooming salons. It ships **two
interfaces from one codebase**:

- **Staff dashboard** (`/`) — the front-desk app: weekly calendar, capacity engine,
  customer/dog directories, WhatsApp inbox, reminders, reports and settings.
- **Customer portal** (`/customer`) — a self-service app where customers log in,
  book through a guided wizard, manage their dogs and trusted contacts, and view
  upcoming appointments.

Built with React 19 + Vite + Supabase (PostgreSQL + Auth + RLS + Edge Functions).

## Project navigation

This README explains how to run the application. For project intent and
delivery context, start with:

- [`PROJECT.md`](PROJECT.md) — concise product North Star and source-of-truth map
- [`ROADMAP.md`](ROADMAP.md) — dependency-aware Now / Next / Later sequence
- [`docs/README.md`](docs/README.md) — documentation authority and status map
- [`AGENTS.md`](AGENTS.md) — durable instructions for coding agents
- [GitHub epic #603](https://github.com/leamonline/Smarter-dog-bookings/issues/603) — live architecture-convergence execution

### Capability status

This table records code at the pinned 9 August 2026 baseline. Environment state
is shown only where dated evidence exists; reverify deployments and feature
flags before a release.

| Capability | Repository support | Environment status | Current note |
|---|---|---|---|
| Staff dashboard and Daily Brief | Implemented | Not reverified in this documentation pass | Core staff surface |
| Customer portal and legacy booking wizard | Implemented | Not reverified in this documentation pass | Writes legacy booking rows guarded by PostgreSQL |
| WhatsApp appointment offers | Implemented | Not reverified in this documentation pass | Drafts times into the staff composer |
| Direct booking from the Inbox | Shell only | Enablement not inferred | `Let's book!` currently leads to an unavailable explanation |
| Visit aggregate, projections and typed commands | Implemented in the repository | Hosted state was not independently reverified in this documentation pass | Mutation commands remain deliberately dark |
| `previous_day_1500_v1` customer policy | Implemented as inactive support | Activation not authorised or inferred | The repository keeps mutation callers dark; activation is separate work |
| Customer notification after a staff reschedule | Gap — staff contact the customer manually | Not applicable | Tracked by [#604](https://github.com/leamonline/Smarter-dog-bookings/issues/604); automation is under a recorded **STOP** (15 August 2026). Revisit when *both* hold: the owner finds the manual contacting burdensome in practice, **and** an approved Meta template route with a deterministic fallback plus a separately authorised production check can be supplied — the [resumption trigger](docs/research/2026-08-09-reschedule-automation-go-no-go.md#resumption-trigger). |
| Visit-level notification intent and attempt history | Gap | Not applicable | Tracked by [#610](https://github.com/leamonline/Smarter-dog-bookings/issues/610) |
| Generic runtime schema/capability contract | Partial policy-specific pilot | Environment support not inferred | Tracked by [#607](https://github.com/leamonline/Smarter-dog-bookings/issues/607) |
| Critical PR browser gate with WebKit | Gap | PR job currently skips Playwright | Tracked by [#606](https://github.com/leamonline/Smarter-dog-bookings/issues/606) |

The evidence and distinctions behind this table live in
[`docs/research/2026-08-09-issue-603-plan-reality-audit.md`](docs/research/2026-08-09-issue-603-plan-reality-audit.md).

## Features

### Staff dashboard

- **Weekly calendar** with slot-based booking (08:30–13:00)
- **Capacity engine** — enforces the 2-2-1 rule for large dogs
- **Booking workflow** — Not Arrived → Checked In → In Bath → Ready for Pick-up → Completed
- **Dogs & Humans directories** — full contact management with alerts, notes, and trusted contacts
- **WhatsApp inbox** — two-way customer messaging with AI-drafted replies and AI-proposed booking actions, staff-approved before anything goes live
- **Reminders & notifications** — multi-channel (WhatsApp, SMS, email) booking confirmations, reminders, ready-for-pickup and cancellations
- **Waitlist** — track overflow requests and notify when slots open
- **Reports** — revenue, booking/customer counts, seat-fill rate, service mix, demand patterns and top customers, over selectable 7/30/90-day periods
- **Groom photos** — before/after shots stored per booking
- **Settings** — business details, hours/closures, services & pricing, booking rules, capacity, customer portal and notifications (owner can edit, staff read-only)
- **Calendar feeds** — per-user ICS feeds for staff and customers
- **Role-based auth** — owner vs staff access levels
- **Demo/sample-data mode** — a deterministic local/test dataset; it is not durable offline production operation
- **Responsive** — optimised for tablet (front desk) and mobile

### Customer portal

- **Phone-OTP or password login** via Supabase Auth (Twilio Verify delivers the code)
- **Self-signup** ("Join the Pack") with a pending-approval gate
- **5-step booking wizard** — pick dog(s) → choose services → date → time slot → confirm
- **Dashboard** — upcoming appointments with countdown, past appointments with "book again", reschedule/cancel
- **Dog management** — add and edit the customer's own dogs
- **Trusted contacts** — emergency contacts / authorised pickups
- **Calendar subscription** — ICS feed for the customer's own appointments

## Tech Stack

- **React 19** + **Vite 7** + **React Router 7**
- **Tailwind CSS 4** with CSS-variable brand design tokens
- **Supabase** (PostgreSQL + Auth + Row Level Security + Edge Functions)
- **React Aria** for accessible components, **Lucide** for icons
- **PWA** via `vite-plugin-pwa`
- Tested with **Vitest** (unit/component) and **Playwright** (e2e)

## Architecture

- **Frontend** — a single-page app served by **Vercel**. `src/index.jsx` routes
  `/customer/*` to the customer portal (`CustomerApp.jsx`) and everything else to the
  staff dashboard (`App.jsx`).
- **Supabase** — Postgres database, Auth, Row Level Security, Realtime and Storage
  (private `dog-photos` bucket).
- **Edge Functions** — backend logic in Deno (notifications, WhatsApp, calendar
  feeds, postcode lookup). See [Edge Functions](#edge-functions) below.
- **External services** — Meta WhatsApp Cloud API, Anthropic Claude (AI
  receptionist), Twilio (SMS + WhatsApp fallback), SendGrid (email), APITier (UK
  postcode lookup), Cloudflare Turnstile (login CAPTCHA), Sentry (error reporting —
  live since 28 August 2026; `npm run check:sentry` verifies it against the
  deployed build. See [docs/error-reporting.md](docs/error-reporting.md)).

Repo layout:

```
src/                    React app (staff + customer)
supabase/migrations/    SQL migrations (run in filename order)
supabase/functions/     Deno Edge Functions
scripts/                seed / migration-check / WhatsApp-flow tooling
docs/                   deep-dive docs (WhatsApp, capacity engine, migrations)
```

## Quick Start

```bash
# Install exactly the locked dependencies
npm ci

# Create .env.local with your Supabase credentials
# (get these from Supabase → Your Project → Connect)
cat > .env.local <<'EOF'
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key-here
EOF

# Start dev server
npm run dev
```

See [`.env.example`](.env.example) for the complete, documented list of environment
variables (browser-visible, server-only, and Edge Function secrets).

## Supabase Setup

1. Create a project at [supabase.com](https://supabase.com)
2. Run every numbered file in `supabase/migrations/` against the SQL Editor, in order
3. Fill in `.env.local` with your project URL and publishable key (see [Frontend env vars](#frontend-env-vars) below)
4. (Optional) Seed sample data: `npm run seed`. The script uses static fixtures only — it never produces "Null" surnames. **Run only against a local Supabase project.** If your dataset has rows with surname literally "Null" (from an external faker pipeline), migration `20260513150000_fix_null_surnames.sql` resets them and adds a CHECK constraint preventing reintroduction.

---

### Frontend env vars

Vite exposes **every variable prefixed `VITE_`** to the browser at build time. Use only non-secret, publicly safe values here.

```bash
# .env.local (git-ignored)
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key-here
```

Get both from **Supabase → Project Settings → API**.

`VITE_SUPABASE_ANON_KEY` is still accepted as a fallback (`src/supabase/client.js` checks it after `VITE_SUPABASE_PUBLISHABLE_KEY`). Prefer the publishable key for new projects.

> **⚠️ `SUPABASE_SERVICE_ROLE_KEY` must never be prefixed `VITE_`.**
> Doing so would embed the service-role key in the browser bundle and bypass Row Level Security entirely. Use it only in trusted local scripts or server-side code.

---

### Provisioning the first owner

Staff access is intentionally sign-in only. Create or invite staff users in Supabase Auth first, then link them to `staff_profiles`. The first owner has to be seeded once via the service-role key:

#### What the script reads

`scripts/seed-first-owner.mjs` looks for these env vars (in order):

| Variable | Required | Notes |
|---|---|---|
| `SUPABASE_URL` | ✓ (primary) | Plain, **no** `VITE_` prefix. Falls back to `VITE_SUPABASE_URL` if unset. |
| `SUPABASE_SERVICE_ROLE_KEY` | ✓ | Server/admin only. Bypasses RLS. |

The script loads `.env.local` automatically if present, then reads `process.env`. Shell exports take priority over `.env.local`.

#### Safe provisioning flow

1. **Create or invite the owner** in **Supabase → Auth → Users** before running the script.
2. **Get the service-role key** from **Supabase → Project Settings → API → service_role**.
3. **Pre-run checklist** — run these before touching secrets:
   ```bash
   git status                  # confirm no uncommitted secret files
   cat .gitignore | grep env   # confirm .env.local is ignored
   ```
   Avoid `git add .` whenever secrets are present locally.
4. **Provide the key** using one of the two methods below, then run the script.
5. **Unset / remove the service-role key** immediately after.
6. **Verify** the new owner record in the `staff_profiles` table.

#### Option A — terminal-only (preferred)

No file ever touches disk:

```bash
export SUPABASE_URL="https://your-project-ref.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"

node scripts/seed-first-owner.mjs your-email@example.com

unset SUPABASE_SERVICE_ROLE_KEY
```

#### Option B — `.env.local` (acceptable, extra care required)

`.env.local` is git-ignored, but the key is at rest on disk until you remove it:

```bash
# .env.local — confirmed in .gitignore
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key-here

# Add temporarily for the one-off script, then delete this line:
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

Run the script:
```bash
node scripts/seed-first-owner.mjs your-email@example.com
```

Then **remove `SUPABASE_SERVICE_ROLE_KEY` from `.env.local` immediately**.

#### After seeding

The new owner can promote or demote others by editing `staff_profiles.role` directly in the Supabase dashboard.

---

### 🛑 Security rules — service-role key

- **Never** commit `.env`, `.env.local`, or any file containing a service-role key.
- **Never** add `SUPABASE_SERVICE_ROLE_KEY` as a Vercel frontend environment variable.
- **Never** use `VITE_SUPABASE_SERVICE_ROLE_KEY` — that prefix makes it browser-visible.
- **Never** paste the service-role key into GitHub issues, PR descriptions, screenshots, log output, or client-side code.
- **Only** use the service-role key in: trusted local admin scripts, server-side code, or Supabase Edge Function secrets (`supabase secrets set`).
- **Rotate immediately** via Supabase → Project Settings → API if the key is ever exposed.

---

### Manual Supabase dashboard settings

These aren't expressible as migrations — set them once per project:

- **Auth → URL Configuration**: set Site URL to your production URL. Add redirect URLs for local development and previews, e.g. `http://localhost:5173/**`, your production `https://.../**`, and any Vercel preview wildcard you use.
- **Auth → Sign In / Providers**: enable Email for staff password login. Enable Phone for the customer portal OTP flow.
- **Auth → Settings → "Leaked password protection"**: turn ON. Checks new passwords against
  HaveIBeenPwned, blocks compromised ones. ⚠️ Requires the **Pro plan** — on Free this toggle
  isn't available, so the security advisor will keep flagging it (known/accepted while the
  project stays on Free; the in-app HIBP check at password-set time is the compensating control).
  Revisit on upgrade.
  Every accepted advisor finding (this one included) is recorded in
  [`supabase/advisors/baseline.json`](supabase/advisors/baseline.json); `npm run check:advisors` diffs the
  live advisors against it, and [docs/supabase-advisors.md](docs/supabase-advisors.md) gives each reason.
- **Database → Extensions → `pg_net`**: move out of the `public` schema (the linter flags `extensions` as the conventional location).

### Customer portal login with Twilio Verify

The customer portal uses Supabase Auth sessions and RLS. Twilio Verify is only the code-delivery provider behind Supabase phone OTP; the browser never calls Twilio directly and no Twilio secret should be added to a `VITE_` variable.

1. In Twilio, create a Verify Service for Smarter Dog. Copy the Verify Service SID, which starts with `VA`.
2. In Supabase, go to **Authentication → Providers → Phone**.
3. Enable the Phone provider.
4. Set the SMS provider to **Twilio Verify**.
5. Add the Twilio Account SID, Twilio Auth Token, and the Verify Service SID. Some Supabase config screens/docs label this field as `message_service_sid`; for Twilio Verify, use the `VA...` Verify Service SID.
6. Keep the app flow as SMS OTP. The frontend calls `signInWithOtp({ phone })`, then `verifyOtp({ phone, token, type: "sms" })`.

Production checks:

- Keep Supabase OTP/rate limits conservative. The customer login UI uses a 60-second resend cooldown.
- Test with a real `humans.phone` value before sharing the portal link.
- After login, the `link_customer_to_human(p_phone)` RPC binds the verified Supabase user to the matching human record. Unknown or already-claimed numbers must not expose customer data.

### WhatsApp AI receptionist

The `whatsapp-agent` Edge Function calls Claude with the full
conversation context and writes draft replies for staff to review.
It never sends a message to the customer directly and never mutates
a booking — both go through guarded paths (`whatsapp-send` and the
`apply_whatsapp_booking_action` RPC).

**Defaults are deliberately conservative.** Every draft is held for
human approval. Auto-send is off everywhere unless you opt in.

Full operational details — function secrets, intent vocabulary,
risk levels, the auto-send allowlist, the kill switch, and the safe
rollout procedure — live in [docs/whatsapp-agent.md](docs/whatsapp-agent.md).

### WhatsApp Flows (interactive booking)

Customers can self-book through an encrypted, form-based WhatsApp Flow
(`whatsapp-flow-endpoint`), guarded by the same 2-2-1 capacity trigger as
the web wizard. **Flow A (Appointment Booking)** is implemented; intake and
cancel/reschedule are planned. Setup, key generation, publishing, and
troubleshooting are in [docs/whatsapp-flows.md](docs/whatsapp-flows.md).

### Capacity engine (2-2-1)

See [docs/capacity-engine.md](docs/capacity-engine.md) for what the
rule does, a worked example, where it lives in code, and the
`salon_config.large_dog_slots` shape.

### Migration history

See [docs/migrations.md](docs/migrations.md). The short version:
run files in filename order against a fresh project; don't blindly
re-run old migrations against prod.

## Edge Functions

Backend logic lives in `supabase/functions/` as Deno Edge Functions (with a
`_shared/` module of common helpers). They fall into a few groups:

- **WhatsApp** — `whatsapp-webhook` (inbound Meta events), `whatsapp-agent` (AI
  receptionist), `whatsapp-send`, `whatsapp-generate-reply`, `whatsapp-flow-endpoint`,
  `whatsapp-register`, `whatsapp-admin`.
- **Notifications** — `notify-booking-confirmed`, `notify-booking-cancelled`,
  `notify-booking-ready`, `notify-booking-reminder`, `notify-waitlist-joined`,
  `notify-customer-welcome`, `resend-booking-notification`.
- **Messaging** — `sms-send`, `reminder-send`, `reminder-sms-fallback`.
- **Customer / utilities** — `customer-phone-on-file`, `apply-customer-confirm`,
  `postcode-lookup`, `calendar-feed`, `calendar-ics`, `dashboard-summary`.

Functions authenticate in-function (HMAC, internal secret, or JWT) rather than at the
gateway. Their secrets are set with `supabase secrets set` — **never** from
`.env.local` (which only feeds the browser build). They deploy automatically via
GitHub Actions (see [Deploy](#deploy)).

## Development

```bash
npm run dev            # start the Vite dev server
npm run build          # production build → dist/
npm run preview        # preview the production build locally

npm test               # run all unit/component tests (Vitest)
npm run test:logic     # logic-only test project
npm run test:component # component test project
npm run test:watch     # watch mode
npm run coverage       # tests with coverage report
npm run e2e            # Playwright end-to-end tests
npm run e2e:ui         # Playwright in UI mode

npm run typecheck      # tsc --noEmit (app + node-tests configs)
npm run lint           # ESLint + import-extension check
npm run check:migrations  # validate migration filenames/order

# WhatsApp Flow tooling
npm run flow:generate-keys
npm run flow:publish
npm run flow:send
```

**End-to-end tests in a hosted sandbox.** `npm run e2e` builds the app and serves it **offline** (sample
data, no Supabase) on port 4173, so it never touches real customer data. Where Playwright cannot download
its own browser (Claude Code on the web pre-installs Chromium at `/opt/pw-browsers/chromium`), point it
at the installed binary; unset, Playwright uses its managed browser exactly as CI does:

```bash
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium npm run e2e -- --project=desktop
```

## Marketing website (`website/`)

The public site smarterdog.co.uk lives under [`website/`](website/) as an
**independent application** — its own `package.json`, lockfile, Vite/Vitest/
Playwright configs and build — imported with full history from
`leamonline/smarter-dog-website` ([ADR 009](docs/architecture/decisions/009-independent-applications-in-one-repository.md)).
Root tooling never touches it; drive it from the root with the `website:*`
scripts, which wrap `npm --prefix website`:

```bash
npm run website:install   # npm ci in website/ (separate node_modules)
npm run website:dev       # Vite dev server for the website
npm run website:lint
npm run website:test      # vitest run
npm run website:coverage
npm run website:build     # → website/dist/
npm run website:e2e       # Playwright (website/e2e)
```

CI for it is `.github/workflows/website.yml`, which runs only for `website/**`
changes. The bookings bar (`ci.yml`) still runs on every pull request because
the `Protect main` ruleset requires its checks by name; root discovery excludes
`website/`, so that run is cheap. Its Bluehost publisher stays **disabled**
until the authorised cutover in
[docs/superpowers/runbooks/2026-09-07-website-publisher-cutover.md](docs/superpowers/runbooks/2026-09-07-website-publisher-cutover.md).
See [`website/MAINTENANCE.md`](website/MAINTENANCE.md) for the site's own
maintenance guide.

## Deploy

### Frontend (Vercel)
Connect this repo — Vercel auto-detects Vite and deploys on every merge to `main`.
Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` (plus any optional
`VITE_*` vars) as Vercel environment variables.

### Edge Functions (GitHub Actions)
`.github/workflows/deploy-edge-functions.yml` redeploys changed functions on push to
`main` (and redeploys everything when `_shared/` changes). It needs the
`SUPABASE_ACCESS_TOKEN` repo secret.

### ⚠️ Database migrations are applied manually
Merging to `main` deploys the frontend and Edge Functions, **but not the database**.
Migrations in `supabase/migrations/` must be applied by hand (Supabase SQL Editor or
CLI). The frontend can otherwise ship ahead of the schema and break production. The
`check-migrations-applied` and `check-migrations-drift` workflows flag any committed
migration that hasn't been applied to prod.

### Manual build
```bash
npm run build   # outputs to dist/
# Serve dist/ with any static file server
```
