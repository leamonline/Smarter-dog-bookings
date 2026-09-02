# CLAUDE.md — Smarter Dog Bookings

> Onboarding for AI agents. Keep it lean; verify against code if anything here looks stale.
> Real customer data flows through production — accuracy and care matter.
>
> Read [`AGENTS.md`](AGENTS.md) and [`PROJECT.md`](PROJECT.md) first. They are
> the tool-neutral authority; this file adds repository detail useful to Claude.

## What this is

A booking + management platform for **Smarter Dog Grooming**, shipping **two interfaces from one
codebase**: a **staff dashboard** (`/` — weekly calendar, capacity engine, directories, WhatsApp
inbox, reminders, reports) and a **customer portal** (`/customer` — self-service login, booking
wizard, dog/contact management). Stack: **React 19 + Vite 7 SPA**, **Supabase** (Postgres + Auth +
RLS + Deno Edge Functions), Tailwind 4, deployed on **Vercel** (smarterdog.vercel.app).

## Run it

Package manager **npm**; **Node 24** (matches CI — pinned via `.nvmrc`, so `nvm`/`fnm` auto-switch
on `cd`; every workflow sets `node-version: 24` explicitly and ignores the file). `package.json`
declares `engines.node: >=24`, so **`npm ci` hard-fails on an older Node** — that is the intended
signal, not a broken checkout. `.npmrc` sets `legacy-peer-deps=true`, so use `npm` (not
`pnpm`/`yarn`). [docs/node-runtime.md](docs/node-runtime.md) is canonical; `.nvmrc`,
`engines.node` and every workflow pin must change in one commit, and
[a test](src/security/nodeRuntimeConsistency.test.ts) fails if they disagree.

```bash
npm ci
npm run dev            # Vite dev server on :5173  (needs VITE_ creds, see below)
npm run build          # production build → dist/
npm run preview        # serve the built app
npm run lint           # eslint + repo check scripts (import extensions, duplicate files,
                       #   lockfile platform, hosted-Supabase target guard)
npm run typecheck      # tsc --noEmit (app + tsconfig.node-tests.json)
npm run test           # all Vitest (test:logic = node, test:component = jsdom)
npm run e2e            # Playwright; builds+previews OFFLINE on :4173 with sample data
                       #   (sandbox: PLAYWRIGHT_CHROMIUM_EXECUTABLE=/opt/pw-browsers/chromium)
npm run check:migrations  # validate migration filenames/order
npm run check:sentry   # is browser error reporting actually live on prod? (ACTIVE/INACTIVE)
npm run check:advisors # diff the hosted Supabase advisors against supabase/advisors/baseline.json
                       #   (needs SUPABASE_ACCESS_TOKEN; --update rewrites the baseline)
```

**CI bar (`.github/workflows/ci.yml`, Node 24):** `lint → check:docs → typecheck → check-migrations →
test → build`. Match that before pushing — "builds" alone is not the bar. (E2E: a pull request runs
every spec once on desktop Chromium plus WebKit smoke, via `pr-production-smoke`; the full
desktop/tablet/mobile matrix runs on push to `main` or manual dispatch.) **Without `VITE_` creds in
dev**, `npm run dev` falls back to offline sample-data mode rather than erroring.

## Environment

Names only — never commit values. Full documented list: [.env.example](.env.example).

- **Browser (`VITE_`, bundled into the client — never put a secret here):**
  `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (legacy fallback `VITE_SUPABASE_ANON_KEY`),
  `VITE_TURNSTILE_SITE_KEY`, `VITE_SENTRY_DSN` / `VITE_SENTRY_ENVIRONMENT` (error reporting is
  **LIVE in prod** since 28 Aug 2026 — verify with `npm run check:sentry`; see
  [docs/error-reporting.md](docs/error-reporting.md)),
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
- **`src/App.jsx` — read this first.** The staff shell: auth gate, then `AuthedApp` composes
  `useStaffAppData` (every data hook, online/offline resolved — [src/hooks/useStaffAppData.ts](src/hooks/useStaffAppData.ts)),
  `useBookingSession` (new-booking drawer session + park/resume), `useProfileRouting` (`/dogs/:id`,
  `/humans/:id` ↔ profile modals), `SalonProvider`, the route map
  ([StaffRoutes.jsx](src/components/layout/StaffRoutes.jsx)) and the modal stack
  ([StaffModals.jsx](src/components/layout/StaffModals.jsx)). `useStaffAppData` is the clearest map of
  what data exists and how it flows; a ratchet test (`src/appShell.test.ts`) keeps App.jsx thin. Staff
  views read shared salon data and core actions via `useSalon()` ([SalonContext.tsx](src/contexts/SalonContext.tsx))
  and take only their per-view controls as props — follow that shape for new views.
- `src/CustomerApp.jsx` — customer portal's gated onboarding lifecycle (login → human record →
  password → signup approval → profile → dashboard/booking wizard).
- **`/today` live salon board** — the **default staff landing** (`/` stays the calendar). Each dog is
  a **token** in the zone that says where it physically is — Arriving → With us → Ready → Gone home —
  so position carries the status and a press opens that dog's actions. Zones are the existing lanes
  relabelled: no new statuses, no new transitions. Plus six decision reports (2A–2F) on `/reports`.
  Pure engines drive both; deep dive: [docs/today-command-centre.md](docs/today-command-centre.md).
- `src/engine/` — **pure TS business logic, zero React**: `capacity.ts` (the 2-2-1 engine),
  `bookingRules.ts` (pricing + the `resolveBookingDisplay` selector), `pricing.ts`, `utilisation.ts`,
  `today.ts` (Today-view selectors), `londonTime.ts` (shared Europe/London wall-clock helpers),
  `salonBoard.ts` (the `/today` board: zone mapping, priority gravity, per-state actions, drag
  legality, undo), `dailyBrief.ts`, `reportsAnalytics.ts` + `denials.ts` (decision-report maths;
  `denials.ts` maps gate rejections → stable reason codes), and the booking-funnel telemetry trio
  `funnel.ts` / `funnelBlockers.ts` / `confirmFailure.ts` (why wizard attempts stall or a confirm
  produced no booking — DB-visible via `booking_funnel_events`).
- `src/constants/` — salon config: `salon.ts` (slots, services, `LARGE_DOG_SLOTS`, statuses),
  `salonSettings.ts` (config defaults), `salonContact.ts`.
- `src/hooks/` — UI-level state hooks. `src/supabase/hooks/` — data hooks (facades composing focused
  sub-hooks). `src/supabase/repositories/` — transform snake_case DB rows → camelCase app objects.
  `src/supabase/rpc.ts` — RPC wrappers. `src/supabase/client.js` + `customerClient.js` — two clients.
- `supabase/migrations/` — ordered SQL history, applied in **filename order**, **by hand** (see Gotchas).
  `supabase/functions/` — Deno Edge Functions (`_shared/` is common code). Do not hardcode
  counts in documentation; discovery checks should enumerate them.

## Domain rules (the booking logic)

These are the rules most easily broken by a careless change. The capacity rules are enforced in the
**frontend engine** *and* an **authoritative Postgres trigger** (the DB is the source of truth). Deep
dive: [docs/capacity-engine.md](docs/capacity-engine.md).

- **Bookable slots:** the canonical grid is `08:30`–`13:00`, **30-minute** intervals (10 slots) —
  `SALON_SLOTS` [salon.ts](src/constants/salon.ts#L1); `SLOT_MINUTES = 30` [utilisation.ts](src/engine/utilisation.ts#L85).
  Staff can add per-date **extra slots** after 13:00 (`day_settings.extra_slots`); the bookable grid
  for a date is `active_slots_for(date)` = canonical ∪ sanitised extras
  ([migration 20260702170000](supabase/migrations/20260702170000_extra_slots_bookable.sql); TS mirror
  `buildSlotGrid` in [slotGrid.ts](src/engine/slotGrid.ts) + `_shared/salonConstants.ts`). Extra slots
  reach **customers only as same-day "last minute" openings** (see below); staff book them any day.
  Large dogs are never extra-slot eligible.
- **Open days:** Mon–Wed. `ALL_DAYS` defaults `mon/tue/wed` open [salon.ts](src/constants/salon.ts#L35);
  at runtime the authoritative open/closed days live in the DB (`day_settings`, read by
  `validate_booking_calendar()`). ⚠️ A second, conflicting default exists — `DEFAULT_BUSINESS_HOURS`
  in [salonSettings.ts](src/constants/salonSettings.ts#L15) lists Mon–Sat 08:00–17:00; it's a settings
  template, **not** the booking constraint. Don't treat it as the hours.
- **Capacity — the "2-2-1" rule:** each slot holds **2 seats** (2 small/medium dogs, or 1 large dog
  that usually takes the whole slot). The 2-2-1 rule caps throughput across *consecutive* slots: you
  can't have three back-to-back double slots — the offending one drops to 1 seat — so any rolling
  3-slot window holds at most **2+2+1 = 5 dogs** (`MAX_DOGS_PER_SLOT = 5`).
  `getMaxSeatsForSlot` [capacity.ts](src/engine/capacity.ts#L38); enforced in DB by
  `validate_booking_capacity()` ([migration 20260331083432](supabase/migrations/20260331083432_capacity_trigger.sql)) (original trigger; the latest baseline definition is in [migration 20260712115759](supabase/migrations/20260712115759_legal_risk_tranche1.sql) — always search every migration for qualified and unqualified definitions before editing).
- **Large dogs:** slot-dependent seat cost + conditional rules (1 seat at 08:30/09:00/12:00; 2-seat
  full takeover at 12:30/13:00; a 12:00 large dog early-closes 13:00). `LARGE_DOG_SLOTS`
  [salon.ts](src/constants/salon.ts#L50); logic in `canBookSlot` [capacity.ts](src/engine/capacity.ts#L282).
- **Daily cap:** **14 dogs/day** (`salon_config.daily_dog_cap`), enforced for non-staff only via a
  per-date advisory lock ([migration 20260622100000](supabase/migrations/20260622100000_daily_dog_cap.sql)).
  This is a separate throughput cap, **not** slots×2. Frontend mirror: `findGroupedSlots`
  [capacity.ts](src/engine/capacity.ts#L618).
- **Double-booking prevention:** same dog can't book the same slot twice (`canBookSlot` +
  unique constraint on `(dog_id, booking_date, slot)` for non-cancelled rows). Concurrent inserts are
  serialised by per-slot + per-date advisory locks in the capacity trigger. Cancelled rows free capacity.
- **Same-day ("last minute") booking:** customers can book **today** only when staff flag the slot
  ("Open for immediate booking" on today's staff calendar → `day_settings.immediate_slots`), and only
  until **30 minutes before** the slot (Europe/London). Authority: `validate_booking_calendar()` +
  the availability RPCs + `get_immediate_slots()`
  ([migration 20260702130000](supabase/migrations/20260702130000_last_minute_immediate_slots.sql));
  `IMMEDIATE_CUTOFF_MINUTES` is mirrored in `salon.ts`/`salonConstants.ts` for UI gating only. A
  multi-dog group needs **every** assigned slot flagged. Future dates unchanged (portal: tomorrow+28;
  the WhatsApp Flow shows "Today — last minute" when flagged).
- **Services:** only 4 are bookable — Full Groom, Bath & Brush, Bath & De-shed, Puppy Groom
  ([salon.ts](src/constants/salon.ts#L28); Puppy Groom is N/A for large). Add-ons: Flea Bath (£10),
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

- **JS-first, TS bolted on:** ~357 `.js/.jsx` vs ~114 `.ts/.tsx` (non-test); `tsconfig` has `checkJs: false`, so
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
  Postgres trigger (originally [20260331083432](supabase/migrations/20260331083432_capacity_trigger.sql); latest baseline definition [20260712115759](supabase/migrations/20260712115759_legal_risk_tranche1.sql)). Search every migration before editing because later migrations can replace the function. Change one rule → change all three, and add the scenario to the one governed list
  (`src/engine/capacityParityFixtures.ts`) that every parity harness reads — browser↔Deno
  (`src/lib/whatsapp/capacityParity.test.ts`) and browser↔PostgreSQL
  (`src/engine/capacityParityFixtures.test.ts` + `supabase/tests/036_capacity_parity.test.sql`).
- **Migrations are applied to prod BY HAND.** Merging to `main` deploys the frontend (Vercel) and
  changed Edge Functions (GH Action) **but not the database** (README §"⚠️ Database migrations").
  Apply a migration to prod **before** merging code that depends on it, or prod breaks. CI's
  `migrations-applied` check supplies evidence for added migrations, but nothing now *enforces* that
  evidence before merge — `main` is unprotected, so this is a discipline, not a gate. A daily
  `check-migrations-drift` job backstops it. Keep
  migrations **idempotent**; don't `db push` or blind-rerun (early migrations aren't idempotent;
  prod history has known gaps). See [docs/migrations.md](docs/migrations.md).
- **`vite.config.js` manual chunks must use `rollupOptions`, not `rolldownOptions`** — the wrong key is
  silently ignored and ships one 443 KB chunk that thrashes the PWA precache. A logic test guards it.
- **Local dev hits the LIVE cloud Supabase** (real PII) unless explicitly put in demo mode.
  Demo/sample-data mode (`VITE_FORCE_OFFLINE=1`, or missing creds in dev) serves
  `src/data/sample.js`; it is deterministic test data, not durable offline production operation.
  Use it for visual checks and E2E so you never touch real customer data.
- **Use `npm ci` locally, not `npm install`.** A darwin `npm install` silently strips the Linux
  `libc` (glibc/musl) metadata from `package-lock.json` for 12 Linux-only optional binaries, and
  CI runs `npm ci` on ubuntu-latest where that discriminator matters. It has been committed
  accidentally twice. `npm run lint` now fails via `scripts/check-lockfile-platform.mjs`; the fix
  is `git restore package-lock.json`. Only run `npm install` when deliberately changing deps.
- **`deno.lock` drifts on every Dependabot bump.** It mirrors `package.json`'s dependency ranges
  under `workspace.packageJson`, but Dependabot only updates `package.json`/`package-lock.json` —
  so the next `deno test` rewrites it and dirties your tree. Resync it in its own commit; never
  let it ride along in a feature commit.
- **Tests are forced offline and must stay that way.** `vitest.config.ts` sets
  `VITE_FORCE_OFFLINE: "1"` on **every** project, so `npm run test` never builds a Supabase client
  even though your `.env.local` holds real production credentials (Vitest loads `.env` files exactly
  like Vite). This lives in committed config on purpose — it replaced an untracked `.env.test.local`
  that silently went missing. Don't add per-file overrides or a new project without `env: offlineEnv`;
  [src/supabase/offlineTestGuard.test.ts](src/supabase/offlineTestGuard.test.ts) fails if you do.
- **Customers cannot raw-INSERT bookings.** The only customer write path is the
  `create_customer_booking_group` RPC (SECURITY DEFINER; validates ownership + takes authoritative size
  from `dogs.size`). Staff INSERT directly via RLS. Don't re-add a customer INSERT policy.
- **Every non-staff booking insert passes three `BEFORE INSERT` gates on `bookings`** — calendar
  (`enforce_booking_calendar`), capacity (`validate_booking_capacity`), and pregnancy
  (`enforce_dog_not_pregnant`) — each bypassing on `is_staff()`. All raise **P0001**, and since
  [migration 20260826120000](supabase/migrations/20260826120000_gate_reason_codes.sql) every gate also
  emits a **stable machine-readable reason code in the exception's `DETAIL` field** (e.g.
  `capacity_2_2_1`, `daily_cap`, `seat_blocked`, `pregnant`) alongside — never instead of — the human
  message. `mapDenialReason` in [denials.ts](src/engine/denials.ts) prefers `DETAIL` and falls back to
  prose matching; the wizard and denial telemetry depend on both, so preserve the code, the DETAIL
  contract, and the message shape (governed by `denialCodeContract.test.ts`). The gates are **table-level**, so any new booking route (RPC,
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
- **Applying migrations to production — standing permission, granted 18 August 2026.** Claude Code
  may apply a migration to the live project **via the Supabase MCP (`apply_migration`)** when the
  change needs one. This is a real production write against real customer data, so it carries
  conditions, all of them non-optional:
  1. **Show the SQL first.** Post it before running it — the operator sees what is applied, not just
     that something was.
  2. **Apply to prod BEFORE merging** the code that depends on it. Never the reverse: that ordering
     is what broke the Settings save in June 2026 (see `check-migrations-applied.yml`).
  3. **Confirm the migration is idempotent before applying, and never blind-rerun.** Early migrations
     are not idempotent and prod history has known gaps — see [docs/migrations.md](docs/migrations.md).
  4. **Verify afterwards with the `migrations-applied` check**, which queries prod's
     `supabase_migrations.schema_migrations` directly. That is independent evidence; Claude's own
     report is not.
  5. **Say so explicitly**, including when an apply fails or half-lands. Since the human merge-control
     attestation was removed (also 18 August 2026) nothing prompts for a migration disposition, so
     stating it plainly is the only remaining signal.
  Permission covers the Supabase MCP only. It is **not** permission to hold or use the service-role
  key, which stays a transient, human-only credential per the bullet below. If the Supabase connector
  is unauthorised, say so and stop — do not improvise another write path.
- **Never** commit `.env*`, secrets, or the service-role key; **never** put a secret behind a `VITE_`
  prefix (it ships to the browser).
- **High-risk — explain the change before making it:** RLS policies, auth, the capacity / booking-
  conflict engine and its DB trigger, and the booking write-path RPCs. Real customer bookings depend on
  these; a silent break can overbook or expose data.
- **The bar is "lint + check:docs + typecheck + check:migrations + test + build all pass"** (what CI runs), not
  "looks done." Run `npm run test` (not just `npm run build`) for UI/logic changes.
- Treat `README.md` and `docs/` (capacity-engine, migrations, whatsapp-agent, whatsapp-flows) as
  canonical for deep dives rather than re-deriving.
