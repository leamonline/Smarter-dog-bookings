# CLAUDE.md — Smarter Dog Bookings

> Onboarding for AI agents. Keep it lean; verify against code if anything here looks stale.
> Real customer data flows through production — accuracy and care matter.

## What this is

A booking + management platform for **Smarter Dog Grooming**, shipping **two interfaces from one
codebase**: a **staff dashboard** (`/` — weekly calendar, capacity engine, directories, WhatsApp
inbox, reminders, reports) and a **customer portal** (`/customer` — self-service login, booking
wizard, dog/contact management). Stack: **React 19 + Vite 7 SPA**, **Supabase** (Postgres + Auth +
RLS + Deno Edge Functions), Tailwind 4, deployed on **Vercel** (smarterdog.vercel.app).

## Run it

Package manager **npm**; **Node 20** (matches CI — pinned via `.nvmrc`, so `nvm`/`fnm` auto-switch
on `cd`; CI sets `node-version: 20` explicitly and ignores the file). `.npmrc` sets
`legacy-peer-deps=true`, so use `npm` (not `pnpm`/`yarn`).

```bash
npm install
npm run dev            # Vite dev server on :5173  (needs VITE_ creds, see below)
npm run build          # production build → dist/
npm run preview        # serve the built app
npm run lint           # eslint + scripts/check-import-extensions.mjs
npm run typecheck      # tsc --noEmit (app + tsconfig.node-tests.json)
npm run test           # all Vitest (test:logic = node, test:component = jsdom)
npm run e2e            # Playwright; builds+previews OFFLINE on :4173 with sample data
npm run check:migrations  # validate migration filenames/order
```

**CI bar (`.github/workflows/ci.yml`, Node 20):** `lint → typecheck → check-migrations → test →
build`. Match that before pushing — "builds" alone is not the bar. (E2E runs only on push to `main`
or manual dispatch.) **Without `VITE_` creds in dev**, `npm run dev` falls back to offline
sample-data mode rather than erroring.

## Environment

Names only — never commit values. Full documented list: [.env.example](.env.example).

- **Browser (`VITE_`, bundled into the client — never put a secret here):**
  `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (legacy fallback `VITE_SUPABASE_ANON_KEY`),
  `VITE_TURNSTILE_SITE_KEY`, optional `VITE_SENTRY_DSN` / `VITE_SENTRY_ENVIRONMENT`,
  `VITE_FORCE_OFFLINE` (set `=1` for offline/sample-data mode; used by E2E). Missing Supabase vars
  in a **prod** build is a hard error page; in dev it just goes offline.
- **Server/admin scripts only (NEVER `VITE_`):** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
  (bypasses RLS = root password; used transiently by `scripts/seed-first-owner.mjs`, then delete it).
- **Edge Function secrets** — set via `supabase secrets set`, **not** `.env.local`. Includes
  `ANTHROPIC_API_KEY`, `CLAUDE_MODEL`, `AGENT_CALLBACK_SECRET`, `META_ACCESS_TOKEN`,
  `META_PHONE_NUMBER_ID`, `META_APP_SECRET`, `META_WABA_ID`, `SEND_INTERNAL_SECRET`,
  `AI_ASSISTANT_ENABLED`, `AI_AUTO_SEND_LOW_RISK`, `AI_AUTONOMOUS_BOOKING_ENABLED`,
  `AI_BOOKING_DAILY_CAP`, `FLOW_PRIVATE_KEY`, `FLOW_PASSPHRASE`, `APITIER_API_KEY`, CORS allowlists.
- **GitHub Actions secret:** `SUPABASE_ACCESS_TOKEN` (edge-function deploys).

## Architecture map

Data flow: **UI → hooks → repositories / RPC → Supabase client → Postgres (RLS + triggers).**

- `src/index.jsx` — entry. Routes `/customer/*` → `CustomerApp.jsx`, `/reset-password` standalone,
  everything else → `App.jsx`. If Supabase creds are missing it renders error pages instead.
- **`src/App.jsx` (1013 lines) — read this first.** The staff app: auth gate, all data-hook
  declarations, modal/route map, `SalonProvider`. The clearest map of what data exists and how it flows.
- `src/CustomerApp.jsx` — customer portal's gated onboarding lifecycle (login → human record →
  password → signup approval → profile → dashboard/booking wizard).
- `src/engine/` — **pure TS business logic, zero React**: `capacity.ts` (the 2-2-1 engine),
  `bookingRules.ts` (pricing + the `resolveBookingDisplay` selector), `pricing.ts`, `utilisation.ts`.
- `src/constants/` — salon config: `salon.ts` (slots, services, `LARGE_DOG_SLOTS`, statuses),
  `salonSettings.ts` (config defaults), `salonContact.ts`.
- `src/hooks/` — UI-level state hooks. `src/supabase/hooks/` — data hooks (facades composing focused
  sub-hooks). `src/supabase/repositories/` — transform snake_case DB rows → camelCase app objects.
  `src/supabase/rpc.ts` — RPC wrappers. `src/supabase/client.js` + `customerClient.js` — two clients.
- `supabase/migrations/` — ~141 SQL files, applied in **filename order**, **by hand** (see Gotchas).
  `supabase/functions/` — 24 Deno Edge Functions (`_shared/` is common code).

## Domain rules (the booking logic)

These are the rules most easily broken by a careless change. The capacity rules are enforced in the
**frontend engine** *and* an **authoritative Postgres trigger** (the DB is the source of truth). Deep
dive: [docs/capacity-engine.md](docs/capacity-engine.md).

- **Bookable slots:** `08:30`–`13:00`, **30-minute** intervals (10 slots). `SALON_SLOTS`
  [salon.ts:1](src/constants/salon.ts:1); `SLOT_MINUTES = 30` [utilisation.ts:82](src/engine/utilisation.ts:82).
  ⚠️ **Code diverges from the stated "08:30–15:00":** only **08:30–13:00 is bookable** (13:00 = last
  drop-off, matching the stated 13:00 last-booking); the salon's 15:00 close is not modelled.
- **Open days:** Mon–Wed. `ALL_DAYS` defaults `mon/tue/wed` open [salon.ts:16](src/constants/salon.ts:16);
  at runtime the authoritative open/closed days live in the DB (`day_settings`, read by
  `validate_booking_calendar()`). ⚠️ A second, conflicting default exists — `DEFAULT_BUSINESS_HOURS`
  in [salonSettings.ts:14](src/constants/salonSettings.ts:14) lists Mon–Sat 08:00–17:00; it's a settings
  template, **not** the booking constraint. Don't treat it as the hours.
- **Capacity — the "2-2-1" rule:** each slot holds **2 seats** (2 small/medium dogs, or 1 large dog
  that usually takes the whole slot). The 2-2-1 rule caps throughput across *consecutive* slots: you
  can't have three back-to-back double slots — the offending one drops to 1 seat — so any rolling
  3-slot window holds at most **2+2+1 = 5 dogs** (`MAX_DOGS_PER_SLOT = 5`).
  `getMaxSeatsForSlot` [capacity.ts:38](src/engine/capacity.ts:38); enforced in DB by
  `validate_booking_capacity()` ([migration 20260331083432](supabase/migrations/20260331083432_capacity_trigger.sql)) (original trigger; the live body is now in `20260622100000_daily_dog_cap.sql` — grep `validate_booking_capacity` for the latest).
- **Large dogs:** slot-dependent seat cost + conditional rules (1 seat at 08:30/09:00/12:00; 2-seat
  full takeover at 12:30/13:00; a 12:00 large dog early-closes 13:00). `LARGE_DOG_SLOTS`
  [salon.ts:31](src/constants/salon.ts:31); logic in `canBookSlot` [capacity.ts:261](src/engine/capacity.ts:261).
- **Daily cap:** **14 dogs/day** (`salon_config.daily_dog_cap`), enforced for non-staff only via a
  per-date advisory lock ([migration 20260622100000](supabase/migrations/20260622100000_daily_dog_cap.sql)).
  This is a separate throughput cap, **not** slots×2. Frontend mirror: `findGroupedSlots`
  [capacity.ts:560](src/engine/capacity.ts:560).
- **Double-booking prevention:** same dog can't book the same slot twice (`canBookSlot` +
  unique constraint on `(dog_id, booking_date, slot)` for non-cancelled rows). Concurrent inserts are
  serialised by per-slot + per-date advisory locks in the capacity trigger. Cancelled rows free capacity.
- **Services:** only 4 are bookable — Full Groom, Bath & Brush, Bath & De-shed, Puppy Groom
  ([salon.ts:9](src/constants/salon.ts:9); Puppy Groom is N/A for large). Add-ons: Flea Bath (£10),
  Sensitive Shampoo, Anal Glands.
- **Walk-ins (nail clip, anal gland, ear clean):** ✅ as stated, **not booked at all**. There is no
  walk-in booking type; the WhatsApp agent only recognises them by keyword and replies "pop in
  08:30–13:00 Mon–Wed" (`_shared/agentRisk.ts`).
- **Pregnant dogs:** staff tick `dogs.is_pregnant` (the dog-edit form). A pregnant dog is then
  **blocked from every non-staff booking insert** by the `enforce_dog_not_pregnant()` `BEFORE INSERT`
  trigger on `bookings` (raises `P0001`), while **staff can still book it** (the trigger bypasses on
  `is_staff()` — clinical judgement). The booking wizard also greys out a pregnant dog (preflight only —
  the trigger is the authority). [migration 20260623130000](supabase/migrations/20260623130000_dog_pregnancy_gate.sql).
  (Separately, "pregnan" is also a WhatsApp medical keyword that escalates a chat to a human in
  `_shared/agentRisk.ts`.)

## Conventions

- **JS-first, TS bolted on:** ~189 `.js/.jsx` vs ~36 `.ts/.tsx`; `tsconfig` has `checkJs: false`, so
  `.js` files get **no** type checking. New logic-heavy code → `.ts`/`.tsx`; React components are
  usually `.jsx`. Engine/logic in TS, UI in JSX.
- **No Redux.** State = React Context (`SalonContext`, `ToastContext`) + custom hooks. Data hooks are
  facades composing focused sub-hooks with stable references. Repositories own the snake_case↔camelCase
  boundary — keep DB column names out of components.
- **No bare `console` in `src/`** (ESLint) — use [src/lib/logger.ts](src/lib/logger.ts) (forwards
  errors to Sentry).
- **Import extensions:** never write a `.js`/`.jsx` extension on a relative import whose target is
  actually `.ts`/`.tsx` — `scripts/check-import-extensions.mjs` fails `npm run lint`. Use extensionless
  specifiers (run with `--fix` to auto-rewrite).
- **Constants over literals:** statuses via `BOOKING_STATUS`, sizes via `DOG_SIZE`, all from
  `constants/salon.ts`. Render booking text only through `resolveBookingDisplay()` — never show a raw
  dog/owner UUID.
- **Tests colocated:** `*.test.ts/js` → logic project; `*.component.test.jsx/tsx` → component project.

## Gotchas & landmines

- **The capacity engine is implemented THREE times** and must stay in sync: `src/engine/capacity.ts`
  (frontend), `supabase/functions/_shared/capacity.ts` (Deno, ~line-for-line duplicate), and the
  Postgres trigger ([20260331083432](supabase/migrations/20260331083432_capacity_trigger.sql), original trigger; the live body is now in `20260622100000_daily_dog_cap.sql` — grep `validate_booking_capacity` for the latest). Change one rule → change all three.
- **Migrations are applied to prod BY HAND.** Merging to `main` deploys the frontend (Vercel) and
  changed Edge Functions (GH Action) **but not the database** (README §"⚠️ Database migrations").
  Apply a migration to prod **before** merging code that depends on it, or prod breaks. CI's
  `check-migrations-applied` gates this; a daily `check-migrations-drift` job backstops it. Keep
  migrations **idempotent**; don't `db push` or blind-rerun (early migrations aren't idempotent;
  prod history has known gaps). See [docs/migrations.md](docs/migrations.md).
- **`vite.config.js` manual chunks must use `rollupOptions`, not `rolldownOptions`** — the wrong key is
  silently ignored and ships one 443 KB chunk that thrashes the PWA precache. A logic test guards it.
- **Local dev hits the LIVE cloud Supabase** (real PII) unless offline. Offline mode
  (`VITE_FORCE_OFFLINE=1`, or missing creds in dev) serves `src/data/sample.js` — use it for visual
  checks and E2E so you never touch real customer data.
- **Customers cannot raw-INSERT bookings.** The only customer write path is the
  `create_customer_booking_group` RPC (SECURITY DEFINER; validates ownership + takes authoritative size
  from `dogs.size`). Staff INSERT directly via RLS. Don't re-add a customer INSERT policy.
- **Every non-staff booking insert passes three `BEFORE INSERT` gates on `bookings`** — calendar
  (`enforce_booking_calendar`), capacity (`validate_booking_capacity`), and pregnancy
  (`enforce_dog_not_pregnant`) — each bypassing on `is_staff()`. All raise **P0001**; the wizard maps on
  `error.code` / message, so preserve it. The gates are **table-level**, so any new booking route (RPC,
  Edge Function, future path) inherits all three automatically — don't re-implement them per-RPC.
- **Two Supabase clients** (`client.js` staff, `customerClient.js` customer) use separate auth storage
  keys so sessions don't clobber each other. Keep them separate.
- **WhatsApp auto-send / autonomous booking are OFF by default** behind 5 gates + a kill switch
  (`AI_ASSISTANT_ENABLED`); booking-touching intents never auto-send (unit-test-enforced). Don't loosen
  casually. See [docs/whatsapp-agent.md](docs/whatsapp-agent.md).
- **Staff Web Push (additive, staff-only):** installed-PWA staff can opt in (Settings → Your Account →
  Device notifications) to a device push for new messages/bookings/cancellations/reschedules/signups/
  waitlist. Dark-launched behind `STAFF_PUSH_ENABLED` (default off); changes NOTHING for customers or
  un-enabled staff. New `notify-staff` edge fn + `_shared/webpush.ts` (pure Web Crypto VAPID/RFC-8291) +
  `_shared/staffPush.ts` + AFTER-INSERT triggers on `booking_events`/`whatsapp_messages`/`salon_todos`/
  `waitlist_entries` (each swallows POST errors so it can't roll back a write). iOS needs
  Add-to-Home-Screen (16.4+). Don't fold it into the customer `notify-*` fns or
  `salon_config.settings.notifications`. See [docs/staff-web-push.md](docs/staff-web-push.md).
- **Known debt (don't be surprised):** ~12 components import `supabase` directly (bypassing
  hooks/repositories); realtime channel names aren't centralised (double-mount in HMR can collide);
  `as any` clusters in reports/booking-wizard/slot-availability. See `TECHNICAL-DEBT-REGISTER.md`.

## Guardrails for Claude Code

- **Work on a branch off `main`.** `main` **auto-deploys to Vercel production** (smarterdog.vercel.app)
  and auto-deploys changed Edge Functions — never push untested work there. DB migrations do **not**
  auto-apply; apply them to prod first.
- **Never** commit `.env*`, secrets, or the service-role key; **never** put a secret behind a `VITE_`
  prefix (it ships to the browser).
- **High-risk — explain the change before making it:** RLS policies, auth, the capacity / booking-
  conflict engine and its DB trigger, and the booking write-path RPCs. Real customer bookings depend on
  these; a silent break can overbook or expose data.
- **The bar is "lint + typecheck + check:migrations + test + build all pass"** (what CI runs), not
  "looks done." Run `npm run test` (not just `npm run build`) for UI/logic changes.
- Treat `README.md` and `docs/` (capacity-engine, migrations, whatsapp-agent, whatsapp-flows) as
  canonical for deep dives rather than re-deriving.
