# Keep development and previews away from production messaging

Status: Active — step 1 in progress
Issue: #875
Base: origin/main, a457024
Last verified: 2026-09-28
Owners: dev/preview runtime configuration (`package.json`, `vite.config.js`,
`src/supabase/client.ts`), shared edge CORS (`supabase/functions/_shared/cors.ts`),
outbound send helpers, documentation
Dependencies: None. Vercel project environment variables are an external
configuration change that needs the owner's approval.
Related requirements: None recorded
Related ADRs: None

## Goal

A developer running `npm run dev`, or anyone opening a Vercel preview, cannot
cause a real WhatsApp, SMS or email to reach a real customer, and does not read
production customer data, unless they have deliberately opted in to doing so.

## Why

#875 documents that every runtime surface points at production. Staff actions
in a dev session send real messages from the salon's WhatsApp number, and any
booking insert against production fires a real confirmation through database
triggers. The only protection is `VITE_FORCE_OFFLINE=1`, which is set for
Vitest and Playwright but not for `npm run dev` or preview builds.

## Current behaviour

Verified on `a457024`, 28 September 2026 (file:line references from that commit).

**Browser**
- `src/supabase/client.ts:8-22` connects to whatever `VITE_SUPABASE_URL` names
  unless `VITE_FORCE_OFFLINE === "1"`. There is no development-versus-production
  check, so a `.env.local` with production credentials makes `npm run dev` a
  production client.
- `package.json:10` `"dev": "vite"` does not set offline mode.
- `vercel.json` sets no environment variables, so preview builds use the
  project-level (production) Supabase configuration.

**Edge function CORS**
- `_shared/cors.ts:8-17` includes `http://localhost:5173` and `:5174` in
  `DEFAULT_ALLOWED_ORIGINS`, so a local dev server is a first-class caller of
  the production send functions. Per-function `*_ALLOWED_ORIGINS` secrets
  override the default when set; which production functions set them has not
  been checked (needs `supabase secrets list`, names only).
- Preview origins (`*-smarterdog.vercel.app` branch hosts) are **not** in the
  default list, so a preview's browser calls to send functions already fail
  their CORS preflight. Previews still write to production tables, which is
  enough to fire the database triggers below.

**Where messages actually leave** (five fetch sites)
- Meta WhatsApp: `whatsapp-send/index.ts:222`, the only Graph `/messages` call.
  `notify-booking-confirmed`, `notify-booking-reminder`, `reminder-send`,
  `broadcast-message`, `notify-customer-welcome`, `apply-customer-confirm` and
  `whatsapp-agent` all reach it over internal HTTP.
- Twilio SMS and Twilio-WhatsApp: `_shared/twilio.ts:103` `postMessage()`.
  `notify-booking-ready`, `notify-booking-cancelled` and `notify-waitlist-joined`
  send Twilio-WhatsApp **directly**, bypassing `whatsapp-send`.
- Email: `_shared/email.ts:8` `sendEmail()`.
- Web Push: `_shared/webpush.ts:265`, staff only, behind `STAFF_PUSH_ENABLED`.
- Slack: `slack-alerts/index.ts:193`, internal only, behind `SLACK_ALERTS_ENABLED`
  and `SLACK_ALERTS_DRY_RUN`.

None of the three customer channels (Meta, Twilio, SendGrid) has a dry-run flag,
recipient allowlist or environment check.

**Triggers that send without any browser**
- `20260916120000_guard_outbound_notification_triggers.sql`:
  `notify_on_booking_insert`, `notify_on_booking_cancelled`,
  `notify_waitlist_joined_trigger` and `fire_whatsapp_agent`, which reach
  functions via `get_supabase_url()`. The "guard" only swallows errors.
- pg_cron: `20260906120000_late_reminder_pass.sql` (reminders at 18:00 and 19:00),
  and `reminder-sms-fallback-hourly` in `20260615120000` with the production ref
  hard-coded in its URL.

**Correction to #875.** The issue proposes a send-side guard (its option 2) as
the main fix. That guard runs **inside the production function**, so it cannot
tell whether the request came from a laptop or from the salon. It protects a
staging project, not production. Stopping dev and previews from reaching
production has to happen on the client side: which project the app connects to
and which origins production accepts.

## Desired behaviour

- `npm run dev` runs on sample data by default. Connecting a dev server to a
  real project is a separate, explicitly named command, and the app shows a
  persistent banner naming the project it is connected to.
- Vercel preview builds run on sample data. A preview build that would connect
  to production fails the build rather than deploying.
- Production send functions refuse browser calls from `localhost` unless an
  explicit per-function secret re-enables it.
- Production behaviour for the salon and customers is unchanged.

## Scope

- npm scripts, `src/supabase/client.ts`, a small connection banner, and a build
  guard in `vite.config.js` (or `scripts/`).
- `_shared/cors.ts` default origin list.
- Vercel Preview environment variables (owner action).
- Documentation: `CLAUDE.md`, `README.md`, `.env.example`, `docs/migrations.md`
  (what the staging project is), and #875 itself.

## Non-goals

- Turning `Smarter-dog-grooming-staging` into a full staging environment (seed
  data, deployed functions, separate WhatsApp number and secrets). That is #875
  option 1. It stays a separate decision; this plan neither blocks nor requires it.
- Changing any production send, trigger, template or schedule.
- Moving the hard-coded production ref in `reminder-sms-fallback-hourly`. Worth
  its own small issue; it only matters once a second project runs cron.

## Implementation sequence

Each step is its own pull request and can ship independently. 1 and 2 give most
of the protection.

1. **Dev defaults to offline.** `"dev"` sets `VITE_FORCE_OFFLINE=1` (cross-platform,
   so via a tiny node wrapper or Vite `--mode`, not a shell prefix). Add
   `"dev:live"` that does not. In live mode, `client.ts` exposes the connected
   project ref and the staff and customer shells render a fixed banner such as
   "Connected to PRODUCTION (nlzhllhkigmsvrzduefz)". Tests: a logic test that
   the `dev` script forces offline, and a component test for the banner.
   No production effect.
2. **Previews offline, and a build guard.** The owner sets
   `VITE_FORCE_OFFLINE=1` on Vercel's **Preview** environment only. In the repo,
   add a build-time check: when `VERCEL_ENV === "preview"` and offline mode is
   not set, fail the build with a clear message. That way a missing variable
   stops a deploy instead of silently pointing at production. Tests: a logic
   test of the guard function. Rollout: set the Vercel variable **before**
   merging, or every preview build fails.
3. **Drop localhost from the production CORS default.** Remove the two
   `localhost` entries from `DEFAULT_ALLOWED_ORIGINS`. Anyone who genuinely
   needs a live dev session against production edge functions sets that
   function's `*_ALLOWED_ORIGINS` secret deliberately. First, list which
   `*_ALLOWED_ORIGINS` secrets exist in production (names only), because an
   existing override would keep localhost regardless of the default. Deploys
   through the normal edge-function workflow. Tests: the existing CORS tests,
   plus one asserting no `localhost` in the default.
4. **Dropped (decision 3, 2026-09-28).** Was: *(optional, recommended only if staging is pursued)* An outbound guard in
   the three customer send sites (`whatsapp-send` fetch, `_shared/twilio.ts`,
   `_shared/email.ts`). It derives the project ref from `SUPABASE_URL`; on any
   project other than production it sends only to an `OUTBOUND_TEST_RECIPIENTS`
   allowlist and logs the rest. It is a no-op on production by construction and
   reuses the ref pattern in `scripts/run-hosted-pgtap.sh`.

## Security and privacy

- Steps 1 and 2 also stop dev and previews from **reading** production customer
  data, not just sending. That is a larger privacy win than #875 claims for
  them.
- No secrets change hands. The banner shows only the public project ref.
- Step 3 narrows the production attack surface slightly (fewer allowed origins).

## Risks

- **Someone relies on live dev today.** After step 1 they must run
  `npm run dev:live`. This is intended friction; the banner makes the choice
  visible.
- **The Vercel variable isn't set before step 2 merges.** Every preview build
  fails. The failure is loud and harmless, and the message names the fix.
- **A production `*_ALLOWED_ORIGINS` secret already lists localhost.** Step 3
  would then change nothing for that function. This is why step 3 starts by
  listing secret names.
- **Preview reviewers lose real data.** Previews become sample-data only. That
  suits UI review but not debugging against real bookings, which belongs in
  `dev:live` on a trusted machine.

## Testing

`npm run lint`, `check:docs`, `typecheck`, `check:migrations`, `test` and
`build` for every step, plus the focused tests named in each step. Step 3 also
runs `npm run check:edge-types` and the edge CORS tests.

## Observability

- Step 1: the banner and the script test.
- Step 2: a preview deployment shows sample data. The build log shows the guard
  passing, and a deliberately misconfigured preview is shown to fail.
- Step 3: an `OPTIONS` preflight from `http://localhost:5173` to production
  `whatsapp-send` returns no `Access-Control-Allow-Origin`. Checked once after
  deploy.

## Documentation updates

- `CLAUDE.md` "Local dev hits the LIVE cloud Supabase" gotcha: invert it to
  "dev is offline unless you run `dev:live`".
- `README.md` run instructions, `.env.example` comments.
- `docs/migrations.md`: a short "The staging project" section (what it is and
  isn't), as #875 recommends.
- Close #875 once steps 1–3 land. Record step 4 and full staging as separate
  issues if wanted.

## Definition of done

- `npm run dev` with production credentials in `.env.local` shows sample data.
- `npm run dev:live` connects and shows the named-project banner.
- A preview deployment shows sample data, and a preview without the variable
  fails to build.
- Production functions no longer grant CORS to `localhost` by default,
  confirmed by the preflight check above.
- All CI checks green. Docs updated and #875 updated or closed.

## Decisions (owner, 2026-09-28)

1. Nobody uses `npm run dev` against production on purpose. Step 1 keeps
   `dev:live` as a cheap, explicit escape hatch rather than removing the path.
2. Sample-data previews are acceptable. Step 2 proceeds as written.
3. No staging environment for now. Step 4 is dropped, and the staging project
   remains a migration-rehearsal target only.

Delivery note: step 1 ships in the same pull request as this plan
(#913), because the session has one working branch. Steps 2 and 3 follow
separately.

## Open questions as originally asked

1. **Is anyone using `npm run dev` against production on purpose?** For
   example, to debug a live issue. If so, `dev:live` keeps that possible, but
   it's worth knowing who uses it.
2. **Are sample-data previews acceptable?** The alternative is pointing
   previews at the staging project, but it has no data and no functions today,
   so it would be worse than sample data until #875 option 1 is done.
3. **Do you want a real staging environment eventually?** If not, step 4 can
   be dropped, and the staging project stays a migration-rehearsal target only.
