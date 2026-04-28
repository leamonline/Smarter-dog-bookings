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
# (get these from supabase.com → Your Project → Settings → API)
cat > .env.local <<'EOF'
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
EOF

# Start dev server
npm run dev
```

## Supabase Setup

1. Create a project at [supabase.com](https://supabase.com)
2. Run every numbered file in `supabase/migrations/` against the SQL Editor, in order
3. Fill in `.env.local` with your project URL and anon key
4. (Optional) Seed sample data: `npm run seed`

### Provisioning the first owner

`002_auth_staff_profiles.sql` lets a new user create their own `staff_profiles` row defaulted to `role = 'staff'`, and `005_restrict_role_escalation.sql` then prevents self-promotion. So the very first user can't promote themselves to owner — you have to seed it once via the service-role key:

```bash
# 1. Sign up via the app's normal login screen (creates the auth.users row)
# 2. Add to .env.local (service-role key from Supabase → Settings → API):
#    SUPABASE_SERVICE_ROLE_KEY=<the long secret key — do NOT commit>
# 3. Run once:
node scripts/seed-first-owner.mjs <your-email>
```

After this, the new owner can promote/demote others by editing the `staff_profiles.role` column directly in the Supabase dashboard.

### Manual Supabase dashboard settings

These aren't expressible as migrations — set them once per project:

- **Auth → Settings → "Leaked password protection"**: turn ON. Checks new passwords against HaveIBeenPwned, blocks compromised ones.
- **Database → Extensions → `pg_net`**: move out of the `public` schema (the linter flags `extensions` as the conventional location).

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
2. Pick a single trusted conversation in the inbox and flip its `auto_send_enabled` to `true` (currently this is a column on `whatsapp_conversations` — UI for it is a follow-up).
3. Watch the drafts panel. Drafts that auto-send transition to state `auto_sent` and skip the approval step.
4. Roll out to more conversations over time. Booking-touching intents are never auto-sent regardless of opt-in.

### Migration history note

`supabase/migrations/` is a near-complete record of prod schema history. Two small gaps remain:

- `001_initial_schema.sql`, `002_auth_staff_profiles.sql`, `003_phase5_schema.sql` — applied before Supabase's migration-tracking table was in use, so they're in the repo but not in `supabase_migrations.schema_migrations` on prod.
- `021_reminder_preferences.sql` — applied via the dashboard rather than as a tracked migration. The columns (`humans.reminder_hours`, `humans.reminder_channels`) exist on prod, but the file isn't in the migration history.

Everything else matches. Files with letter suffixes (e.g. `012a_…`, `017a_…`) are backfills of migrations that were originally applied via the dashboard; they slot in alphabetically between the main-numbered files so `ls`-order still reflects apply-order. If you fork to a fresh Supabase project, run the files in filename order.

## Deploy

### Vercel
Connect this repo — Vercel auto-detects Vite. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as environment variables.

### Manual
```bash
npm run build   # outputs to dist/
# Serve dist/ with any static file server
```

## Tech Stack

- **React 19** + **Vite 8**
- **Supabase** (PostgreSQL + Auth + Row Level Security)
- Inline CSS with brand design tokens
