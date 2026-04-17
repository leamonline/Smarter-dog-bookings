# SmarterDog — Salon Dashboard

A booking and management dashboard for dog grooming salons. Built with React + Vite + Supabase.

## Features

- **Weekly calendar** with slot-based booking (08:30–13:00)
- **Capacity engine** — enforces the 2-2-1 rule for large dogs
- **Booking workflow** — Not Arrived → Checked In → In Bath → Ready for Pick-up → Completed
- **Dogs & Humans directories** — full contact management with alerts, notes, and trusted contacts
- **Role-based auth** — owner vs staff access levels
- **Offline mode** — works without Supabase using sample data
- **Responsive** — optimized for tablet (front desk) and mobile

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

### Schema drift note

The local `supabase/migrations/` folder ends at `023_secure_salon_todos.sql`. Production has a few additional migrations applied directly via the Supabase dashboard (`add_chain_id_to_bookings`, `add_deposit_amount_to_bookings`, `create_salon_todos_table`, `fix_staff_profiles_rls_recursion`, `fix_calendar_token_search_path`). The DDL exists in production; back-filling them as numbered files would risk re-deriving DDL that doesn't match what was actually applied. If you fork to a fresh Supabase project, dump the production schema and import it, rather than replaying the local migrations.

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
