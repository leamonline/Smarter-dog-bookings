# SmarterDog — Salon Dashboard

A booking and management dashboard for dog grooming salons. Built with React + Vite + Supabase.

## Features

- **Weekly calendar** with slot-based booking (08:30–13:00)
- **Capacity engine** — enforces the 2-2-1 rule for large dogs
- **Booking workflow** — Not Arrived → Checked In → In Bath → Ready for Pick-up → Completed
- **Dogs & Humans directories** — full contact management with alerts, notes, and trusted contacts
- **WhatsApp inbox** — two-way customer messaging with AI-drafted replies and AI-proposed booking actions, staff-approved before anything goes live
- **Waitlist** — track overflow requests and notify when slots open
- **Calendar feeds** — per-user ICS feeds for staff and customers
- **Groom photos** — before/after shots stored per booking
- **Role-based auth** — owner vs staff access levels
- **Offline mode** — works without Supabase using sample data
- **Responsive** — optimised for tablet (front desk) and mobile

## Quick Start

```bash
# Install dependencies
npm install

# Create .env.local with your Supabase credentials
# (get these from Supabase → Your Project → Connect)
cat > .env.local <<'EOF'
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key-here
EOF

# Start dev server
npm run dev
```

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
- **Auth → Settings → "Leaked password protection"**: turn ON. Checks new passwords against HaveIBeenPwned, blocks compromised ones.
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

The `whatsapp-agent` Edge Function is the brain of the WhatsApp inbox. It calls Claude with the full conversation context (recent messages + customer + dogs + availability + persisted state) and writes a draft reply for staff to review. It never sends a message to the customer directly and never mutates a booking — both of those go through guarded paths (`whatsapp-send` and the `apply_whatsapp_booking_action` RPC).

**Defaults are deliberately conservative.** Every draft is held for human approval. Auto-send is plumbed but off everywhere unless you explicitly opt in.

Set the function's secrets with `supabase secrets set NAME=value` (do NOT put them in `.env.local`):

| Variable | Default | What it does |
|---|---|---|
| `ANTHROPIC_API_KEY` | _required_ | Claude API key. Server-side only — never put behind a `VITE_` prefix. |
| `CLAUDE_MODEL` | `claude-sonnet-4-6` | Model used by the agent. |
| `AGENT_CALLBACK_SECRET` | _required_ | Shared secret between the `whatsapp_events` pg_net trigger and the function. |
| `AI_ASSISTANT_ENABLED` | `true` | Kill switch. Set to `false` to bypass Claude (the agent then writes a brand-voiced "I'll get someone to look at this" fallback draft tagged for handoff). Useful during incidents. |
| `AI_AUTO_SEND_LOW_RISK` | `false` | Global gate for auto-send. Even when `true`, a draft only auto-sends when **all** of the following are true: the conversation has `auto_send_enabled=true`, the draft's risk level is `low`, the draft does not require handoff, and the intent is in the auto-send allowlist (`faq`, `greeting`, `smalltalk`, `confirm_time`). |
| `WHATSAPP_SEND_URL` | `${SUPABASE_URL}/functions/v1/whatsapp-send` | Where the agent posts approved-for-auto-send drafts. Override only if you've moved the function. |
| `SEND_INTERNAL_SECRET` | _required for auto-send_ | Used by the agent to authenticate against `whatsapp-send` for auto-dispatch. Same value `whatsapp-send` already expects. |

**Risk levels and handoff** (see `supabase/functions/_shared/agentRisk.ts`):

- `low` — routine FAQ, greeting, "thanks", "on my way". Safe to auto-send when policy permits.
- `medium` — booking proposals, reschedules, cancellations. Staff approves as usual.
- `high` — medical / complaint / very-low-confidence. Always requires a human; the inbox shows a red dot on the conversation.

**Turning auto-send on safely** (when you're ready, after a few weeks of monitoring drafts):

1. Set `AI_AUTO_SEND_LOW_RISK=true` on the function.
2. Pick a single trusted conversation in the inbox and flip its "Auto-send off" toggle to on (column: `whatsapp_conversations.auto_send_enabled`). The toggle prompts for confirmation before turning auto-send on; turning it off is one click.
3. Watch the drafts panel. Drafts that auto-send transition to state `auto_sent` and skip the approval step.
4. Roll out to more conversations over time. Booking-touching intents are never auto-sent regardless of opt-in.

Note: `auto_send_enabled` defaults to `false` at the column level (set in migration `20260424001635_whatsapp_schema.sql`, re-asserted in `20260513130000_whatsapp_auto_send_default_off.sql`). The inbox UI reads its initial state from the row, never defaulting to on in the component.

### Migration history note

`supabase/migrations/` is a near-complete record of prod schema history. Two small gaps remain:

- `20260330095121_initial_schema.sql`, `20260330095135_auth_staff_profiles.sql`, `20260330095217_phase5_schema.sql` — applied before Supabase's migration-tracking table was in use, so they're in the repo but not in `supabase_migrations.schema_migrations` on prod.
- `20260422004157_reminder_preferences.sql` — applied via the dashboard rather than as a tracked migration. The columns (`humans.reminder_hours`, `humans.reminder_channels`) exist on prod, but the file isn't in the migration history table.

Everything else matches. Files with letter suffixes (e.g. `012a_…`, `017a_…`) are backfills of migrations that were originally applied via the dashboard; they slot in alphabetically between the main-numbered files so `ls`-order still reflects apply-order.

**Fresh project?** Run the files in filename order. **Do not blindly re-run old migrations against production** — some are not idempotent.

## Deploy

### Vercel
Connect this repo — Vercel auto-detects Vite. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` as environment variables.

### Manual
```bash
npm run build   # outputs to dist/
# Serve dist/ with any static file server
```

## Tech Stack

- **React 19** + **Vite 8**
- **Supabase** (PostgreSQL + Auth + Row Level Security)
- Inline CSS with brand design tokens
